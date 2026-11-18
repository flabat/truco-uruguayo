import assert from "node:assert/strict";
import test from "node:test";
import { reconocerFlor, temas, type Tema } from "../../src/aprendizaje/lecciones/index.ts";
import { familiasPorHabilidad, proveedorSituaciones } from "../../src/aprendizaje/generadores/index.ts";
import { crearFuenteProgreso } from "../../src/aprendizaje/progreso.ts";
import { generarSesion } from "../../src/aprendizaje/sesion.ts";
import { evaluarTantos } from "../../src/motor/tantos.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import { pieza } from "../../src/motor/cartas.ts";

test("el catálogo cubre las familias y los ejemplos resueltos coinciden con las reglas", () => {
  assert.equal(new Set(temas.map((tema) => tema.id)).size, temas.length);
  assert.deepEqual(new Set(temas.map((tema) => tema.habilidad)), new Set(Object.keys(familiasPorHabilidad)));
  for (const [habilidad, familias] of Object.entries(familiasPorHabilidad)) {
    const cubiertas = temas.filter((tema) => tema.habilidad === habilidad).flatMap((tema) => tema.familias);
    assert.deepEqual(new Set(cubiertas), new Set(familias));
  }
  for (const tema of temas) {
    const { cartas, muestra } = tema.ejemplo;
    assert.equal(new Set([muestra, ...cartas]).size, 1 + cartas.length);
    switch (tema.id) {
      case "comparar-cartas": assert.ok(compararCartas(cartas[0], cartas[1], muestra) > 0); break;
      case "reconocer-piezas": assert.deepEqual(cartas.map((carta) => pieza(carta, muestra)), [4, 5, null]); break;
      case "reconocer-flor": assert.equal(evaluarTantos(cartas, muestra).forma, "una-pieza-y-dos-del-mismo-palo"); break;
      case "contar-envido": assert.equal(evaluarTantos(cartas, muestra).total, 36); break;
      case "contar-flor": assert.equal(evaluarTantos(cartas, muestra).total, 39); break;
    }
  }
});

test("una lección adicional de flor aparente reutiliza la decisión, las pistas y la generación", () => {
  const adicional: Tema = {
    ...reconocerFlor, id: "flor-aparente", titulo: "Una pieza y dos palos",
    familias: ["flor-aparente"],
    ejemplo: { muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "espadas-01"],
      detalle: "Las dos cartas que acompañan a la pieza son de palos distintos. Falta flor." },
  };
  const fuente = crearFuenteProgreso(() => undefined);
  const sesion = generarSesion(adicional, 3, proveedorSituaciones, fuente);
  assert.equal(sesion.pasoActual?.tipo, "decidir-flor");
  assert.equal(sesion.responder({ tipo: "decidir-flor", hayFlor: true }).correcta, false);
  assert.match(sesion.pedirPista(), /compará los palos/);
  assert.equal(sesion.responder({ tipo: "decidir-flor", hayFlor: false }).correcta, true);
  assert.equal(sesion.completada, true);
  const otra = generarSesion(adicional, 3, proveedorSituaciones, fuente);
  assert.notEqual(otra.situacion.clave, sesion.situacion.clave);
});
