import assert from "node:assert/strict";
import test from "node:test";
import { confirmar, confirmarComputadora, guardarAcciones, jugarComputadoras, leerAccion, prepararTurno, restaurar, type ManoPublicable } from "../../api/turnos.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline, vistaParaPolitica, type RepartoOnline } from "../../src/motor/mesa-online.ts";
import { mazo } from "../../src/motor/cartas.ts";
import { evaluarTantos } from "../../src/motor/tantos.ts";
import { observe } from "../../training/seat/index.ts";
import { dueloFlor, dueloMazo } from "../fixtures/duelo-mazo.ts";

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

test("la flor y la primera ganada de Ana dejan al bot cantar o entregar antes de la segunda carta", () => {
  const mano = restaurar(dueloFlor, "duel", 40, [0]);
  assert.deepEqual(vistaOnline(mano.estado, 0).legales, []);
  assert.deepEqual(vistaOnline(mano.estado, 1).legales, ["mazo", "truco"]);
  assert.equal(vistaOnline(mano.estado, 0).vueltaActual?.salida, 0);
  assert.throws(() => confirmar(mano, "duel", { tipo: "carta", asiento: 0, carta: "oros-10" }), /fuera-de-turno/);
  const obs = observe(mano.estado, 1, "duel", mano.turnos, vistaParaPolitica);
  assert.deepEqual(obs.legalActions, ["copas-02", "bastos-06", "truco"]);
  assert.doesNotMatch(JSON.stringify(obs), /oros-10|oros-02/);

  const fin = jugarComputadoras(mano, "duel", [0]);
  assert.deepEqual(guardarAcciones(fin), [...dueloFlor.acciones, { tipo: "mazo", asiento: 1 }]);
  assert.deepEqual(fin.estado.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }, { equipo: 0, tantos: 1, motivo: "truco" }]);
  assert.deepEqual(restaurar({ ...dueloFlor, acciones: guardarAcciones(fin) }, "duel"), fin);

  const amago = confirmarComputadora(mano, "duel", 1, "truco");
  assert.deepEqual(vistaOnline(amago.estado, 0).legales, ["quiero", "no-quiero", "retruco"]);
  const rechazo = confirmar(amago, "duel", { tipo: "no-quiero", asiento: 0 });
  assert.deepEqual(rechazo.estado.resultado, { equipo: 1, tantos: 1, motivo: "rechazo" });
  const aceptado = prepararTurno(confirmar(amago, "duel", { tipo: "quiero", asiento: 0 }), [0]);
  assert.deepEqual(vistaOnline(aceptado.estado, 1).legales, ["mazo"]);
  const entrega = confirmarComputadora(aceptado, "duel", 1, "bastos-06");
  assert.deepEqual(entrega.estado.resultado, { equipo: 0, tantos: 2, motivo: "mazo" });
  assert.deepEqual(restaurar({ ...dueloFlor, acciones: guardarAcciones(entrega) }, "duel"), entrega);

  const antes = restaurar({ ...dueloFlor, acciones: [...dueloFlor.acciones,
    { tipo: "carta", asiento: 0, carta: "oros-10" }] }, "duel", 40, [0]);
  assert.equal(antes.estado.mano.vueltaActual?.jugadas[0].carta, "oros-10");
  assert.equal(restaurar(dueloFlor, "duel", 40, [1]).estado.antesDeSalida, undefined);
});

test("el bluff y la entrega conservan la meta pactada al reconstruir el chico", () => {
  const mano = restaurar(dueloFlor, "duel", 16, [0]);
  const amago = confirmarComputadora(mano, "duel", 1, "truco");
  const aceptada = confirmar(amago, "duel", { tipo: "quiero", asiento: 0 });
  const fin = jugarComputadoras(aceptada, "duel", [0]);
  assert.equal(fin.estado.resultado?.motivo, "mazo");
  assert.deepEqual(marcadorOnline(fin.estado), [16, 0]);
  const replay = restaurar({ ...dueloFlor, acciones: guardarAcciones(fin) }, "duel", 16, [0]);
  assert.deepEqual(replay, fin);
});

test("las 28 flores compatibles dan la misma decisión y una combinación ganable deja salir a Ana", () => {
  const { reparto } = dueloFlor;
  const expuesta = reparto.manos[0][0];
  const ocultas = mazo.filter(c => c !== expuesta && c !== reparto.muestra && !reparto.manos[1].includes(c));
  let compatibles = 0;
  for (const [i, a] of ocultas.entries()) {
    for (const b of ocultas.slice(i + 1)) {
      const manoAna = [expuesta, a, b] as const;
      if (evaluarTantos(manoAna, reparto.muestra).modalidad !== "flor") continue;
      compatibles++;
      const mano = restaurar({ ...dueloFlor, reparto: { ...reparto, manos: [manoAna, reparto.manos[1]] } }, "duel", 40, [0]);
      assert.equal(mano.estado.antesDeSalida, 1);
    }
  }
  assert.equal(compatibles, 28);

  // Ana en realidad tiene dos piezas, pero el as de bastos y el 7 de espadas podrían barrer dos oros comunes.
  const posible = restaurar({ ...dueloFlor, reparto: { ...reparto,
    manos: [reparto.manos[0], ["bastos-01", "espadas-07", "espadas-05"]] } }, "duel", 40, [0]);
  assert.equal(posible.estado.antesDeSalida, undefined);
  assert.equal(vistaOnline(posible.estado, 0).turno, 0);
});
