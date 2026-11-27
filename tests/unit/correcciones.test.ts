import assert from "node:assert/strict";
import test from "node:test";
import { corregirDecision } from "@eltruco/motor/correcciones.ts";
import type { EstadoOnline } from "@eltruco/motor/cantos-online.ts";
import { aplicarOnline, iniciarOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import { restaurar } from "../../api/turnos.ts";
import { dueloMazo, dueloVale, hasta } from "../fixtures/duelo-mazo.ts";

const conDos = ["bastos-01", "espadas-06", "oros-02"] as const;

// Ana es mano y sale con el 5 de copas. La computadora gana la primera con el as de espadas y guarda el 2 de la muestra.
function primeraConTres(): EstadoOnline {
  const reparto: RepartoOnline = { versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 1, mano: 0, muestra: "oros-07",
    manos: [["copas-05", "bastos-06", "espadas-04"], ["oros-02", "espadas-01", "copas-06"]] };
  const paso = aplicarOnline(iniciarOnline(reparto), { tipo: "carta", asiento: 0, carta: "copas-05" });
  assert.ok(paso.ok);
  return paso.estado;
}

test("#460: el quiero al vale cuatro con la mano perdida pasa a no quiero", () => {
  assert.deepEqual(corregirDecision(restaurar(dueloVale, "duel").estado, 1, "quiero"),
    { decision: "no-quiero", correccion: "nunca-querer-perdida" });
});

test("con la mano perdida, la subida queda como está", () => {
  // Truco querido y 4 de oros en la mesa: a la computadora solo le queda el as de espadas.
  assert.deepEqual(corregirDecision(hasta(9).estado, 1, "retruco"), { decision: "retruco" });
});

test("con la mano ganada y un truco pendiente, quiero y no quiero pasan a retruco", () => {
  const estado = hasta(7, conDos).estado;
  for (const decision of ["quiero", "no-quiero"] as const) {
    assert.deepEqual(corregirDecision(estado, 1, decision), { decision: "retruco", correccion: "subir-ganada" });
  }
});

test("con la mano ganada y el vale cuatro pendiente, no quiero pasa a quiero", () => {
  const estado = hasta(11, conDos).estado;
  assert.deepEqual(corregirDecision(estado, 1, "no-quiero"), { decision: "quiero", correccion: "subir-ganada" });
});

test("con la mano ganada en su turno, la carta pasa al retruco", () => {
  assert.deepEqual(corregirDecision(hasta(9, conDos).estado, 1, "oros-02"),
    { decision: "retruco", correccion: "subir-ganada" });
});

test("con la mano ganada en la primera vuelta, la carta pasa al truco y el envido queda", () => {
  const estado = primeraConTres();
  assert.deepEqual(corregirDecision(estado, 1, "espadas-01"), { decision: "truco", correccion: "subir-ganada" });
  assert.deepEqual(corregirDecision(estado, 1, "envido"), { decision: "envido" });
});

test("sin desenlace seguro no se corrige nada", () => {
  assert.deepEqual(corregirDecision(hasta(7).estado, 1, "quiero"), { decision: "quiero" });
});

test("con un canto lateral pendiente, el quiero y el no quiero no se corrigen", () => {
  const base = hasta(7, conDos).estado;
  const estado: EstadoOnline = { ...base, lateral: { tipo: "envido", asiento: 0, valor: 2, anterior: 1 } };
  for (const decision of ["quiero", "no-quiero"] as const) {
    assert.deepEqual(corregirDecision(estado, 1, decision), { decision });
  }
});

test("corregir dos veces da lo mismo que corregir una", () => {
  const casos = [
    [restaurar(dueloVale, "duel").estado, "quiero"], [hasta(7, conDos).estado, "quiero"],
    [hasta(11, conDos).estado, "no-quiero"], [hasta(9, conDos).estado, "oros-02"],
    [restaurar(dueloMazo, "duel").estado, "oros-07"], [primeraConTres(), "espadas-01"],
  ] as const;
  for (const [estado, decision] of casos) {
    const una = corregirDecision(estado, 1, decision).decision;
    assert.deepEqual(corregirDecision(estado, 1, una), { decision: una });
  }
});

test("la regla del #452 se conserva como entregar-mazo", () => {
  assert.deepEqual(corregirDecision(restaurar(dueloMazo, "duel").estado, 1, "oros-07"),
    { decision: "mazo", correccion: "entregar-mazo" });
});
