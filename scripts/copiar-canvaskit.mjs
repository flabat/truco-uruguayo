// Copia CanvasKit (el motor de Skia en la web) a app/public para que la exportación lo sirva en /app/canvaskit.wasm.
// No se versiona: sale de node_modules al exportar.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origen = resolve(raiz, "node_modules/canvaskit-wasm/bin/full/canvaskit.wasm");
const destino = resolve(raiz, "app/public/canvaskit.wasm");

if (!existsSync(origen)) {
  console.error(`No se encontró ${origen}. Ejecutá "npm ci" en la raíz para instalar canvaskit-wasm.`);
  process.exit(1);
}
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log("CanvasKit copiado a app/public/canvaskit.wasm");
