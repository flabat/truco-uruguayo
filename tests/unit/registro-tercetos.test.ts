import assert from "node:assert/strict";
import test from "node:test";
import { asientoBotTercetos, proyectarTercetos, restaurarTercetosDB, type RegistroTercetos } from "../../api/partidas-tercetos.ts";
import { leerAccion } from "../../api/turnos.ts";

const fila: RegistroTercetos = {
  mesa: "test", numero: 2, version: 1, version_reglas: 2, version_senas: null, meta_tercetos: 26,
  puntos_inicio: [2, 4], tipo_reparto: "pico-a-pico", acciones: [],
  reparto: { versionReparto: "online-2", dador: 4, mano: 5, muestra: "copas-06", manos: [
    ["oros-03", "espadas-12", "oros-01"], ["copas-03", "oros-12", "copas-01"],
    ["bastos-04", "espadas-05", "oros-07"], ["oros-04", "bastos-05", "espadas-07"],
    ["bastos-01", "espadas-02", "bastos-07"], ["oros-06", "espadas-03", "oros-11"],
  ] },
};

test("la bitácora recupera una respuesta pendiente con la prioridad de un humano habilitado", () => {
  const pendiente = {...fila, version: 2, acciones: [{asiento: 5, tipo: "truco", duelo: 1} as const]};
  const estado = restaurarTercetosDB(pendiente);
  assert.equal(asientoBotTercetos(estado, [0, 4]), 2);
  assert.equal(asientoBotTercetos(estado, [2]), undefined);
  const rival = proyectarTercetos(estado, fila.numero, pendiente.version, 2);
  assert.deepEqual(rival.lance, {tipo: "pico-a-pico", duelo: 1, activos: [5, 2]});
  assert.ok(rival.vista.legales.includes("quiero"));
  const espera = proyectarTercetos(estado, fila.numero, pendiente.version, 4);
  assert.deepEqual(espera.puntos, [2, 4]);
  assert.equal(espera.meta, 26);
  assert.equal(espera.vista.estado, "esperando");
  assert.deepEqual(espera.vista.legales, []);
  for (const terna of fila.reparto.manos) for (const carta of terna) assert.ok(!JSON.stringify(espera).includes(carta));
});

test("el lector V2 rechaza desajustes de versión, modalidad y duelo del comando", () => {
  assert.throws(() => restaurarTercetosDB({...fila, version_reglas: 3}), {status: 503});
  assert.throws(() => restaurarTercetosDB({...fila, tipo_reparto: "redondilla"}), /tipo de reparto/);
  assert.throws(() => restaurarTercetosDB({...fila, acciones: [{asiento: 5, tipo: "truco", duelo: 2}]}), /otro duelo/);
  assert.throws(() => restaurarTercetosDB({...fila, acciones: [{asiento: 4, tipo: "truco", duelo: 1}]}), /Acción inválida/);
});

test("el servidor identifica asiento y lance en tercetos", () => {
  assert.deepEqual(leerAccion({tipo: "mazo"}, 5, "triples"), {tipo: "mazo", asiento: 5});
  for (const accion of [{tipo: "mazo", asiento: 2}, {tipo: "mazo", duelo: 1}, {tipo: "truco", sena: "cejas"}]) {
    assert.throws(() => leerAccion(accion, 5, "triples"), {status: 400});
  }
});
