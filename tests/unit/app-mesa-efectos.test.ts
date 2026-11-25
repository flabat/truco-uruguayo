import assert from "node:assert/strict";
import test from "node:test";
import type { Evento } from "../../app/src/mesa/cola.ts";
import { efectosDe } from "../../app/src/mesa/efectos.ts";

const carta = "1e" as never;

test("el reparto suena como roce de naipe, sin vibrar", () => {
  assert.deepEqual(efectosDe({ tipo: "reparto", dador: 2 }), { efecto: "roce" });
});

test("la carta propia suena naipe y la ajena naipe bajo, sin vibrar desde acá", () => {
  assert.deepEqual(efectosDe({ tipo: "carta", asiento: 0, carta, propia: true }), { efecto: "naipe" });
  assert.deepEqual(efectosDe({ tipo: "carta", asiento: 1, carta, propia: false }), { efecto: "naipe-bajo" });
});

test("un canto para mí avisa con vibración y voz del asiento", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 1, texto: "Truco", paraMi: true }),
    { vibracion: "aviso", voz: { asiento: 1, frase: "Truco" } });
});

test("un canto entre otros solo suena", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 3, texto: "Envido", paraMi: false }),
    { voz: { asiento: 3, frase: "Envido" } });
});

test("la declaración de tantos va por la voz y no vibra", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 2, texto: "33 de envido", paraMi: false }),
    { voz: { asiento: 2, frase: "33 de envido" } });
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 2, texto: "29 de flor", paraMi: true }),
    { voz: { asiento: 2, frase: "29 de flor" } });
});

test("la frase del pie para mí vibra liviano y habla con la voz de quien la dice", () => {
  assert.deepEqual(efectosDe({ tipo: "frase", emisor: 2, destinatario: 0, texto: "Vení", paraMi: true }),
    { vibracion: "liviano", voz: { asiento: 2, frase: "Vení" } });
  assert.deepEqual(efectosDe({ tipo: "frase", emisor: 2, destinatario: 1, texto: "Vení", paraMi: false }), {});
});

test("la vuelta vibra liviano solo si es nuestra", () => {
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: 0, nuestra: true }), { vibracion: "liviano" });
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: 1, nuestra: false }), {});
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: null, nuestra: false }), {});
});

test("el cobro suena ficha y vibra éxito solo si es nuestro", () => {
  assert.deepEqual(efectosDe({ tipo: "cobro", equipo: 0, tantos: 2, nuestro: true }), { vibracion: "exito", efecto: "ficha" });
  assert.deepEqual(efectosDe({ tipo: "cobro", equipo: 1, tantos: 2, nuestro: false }), { efecto: "ficha" });
});

test("el chico festeja solo si es nuestro", () => {
  assert.deepEqual(efectosDe({ tipo: "chico", nuestro: true }), { vibracion: "exito", efecto: "festejo" });
  assert.deepEqual(efectosDe({ tipo: "chico", nuestro: false }), {});
});

test("un espectador nunca recibe vibración de aviso ni de éxito", () => {
  const eventos: Evento[] = [
    { tipo: "reparto", dador: 0 },
    { tipo: "carta", asiento: 0, carta, propia: false },
    { tipo: "canto", asiento: 1, texto: "Truco", paraMi: false },
    { tipo: "canto", asiento: 1, texto: "33 de envido", paraMi: false },
    { tipo: "frase", emisor: 0, destinatario: 2, texto: "Jugá", paraMi: false },
    { tipo: "vuelta", ganador: 0, nuestra: false },
    { tipo: "cobro", equipo: 0, tantos: 3, nuestro: false },
    { tipo: "chico", nuestro: false },
  ];
  for (const e of eventos) {
    const { vibracion } = efectosDe(e);
    assert.ok(vibracion !== "aviso" && vibracion !== "exito", e.tipo);
  }
});
