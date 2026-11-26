import assert from "node:assert/strict";
import test from "node:test";
import { asientosQueTraban, efectoDeSalida, type AsientoActivo } from "../../api/abandono.ts";

const mesa = (activos: boolean[]): AsientoActivo[] => activos.map((activo, asiento) => ({ asiento, activo }));

test("en 1v1 la salida cierra la partida a favor del rival", () => {
  assert.deepEqual(efectoDeSalida("1v1", mesa([true, false]), 0), { tipo: "cerrar", ganador: 1 });
  assert.deepEqual(efectoDeSalida("1v1", mesa([true, true]), 1), { tipo: "cerrar", ganador: 0 });
});

test("en 2v2 la salida cede el asiento si queda otro humano activo", () => {
  assert.deepEqual(efectoDeSalida("2v2", mesa([true, false, true, false]), 0), { tipo: "ceder" });
  assert.deepEqual(efectoDeSalida("2v2", mesa([true, true, false, false]), 1), { tipo: "ceder" });
});

test("en 3v3 la salida del único activo cierra a favor del otro equipo", () => {
  assert.deepEqual(efectoDeSalida("3v3", mesa([false, false, false, false, true, false]), 4), {
    tipo: "cerrar",
    ganador: 1,
  });
});

test("traban los asientos que deben decidir y están activos sin conexión", () => {
  assert.deepEqual(asientosQueTraban([0], undefined, [0, 1], [1]), [0]);
  assert.deepEqual(asientosQueTraban([0, 2], undefined, [0, 2], [2]), []);
  // La computadora compañera no responde por A mientras A puede decidir.
  assert.deepEqual(asientosQueTraban([0, 2], undefined, [0], []), [0]);
  // Solo deciden computadoras: juegan ellas.
  assert.deepEqual(asientosQueTraban([1, 3], undefined, [0], []), []);
  assert.deepEqual(asientosQueTraban([0, 2], undefined, [0, 2], []), [0, 2]);
  assert.deepEqual(asientosQueTraban([], undefined, [0, 1], []), []);
});

test("el pie desconectado traba aunque no esté entre los que deciden", () => {
  assert.deepEqual(asientosQueTraban([1], 2, [0, 2], [0]), [2]);
  assert.deepEqual(asientosQueTraban([2], 2, [0, 2], []), [2]);
  assert.deepEqual(asientosQueTraban([1], 2, [0, 2], [0, 2]), []);
});
