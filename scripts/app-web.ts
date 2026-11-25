// `npm run app:web -- [--api local|vps]`: la app web con recarga en caliente y la API en el mismo origen.
//
// Un proxy en APP_WEB_PORT (8083) atiende el navegador; la app queda en la raíz, como la sirve Metro en desarrollo. /api y el WebSocket van a la API elegida; el resto, a Metro
// (`expo start --web`), que corre en un puerto interno. El ingreso usa el flujo PKCE de la app con retorno de bucle
// local (RFC 8252): Keycloak solo vuelve a la API, así que la API devuelve el código a este proxy, que lo canjea y
// guarda la sesión como cookie de localhost. Funciona igual contra eltru.co y contra la pila local.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import net, { type Socket } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COOKIE_INGRESO, cookieHaciaProxy, cookieIngreso, cookieSesion, destinoDespuesDelIngreso, encabezadosHaciaApi,
  esDeLaApi, leerArgumentosWeb, rutaSinBase, leerCookie, leerEnv, locationHaciaProxy, origenApi, parPkce, puertoAppWeb,
  randomBytes, RETORNO_LOCAL, urlIngreso, USO,
} from "./app-web-opciones.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function puertoLibre(): Promise<number> {
  return new Promise((ok, mal) => {
    const s = net.createServer().once("error", mal).listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => ok(port));
    });
  });
}

function esperarMetro(puerto: number, hijo: ChildProcess): Promise<void> {
  return new Promise((ok, mal) => {
    const fin = Date.now() + 120_000;
    hijo.once("exit", codigo => mal(new Error(`Metro terminó antes de arrancar (código ${codigo}).`)));
    const intentar = () => {
      http.get({ host: "127.0.0.1", port: puerto, path: "/status" }, res => {
        let cuerpo = "";
        res.on("data", d => (cuerpo += d)).on("end", () => (cuerpo.includes("packager-status:running") ? ok() : reintentar()));
      }).on("error", reintentar);
    };
    const reintentar = () => (Date.now() > fin ? mal(new Error("Metro no respondió en 2 minutos.")) : setTimeout(intentar, 500));
    intentar();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(USO); return; }
  const { api: perfil } = leerArgumentosWeb(argv);
  const archivoEnv = join(raiz, ".env.trabajo");
  const env = { ...(existsSync(archivoEnv) ? leerEnv(readFileSync(archivoEnv, "utf8")) : {}), ...process.env } as Record<string, string>;
  const api = new URL(origenApi(perfil, env));
  const puerto = puertoAppWeb(env);
  const proxy = new URL(`http://localhost:${puerto}`);
  const cliente = api.protocol === "https:" ? https : http;

  // Ingresos en curso: el id viaja en una cookie del proxy; el verificador nunca sale de esta máquina.
  const ingresos = new Map<string, { verificador: string; volver: string; vence: number }>();

  async function canjear(codigo: string, verificador: string): Promise<string> {
    const respuesta = await fetch(new URL("/api/auth/canje", api), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, verificador }),
    });
    const datos = await respuesta.json().catch(() => null) as { sesion?: string; error?: string } | null;
    if (!respuesta.ok || typeof datos?.sesion !== "string") throw new Error(datos?.error ?? `HTTP ${respuesta.status}`);
    return datos.sesion;
  }

  function ingresar(req: IncomingMessage, res: ServerResponse, url: URL) {
    const { verificador, desafio } = parPkce();
    const id = randomBytes(16).toString("base64url");
    const ahora = Date.now();
    for (const [k, v] of ingresos) if (v.vence < ahora) ingresos.delete(k);
    ingresos.set(id, { verificador, volver: destinoDespuesDelIngreso(url.searchParams.get("volver")), vence: ahora + 600_000 });
    // Navegación directa a la API: la cookie de su flujo queda en su dominio, donde vuelve Keycloak.
    res.writeHead(303, { Location: urlIngreso(api, proxy, desafio), "Set-Cookie": cookieIngreso(id), "Cache-Control": "no-store" }).end();
  }

  async function retorno(req: IncomingMessage, res: ServerResponse, url: URL) {
    const id = leerCookie(req.headers.cookie, COOKIE_INGRESO);
    const pendiente = id ? ingresos.get(id) : undefined;
    const codigo = url.searchParams.get("codigo");
    if (id) ingresos.delete(id);
    const borrar = `${COOKIE_INGRESO}=; Path=/api/auth/; Max-Age=0`;
    if (!pendiente || pendiente.vence < Date.now() || !codigo) {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Set-Cookie": borrar })
        .end("El ingreso venció o empezó en otro navegador. Volvé a ingresar desde la app.");
      return;
    }
    try {
      const sesion = await canjear(codigo, pendiente.verificador);
      res.writeHead(303, { Location: pendiente.volver, "Set-Cookie": [borrar, cookieSesion(sesion)], "Cache-Control": "no-store" }).end();
    } catch (error) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Set-Cookie": borrar })
        .end(`No se pudo canjear el ingreso con ${api.origin}: ${(error as Error).message}`);
    }
  }

  function haciaApi(req: IncomingMessage, res: ServerResponse) {
    const pedido = cliente.request(new URL(req.url!, api), {
      method: req.method, headers: encabezadosHaciaApi(req.headers, api),
    }, respuesta => {
      const headers = { ...respuesta.headers };
      if (typeof headers.location === "string") headers.location = locationHaciaProxy(headers.location, api, proxy);
      if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].map(cookieHaciaProxy);
      res.writeHead(respuesta.statusCode ?? 502, headers);
      respuesta.pipe(res);
    });
    pedido.on("error", error => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`La API de ${api.origin} no respondió: ${error.message}`);
    });
    req.pipe(pedido);
  }

  const metroPuerto = await puertoLibre();
  const metroUrl = new URL(`http://127.0.0.1:${metroPuerto}`);

  function haciaMetro(req: IncomingMessage, res: ServerResponse) {
    const pedido = http.request({ host: metroUrl.hostname, port: metroPuerto, path: req.url, method: req.method, headers: req.headers }, respuesta => {
      res.writeHead(respuesta.statusCode ?? 502, respuesta.headers);
      respuesta.pipe(res);
    });
    pedido.on("error", () => {
      if (!res.headersSent) res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2" });
      res.end("Metro todavía no está listo. Recargá en unos segundos.");
    });
    req.pipe(pedido);
  }

  /** WebSocket: el de la mesa va a la API (con Host y Origin de la API); el de recarga en caliente, a Metro. */
  function mejorar(req: IncomingMessage, socket: Socket, cabeza: Buffer) {
    const deLaApi = esDeLaApi(req.url ?? "/");
    const destino = deLaApi ? new URL(req.url!, api) : new URL(req.url!, metroUrl);
    const headers = deLaApi ? encabezadosHaciaApi(req.headers, api) : req.headers;
    const modulo = destino.protocol === "https:" ? https : http;
    const pedido = modulo.request(destino, { method: "GET", headers });
    pedido.on("upgrade", (respuesta, remoto, cabezaRemota) => {
      const lineas = [`HTTP/1.1 ${respuesta.statusCode} ${respuesta.statusMessage}`];
      for (let i = 0; i < respuesta.rawHeaders.length; i += 2) lineas.push(`${respuesta.rawHeaders[i]}: ${respuesta.rawHeaders[i + 1]}`);
      socket.write(lineas.join("\r\n") + "\r\n\r\n");
      if (cabezaRemota.length) socket.write(cabezaRemota);
      if (cabeza.length) remoto.write(cabeza);
      remoto.pipe(socket).pipe(remoto);
      remoto.on("error", () => socket.destroy());
      socket.on("error", () => remoto.destroy());
    });
    pedido.on("response", respuesta => {
      socket.end(`HTTP/1.1 ${respuesta.statusCode} ${respuesta.statusMessage}\r\nConnection: close\r\n\r\n`);
    });
    pedido.on("error", () => socket.destroy());
    pedido.end();
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", proxy);
    // En desarrollo Expo Router no aplica la base /jugar: la app vive en la raíz. Los enlaces de la app y del ingreso
    // que apuntan a /jugar/… (invitaciones, retorno, CanvasKit, cartas) se redirigen a la misma ruta sin la base.
    const sinBase = rutaSinBase(url.pathname);
    if (sinBase !== null) { res.writeHead(302, { Location: sinBase + url.search + url.hash, "Cache-Control": "no-store" }).end(); return; }
    if (req.method === "GET" && url.pathname === "/api/auth/login" && !url.searchParams.has("app")) return ingresar(req, res, url);
    if (req.method === "GET" && url.pathname === RETORNO_LOCAL) { void retorno(req, res, url); return; }
    if (esDeLaApi(url.pathname)) return haciaApi(req, res);
    haciaMetro(req, res);
  });
  servidor.on("upgrade", mejorar);
  await new Promise<void>((ok, mal) => {
    servidor.once("error", (error: NodeJS.ErrnoException) =>
      mal(error.code === "EADDRINUSE" ? new Error(`El puerto ${puerto} está ocupado. Definí APP_WEB_PORT en .env.trabajo o en el entorno.`) : error));
    servidor.listen(puerto, "127.0.0.1", ok);
  });

  // CanvasKit se sirve desde app/public en /jugar/canvaskit.wasm, igual que en la exportación.
  await new Promise<void>((ok, mal) => spawn(process.execPath, [join(raiz, "scripts/copiar-canvaskit.mjs")], { stdio: "inherit" })
    .on("exit", c => (c === 0 ? ok() : mal(new Error("No se pudo copiar CanvasKit.")))));
  const metro: ChildProcess = spawn("npx", ["expo", "start", "--web", "--port", String(metroPuerto)], {
    cwd: join(raiz, "app"), stdio: "inherit", env: { ...process.env, BROWSER: "none" },
  });
  const cerrar = () => { metro.kill("SIGTERM"); servidor.close(); };
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
  metro.on("exit", codigo => { servidor.close(); process.exitCode = codigo ?? 0; });
  await esperarMetro(metroPuerto, metro);
  console.log(`\n[app:web] La app web está en ${proxy.origin}/ · API: ${api.origin} · Metro interno: ${metroPuerto}\n`);
}

main().catch(error => {
  console.error(`[app:web] ${(error as Error).message}`);
  process.exit(1);
});
