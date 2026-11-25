#!/usr/bin/env node
// Asociación del dominio con la app (universal links de iOS y App Links de Android).
//
//   node scripts/enlaces-app.mjs generar <carpeta>   escribe los archivos de /.well-known/ que se puedan
//   node scripts/enlaces-app.mjs verificar [.env]    avisa si faltan los datos de las cuentas
//
// Los datos salen de APPLE_TEAM_ID (Team ID de Apple Developer) y ANDROID_CERT_SHA256 (huellas SHA-256
// de los certificados de firma de Play, separadas por comas). Sin ellos no se escribe el archivo de esa
// plataforma: el servidor responde 404 y los enlaces siguen abriendo la web.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const idDeLaApp = "co.eltru.app";

const consultas = (...claves) => claves.map(clave => ({ [clave]: "?*" }));

/**
 * Rutas que abren la app, en el orden en que iOS las evalúa: gana la primera que coincide.
 * `/jugar/` y `/app/` solo con `?invitacion=`, `?mesa=` o `?mirar=`; `/volver/` solo con `?mesa=`.
 * Las rutas profundas de la exportación web (`/app/…` hoy, `/jugar/…` cuando se mude) también.
 */
export function componentesApple() {
  const excluidas = ["/api/*", "/realms/*", "/resources/*", "/aprender/*", "/reglas/*", "/app/_expo/*", "/jugar/_expo/*"]
    .map(ruta => ({ "/": ruta, exclude: true, comment: "Contenido del sitio o de la API" }));
  const raices = ["/jugar", "/jugar/", "/app", "/app/"].flatMap(ruta =>
    consultas("invitacion", "mesa", "mirar").map(consulta => ({ "/": ruta, "?": consulta })));
  const volver = ["/volver", "/volver/"].map(ruta => ({ "/": ruta, "?": { mesa: "?*" } }));
  const profundas = ["/app", "/jugar"].flatMap(base =>
    ["invitacion", "sala", "mirar"].map(pantalla => ({ "/": `${base}/${pantalla}/?*` })));
  return [...excluidas, ...raices, ...volver, ...profundas];
}

/** Prefijos de Android: sus filtros no distinguen la consulta, así que `/jugar/` sin parámetros abre el salón. */
export const rutasAndroid = ["/jugar", "/volver", "/app"];

export function validarTeamId(valor) {
  const id = (valor ?? "").trim();
  if (!id) return null;
  if (!/^[A-Z0-9]{10}$/.test(id)) throw new Error(`APPLE_TEAM_ID inválido: "${id}" (son 10 letras mayúsculas o dígitos)`);
  return id;
}

export function validarHuellas(valor) {
  const huellas = (valor ?? "").split(/[\s,]+/).filter(Boolean).map(huella => {
    const hex = huella.replace(/:/g, "").toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hex)) throw new Error(`ANDROID_CERT_SHA256 inválida: "${huella}" (son 32 bytes en hexadecimal)`);
    return hex.match(/../g).join(":");
  });
  return huellas.length ? [...new Set(huellas)] : null;
}

export function asociacionApple(teamId) {
  const id = validarTeamId(teamId);
  if (!id) return null;
  return {
    applinks: { details: [{ appIDs: [`${id}.${idDeLaApp}`], components: componentesApple() }] },
  };
}

export function vinculosAndroid(huellas) {
  const lista = validarHuellas(huellas);
  if (!lista) return null;
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: idDeLaApp, sha256_cert_fingerprints: lista },
  }];
}

/** Escribe en `carpeta` los archivos que tienen datos y devuelve los avisos de los que faltan. */
export function generar(carpeta, entorno) {
  const apple = asociacionApple(entorno.APPLE_TEAM_ID);
  const android = vinculosAndroid(entorno.ANDROID_CERT_SHA256);
  mkdirSync(carpeta, { recursive: true });
  if (apple) writeFileSync(join(carpeta, "apple-app-site-association"), JSON.stringify(apple, null, 2) + "\n");
  if (android) writeFileSync(join(carpeta, "assetlinks.json"), JSON.stringify(android, null, 2) + "\n");
  return avisos(entorno);
}

export function avisos(entorno) {
  const lista = [];
  if (!validarTeamId(entorno.APPLE_TEAM_ID)) {
    lista.push("Falta APPLE_TEAM_ID: los enlaces de invitación abren la web en iOS, no la app.");
  }
  if (!validarHuellas(entorno.ANDROID_CERT_SHA256)) {
    lista.push("Falta ANDROID_CERT_SHA256: los enlaces de invitación abren la web en Android, no la app.");
  }
  return lista;
}

function leerEnv(ruta) {
  if (!existsSync(ruta)) return {};
  const valores = {};
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    const par = linea.match(/^\s*(APPLE_TEAM_ID|ANDROID_CERT_SHA256)\s*=\s*(.*?)\s*$/);
    if (par) valores[par[1]] = par[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return valores;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [orden, destino] = process.argv.slice(2);
  try {
    let lista;
    if (orden === "generar" && destino) lista = generar(destino, process.env);
    else if (orden === "verificar") lista = avisos({ ...leerEnv(destino ?? ".env"), ...pickDefined(process.env) });
    else throw new Error("Uso: enlaces-app.mjs generar <carpeta> | verificar [.env]");
    for (const aviso of lista) console.warn("Aviso: " + aviso);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function pickDefined(entorno) {
  return Object.fromEntries(["APPLE_TEAM_ID", "ANDROID_CERT_SHA256"].filter(k => entorno[k]).map(k => [k, entorno[k]]));
}
