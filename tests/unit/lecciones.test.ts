import assert from "node:assert/strict";
import test from "node:test";
import { comparar, elegirApertura, reconocerFlor, temas, type Tema } from "../../src/aprendizaje/lecciones/index.ts";
import { claveSituacion, familiasPorHabilidad, generarSituacion } from "../../src/aprendizaje/generadores/index.ts";
import { crearFuenteProgreso } from "../../src/aprendizaje/progreso.ts";
import { generarPractica } from "../../src/aprendizaje/lecciones/practica.ts";
import { evaluarTantos } from "../../src/motor/tantos.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import { esCardId, pieza } from "../../src/motor/cartas.ts";

test("el catálogo cubre las familias y los ejemplos resueltos coinciden con las reglas", () => {
  assert.equal(new Set(temas.map((tema) => tema.id)).size, temas.length);
  assert.deepEqual(new Set(temas.map((tema) => tema.habilidad)), new Set(Object.keys(familiasPorHabilidad)));
  for (const [habilidad, familias] of Object.entries(familiasPorHabilidad)) {
    const cubiertas = temas.filter((tema) => tema.habilidad === habilidad).flatMap((tema) => tema.familias);
    assert.deepEqual(new Set(cubiertas), new Set(familias));
  }
  for (const tema of temas) {
    const ejemplos = tema.ejemplos;
    assert.deepEqual(ejemplos.map((e) => e.uso), ["apertura", "apertura", "repaso"]);
    assert.equal(new Set(ejemplos.map((e) => e.id)).size, 3);
    assert.equal(new Set(ejemplos.map((e) => claveSituacion(e.muestra, e.cartas))).size, 3);
    assert.equal(elegirApertura(tema, () => 0), ejemplos[0]);
    assert.equal(elegirApertura(tema, () => 0.999), ejemplos[1]);
    for (const { cartas, muestra } of ejemplos) {
      assert.equal(cartas.length, tema.comparar ? 2 : 3);
      assert.ok([muestra, ...cartas].every(esCardId));
      assert.equal(new Set([muestra, ...cartas]).size, 1 + cartas.length);
    }
  }
});

test("las ganadoras, las piezas efectivas y las formas de flor coinciden con las quince manos revisadas", () => {
  const ejemplos = (id: string) => temas.find((tema) => tema.id === id)!.ejemplos;
  assert.deepEqual(comparar.ejemplos.map(({ cartas, muestra }) =>
    Math.sign(compararCartas(cartas[0], cartas[1], muestra))), [1, -1, 0]);
  assert.deepEqual(ejemplos("reconocer-piezas").map(({ cartas, muestra }) =>
    cartas.map((carta) => pieza(carta, muestra))), [[5, null, null], [null, null, 4], [4, 5, null]]);
  assert.deepEqual(reconocerFlor.ejemplos.map(({ cartas, muestra }) => evaluarTantos(cartas, muestra).forma),
    ["tres-del-mismo-palo", "dos-del-mismo-palo", "una-pieza-y-dos-del-mismo-palo"]);

  const cuentas = ["contar-envido", "contar-flor"].flatMap((id) =>
    ejemplos(id).map(({ cartas, muestra }) => {
      const { modalidad, total, desgloses } = evaluarTantos(cartas, muestra);
      assert.equal(id, "contar-" + modalidad);
      assert.equal(desgloses.length, 1);
      const { base, aportes } = desgloses[0];
      return [total, base, ...aportes.map(({ carta, tantos }) => [carta, tantos])];
    }));
  assert.deepEqual(cuentas, [
    [31, 20, ["copas-04", 4], ["copas-07", 7]],
    [28, 20, ["oros-05", 5], ["oros-03", 3]],
    [36, 0, ["bastos-04", 29], ["copas-07", 7]],
    [31, 20, ["copas-07", 7], ["copas-03", 3], ["copas-01", 1]],
    [32, 20, ["oros-02", 2], ["oros-06", 6], ["oros-04", 4]],
    [39, 20, ["bastos-04", 9], ["copas-07", 7], ["copas-03", 3]],
  ]);
});

test("la práctica evita cada ejemplo, aun reordenado, y las manos recientes", () => {
  // Sin exclusiones estas semillas reparten las tres manos publicadas.
  for (const [i, semilla] of [99736, 129348, 12166].entries()) {
    const ejemplo = comparar.ejemplos[i];
    const clave = claveSituacion(ejemplo.muestra, ejemplo.cartas);
    const familia = comparar.familias[semilla % comparar.familias.length];
    assert.equal(generarSituacion({ habilidad: comparar.habilidad, familia, semilla, recientes: [] }).clave, clave);
    const fuente = crearFuenteProgreso(() => undefined);
    const primera = generarPractica(comparar, semilla, fuente).situacion;
    const otra = generarPractica(comparar, semilla, fuente).situacion;
    assert.equal(new Set([clave, primera.clave, otra.clave]).size, 3);
  }
});

test("una lección adicional de flor aparente reutiliza la decisión, las pistas y la generación", () => {
  const adicional: Tema = {
    ...reconocerFlor, id: "flor-aparente", titulo: "Una pieza y dos palos",
    familias: ["flor-aparente"],
    ejemplos: [{ id: "una-pieza", uso: "apertura", muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "espadas-01"],
      detalle: "Las dos cartas que acompañan a la pieza son de palos distintos. Falta flor." }],
  };
  const fuente = crearFuenteProgreso(() => undefined);
  const sesion = generarPractica(adicional, 3, fuente);
  assert.equal(sesion.pasoActual?.tipo, "decidir-flor");
  assert.equal(sesion.responder({ tipo: "decidir-flor", hayFlor: true }).correcta, false);
  assert.match(sesion.pedirPista(), /compará los palos/);
  assert.equal(sesion.responder({ tipo: "decidir-flor", hayFlor: false }).correcta, true);
  assert.equal(sesion.completada, true);
  const otra = generarPractica(adicional, 3, fuente);
  assert.notEqual(otra.situacion.clave, sesion.situacion.clave);
});
