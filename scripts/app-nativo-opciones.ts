// Lo puro de `npm run app:nativo`: argumentos, puertos, perfiles de API, rutas de la caché y enlaces.
// El script que compila, instala y arranca Metro está en app-nativo.ts.
import { join } from "node:path";

export type Plataforma = "ios" | "android";
export type PerfilApi = "local" | "vps";

export interface Opciones {
  plataforma: Plataforma;
  api: PerfilApi;
  dispositivo?: string;
  /** iPhone físico conectado y emparejado en vez del simulador (solo iOS). */
  fisico: boolean;
  recompilar: boolean;
}

export const USO = `Uso: npm run app:nativo -- ios|android [--api local|vps] [--dispositivo <nombre o id>] [--fisico] [--recompilar]

  --api local         API de la pila local (docker compose): localhost, o 10.0.2.2 en el emulador de Android
  --api vps           API de https://eltru.co (predeterminado)
  --dispositivo       simulador o emulador: nombre o UDID en iOS, nombre del AVD o serie de adb en Android
  --fisico            iOS: un iPhone conectado y emparejado en vez del simulador. Necesita un certificado
                      Apple Development en el llavero y que el iPhone esté en la misma red que la Mac
  --recompilar        compila aunque haya un build guardado con la misma huella`;

export const METRO_PREDETERMINADO = 8082;
export const WEB_PREDETERMINADA = 8081;
export const URL_VPS = "https://eltru.co";

export function leerArgumentos(argv: string[]): Opciones {
  let plataforma: Plataforma | undefined;
  let api: PerfilApi = "vps";
  let dispositivo: string | undefined;
  let recompilar = false;
  let fisico = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [nombre, enLinea] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const valor = () => {
      const v = enLinea ?? argv[++i];
      if (v === undefined || v === "") throw new Error(`Falta el valor de ${nombre}.`);
      return v;
    };
    if (nombre === "ios" || nombre === "android") {
      if (plataforma && plataforma !== nombre) throw new Error("Indicá una sola plataforma: ios o android.");
      plataforma = nombre;
    } else if (nombre === "--api") {
      const v = valor();
      if (v !== "local" && v !== "vps") throw new Error(`Perfil de API desconocido: ${v}. Usá local o vps.`);
      api = v;
    } else if (nombre === "--dispositivo") {
      dispositivo = valor();
    } else if (nombre === "--fisico") {
      fisico = true;
    } else if (nombre === "--recompilar") {
      recompilar = true;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  if (!plataforma) throw new Error("Falta la plataforma: ios o android.");
  if (fisico && plataforma !== "ios") throw new Error("--fisico es solo para iOS.");
  return { plataforma, api, dispositivo, fisico, recompilar };
}

/** Lee un archivo `CLAVE=valor` como `.env.trabajo`; ignora comentarios, líneas vacías y comillas. */
export function leerEnv(texto: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

function puerto(valor: string | undefined, clave: string, predeterminado: number): number {
  if (valor === undefined || valor === "") return predeterminado;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${clave} no es un puerto válido: ${valor}`);
  return n;
}

/** Metro va en METRO_PORT de `.env.trabajo` (#378) o en el 8082: el 8081 es de la web local. */
export const puertoMetro = (env: Record<string, string>) => puerto(env.METRO_PORT, "METRO_PORT", METRO_PREDETERMINADO);

/** La web local (y la API) de este worktree: WEB_PORT de `.env.trabajo` o el 8081. */
export const puertoWeb = (env: Record<string, string>) => puerto(env.WEB_PORT, "WEB_PORT", WEB_PREDETERMINADA);

/**
 * EXPO_PUBLIC_API_URL según el perfil. Va con localhost también para Android: así un mismo Metro sirve las dos
 * plataformas, y la app lo traduce a 10.0.2.2 en el emulador (app/src/direccion-api.ts). Un iPhone físico no ve el
 * localhost de la Mac: ahí `host` es la IP de la Mac en la red local.
 */
export const urlApi = (perfil: PerfilApi, env: Record<string, string>, host = "localhost") =>
  perfil === "vps" ? URL_VPS : `http://${host}:${puertoWeb(env)}`;

/**
 * `~/.cache/truco/builds/<plataforma>-<huella>`, o `ios-fisico-<huella>` para el iPhone físico: ese build es para
 * iphoneos y va firmado, así que no sirve en el simulador ni al revés.
 */
export const carpetaBuild = (cache: string, plataforma: Plataforma, huella: string, fisico = false) =>
  join(cache, "builds", `${plataforma}${fisico ? "-fisico" : ""}-${huella}`);

/** Enlace que abre el cliente de desarrollo contra un Metro dado (esquema `exp+<slug>`). */
export const enlaceDevClient = (slug: string, metro: string) =>
  `exp+${slug}://expo-development-client/?url=${encodeURIComponent(metro)}`;

/** ¿Lo que responde en /status es Metro? */
export const esMetro = (cuerpo: string) => cuerpo.trim() === "packager-status:running";

/** De la salida de `xcrun simctl list devices available --json`, el simulador pedido o el más adecuado. */
export function elegirSimulador(
  lista: { devices: Record<string, { udid: string; name: string; state: string; isAvailable?: boolean }[]> },
  pedido?: string,
): { udid: string; name: string; state: string } | undefined {
  const todos = Object.entries(lista.devices)
    .filter(([runtime]) => runtime.includes("iOS"))
    .flatMap(([, ds]) => ds.filter(d => d.isAvailable !== false));
  if (pedido) return todos.find(d => d.udid === pedido) ?? todos.find(d => d.name === pedido);
  const iphones = todos.filter(d => d.name.startsWith("iPhone"));
  return iphones.find(d => d.state === "Booted") ?? todos.find(d => d.state === "Booted") ?? iphones[0];
}

interface DispositivoDevicectl {
  identifier: string;
  connectionProperties?: { pairingState?: string; tunnelState?: string };
  deviceProperties?: { name?: string };
  hardwareProperties?: { platform?: string; reality?: string; udid?: string };
}

/**
 * De la salida de `xcrun devicectl list devices --json-output`, el iPhone o iPad físico pedido o el primero
 * emparejado. Xcode 27 también lista ahí los simuladores encendidos (`reality: "simulated"`): se descartan.
 */
export function elegirDispositivoFisico(
  lista: { result?: { devices?: DispositivoDevicectl[] } },
  pedido?: string,
): { udid: string; name: string } | undefined {
  const fisicos = (lista.result?.devices ?? [])
    .filter(d => d.hardwareProperties?.reality !== "simulated" && d.hardwareProperties?.platform === "iOS")
    .filter(d => d.connectionProperties?.pairingState === "paired" && d.connectionProperties?.tunnelState !== "unavailable")
    .map(d => ({ udid: d.hardwareProperties?.udid ?? d.identifier, name: d.deviceProperties?.name ?? d.identifier, id: d.identifier }));
  const elegido = pedido ? fisicos.find(d => d.udid === pedido || d.id === pedido || d.name === pedido) : fisicos[0];
  return elegido && { udid: elegido.udid, name: elegido.name };
}
