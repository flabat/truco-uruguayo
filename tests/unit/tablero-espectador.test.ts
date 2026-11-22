import test from "node:test";
import assert from "node:assert/strict";
import { tableroEspectador } from "../../api/tablero-espectador.ts";
import { restaurar, type Registro } from "../../api/turnos.ts";
import { vistaOnline } from "../../src/motor/mesa-online.ts";
import { dueloFlor, dueloMazo } from "../fixtures/duelo-mazo.ts";

test("el cierre por mazo conserva la flor pública sin revelar las cartas que prueban los tantos", () => {
  let anterior: string | undefined;
  for (const [a, b] of [["espadas-01", "espadas-02"], ["espadas-03", "espadas-10"]] as const) {
    const fila: Registro = { ...dueloFlor,
      reparto: { ...dueloFlor.reparto, muestra: "oros-11", manos: [["espadas-06", a, b], ["copas-04", "copas-05", "oros-02"]] },
      acciones: [
        { tipo: "flor", asiento: 0 }, { tipo: "flor", asiento: 1 }, { tipo: "quiero", asiento: 1 },
        { tipo: "carta", asiento: 0, carta: "espadas-06" }, { tipo: "carta", asiento: 1, carta: "copas-04" },
        { tipo: "mazo", asiento: 1 },
      ],
    };
    const { estado } = restaurar(fila, "duel", 40);
    assert.ok(vistaOnline(estado, 0).pruebasDeTantos?.length);
    const tablero = tableroEspectador(estado);
    assert.equal(tablero.resultado?.motivo, "mazo");
    assert.deepEqual(tablero.comparacionFlor, [{ asiento: 0, total: 29 }, { asiento: 1, total: 39 }]);
    const json = JSON.stringify(tablero);
    for (const oculta of [a, b, "copas-05", "oros-02"]) assert.ok(!json.includes(oculta));
    if (anterior) assert.equal(json, anterior);
    anterior = json;
  }
});

test("el envido que cierra el chico muestra los tantos y ninguna carta de la mano", () => {
  const fila: Registro = { ...dueloMazo, reparto: { ...dueloMazo.reparto, reglaFlor: "inmediata-v2" },
    acciones: [{ tipo: "envido", asiento: 1 }, { tipo: "quiero", asiento: 0 }] };
  const { estado } = restaurar(fila, "duel", 2);
  const tablero = tableroEspectador(estado);
  assert.equal(tablero.resultado?.motivo, "envido");
  assert.equal(tablero.cobros[0].tantos, 2);
  for (const oculta of fila.reparto.manos.flat()) assert.ok(!JSON.stringify(tablero).includes(oculta));
});

test("el espectador ve la respuesta de la computadora en los repartos que la hacen pública", () => {
  const acciones = dueloFlor.acciones.slice(0, 2);
  const historico = restaurar({ ...dueloFlor, acciones }, "duel", 40);
  assert.deepEqual(tableroEspectador(historico.estado).acciones, acciones.slice(0, 1));

  const reparto = { ...dueloFlor.reparto, reglaFlor: "inmediata-v2", respondenSinFlor: [1] } as const;
  const actual = restaurar({ ...dueloFlor, reparto, acciones }, "duel", 40);
  const tablero = tableroEspectador(actual.estado);
  assert.deepEqual(tablero.acciones, acciones);
  assert.deepEqual(tablero.cobros.map(c => c.tantos), [3]);
});
