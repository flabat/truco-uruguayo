import assert from "node:assert/strict";
import test from "node:test";
import { comparar, reconocerFlor, temas } from "../../src/aprendizaje/lecciones/index.ts";
import { crearSelectorEjemplos } from "../../src/aprendizaje/lecciones/ejemplos.ts";

for (const valor of [0, 0.99]) {
  test(`apertura y tres ciclos independientes de cada tema con azar ${valor}`, () => {
    const seleccionar = crearSelectorEjemplos(() => undefined, () => valor);
    for (const tema of temas) {
      let anterior;
      for (let ciclo = 0; ciclo < 3; ciclo++) {
        const manos = Array.from({ length: 3 }, () => seleccionar(tema));
        if (ciclo === 0) assert.equal(manos[0].uso, "apertura");
        assert.notEqual(manos[0], anterior);
        assert.deepEqual(new Set(manos), new Set(tema.ejemplos));
        anterior = manos.at(-1);
      }
    }
  });
}

test("dos lectores comparten el ciclo. Restaurar un ID válido no sortea ni escribe", () => {
  const datos = new Map<string, string>();
  const almacen = { getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); } };
  const elegir = crearSelectorEjemplos(() => almacen, () => 0);
  const otra = crearSelectorEjemplos(() => almacen, () => 0);
  const primera = elegir(comparar);
  const segunda = otra(comparar);
  const guardado = [...datos];
  const restaurar = crearSelectorEjemplos(() => almacen, () => assert.fail("consumió azar"));
  assert.equal(restaurar(comparar, primera.id), primera);
  assert.deepEqual([...datos], guardado);
  const tercera = elegir(comparar, "retirado");
  assert.equal(new Set([primera, segunda, tercera]).size, 3);
  assert.equal(otra(reconocerFlor).uso, "apertura");
  // La entrada restaurada puede mostrar una mano anterior al último sorteo de otra pestaña.
  assert.equal(elegir(comparar, primera.id), primera);
  assert.equal(elegir(comparar), segunda);
});

test("descarta IDs retirados o duplicados y conserva el ciclo en memoria si falla la escritura", () => {
  const [a, b, c] = comparar.ejemplos;
  const almacen = { getItem: () => JSON.stringify(["retirado", a.id, a.id, 42]),
    setItem: () => { throw new Error("Sin cuota"); } };
  const elegir = crearSelectorEjemplos(() => almacen, () => 0);
  assert.equal(elegir(comparar), b);
  assert.equal(elegir(comparar), c);
  assert.equal(elegir(comparar), a);
});

test("con lectura denegada, un ejemplo restaurado puede iniciar la rotación en memoria", () => {
  const elegir = crearSelectorEjemplos(() => ({
    getItem: () => { throw new Error("Denegado"); },
    setItem: () => assert.fail("escritura"),
  }), () => 0);
  const [a, b, c] = comparar.ejemplos;
  assert.equal(elegir(comparar, c.id), c);
  assert.equal(elegir(comparar), a);
  assert.equal(elegir(comparar), b);
});
