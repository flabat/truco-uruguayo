import assert from "node:assert/strict";
import test from "node:test";
import { armarLinea, type LineaGuion, type Palabra } from "../src/lib/linea.ts";
import { momentosDeCartas, valoresDePiezas, vozSilenciosa } from "../src/lib/escena.ts";
import fixture from "./fixtures/envido-03.json" with { type: "json" };

const linea = armarLinea(fixture.lineas as LineaGuion[], fixture.palabras as Palabra[]);

function lineaDe(texto: string) {
  const palabras = texto.split(" ").map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  return armarLinea([{ id: "cartas", texto }], palabras);
}

test("ordena por la palabra dicha", () => {
  const [cinco, siete, dos] = momentosDeCartas(linea, "cartas", ["oros-05", "oros-07", "copas-02"]);
  assert.equal(cinco, linea.cuando("cartas", "cinco"));
  assert.equal(siete, linea.cuando("cartas", "siete"));
  assert.equal(dos, linea.cuando("cartas", "dos"));
  assert.ok(cinco < siete && siete < dos);
});

test("un rango repetido toma la siguiente ocurrencia", () => {
  const l = lineaDe("Siete de oros y siete de copas.");
  assert.deepEqual(momentosDeCartas(l, "cartas", ["oros-07", "copas-07"]), [0, 2]);
});

test("sin la palabra cae al inicio de la línea", () => {
  const l = lineaDe("Mirá estas cartas.");
  assert.deepEqual(momentosDeCartas(l, "cartas", ["bastos-12", "oros-01", "copas-03"]), [0, 0.15, 0.3]);
});

test("valoresDePiezas sale del motor y respeta el rey sustituto", () => {
  const rangos = (m: string) => valoresDePiezas(m as never).map((v) => [v.carta, v.envido, v.flor]);
  assert.deepEqual(rangos("bastos-06"), [
    ["bastos-02", 30, 10], ["bastos-04", 29, 9], ["bastos-05", 28, 8], ["bastos-11", 27, 7], ["bastos-10", 27, 7]]);
  assert.deepEqual(rangos("copas-04"), [
    ["copas-02", 30, 10], ["copas-12", 29, 9], ["copas-05", 28, 8], ["copas-11", 27, 7], ["copas-10", 27, 7]]);
});

test("vozSilenciosa da una palabra cada 0,3 s para previsualizar sin audio", () => {
  const voz = vozSilenciosa([{ id: "a", texto: "Hola che." }, { id: "b", texto: "Chau." }]);
  assert.equal(voz.archivo, "");
  assert.deepEqual(voz.palabras.map((p) => [p.text, p.start]), [["Hola", 0], ["che.", 0.3], ["Chau.", 0.6]]);
});
