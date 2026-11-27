import assert from "node:assert/strict";
import test from "node:test";
import duelo from "../fixtures/replay-chico/duelo.json" with { type: "json" };
import parejas from "../fixtures/replay-chico/parejas.json" with { type: "json" };
import tercetos from "../fixtures/replay-chico/tercetos.json" with { type: "json" };
import { dueloFlor, dueloMazo } from "../fixtures/duelo-mazo.ts";
import { reproducirChico } from "../../api/replay-chico.ts";
import { iniciarChicoOnline, decidirChicoOnline, vistaChicoOnline } from "../../api/replay-chico-online.ts";

test("duelo mixto: la falta aceptada por la computadora paga 40 antes de tirar una carta", () => {
  const antes = reproducirChico(duelo, 1, 2);
  assert.deepEqual(antes.puntos, [0, 0]);
  assert.ok(antes.vista && "legales" in antes.vista && antes.vista.legales.some(accion => accion === "quiero"));
  const despues = reproducirChico(duelo, 1, 3);
  assert.deepEqual(despues.puntos, [40, 0]);
  assert.equal(despues.vista?.acciones.some(a => a.tipo === "carta"), false);
  assert.deepEqual(despues.vista?.cobros, [{ equipo: 0, tantos: 40, motivo: "envido", asiento: 0, tantoGanador: 33,
    comparacionEnvido: { indiceAccion: 1, participantes: [{ asiento: 0, total: 33 }, { asiento: 1, total: null }] } }]);
});

test("parejas: la seña y la carta ocupan una sola posición, invisible como gesto para ambos rivales", () => {
  const silencio = structuredClone(parejas);
  const decision = silencio.eventos.find(e => e.accion?.sena);
  assert.ok(decision?.accion);
  delete decision.accion.sena;
  for (let hasta = decision.secuencia; hasta <= parejas.eventos.length; hasta++) {
    for (const asiento of [1, 3]) {
      assert.deepEqual(reproducirChico(parejas, asiento, hasta), reproducirChico(silencio, asiento, hasta));
    }
  }
  for (const asiento of [0, 2]) {
    const { vista } = reproducirChico(parejas, asiento, decision.secuencia);
    assert.ok(vista && "turnos" in vista);
    assert.deepEqual(vista.turnos?.at(-1), { action: { tipo: "carta", asiento: 0, carta: "espadas-01" }, awards: [], signal: "cejas" });
    assert.deepEqual(vista.acciones[1], { tipo: "quiero", asiento: 3 });
  }
  assert.deepEqual(reproducirChico(parejas, 3).puntos, [2, 0]);
});

test("tercetos: un solo reparto abre el segundo duelo, preserva el cobro del primero y cierra antes del tercero", () => {
  const redondilla = reproducirChico(tercetos, 0, 1).vista;
  assert.ok(redondilla && "lance" in redondilla);
  assert.equal(redondilla.lance?.tipo, "redondilla");
  const espera = reproducirChico(tercetos, 0, 8).vista;
  assert.ok(espera && "lance" in espera);
  assert.deepEqual(espera.lance, { tipo: "pico-a-pico", activos: [5, 2], duelo: 1 });
  assert.equal("cartas" in espera, false);
  assert.doesNotMatch(JSON.stringify(espera), /copas-05|copas-06|copas-07/);

  const siguiente = reproducirChico(tercetos, 0, 11);
  assert.deepEqual(siguiente.puntos, [3, 1]);
  assert.ok(siguiente.vista && "lance" in siguiente.vista && "cartas" in siguiente.vista);
  assert.equal(siguiente.vista.muestra, espera.muestra);
  assert.deepEqual(siguiente.vista.lance, { tipo: "pico-a-pico", activos: [0, 3], duelo: 2 });
  assert.deepEqual(siguiente.vista.cartas, ["copas-05", "copas-06", "copas-07"]);
  assert.deepEqual(siguiente.vista.historialLances?.[0].cobros.map(c => c.tantos), [2, 1]);
  const fin = reproducirChico(tercetos, 1);
  assert.deepEqual(fin.puntos, [10, 1]);
  assert.ok(fin.vista && "lance" in fin.vista && fin.vista.historialLances?.length === 2);
  assert.equal("cartas" in fin.vista, false);
  assert.deepEqual(fin.vista.cobros[0], { equipo: 0, tantos: 7, valor: 15, motivo: "flor", asiento: 0, tantoGanador: 38 });
});

test("el lector rechaza una seña de otro perfil, un canto desconocido y un índice de duelo falso", () => {
  const dados = duelo.eventos[0].reparto;
  const estado = iniciarChicoOnline("duel", dados, [0, 0], 40, 1);
  for (const accion of [
    { tipo: "envido", asiento: 0, sena: "cejas" }, { tipo: "desconocido", asiento: 0 },
    { tipo: "carta", asiento: 0, carta: "falsa" }, { tipo: "envido", asiento: 0, carta: "oros-07" },
  ]) assert.throws(() => decidirChicoOnline(estado, accion));
  assert.throws(() => iniciarChicoOnline("pairs", dados, [0, 0], 40, 1), /reparto/);
  const otra = structuredClone(tercetos);
  otra.eventos[10].duelo = 2;
  assert.throws(() => reproducirChico(otra, 0), /Secuencia 11: .*duelo/);
});

test("la entrega automática del duelo pertenece solo a una computadora de la mesa en línea", () => {
  function segundaPerdida(humanos?: number[]) {
    const inicio = iniciarChicoOnline("duel", dueloMazo.reparto, dueloMazo.puntos_inicio, 40, 1, humanos);
    return dueloMazo.acciones.reduce((estado, accion) => decidirChicoOnline(estado, accion), inicio);
  }
  const entrega = { tipo: "mazo", asiento: 1 };
  assert.throws(() => decidirChicoOnline(segundaPerdida([0, 1]), entrega), /computadora/);
  assert.throws(() => decidirChicoOnline(segundaPerdida(), entrega), /computadora/);
  assert.equal(decidirChicoOnline(segundaPerdida([0]), entrega).terminada, true);
});

test("el replay de una mesa conserva la oportunidad del bot tras la flor y la arena conserva la salida natural", () => {
  function reproducirFlor(humanos?: readonly number[]) {
    const inicio = iniciarChicoOnline("duel", dueloFlor.reparto, dueloFlor.puntos_inicio, 40, 1, humanos);
    return dueloFlor.acciones.reduce((estado, accion) => decidirChicoOnline(estado, accion), inicio);
  }
  const mesa = reproducirFlor([0]);
  assert.deepEqual(vistaChicoOnline(mesa, 1).legales, ["mazo", "truco"]);
  assert.deepEqual(decidirChicoOnline(mesa, { tipo: "mazo", asiento: 1 }).cobros, [{ equipo: 0, tantos: 1, motivo: "truco" }]);
  assert.equal(vistaChicoOnline(reproducirFlor(), 0).turno, 0);
});

test("una corrección de la computadora requiere la propuesta original", () => {
  const conCorreccion = (bot: Record<string, unknown>) => {
    const copia = structuredClone(duelo);
    const decision = copia.eventos.find(e => e.tipo === "decision" && e.bot);
    assert.ok(decision?.bot);
    Object.assign(decision.bot, bot);
    return copia;
  };
  assert.doesNotThrow(() => reproducirChico(conCorreccion({ propuesta: "no-quiero", correccion: "nunca-querer-perdida" }), 1));
  assert.throws(() => reproducirChico(conCorreccion({ correccion: "nunca-querer-perdida" }), 1), /Procedencia/);
  assert.throws(() => reproducirChico(conCorreccion({ propuesta: "no-quiero", correccion: 7 }), 1), /Procedencia/);
});
