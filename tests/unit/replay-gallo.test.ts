import assert from "node:assert/strict";
import test from "node:test";
import chico from "../fixtures/replay-chico/gallo.json" with { type: "json" };
import { decidirGallo, iniciarGallo, vistaGallo } from "@eltruco/motor/replay-gallo.ts";

const { reparto, puntosInicio } = chico.eventos[0];
assert.ok(reparto && puntosInicio);
const inicial = iniciarGallo(reparto, puntosInicio, chico.meta);
const decisiones = chico.eventos.filter(e => e.tipo === "decision");

test("el gallo ve cuatro cartas antes de descartar y sólo los otros dos comparten los tantos del retruco", () => {
  let estado = inicial;
  assert.deepEqual(vistaGallo(estado, reparto.gallo).cartas, reparto.manos[reparto.gallo]);
  assert.deepEqual(estado.habilitados, [1]);
  for (const e of decisiones) {
    estado = decidirGallo(estado, e.accion);
    assert.deepEqual(estado.cobros, e.cobros);
    assert.deepEqual(estado.puntos, e.puntos);
  }
  assert.deepEqual(vistaGallo(estado, reparto.gallo).cartas, ["espadas-01", "copas-11", "bastos-06"]);
  assert.deepEqual(vistaGallo(estado, reparto.gallo).acciones[0], { tipo: "descarte", asiento: 1, carta: "oros-07" });
  assert.deepEqual(estado.puntos, [0, 2]);
  assert.ok(estado.terminada);
  assert.throws(() => decidirGallo(estado, { tipo: "truco", asiento: 1 }));
});

test("los dos oponentes ven lo mismo ante dos descartes distintos en todos los pasos", () => {
  let uno = inicial;
  let otro = inicial;
  for (const asiento of [0, 2]) {
    const vista = vistaGallo(inicial, asiento);
    assert.deepEqual(vista.cartas, reparto.manos[asiento]);
    assert.ok(reparto.manos[reparto.gallo].every(c => !JSON.stringify(vista).includes(c)));
  }
  for (const { accion } of decisiones) {
    assert.ok(accion);
    uno = decidirGallo(uno, accion);
    otro = decidirGallo(otro, accion.tipo === "descarte" ? { ...accion, carta: "espadas-01" } : accion);
    for (const asiento of [0, 2]) assert.deepEqual(vistaGallo(uno, asiento), vistaGallo(otro, asiento));
  }
  assert.notDeepEqual(vistaGallo(uno, reparto.gallo), vistaGallo(otro, reparto.gallo));
});

test("el descarte pertenece al gallo, ocurre una sola vez y precede al canto", () => {
  const descarte = { tipo: "descarte", asiento: 1, carta: "oros-07" };
  assert.throws(() => decidirGallo(inicial, { ...descarte, asiento: 2 }), /turno/);
  assert.throws(() => decidirGallo(inicial, { ...descarte, carta: reparto.muestra }), /cuatro cartas/);
  assert.throws(() => decidirGallo(inicial, { tipo: "truco", asiento: 1 }), /devolver/);
  const descartada = decidirGallo(inicial, descarte);
  assert.throws(() => decidirGallo(descartada, descarte));
  assert.throws(() => iniciarGallo({ ...reparto, gallo: 0 }, puntosInicio, chico.meta), /Reparto/);
  assert.throws(() => iniciarGallo({ ...reparto, muestra: "oros-07" }, puntosInicio, chico.meta), /Reparto/);
});
