import assert from "node:assert/strict";
import test from "node:test";
import { leerPreferencias, livianoActivo, porDefecto } from "../../app/src/mesa/preferencias.ts";

test("sin nada guardado rigen las preferencias por defecto", () => {
  assert.deepEqual(leerPreferencias(null), porDefecto);
  assert.deepEqual(porDefecto, { sonido: true, hapticos: true, liviano: false });
});

test("un campo guardado cambia solo ese interruptor", () => {
  assert.deepEqual(leerPreferencias('{"sonido":false}'), { sonido: false, hapticos: true, liviano: false });
});

test("un texto roto o con valores que no son booleanos vuelve a lo de siempre", () => {
  assert.deepEqual(leerPreferencias("{sonido:"), porDefecto);
  assert.deepEqual(leerPreferencias("null"), porDefecto);
  assert.deepEqual(leerPreferencias("[false]"), porDefecto);
  assert.deepEqual(leerPreferencias('{"hapticos":"no","liviano":true}'), { sonido: true, hapticos: true, liviano: true });
});

test("reducir movimiento del sistema activa el modo liviano aunque el interruptor esté apagado", () => {
  assert.equal(livianoActivo(porDefecto, true), true);
  assert.equal(livianoActivo(porDefecto, false), false);
  assert.equal(livianoActivo({ ...porDefecto, liviano: true }, false), true);
});
