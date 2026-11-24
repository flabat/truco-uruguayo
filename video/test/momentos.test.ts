import assert from "node:assert/strict";
import test from "node:test";
import { momentosDePrueba } from "../scripts/momentos.ts";
import { armarLinea, type LineaGuion, type Palabra } from "../src/lib/linea.ts";
import fixture from "./fixtures/envido-03.json" with { type: "json" };

const palabras = fixture.palabras as Palabra[];
const lineas = fixture.lineas as LineaGuion[];

test("los momentos de prueba nombran cada línea presente, en orden", () => {
  const m = momentosDePrueba(armarLinea(lineas, palabras));
  assert.deepEqual(m.map(([id]) => id).filter((id) => !id.startsWith("pausa")),
    ["pregunta", "cartas", "respuesta1", "cambio", "respuesta2", "tercera", "cierre"]);
  assert.ok(m.every(([, t], i) => i === 0 || t >= m[i - 1][1]));
});

test("sin la línea pregunta no falla", () => {
  const n = palabras.findIndex((p) => p.text === "Cinco");
  const sinPregunta = armarLinea(lineas.slice(1), palabras.slice(n));
  assert.ok(!momentosDePrueba(sinPregunta).some(([id]) => id === "pregunta"));
});
