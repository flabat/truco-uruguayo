import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { efectos } from "../../app/src/sonido/efectos.ts";
import { asientosConVoz, clipsDeVoz, metodoDeclaracion } from "../../app/src/sonido/frases.ts";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sonido = path.join(raiz, "app/assets/sonido");
const manifiesto = readFileSync(path.join(raiz, "app/src/sonido/recursos.ts"), "utf8");
const requeridos = [...manifiesto.matchAll(/require\("\.\.\/\.\.\/assets\/sonido\/([^"]+)"\)/g)].map(m => m[1]);

const esMp3 = (archivo: string) => {
  const b = readFileSync(archivo);
  return (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || b.toString("latin1", 0, 3) === "ID3";
};

test("el manifiesto se grabó con el método de declaración vigente", () => {
  assert.match(manifiesto, new RegExp(`metodoGrabado = "${metodoDeclaracion}"`));
});

test("cada asiento tiene un clip por frase, con el nombre que da la lista", () => {
  const esperados = Array.from({ length: asientosConVoz }, (_, a) => clipsDeVoz().map(c => `voces/${a}/${c.clave}.mp3`));
  for (const archivo of esperados.flat()) {
    assert.ok(requeridos.includes(archivo), `falta en el manifiesto: ${archivo}`);
    const ruta = path.join(sonido, archivo);
    assert.ok(existsSync(ruta), `falta el archivo: ${archivo}`);
    assert.ok(esMp3(ruta), `no es MP3: ${archivo}`);
  }
  const enDisco = globSync("voces/**/*.mp3", { cwd: sonido }).sort();
  assert.deepEqual(enDisco, esperados.flat().sort(), "hay clips sobrantes o faltantes");
});

test("los cuatro efectos existen y el manifiesto no nombra archivos inexistentes", () => {
  for (const e of efectos) assert.ok(requeridos.includes(`efectos/${e}.mp3`), e);
  for (const archivo of requeridos) assert.ok(esMp3(path.join(sonido, archivo)), archivo);
});

test("el sonido de la app pesa menos de 6 MB", () => {
  const total = globSync("**/*.mp3", { cwd: sonido }).reduce((n, a) => n + statSync(path.join(sonido, a)).size, 0);
  assert.ok(total < 6 * 1024 * 1024, `${(total / 1024 / 1024).toFixed(2)} MB`);
});
