import assert from "node:assert/strict";
import test from "node:test";
import { momentosDeComparar, momentosDePrueba } from "../scripts/momentos.ts";
import { resolverVueltas, type EpisodioComparar } from "../src/lib/episodio.ts";
import { vozSilenciosa } from "../src/lib/escena.ts";
import { guionCompararCartas } from "../src/plantillas/comparar-cartas/guion.ts";
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

test("los momentos de comparar cartas muestran cada vuelta y su resultado", () => {
  const ep: EpisodioComparar = { plantilla: "comparar-cartas", serie: "c", id: "1", muestra: "bastos-06", gancho: "¿Cuál gana?",
    vueltas: [["bastos-02", "espadas-01"], ["espadas-07", "copas-07"], ["oros-03", "copas-03"]] };
  const lineas = guionCompararCartas(ep, resolverVueltas(ep));
  const m = momentosDeComparar(armarLinea(lineas, vozSilenciosa(lineas).palabras));
  assert.deepEqual(m.map(([id]) => id),
    ["pregunta", "vuelta1", "pausa vuelta1", "respuesta1", "vuelta2", "respuesta2", "vuelta3", "respuesta3", "escala", "cierre"]);
  assert.ok(m.every(([, t], i) => i === 0 || t >= m[i - 1][1]));
});
