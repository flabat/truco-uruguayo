import assert from "node:assert/strict";
import test from "node:test";
import { capturarTruco, reproducirTruco } from "@eltruco/motor/replay-truco.ts";
import { aplicarAccion, iniciarTruco, resultadoTruco, type AccionTruco, type EstadoTruco } from "@eltruco/motor/truco.ts";
import type { Jugada } from "@eltruco/motor/mano.ts";
import vector from "../fixtures/replay-v1.json" with { type: "json" };

const inicial = iniciarTruco(217, 3);
const oferta = { tipo: "truco", asiento: 0 } as const;
const cartas = (vector.jugadas as Jugada[]).map((j) => ({ tipo: "carta", ...j } as const));

function aplicar(estado: EstadoTruco, accion: AccionTruco) {
  const paso = aplicarAccion(estado, accion);
  assert.ok(paso.ok, JSON.stringify(paso));
  return paso.estado;
}

test("cantar en cualquiera de las tres vueltas conserva el turno y las cartas hasta que responde un rival", () => {
  for (const indice of [0, 4, 9]) {
    const mesa = cartas.slice(0, indice).reduce(aplicar, inicial);
    const pendiente = aplicar(mesa, oferta);
    assert.deepEqual(pendiente.mano, mesa.mano);
    assert.equal(resultadoTruco(pendiente), null);
    for (const asiento of [1, 3] as const) {
      const querida = aplicar(pendiente, { tipo: "quiero", asiento });
      assert.deepEqual(querida.mano, mesa.mano);
      assert.equal(querida.apuesta, "querido");
      const final = cartas.slice(indice).reduce(aplicar, querida);
      assert.deepEqual(resultadoTruco(final), { equipo: 0, tantos: 2, motivo: "vueltas" });
    }
  }
  assert.deepEqual(resultadoTruco(cartas.reduce(aplicar, inicial)), { equipo: 0, tantos: 1, motivo: "vueltas" });
});

test("rechazar cuando el cantor perdió la primera concede uno a su pareja y bloquea otra acción", () => {
  const mesa = cartas.slice(0, 5).reduce(aplicar, inicial);
  const pendiente = aplicar(mesa, { tipo: "truco", asiento: 1 });
  const cerrada = aplicar(pendiente, { tipo: "no-quiero", asiento: 2 });
  assert.deepEqual(resultadoTruco(cerrada), { equipo: 1, tantos: 1, motivo: "rechazo" });
  assert.deepEqual(cerrada.mano, mesa.mano);
  for (const accion of [cartas[5], oferta, { tipo: "quiero", asiento: 0 } as const]) {
    assert.deepEqual(aplicarAccion(cerrada, accion), { ok: false, error: "mano-cerrada" });
  }
});

test("el replay V2 restaura cada prefijo de cartas y cantos, incluso después de un no quiero", () => {
  for (const final of [
    [oferta, { tipo: "no-quiero", asiento: 3 }] as const,
    [oferta, { tipo: "quiero", asiento: 1 }, ...cartas] as const,
  ]) {
    let mesa = inicial;
    for (let cantidad = 0; cantidad <= final.length; cantidad++) {
      const registro = { version: 2, versionReglas: 2, versionReparto: 1, semilla: 217, dador: 3,
        acciones: final.slice(0, cantidad) };
      assert.deepEqual(capturarTruco(mesa), registro);
      const prefijo = reproducirTruco(JSON.stringify(registro));
      assert.ok(prefijo.ok);
      assert.deepEqual(prefijo.estado, mesa);
      if (cantidad < final.length) mesa = aplicar(prefijo.estado, final[cantidad]);
    }
  }
});

test("se rechazan ofertas, respuestas y cartas ilegales con la posición exacta del evento", () => {
  const registro = capturarTruco(inicial);
  const querer = { tipo: "quiero", asiento: 3 };
  for (const [acciones, error] of [
    [[null], "accion-invalida"], [[{ tipo: "retruco", asiento: 0 }], "accion-invalida"],
    [[{ ...oferta, asiento: 1 }], "fuera-de-turno"], [[querer], "sin-oferta"],
    [[oferta, cartas[0]], "falta-respuesta"], [[oferta, oferta], "falta-respuesta"],
    [[oferta, { ...querer, asiento: 2 }], "responde-el-rival"],
    [[oferta, querer, oferta], "truco-ya-querido"], [[oferta, querer, querer], "sin-oferta"],
    [[oferta, querer, { ...cartas[0], asiento: 1 }], "fuera-de-turno"],
    [[...cartas, oferta], "mano-cerrada"],
  ] as const) {
    assert.deepEqual(reproducirTruco({ ...registro, acciones }), { ok: false, error, posicion: acciones.length });
  }
  assert.deepEqual(reproducirTruco("{"), { ok: false, error: "json-invalido" });
  for (const dato of [null, { ...registro, dador: 4 }, { ...registro, semilla: -1 }, { ...registro, acciones: {} }]) {
    assert.deepEqual(reproducirTruco(dato), { ok: false, error: "formato-invalido" });
  }
  for (const campo of ["version", "versionReglas", "versionReparto"]) {
    assert.deepEqual(reproducirTruco({ ...registro, [campo]: 99 }), { ok: false, error: "version-desconocida", campo });
  }
});
