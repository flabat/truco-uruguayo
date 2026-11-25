#!/usr/bin/env node
// Calcula la versión del árbol que se va a construir: commit, rama, fecha, cambios sin commit y etiqueta.
// Compose la pasa a las imágenes como argumentos de build y la API la publica en GET /api/version.
//
//   eval "$(node scripts/version.mjs --exportar)" && docker compose up --build --wait
//
// Sin --exportar imprime el JSON. `variablesDeVersion` sirve a otros scripts (npm run vps).
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function git(cwd, ...argumentos) {
  try {
    return execFileSync("git", argumentos, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Variables de entorno para `docker compose build` a partir del checkout en `cwd`. */
export function variablesDeVersion(cwd = process.cwd(), ahora = new Date()) {
  const commit = git(cwd, "rev-parse", "HEAD");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${cwd} no es un checkout de git con commits.`);
  return {
    TRUCO_RELEASE: commit,
    TRUCO_RAMA: git(cwd, "branch", "--show-current"),
    TRUCO_FECHA: ahora.toISOString(),
    // Cualquier cambio sin commit, incluidos los archivos nuevos que entran al contexto de Docker.
    TRUCO_SUCIO: git(cwd, "status", "--porcelain") ? "1" : "0",
    TRUCO_ETIQUETA: git(cwd, "describe", "--tags", "--exact-match", "HEAD"),
  };
}

const comillas = valor => "'" + valor.replaceAll("'", "'\\''") + "'";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const variables = variablesDeVersion();
  if (process.argv.includes("--exportar")) {
    for (const [nombre, valor] of Object.entries(variables)) console.log(`export ${nombre}=${comillas(valor)}`);
  } else {
    console.log(JSON.stringify(variables, null, 2));
  }
}
