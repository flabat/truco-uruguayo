import assert from "node:assert/strict";
import test from "node:test";
import { verboDeCanto } from "../../paquetes/cliente/src/cantos.ts";

test("el truco se grita, el envido se toca y la flor se canta", () => {
  for (const tipo of ["truco", "retruco", "vale-cuatro"] as const) assert.equal(verboDeCanto(tipo), "gritó");
  for (const tipo of ["envido", "real-envido", "falta-envido"] as const) assert.equal(verboDeCanto(tipo), "tocó");
  for (const tipo of ["flor", "con-flor-envido", "contraflor-al-resto"] as const) assert.equal(verboDeCanto(tipo), "cantó");
  for (const tipo of ["quiero", "no-quiero", "con-flor-quiero", "paso-flor", "mazo"] as const) assert.equal(verboDeCanto(tipo), "dijo");
});
