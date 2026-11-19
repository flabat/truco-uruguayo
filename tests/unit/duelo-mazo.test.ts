import assert from "node:assert/strict";
import test from "node:test";
import { confirmar, confirmarComputadora, guardarAcciones, jugarComputadoras, leerAccion, restaurar, type ManoPublicable } from "../../api/turnos.ts";
import { aplicarOnline, iniciarOnline, vistaOnline, type RepartoOnline } from "../../src/motor/mesa-online.ts";
import { dueloMazo } from "../fixtures/duelo-mazo.ts";

test("ambas cartas perdedoras se entregan tapadas y la mano guardada conserva el cobro y la privacidad", () => {
  const mano = restaurar(dueloMazo, "duel");
  assert.deepEqual(vistaOnline(mano.estado, 1).legales, ["carta", "retruco"]);
  for (const carta of ["oros-07", "bastos-01"] as const) {
    const fin = confirmarComputadora(mano, "duel", 1, carta);
    assert.deepEqual(fin.estado.resultado, { equipo: 0, tantos: 2, motivo: "mazo" });
    assert.deepEqual(fin.estado.cobros, [
      { equipo: 1, tantos: 1, motivo: "envido" }, { equipo: 0, tantos: 2, motivo: "truco" },
    ]);
    const acciones = guardarAcciones(fin);
    assert.deepEqual(acciones, [...dueloMazo.acciones, { tipo: "mazo", asiento: 1 }]);
    assert.deepEqual(restaurar({ ...dueloMazo, acciones }, "duel"), fin);
    const vista = vistaOnline(fin.estado, 0);
    assert.equal(vista.turno, null);
    assert.deepEqual(vista.legales, []);
    assert.doesNotMatch(JSON.stringify(vista), /oros-07|bastos-01/);
    assert.deepEqual(aplicarOnline(fin.estado, { tipo: "mazo", asiento: 1 }), { ok: false, error: "mano-cerrada" });
  }
  assert.throws(() => leerAccion({ tipo: "mazo" }, 1, "duel"));
  // Un registro anterior conserva la carta que realmente se mostró.
  const anterior = restaurar({ ...dueloMazo, acciones: [...dueloMazo.acciones,
    { tipo: "carta", asiento: 1, carta: "oros-07" }] }, "duel");
  assert.equal(anterior.estado.resultado?.motivo, "vueltas");
  assert.equal(anterior.turnos.at(-1)?.action.tipo, "carta");
});

test("el retruco de la computadora puede ganar por rechazo o cerrar al mazo por tres tantos", () => {
  const amago = confirmarComputadora(restaurar(dueloMazo, "duel"), "duel", 1, "retruco");
  assert.equal(amago.estado.resultado, null);
  assert.equal(amago.turnos.at(-1)?.action.tipo, "retruco");
  const rechazo = confirmar(amago, "duel", { tipo: "no-quiero", asiento: 0 });
  assert.deepEqual(rechazo.estado.resultado, { equipo: 1, tantos: 2, motivo: "rechazo" });
  const aceptada = confirmar(amago, "duel", { tipo: "quiero", asiento: 0 });
  const fin = jugarComputadoras(aceptada, "duel", [0]);
  assert.deepEqual(fin.estado.resultado, { equipo: 0, tantos: 3, motivo: "mazo" });
  assert.deepEqual(fin.turnos.at(-1)?.action, { tipo: "mazo", asiento: 1 });
});

test("empardar la segunda no alcanza, pero una pieza que puede ganarla mantiene las cartas jugables", () => {
  const { reparto } = dueloMazo;
  const parda = restaurar({ ...dueloMazo, reparto: { ...reparto,
    manos: [["oros-03", "bastos-03", "bastos-06"], ["oros-02", "espadas-03", "oros-06"]] },
    acciones: [...dueloMazo.acciones.slice(0, -1), { tipo: "carta", asiento: 0, carta: "bastos-03" }] }, "duel");
  assert.equal(confirmarComputadora(parda, "duel", 1, "espadas-03").estado.resultado?.motivo, "mazo");

  // Con el 10 de copas de muestra, el rey de copas hace de pieza y gana al as de espadas.
  const conPieza = restaurar({ ...dueloMazo, reparto: { ...reparto,
    manos: [reparto.manos[0], ["oros-02", "bastos-01", "copas-12"]] } }, "duel");
  assert.equal(confirmarComputadora(conPieza, "duel", 1, "copas-12").estado.resultado, null);
  assert.equal(confirmarComputadora(conPieza, "duel", 1, "bastos-01").estado.resultado?.motivo, "vueltas");
});

test("una primera parda y una mesa de parejas conservan la jugada de la computadora", () => {
  const reparto: RepartoOnline = { ...dueloMazo.reparto, mano: 0, dador: 1,
    manos: [["espadas-02", "espadas-01", "bastos-06"], dueloMazo.reparto.manos[1]] };
  const parda = restaurar({ ...dueloMazo, reparto, acciones: [
    { tipo: "carta", asiento: 0, carta: "espadas-02" }, { tipo: "carta", asiento: 1, carta: "oros-02" },
    { tipo: "carta", asiento: 0, carta: "espadas-01" },
  ] }, "duel");
  assert.equal(confirmarComputadora(parda, "duel", 1, "oros-07").turnos.at(-1)?.action.tipo, "carta");

  const parejas: RepartoOnline = { ...dueloMazo.reparto, mano: 0, dador: 3, manos: [
    ...dueloMazo.reparto.manos, ["copas-06", "bastos-05", "oros-05"], ["bastos-07", "copas-04", "espadas-06"],
  ] };
  let mano: ManoPublicable = { estado: iniciarOnline(parejas), turnos: [] };
  for (const [asiento, carta] of [[0, "oros-03"], [1, "oros-02"], [2, "copas-06"], [3, "bastos-07"], [0, "espadas-01"]] as const) {
    mano = confirmar(mano, "pairs", { tipo: "carta", asiento, carta });
  }
  assert.equal(confirmarComputadora(mano, "pairs", 1, "oros-07").turnos.at(-1)?.action.tipo, "carta");
});
