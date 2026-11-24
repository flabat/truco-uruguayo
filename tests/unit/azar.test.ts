import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { enteroAleatorio } from "@eltruco/motor/azar.ts";

test("un argumento devuelve enteros en [0, n)", () => {
  for (let i = 0; i < 10_000; i++) {
    const x = enteroAleatorio(4);
    assert.ok(Number.isInteger(x) && x >= 0 && x < 4, String(x));
  }
});

test("dos argumentos devuelven enteros en [min, max)", () => {
  for (let i = 0; i < 10_000; i++) {
    const x = enteroAleatorio(3, 40);
    assert.ok(Number.isInteger(x) && x >= 3 && x < 40, String(x));
  }
});

test("reparte de forma pareja", () => {
  const cuentas = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60_000; i++) cuentas[enteroAleatorio(6)]++;
  for (const c of cuentas) assert.ok(c > 9_400 && c < 10_600, String(cuentas));
});

test("rechaza rangos inválidos", () => {
  for (const args of [[0], [5, 5], [7, 2], [1.5], [0, 2 ** 33]]) {
    assert.throws(() => enteroAleatorio(...(args as [number, number])), RangeError, String(args));
  }
});

test("el motor no importa node:crypto", async () => {
  const fuente = await readFile(new URL(import.meta.resolve("@eltruco/motor/mesa-online.ts")), "utf8");
  assert.doesNotMatch(fuente, /node:crypto/);
});
