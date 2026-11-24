import assert from "node:assert/strict";
import test from "node:test";
import { aPalabras, nombreHablado, palabraDeRango } from "../src/lib/numeros.ts";
import { plano } from "../src/lib/texto.ts";

test("aPalabras cubre los tantos posibles", () => {
  const casos: Record<number, string> = { 0: "cero", 1: "uno", 7: "siete", 16: "dieciséis", 20: "veinte", 21: "veintiuno",
    22: "veintidós", 23: "veintitrés", 26: "veintiséis", 29: "veintinueve", 30: "treinta",
    31: "treinta y uno", 33: "treinta y tres", 38: "treinta y ocho", 44: "cuarenta y cuatro", 47: "cuarenta y siete" };
  for (const [n, palabras] of Object.entries(casos)) assert.equal(aPalabras(Number(n)), palabras);
  assert.throws(() => aPalabras(100), RangeError);
  assert.throws(() => aPalabras(-1), RangeError);
  assert.throws(() => aPalabras(2.5), RangeError);
});

test("plano iguala mayúsculas, tildes y signos", () => {
  assert.equal(plano("¿Cuánto  CANTÁS?"), "cuanto cantas");
  assert.equal(plano("Probá otra mano, ¡ya!"), "proba otra mano ya");
});

test("nombreHablado usa as, sota, caballo y rey", () => {
  assert.equal(nombreHablado("espadas-01"), "as de espadas");
  assert.equal(nombreHablado("bastos-11"), "caballo de bastos");
  assert.equal(nombreHablado("oros-10"), "sota de oros");
  assert.equal(nombreHablado("copas-12"), "rey de copas");
  assert.equal(nombreHablado("copas-07"), "siete de copas");
});

test("palabraDeRango nombra cada rango", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((r) => palabraDeRango(r as never)),
    ["as", "dos", "tres", "cuatro", "cinco", "seis", "siete", "sota", "caballo", "rey"]);
});
