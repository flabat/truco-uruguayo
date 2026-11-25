// Lo puro de `npm run app:web`: argumentos, puertos y cómo se reescriben los encabezados entre el navegador, el
// proxy local y la API. El servidor está en app-web.ts.
import { createHash, randomBytes } from "node:crypto";
import { leerEnv, puertoWeb, URL_VPS, type PerfilApi } from "./app-nativo-opciones.ts";

export { leerEnv };

export interface OpcionesWeb {
  api: PerfilApi;
}

export const USO = `Uso: npm run app:web -- [--api local|vps]

  --api vps           API de https://eltru.co (predeterminado)
  --api local         API de la pila local (docker compose up --build)

Sirve la app web con recarga en caliente en http://localhost:<APP_WEB_PORT>/ (8083 sin .env.trabajo). Los enlaces
a /jugar/… se redirigen a la raíz, donde Expo deja la app en desarrollo.
/api y el WebSocket van a la API elegida desde el mismo origen, así la sesión funciona igual que en eltru.co.`;

export const APP_WEB_PREDETERMINADO = 8083;
export const RETORNO_LOCAL = "/api/auth/retorno-local";
/** Cookie del ingreso en curso del proxy: guarda qué verificador PKCE corresponde a este navegador. */
export const COOKIE_INGRESO = "app_web_ingreso";
export const COOKIE_SESION = "truco_sesion";
const diasTreinta = 30 * 24 * 60 * 60;

export function leerArgumentosWeb(argv: string[]): OpcionesWeb {
  let api: PerfilApi = "vps";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [nombre, enLinea] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (nombre !== "--api") throw new Error(`Argumento desconocido: ${arg}`);
    const v = enLinea ?? argv[++i];
    if (v !== "local" && v !== "vps") throw new Error(`Perfil de API desconocido: ${v ?? "(vacío)"}. Usá local o vps.`);
    api = v;
  }
  return { api };
}

export function puertoAppWeb(env: Record<string, string>): number {
  const valor = env.APP_WEB_PORT;
  if (valor === undefined || valor === "") return APP_WEB_PREDETERMINADO;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`APP_WEB_PORT no es un puerto válido: ${valor}`);
  return n;
}

/** Origen de la API según el perfil: eltru.co o la web local del worktree (nginx reenvía /api a la API). */
export const origenApi = (perfil: PerfilApi, env: Record<string, string>) =>
  perfil === "vps" ? URL_VPS : `http://localhost:${puertoWeb(env)}`;

/** Ruta de /jugar/… sin la base, o null si no empieza con /jugar. En desarrollo la app vive en la raíz. */
export function rutaSinBase(ruta: string): string | null {
  if (ruta !== "/jugar" && !ruta.startsWith("/jugar/")) return null;
  return ruta.slice("/jugar".length) || "/";
}

/** ¿Este pedido va a la API? Todo lo demás lo sirve Metro. */
export const esDeLaApi = (ruta: string) => ruta === "/api" || ruta.startsWith("/api/") || ruta.startsWith("/api?");

/**
 * Encabezados del navegador hacia la API: el Host y el Origin pasan a ser los de la API, que rechaza un Origin
 * ajeno al cerrar sesión o abrir el WebSocket. El Referer se descarta.
 */
export function encabezadosHaciaApi(entrada: Record<string, string | string[] | undefined>, api: URL): Record<string, string | string[]> {
  const salida: Record<string, string | string[]> = {};
  for (const [clave, valor] of Object.entries(entrada)) {
    if (valor === undefined) continue;
    const k = clave.toLowerCase();
    if (k === "host" || k === "referer" || k === "origin") continue;
    salida[clave] = valor;
  }
  salida.host = api.host;
  if (entrada.origin !== undefined) salida.origin = api.origin;
  return salida;
}

/** Una redirección de la API a su propio origen vuelve al proxy; las demás (Keycloak, proveedores) quedan igual. */
export function locationHaciaProxy(location: string, api: URL, proxy: URL): string {
  const destino = new URL(location, api);
  if (destino.origin !== api.origin) return location;
  return proxy.origin + destino.pathname + destino.search + destino.hash;
}

/** La cookie de la API, para el proxy en http://localhost: sin Secure ni Domain. */
export function cookieHaciaProxy(cookie: string): string {
  return cookie.split(";").map(p => p.trim()).filter(p => !/^(secure|domain=.*)$/i.test(p)).join("; ");
}

const base64url = (b: Buffer) => b.toString("base64url");

/** Par PKCE S256 (RFC 7636): el verificador queda en el proxy; el desafío viaja a la API. */
export function parPkce(azar: (n: number) => Buffer = randomBytes) {
  const verificador = base64url(azar(32));
  const desafio = base64url(createHash("sha256").update(verificador).digest());
  return { verificador, desafio };
}

/** Adónde vuelve el navegador después de ingresar: una ruta de la app, nunca otro sitio. */
export function destinoDespuesDelIngreso(volver: string | null): string {
  return volver && /^\/jugar\/[A-Za-z0-9_\-/?=&%.]*$/.test(volver) && !volver.includes("//") ? volver : "/jugar/";
}

/** URL del ingreso en la API con el desafío y el retorno de bucle local de este proxy. */
export function urlIngreso(api: URL, proxy: URL, desafio: string): string {
  const url = new URL("/api/auth/login", api);
  url.searchParams.set("app", desafio);
  url.searchParams.set("retorno", proxy.origin + RETORNO_LOCAL);
  return url.href;
}

export const cookieIngreso = (id: string) => `${COOKIE_INGRESO}=${id}; Path=/api/auth/; HttpOnly; SameSite=Lax; Max-Age=600`;
export const cookieSesion = (sesion: string) => `${COOKIE_SESION}=${sesion}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${diasTreinta}`;

export function leerCookie(encabezado: string | undefined, nombre: string): string | undefined {
  for (const parte of (encabezado ?? "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return v.join("=");
  }
  return undefined;
}

export { randomBytes };
export const opcionesDelEnv = (texto: string | undefined) => (texto === undefined ? {} : leerEnv(texto));
