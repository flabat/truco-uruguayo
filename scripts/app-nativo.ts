// `npm run app:nativo -- ios|android [--api local|vps]`: reusa el cliente de desarrollo si no cambió nada nativo.
// Calcula la huella con @expo/fingerprint; si `~/.cache/truco/builds/<plataforma>-<huella>` existe, instala ese
// build; si no, compila con `expo run:<plataforma>` y lo guarda. Después arranca Metro (o reusa el que ya corre en
// el puerto) con EXPO_PUBLIC_API_URL del perfil y abre la app contra ese Metro. Con `--fisico`, el destino es un
// iPhone conectado: compila firmado, instala con devicectl y apunta Metro a la IP de la Mac en la red local.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFingerprintAsync } from "@expo/fingerprint";
import {
  carpetaBuild, elegirDispositivoFisico, elegirSimulador, enlaceDevClient, esMetro, leerArgumentos, leerEnv, puertoMetro, urlApi, USO,
  type Opciones,
} from "./app-nativo-opciones.ts";
import { direccionDeLaApi } from "../app/src/direccion-api.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dirApp = join(raiz, "app");
const cache = process.env.TRUCO_CACHE ?? join(homedir(), ".cache", "truco");
const sdkAndroid = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), "Library", "Android", "sdk");
const adbRuta = existsSync(join(sdkAndroid, "platform-tools", "adb")) ? join(sdkAndroid, "platform-tools", "adb") : "adb";
const emuladorRuta = existsSync(join(sdkAndroid, "emulator", "emulator")) ? join(sdkAndroid, "emulator", "emulator") : "emulator";

const inicio = performance.now();
const segundos = () => ((performance.now() - inicio) / 1000).toFixed(1);
const decir = (texto: string) => console.log(`[app:nativo ${segundos()} s] ${texto}`);
const salida = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

function correr(cmd: string, args: string[], opciones: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  return new Promise((ok, mal) => {
    const hijo = spawn(cmd, args, { stdio: "inherit", ...opciones });
    hijo.on("error", mal);
    hijo.on("exit", codigo => codigo === 0 ? ok() : mal(new Error(`${cmd} ${args.join(" ")} terminó con ${codigo}`)));
  });
}

async function estadoMetro(puerto: number): Promise<"metro" | "otro" | "libre"> {
  try {
    const r = await fetch(`http://localhost:${puerto}/status`, { signal: AbortSignal.timeout(1500) });
    return esMetro(await r.text()) ? "metro" : "otro";
  } catch (e) {
    return (e as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED" ? "libre" : "otro";
  }
}

// --- Dispositivos ---

interface Destino { id: string; nombre: string }

async function simulador(pedido?: string): Promise<Destino> {
  const lista = JSON.parse(salida("xcrun", ["simctl", "list", "devices", "available", "--json"]));
  const sim = elegirSimulador(lista, pedido);
  if (!sim) throw new Error(pedido ? `No hay un simulador de iOS "${pedido}".` : "No hay simuladores de iOS disponibles.");
  if (sim.state !== "Booted") {
    decir(`Arrancando el simulador ${sim.name}…`);
    salida("xcrun", ["simctl", "boot", sim.udid]);
  }
  try {
    // Muestra la ventana del simulador; sin ella el simulador igual funciona (por ejemplo, en el panel de Claude).
    const app = join(salida("xcode-select", ["-p"]), "Applications", "Simulator.app");
    const cual = existsSync(app) ? [app] : ["-a", "Simulator"];
    execFileSync("open", ["-g", ...cual, "--args", "-CurrentDeviceUDID", sim.udid], { stdio: "ignore" });
  } catch {}
  salida("xcrun", ["simctl", "bootstatus", sim.udid, "-b"]);
  return { id: sim.udid, nombre: sim.name };
}

function iphoneFisico(pedido?: string): Destino {
  const dir = mkdtempSync(join(tmpdir(), "truco-devicectl-"));
  try {
    const archivo = join(dir, "dispositivos.json");
    salida("xcrun", ["devicectl", "list", "devices", "--json-output", archivo]);
    const iphone = elegirDispositivoFisico(JSON.parse(readFileSync(archivo, "utf8")), pedido);
    if (!iphone) {
      throw new Error(pedido
        ? `No hay un iPhone físico emparejado "${pedido}". Revisá \`xcrun devicectl list devices\`.`
        : "No hay un iPhone físico emparejado. Conectalo por cable, aceptá «Confiar en esta computadora» y activá el modo desarrollador.");
    }
    return { id: iphone.udid, nombre: iphone.name };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** La IP de la Mac en la red local: el iPhone físico llega por ahí a Metro (y a la API local). */
function ipLocal(): string {
  for (const interfaz of ["en0", "en1"]) {
    try { const ip = salida("ipconfig", ["getifaddr", interfaz]); if (ip) return ip; } catch {}
  }
  throw new Error("No encontré la IP de la Mac en la red local (en0 ni en1). El iPhone tiene que estar en la misma red.");
}

const adb = (serie: string | undefined, ...args: string[]) => salida(adbRuta, [...(serie ? ["-s", serie] : []), ...args]);

function nombreAvd(serie: string): string {
  try { return adb(serie, "emu", "avd", "name").split(/\r?\n/)[0].trim(); } catch { return serie; }
}

async function emulador(pedido?: string): Promise<Destino> {
  const enMarcha = () => adb(undefined, "devices").split(/\r?\n/).slice(1)
    .map(l => l.split(/\s+/)).filter(([, estado]) => estado === "device").map(([serie]) => serie);
  let serie = enMarcha().find(s => !pedido || s === pedido || nombreAvd(s) === pedido);
  if (!serie) {
    const avds = salida(emuladorRuta, ["-list-avds"]).split(/\r?\n/).filter(Boolean);
    const avd = pedido ?? avds[0];
    if (!avd || !avds.includes(avd)) throw new Error(pedido ? `No hay un AVD "${pedido}".` : "No hay emuladores de Android (AVD). Creá uno en Android Studio.");
    decir(`Arrancando el emulador ${avd}…`);
    spawn(emuladorRuta, ["-avd", avd], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 180 && !serie; i++) {
      await esperar(1000);
      serie = enMarcha().find(s => nombreAvd(s) === avd);
    }
    if (!serie) throw new Error(`El emulador ${avd} no arrancó.`);
  }
  for (let i = 0; i < 180; i++) {
    try { if (adb(serie, "shell", "getprop", "sys.boot_completed") === "1") return { id: serie, nombre: nombreAvd(serie) }; } catch {}
    await esperar(1000);
  }
  throw new Error(`El emulador ${serie} no terminó de arrancar.`);
}

// --- Builds ---

function binarioGuardado(dir: string, plataforma: Opciones["plataforma"]): string | undefined {
  if (!existsSync(dir)) return undefined;
  const nombre = readdirSync(dir).find(f => f.endsWith(plataforma === "ios" ? ".app" : ".apk"));
  return nombre && join(dir, nombre);
}

async function compilar(opciones: Opciones, destino: Destino, dir: string): Promise<string> {
  const temporal = `${dir}.compilando-${process.pid}`;
  // CocoaPods falla con "Unicode Normalization not appropriate for ASCII-8BIT" si el entorno no tiene locale UTF-8.
  const env = /utf-?8/i.test(process.env.LC_ALL ?? process.env.LANG ?? "") ? process.env : { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };
  rmSync(temporal, { recursive: true, force: true });
  mkdirSync(temporal, { recursive: true });
  try {
    if (opciones.plataforma === "ios") {
      // En el simulador, `generic` compila para "generic/platform=iOS Simulator" sin firmar y no instala: eso lo hace
      // instalar(). Con el UDID, Expo toma el simulador encendido por un iPhone físico, porque Xcode 27 lo lista en
      // `devicectl list devices`, y pide un certificado de firma (#418). En el iPhone físico sí hace falta firmar.
      const dispositivo = opciones.fisico ? destino.id : "generic";
      await correr("npx", ["expo", "run:ios", "--no-bundler", "--device", dispositivo, "--output", temporal], { cwd: dirApp, env });
    } else {
      await correr("npx", ["expo", "run:android", "--no-bundler", "--device", destino.nombre], { cwd: dirApp, env });
      const salidas = join(dirApp, "android", "app", "build", "outputs", "apk", "debug");
      const apk = readdirSync(salidas).filter(f => f.endsWith(".apk")).sort((a, b) => Number(b === "app-debug.apk") - Number(a === "app-debug.apk"))[0];
      if (!apk) throw new Error(`No encontré el APK en ${salidas}.`);
      cpSync(join(salidas, apk), join(temporal, apk));
    }
    if (!binarioGuardado(temporal, opciones.plataforma)) throw new Error("La compilación no dejó un binario.");
    rmSync(dir, { recursive: true, force: true });
    renameSync(temporal, dir);
    return binarioGuardado(dir, opciones.plataforma)!;
  } catch (e) {
    rmSync(temporal, { recursive: true, force: true });
    throw e;
  }
}

function instalar(opciones: Opciones, destino: Destino, binario: string) {
  if (opciones.fisico) salida("xcrun", ["devicectl", "device", "install", "app", "--device", destino.id, binario]);
  else if (opciones.plataforma === "ios") salida("xcrun", ["simctl", "install", destino.id, binario]);
  else adb(destino.id, "install", "-r", "-d", binario);
}

function abrir(opciones: Opciones, destino: Destino, enlace: string, puerto: number, bundle: string) {
  if (opciones.fisico) {
    salida("xcrun", ["devicectl", "device", "process", "launch", "--device", destino.id, "--terminate-existing", "--payload-url", enlace, bundle]);
  } else if (opciones.plataforma === "ios") {
    salida("xcrun", ["simctl", "openurl", destino.id, enlace]);
  } else {
    adb(destino.id, "reverse", `tcp:${puerto}`, `tcp:${puerto}`);
    adb(destino.id, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${enlace}'`);
  }
}

// --- Principal ---

async function main() {
  let opciones: Opciones;
  try {
    opciones = leerArgumentos(process.argv.slice(2));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USO}`);
    process.exit(2);
  }
  const archivoEnv = join(raiz, ".env.trabajo");
  const env = existsSync(archivoEnv) ? leerEnv(readFileSync(archivoEnv, "utf8")) : {};
  const puerto = puertoMetro(env);
  const host = opciones.fisico ? ipLocal() : "localhost";
  const api = urlApi(opciones.api, env, host);
  const apiEnApp = direccionDeLaApi(api, opciones.plataforma);
  const { slug, ios } = JSON.parse(readFileSync(join(dirApp, "app.json"), "utf8")).expo as { slug: string; ios: { bundleIdentifier: string } };

  // Antes de compilar: si ya corre Metro en el puerto, tiene que ser de este worktree y con la misma API.
  const estado = await estadoMetro(puerto);
  if (estado === "otro") throw new Error(`El puerto ${puerto} está ocupado por otro servicio. Definí METRO_PORT en .env.trabajo.`);
  const registro = join(cache, "metro", `${puerto}.json`);
  const previo = estado === "metro" && existsSync(registro) ? JSON.parse(readFileSync(registro, "utf8")) as { api?: string; raiz?: string } : {};
  if (previo.raiz && previo.raiz !== raiz) {
    throw new Error(`El Metro del ${puerto} es de ${previo.raiz}. Cerralo o definí otro METRO_PORT en .env.trabajo.`);
  }
  if (previo.api && previo.api !== api) {
    throw new Error(`El Metro del ${puerto} arrancó con la API ${previo.api}. Cerralo para usar ${api}, o pasá el --api que corresponde.`);
  }

  const { hash } = await createFingerprintAsync(dirApp, { platforms: [opciones.plataforma] });
  const dir = carpetaBuild(cache, opciones.plataforma, hash, opciones.fisico);
  decir(`Huella ${opciones.plataforma}: ${hash}`);

  const destino = opciones.fisico ? iphoneFisico(opciones.dispositivo)
    : opciones.plataforma === "ios" ? await simulador(opciones.dispositivo) : await emulador(opciones.dispositivo);
  decir(`Destino: ${destino.nombre} (${destino.id})`);

  let binario = opciones.recompilar ? undefined : binarioGuardado(dir, opciones.plataforma);
  if (binario) {
    decir(`Uso el build guardado en ${dir}`);
  } else {
    decir(opciones.recompilar ? "Recompilando por --recompilar." : "No hay build con esta huella: compilo (tarda varios minutos la primera vez).");
    binario = await compilar(opciones, destino, dir);
    decir(`Build guardado en ${dir}`);
  }
  instalar(opciones, destino, binario);
  decir("App instalada.");

  let metro: ChildProcess | undefined;
  if (estado === "metro") {
    decir(`Reuso el Metro que ya corre en el ${puerto}${previo.api ? "" : " (no sé con qué API arrancó)"}.`);
  } else {
    decir(`Arranco Metro en el ${puerto} con EXPO_PUBLIC_API_URL=${api}`);
    mkdirSync(dirname(registro), { recursive: true });
    writeFileSync(registro, JSON.stringify({ api, raiz }) + "\n");
    metro = spawn("npx", ["expo", "start", "--dev-client", "--port", String(puerto)], {
      cwd: dirApp, stdio: "inherit", env: { ...process.env, EXPO_PUBLIC_API_URL: api },
    });
    metro.on("exit", codigo => process.exit(codigo ?? 0));
    for (let i = 0; (await estadoMetro(puerto)) !== "metro"; i++) {
      if (i > 120) throw new Error(`Metro no respondió en el ${puerto}.`);
      await esperar(500);
    }
  }

  abrir(opciones, destino, enlaceDevClient(slug, `http://${host}:${puerto}`), puerto, ios.bundleIdentifier);
  decir(`App abierta en ${destino.nombre} contra Metro http://${host}:${puerto} (API ${apiEnApp}).`);
  if (metro) {
    decir("Metro sigue en marcha: Ctrl+C para cerrarlo. La web está en la misma dirección.");
    const cerrar = () => metro!.kill("SIGINT");
    process.on("SIGINT", cerrar);
    process.on("SIGTERM", cerrar);
  }
}

main().catch(e => {
  console.error(`[app:nativo] ${(e as Error).message}`);
  process.exit(1);
});
