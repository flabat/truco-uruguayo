import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const raiz = join(import.meta.dirname, "../../app/src");

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap(e => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

const fuentes = archivos(raiz).map(ruta => ({ ruta: relative(raiz, ruta), texto: readFileSync(ruta, "utf8") }));

// Con la extensión, Metro toma el archivo exacto y la web empaqueta la capa nativa: Skia entra en la
// ruta en vez de quedar en el paquete aparte del lienzo.
test("CapaLienzo se importa sin extensión para que Metro elija la versión de cada plataforma", () => {
  const conExtension = fuentes.filter(f => /CapaLienzo\.(web\.)?tsx["']/.test(f.texto)).map(f => f.ruta);
  assert.deepEqual(conExtension, []);
});

// En las apps, la carga web de Skia arrastra canvaskit-wasm y rompe la exportación nativa.
test("la carga web de Skia solo aparece en archivos .web", () => {
  const fuera = fuentes
    .filter(f => !/\.web\.tsx?$/.test(f.ruta) && /WithSkiaWeb|lib\/module\/web/.test(f.texto))
    .map(f => f.ruta);
  assert.deepEqual(fuera, []);
});
