import assert from "node:assert/strict";
import test from "node:test";
import { resumirTantos } from "@eltruco/motor/resumen-tantos.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline, vistaOnlineV1, vistaTercetos, type AccionOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import { manoReportada, reparto } from "../fixtures/flor-retruco.ts";
import pico from "../fixtures/pico-tercetos-v2.json" with { type: "json" };

test("el resumen separa el acumulado y limita cada cobro sin modificar el registro", () => {
  for (const [inicio, meta, esperado] of [[[2, 1], 20, [6, 0]], [[8, 0], 10, [2, 0]]] as const) {
    const estado = manoReportada(inicio, meta);
    const antes = JSON.stringify(estado);
    for (const asiento of [0, 1] as const) {
      const resumen = vistaOnline(estado, asiento).resumenTantos!;
      assert.deepEqual(resumen.totales, esperado);
      assert.deepEqual(resumen.totales, marcadorOnline(estado).map((p, i) => p - inicio[i]));
      if (inicio[0] === 8) {
        assert.deepEqual(resumen.cobros.map(c => [c.tantos, c.valor]), [[2, 3]]);
        assert.equal(estado.resultado?.motivo, "flor");
      }
    }
    assert.equal(JSON.stringify(estado), antes);
    assert.equal(vistaOnlineV1(estado, 0).resumenTantos, undefined);
  }
  assert.deepEqual(vistaOnline(iniciarOnline(reparto), 0).resumenTantos?.totales, [0, 0]);
});

test("ambos equipos conservan su total y el tope se aplica en orden", () => {
  const cobros = [{ equipo: 0, tantos: 3, motivo: "flor" }, { equipo: 1, tantos: 2, motivo: "truco" },
    { equipo: 0, tantos: 4, motivo: "truco" }] as const;
  assert.deepEqual(resumirTantos(cobros, [6, 8], 10), {
    totales: [4, 2], cobros: [cobros[0], cobros[1], { ...cobros[2], tantos: 1, valor: 4 }],
  });
  assert.deepEqual(resumirTantos([]).totales, [0, 0]);
});

test("cada prefijo del pico suma los lances una sola vez, también al cierre anticipado y al reconstruir", () => {
  let estado = iniciarOnline(pico.reparto as RepartoOnline, [12, 11], pico.meta, pico.numero);
  for (const accion of pico.acciones) {
    const paso = aplicarOnline(estado, accion as AccionOnline);
    assert.ok(paso.ok);
    estado = paso.estado;
    const puntos = marcadorOnline(estado);
    for (const asiento of [0, 1, 2, 3, 4, 5] as const) {
      const vista = vistaTercetos(estado, asiento);
      assert.deepEqual(vista.resumenReparto?.totales, [puntos[0] - 12, puntos[1] - 11]);
      assert.deepEqual(vista.resumenTantos?.totales,
        puntos.map((p, i) => p - estado.puntosInicio[i]));
      assert.deepEqual(vistaTercetos(JSON.parse(JSON.stringify(estado)), asiento), vista);
    }
  }
  assert.deepEqual(vistaTercetos(estado, 0).resumenReparto?.totales, [14, 0]);
  assert.deepEqual(vistaTercetos(estado, 0).resumenTantos?.cobros.map(c => [c.tantos, c.valor]), [[11, 15]]);
});
