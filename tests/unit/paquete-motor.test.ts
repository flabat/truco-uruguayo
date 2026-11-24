import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const raiz = new URL("../../", import.meta.url);
const fuenteDelPaquete = new URL("paquetes/motor/src/", raiz);
const especificador = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

async function archivos(directorio: URL, extensiones: readonly string[]): Promise<URL[]> {
  const entradas = await readdir(directorio, { recursive: true, withFileTypes: true });
  return entradas
    .filter(e => e.isFile() && extensiones.some(x => e.name.endsWith(x)))
    .map(e => new URL(`${e.parentPath}/${e.name}`, "file://"))
    .filter(u => !/\/(node_modules|dist|runs)\//.test(u.pathname));
}

test("el paquete solo importa archivos propios", async () => {
  const fuentes = await archivos(fuenteDelPaquete, [".ts"]);
  assert.ok(fuentes.length > 15, "faltan los archivos del paquete");
  for (const archivo of fuentes) {
    const texto = await readFile(archivo, "utf8");
    for (const [, ruta] of texto.matchAll(especificador)) {
      assert.match(ruta, /^\.\/[a-z0-9-]+\.ts$/, `${archivo.pathname} importa ${ruta}`);
    }
  }
});

test("nadie importa la ruta vieja del motor", async () => {
  const vieja = /src\/motor\/|@site\/motor\/|["'][./]+(?:[^"']*\/)?motor\/[a-z0-9-]+(\.ts)?["']/;
  const propio = fileURLToPath(import.meta.url);
  for (const carpeta of ["src", "api", "training", "scripts", "tests", "video", "docs"]) {
    for (const archivo of await archivos(new URL(`${carpeta}/`, raiz), [".ts", ".tsx", ".astro", ".mjs"])) {
      if (fileURLToPath(archivo) === propio) continue;
      const texto = await readFile(archivo, "utf8");
      assert.equal(texto.match(vieja)?.[0], undefined, archivo.pathname);
    }
  }
});

test("@eltruco/motor resuelve desde la raíz y desde api/", async () => {
  const motor = await import("@eltruco/motor/mesa-online.ts");
  assert.equal(typeof motor.iniciarOnline, "function");
  assert.match(import.meta.resolve("@eltruco/motor/mesa-online.ts"), /\/paquetes\/motor\/src\/mesa-online\.ts$/);
  const desdeApi = spawnSync(process.execPath, ["--input-type=module", "-e",
    "const m = await import('@eltruco/motor/mesa-online.ts'); console.log(typeof m.iniciarOnline, import.meta.resolve('@eltruco/motor/mesa-online.ts'))"],
  { cwd: fileURLToPath(new URL("api/", raiz)), encoding: "utf8" });
  assert.equal(desdeApi.status, 0, desdeApi.stderr);
  assert.match(desdeApi.stdout, /^function file:.*\/paquetes\/motor\/src\/mesa-online\.ts\n$/);
});
