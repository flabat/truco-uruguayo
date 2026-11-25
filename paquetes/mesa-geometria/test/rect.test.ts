import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaDeCarta, contiene, seCortan, unir } from "../src/index.ts";

function cerca(real: number, esperado: number) {
  assert.ok(Math.abs(real - esperado) < 1e-9, `${real} ≠ ${esperado}`);
}

test("la caja de una carta rotada 90° gira alrededor de su centro", () => {
  const caja = cajaDeCarta({ x: 0, y: 0, ancho: 100, alto: 155.2, rotacion: 90 });
  cerca(caja.x, -27.6);
  cerca(caja.y, 27.6);
  cerca(caja.ancho, 155.2);
  cerca(caja.alto, 100);
});

test("sin rotación la caja es la misma carta", () => {
  assert.deepEqual(cajaDeCarta({ x: 3, y: 4, ancho: 10, alto: 20, rotacion: 0 }), { x: 3, y: 4, ancho: 10, alto: 20 });
});

test("dos rectángulos que solo comparten un borde no se cortan", () => {
  assert.equal(seCortan({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 10, y: 0, ancho: 10, alto: 10 }), false);
  assert.equal(seCortan({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 9, y: 9, ancho: 10, alto: 10 }), true);
});

test("unir da la caja de todos", () => {
  assert.deepEqual(unir([{ x: 0, y: 5, ancho: 10, alto: 10 }, { x: 20, y: 0, ancho: 5, alto: 5 }]), { x: 0, y: 0, ancho: 25, alto: 15 });
});

test("contiene tolera medio punto de desborde", () => {
  const pantalla = { x: 0, y: 0, ancho: 100, alto: 100 };
  assert.equal(contiene(pantalla, { x: -0.4, y: 0, ancho: 100.8, alto: 50 }), true);
  assert.equal(contiene(pantalla, { x: -1, y: 0, ancho: 50, alto: 50 }), false);
});
