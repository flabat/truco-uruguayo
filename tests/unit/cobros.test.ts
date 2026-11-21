import assert from "node:assert/strict";
import test from "node:test";
import { motivoDelCobro } from "../../src/lib/cobros.ts";
import { marcadorOnline, vistaOnline } from "../../src/motor/mesa-online.ts";
import { manoReportada } from "../fixtures/flor-retruco.ts";

test("flor más retruco conserva ambos cobros públicos y suma seis", () => {
  const estado = manoReportada();
  assert.deepEqual(marcadorOnline(estado), [6, 0]);
  assert.equal(estado.resultado?.tantos, 3);
  for (const asiento of [0, 1] as const) {
    const vista = vistaOnline(estado, asiento);
    assert.deepEqual(vista.cobros.map(c => [c.equipo, c.tantos, motivoDelCobro(c, vista.acciones, vista.resultado)]),
      [[0, 3, "flor"], [0, 3, "retruco querido"]]);
  }
});

test("el cobro distingue apuesta aceptada, rechazo y retiro", () => {
  for (const [tantos, texto] of [[1, "truco sin cantar"], [2, "truco querido"], [3, "retruco querido"], [4, "vale cuatro querido"]] as const) {
    const c = { equipo: 0, tantos, motivo: "truco" } as const;
    assert.equal(motivoDelCobro(c, [], { equipo: 0, tantos, motivo: "vueltas" }), texto);
    assert.equal(motivoDelCobro(c, [], { equipo: 0, tantos, motivo: "mazo" }), texto + " · retiro al mazo");
  }
  for (const tipo of ["truco", "retruco", "vale-cuatro"] as const) {
    assert.equal(motivoDelCobro({ equipo: 0, tantos: 2, motivo: "truco" }, [{ asiento: 0, tipo }],
      { equipo: 0, tantos: 2, motivo: "rechazo" }), tipo.replace("vale-cuatro", "vale cuatro") + " no querido");
  }
});
