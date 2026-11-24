import assert from "node:assert/strict";
import test from "node:test";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { armarLinea, type LineaGuion, type Palabra } from "../src/lib/linea.ts";
import fixture from "./fixtures/envido-03.json" with { type: "json" };

const lineas = fixture.lineas as LineaGuion[];
const palabras = fixture.palabras as Palabra[];

test("arma tramos contiguos y respeta las pausas marcadas", () => {
  const linea = armarLinea(lineas, palabras);
  assert.equal(linea.tramos.length, lineas.length);
  assert.deepEqual(linea.pausas.map((p) => p.id), ["cartas", "cambio"]);
  for (const p of linea.pausas) assert.ok(Math.abs(p.hasta - p.desde - 3) < 0.01, `${p.id}: ${p.hasta - p.desde}`);
  // La primera línea termina en «?» pero no lleva pausa para contar: solo un respiro.
  assert.ok(linea.tramos[1].inicio - (linea.tramos[0].inicio + linea.tramos[0].hasta - linea.tramos[0].desde) < 0.5);
  for (let n = 1; n < linea.tramos.length; n++) assert.equal(linea.tramos[n].desde, linea.tramos[n - 1].hasta);
});

test("cuando devuelve el tiempo en el video", () => {
  const linea = armarLinea(lineas, palabras);
  const tramo = linea.tramos[2];
  const primera = palabras.findIndex((p) => p.text === "Treinta");
  assert.equal(linea.cuando("respuesta1", "treinta"), tramo.inicio + palabras[primera].start - tramo.desde);
  assert.equal(linea.cuando("respuesta1", "nunca"), null);
  assert.equal(linea.inicio("respuesta1"), tramo.inicio);
  assert.ok(linea.fin("respuesta1") > linea.inicio("respuesta1"));
});

test("los subtítulos cortan al final de cada oración", () => {
  const { pages } = createTikTokStyleCaptions({ captions: armarLinea(lineas, palabras).subtitulos, combineTokensWithinMilliseconds: 4000 });
  assert.ok(!pages.some((p) => p.text.includes("da?") && p.text.includes("Treinta")), "una página cruza la pausa");
  for (const p of pages) assert.match(p.text.trim(), /[.?!]$/);
});

test("un texto que no coincide nombra la línea", () => {
  const cambiadas = lineas.map((l) => l.id === "respuesta1" ? { ...l, texto: "Treinta y tres. Otra cosa." } : l);
  assert.throws(() => armarLinea(cambiadas, palabras), /respuesta1/);
});

test("la duración suma voz, pausas y cola", () => {
  const linea = armarLinea(lineas, palabras, { pausa: 2, respiro: 0.5, cola: 1 });
  const voz = linea.tramos.reduce((s, t) => s + t.hasta - t.desde, 0);
  const esperada = voz + 2 * 2 + 0.5 * (lineas.length - 3) + 1;
  assert.ok(Math.abs(linea.duracion - esperada) < 1e-9, `${linea.duracion} ≠ ${esperada}`);
});
