import assert from "node:assert/strict";
import test from "node:test";
import { cuentaDelChico, esMetaDeChico, metaPorModalidad, mitadesDelChico } from "../../src/motor/chico.ts";

test("el chico de tercetos tiene 25 malas y 25 buenas, con cuenta por equipo", () => {
  const meta = metaPorModalidad["3v3"];
  assert.equal(meta, 50);
  assert.equal(mitadesDelChico(meta), "25 malas y 25 buenas");
  assert.deepEqual([24, 25, 26, 49, 50].map(n => cuentaDelChico(n, meta)),
    ["24 malas", "0 buenas", "1 buena", "24 buenas", "25 buenas"]);
  assert.equal(metaPorModalidad["2v2"], 40);
  assert.equal(metaPorModalidad["1v1"], 40);
});

test("una meta pactada divide el chico en mitades enteras", () => {
  assert.ok(esMetaDeChico(26));
  assert.equal(cuentaDelChico(14, 26), "1 buena");
  assert.equal(mitadesDelChico(2), "1 mala y 1 buena");
  for (const valor of [null, -2, 0, 1, 3, 4.5, "50", Infinity, 2 ** 31]) {
    assert.equal(esMetaDeChico(valor), false);
  }
});
