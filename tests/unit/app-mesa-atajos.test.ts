import assert from "node:assert/strict";
import test from "node:test";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { atajoDeTecla } from "../../app/src/mesa/atajos.ts";
import type { HojaCantos } from "../../app/src/mesa/hoja-cantos.ts";

const tres = ["espadas-01", "bastos-01", "espadas-07"] as CardId[];

const propia: HojaCantos = {
  modo: "propia", cerrable: true, encabezado: "Cantos", detalle: null, respuestas: [],
  grupos: [{ nombre: "Truco", opciones: ["truco"] }], mazo: true, notas: [],
};
const respuesta: HojaCantos = {
  modo: "respuesta", cerrable: false, encabezado: "Diego tocó envido", detalle: null, respuestas: ["quiero", "no-quiero"],
  grupos: [{ nombre: "Envido", opciones: ["real-envido"] }], mazo: true, notas: [],
};

const estado = (cambios: Partial<Parameters<typeof atajoDeTecla>[1]> = {}): Parameters<typeof atajoDeTecla>[1] => ({
  mano: tres, puedeJugarCarta: true, hoja: propia, hojaAbierta: false, ...cambios,
});

test("1, 2 y 3 juegan las cartas de izquierda a derecha solo en tu turno", () => {
  assert.deepEqual(atajoDeTecla("2", estado()), { tipo: "carta", carta: "bastos-01" });
  assert.equal(atajoDeTecla("3", estado({ mano: tres.slice(0, 2) })), null);
  assert.equal(atajoDeTecla("1", estado({ puedeJugarCarta: false })), null);
});

test("C abre Cantos solo si está cerrada", () => {
  assert.deepEqual(atajoDeTecla("c", estado()), { tipo: "abrir-cantos" });
  assert.deepEqual(atajoDeTecla("C", estado()), { tipo: "abrir-cantos" });
  assert.equal(atajoDeTecla("C", estado({ hojaAbierta: true })), null);
  assert.equal(atajoDeTecla("c", estado({ hoja: null })), null);
});

test("Q y N responden solo si la respuesta está en la hoja", () => {
  assert.deepEqual(atajoDeTecla("q", estado({ hoja: respuesta, hojaAbierta: true })), { tipo: "canto", canto: "quiero" });
  assert.deepEqual(atajoDeTecla("N", estado({ hoja: respuesta, hojaAbierta: true })), { tipo: "canto", canto: "no-quiero" });
  assert.equal(atajoDeTecla("q", estado({ hojaAbierta: true })), null);
});

test("Escape cierra solo una hoja que se puede cerrar", () => {
  assert.equal(atajoDeTecla("Escape", estado({ hoja: respuesta, hojaAbierta: true })), null);
  assert.deepEqual(atajoDeTecla("Escape", estado({ hojaAbierta: true })), { tipo: "cerrar" });
  assert.equal(atajoDeTecla("Escape", estado()), null);
});

test("las demás teclas no hacen nada", () => {
  assert.equal(atajoDeTecla("x", estado()), null);
  assert.equal(atajoDeTecla("4", estado()), null);
});
