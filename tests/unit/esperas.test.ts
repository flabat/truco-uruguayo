import assert from "node:assert/strict";
import test from "node:test";
import { crearEsperas } from "../../api/esperas.ts";

function crear() {
  let t = 0;
  const esperas = crearEsperas(() => t, 60_000);
  return { esperas, en: (ms: number) => { t = ms; } };
}

test("un asiento que sigue trabando conserva desde y suma el plazo", () => {
  const { esperas, en } = crear();
  en(0);
  esperas.actualizar("m", [0]);
  en(30_000);
  assert.deepEqual(esperas.actualizar("m", [0]), [{ asiento: 0, desde: 0, disponible: 60_000, restante: 30_000 }]);
});

test("la espera vence recién al cumplirse el plazo", () => {
  const { esperas, en } = crear();
  en(0);
  esperas.actualizar("m", [0]);
  en(59_999);
  assert.equal(esperas.vencida("m", 0), false);
  en(60_000);
  assert.equal(esperas.vencida("m", 0), true);
});

test("reconectar reinicia la espera", () => {
  const { esperas, en } = crear();
  en(0);
  esperas.actualizar("m", [0]);
  esperas.actualizar("m", []);
  en(70_000);
  assert.equal(esperas.actualizar("m", [0])[0].desde, 70_000);
  assert.equal(esperas.vencida("m", 0), false);
});

test("cada asiento lleva su propio desde", () => {
  const { esperas, en } = crear();
  en(0);
  esperas.actualizar("m", [0]);
  en(5_000);
  const espera = esperas.actualizar("m", [0, 2]);
  assert.deepEqual(espera.map((e) => [e.asiento, e.desde]), [[0, 0], [2, 5_000]]);
});

test("una mesa o asiento sin espera no está vencido", () => {
  const { esperas, en } = crear();
  en(1_000_000);
  assert.equal(esperas.vencida("otra", 0), false);
  esperas.actualizar("m", [1]);
  assert.equal(esperas.vencida("m", 0), false);
});

test("lo que falta baja con el tiempo y no pasa de cero", () => {
  const { esperas, en } = crear();
  en(0);
  assert.equal(esperas.actualizar("m", [0])[0].restante, 60_000);
  en(59_000);
  assert.equal(esperas.actualizar("m", [0])[0].restante, 1_000);
  en(90_000);
  assert.equal(esperas.actualizar("m", [0])[0].restante, 0);
});
