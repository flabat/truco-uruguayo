import assert from "node:assert/strict";
import test from "node:test";
import { picoDb, recortarYNivelar, rmsDb, unir } from "../../scripts/voces/audio.ts";

const f = 24000;
const silencio = (ms: number) => new Int16Array(Math.round((ms / 1000) * f));
const tono = (ms: number, db: number) => {
  const amp = 32767 * 10 ** (db / 20) * Math.SQRT2;
  return Int16Array.from({ length: Math.round((ms / 1000) * f) }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * 440 * i) / f)));
};

test("recorta el silencio de los bordes y deja un margen corto", () => {
  const entrada = unir([silencio(200), tono(300, -30), silencio(200)], f, 0);
  const salida = recortarYNivelar(entrada, f);
  const ms = (salida.length / f) * 1000;
  assert.ok(ms >= 300 && ms <= 400, `${ms} ms`);
});

test("lleva la voz a −18 dBFS de RMS", () => {
  const salida = recortarYNivelar(tono(500, -30), f);
  assert.ok(Math.abs(rmsDb(salida.subarray(f / 10, -f / 10)) + 18) < 1, String(rmsDb(salida)));
});

test("no pasa −1 dBFS de pico", () => {
  // Un tono con un pico aislado: subir el RMS lo haría saturar.
  const entrada = tono(400, -30);
  entrada[1000] = 32000;
  const salida = recortarYNivelar(entrada, f);
  assert.ok(picoDb(salida) <= -1 + 0.01, String(picoDb(salida)));
});

test("un clip sin voz queda vacío", () => {
  assert.equal(recortarYNivelar(silencio(300), f).length, 0);
});
