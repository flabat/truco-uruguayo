import assert from "node:assert/strict";
import test from "node:test";
import type { Evento } from "../../app/src/mesa/cola.ts";
import { despacharEfectos, efectosDe, fraseDeCanto, type DestinoDeEfectos } from "../../app/src/mesa/efectos.ts";

const carta = "1e" as never;

test("el reparto no suena acá: el roce por carta sale del plan de reparto", () => {
  assert.deepEqual(efectosDe({ tipo: "reparto", dador: 2 }), {});
});

test("la carta propia suena naipe y la ajena a la mitad, sin vibrar desde acá", () => {
  assert.deepEqual(efectosDe({ tipo: "carta", asiento: 0, carta, propia: true }), { efecto: { nombre: "naipe" } });
  assert.deepEqual(efectosDe({ tipo: "carta", asiento: 1, carta, propia: false }),
    { efecto: { nombre: "naipe", volumen: 0.5 } });
});

test("un canto para mí avisa con vibración y voz del asiento", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 1, texto: "Truco", paraMi: true }),
    { vibracion: "aviso", voz: { asiento: 1, frase: { tipo: "canto", canto: "truco" } } });
});

test("un canto entre otros solo suena", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 3, texto: "Envido", paraMi: false }),
    { voz: { asiento: 3, frase: { tipo: "canto", canto: "envido" } } });
});

test("la declaración de tantos va por la voz y no vibra", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 2, texto: "33 de envido", paraMi: false }),
    { voz: { asiento: 2, frase: { tipo: "tantos", motivo: "envido", total: 33 } } });
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 2, texto: "29 de flor", paraMi: true }),
    { voz: { asiento: 2, frase: { tipo: "tantos", motivo: "flor", total: 29 } } });
});

test("la frase del pie para mí vibra liviano y habla con la voz de quien la dice", () => {
  assert.deepEqual(efectosDe({ tipo: "frase", emisor: 2, destinatario: 0, pie: "veni", texto: "Ana: vení", paraMi: true }),
    { vibracion: "liviano", voz: { asiento: 2, frase: { tipo: "pie", frase: "veni" } } });
  assert.deepEqual(efectosDe({ tipo: "frase", emisor: 2, destinatario: 1, pie: "veni", texto: "Vení", paraMi: false }), {});
});

test("la vuelta vibra liviano solo si es nuestra", () => {
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: 0, nuestra: true }), { vibracion: "liviano" });
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: 1, nuestra: false }), {});
  assert.deepEqual(efectosDe({ tipo: "vuelta", ganador: null, nuestra: false }), {});
});

test("el cobro suena ficha y vibra éxito solo si es nuestro", () => {
  assert.deepEqual(efectosDe({ tipo: "cobro", equipo: 0, tantos: 2, nuestro: true }), { vibracion: "exito", efecto: { nombre: "ficha" } });
  assert.deepEqual(efectosDe({ tipo: "cobro", equipo: 1, tantos: 2, nuestro: false }), { efecto: { nombre: "ficha" } });
});

test("el chico festeja solo si es nuestro", () => {
  assert.deepEqual(efectosDe({ tipo: "chico", nuestro: true }), { vibracion: "exito", efecto: { nombre: "festejo" } });
  assert.deepEqual(efectosDe({ tipo: "chico", nuestro: false }), {});
});

test("un espectador nunca recibe vibración de aviso ni de éxito", () => {
  const eventos: Evento[] = [
    { tipo: "reparto", dador: 0 },
    { tipo: "carta", asiento: 0, carta, propia: false },
    { tipo: "canto", asiento: 1, texto: "Truco", paraMi: false },
    { tipo: "canto", asiento: 1, texto: "33 de envido", paraMi: false },
    { tipo: "frase", emisor: 0, destinatario: 2, pie: "juga", texto: "Jugá", paraMi: false },
    { tipo: "vuelta", ganador: 0, nuestra: false },
    { tipo: "cobro", equipo: 0, tantos: 3, nuestro: false },
    { tipo: "chico", nuestro: false },
  ];
  for (const e of eventos) {
    const { vibracion } = efectosDe(e);
    assert.ok(vibracion !== "aviso" && vibracion !== "exito", e.tipo);
  }
});

function destinoContador() {
  const llamadas: string[] = [];
  const destino: DestinoDeEfectos = {
    vibrar: v => llamadas.push("vibrar:" + v),
    reproducirEfecto: (n, o) => llamadas.push("efecto:" + n + (o?.volumen != null ? "@" + o.volumen : "")),
    reproducirVoz: (a, f) => llamadas.push(`voz:${a}:${JSON.stringify(f)}`),
  };
  return { llamadas, destino };
}

test("con los hápticos apagados no vibra pero sí suena", () => {
  const { llamadas, destino } = destinoContador();
  despacharEfectos({ tipo: "cobro", equipo: 0, tantos: 1, nuestro: true }, false, destino);
  assert.deepEqual(llamadas, ["efecto:ficha"]);
  despacharEfectos({ tipo: "cobro", equipo: 0, tantos: 1, nuestro: true }, true, destino);
  assert.deepEqual(llamadas.slice(1), ["vibrar:exito", "efecto:ficha"]);
});

test("si vibrar falla, el sonido igual se despacha", () => {
  const { llamadas, destino } = destinoContador();
  const aviso = console.warn;
  console.warn = () => {};
  try {
    despacharEfectos({ tipo: "canto", asiento: 1, texto: "Truco", paraMi: true }, true,
      { ...destino, vibrar: () => { throw new Error("sin motor"); } });
  } finally {
    console.warn = aviso;
  }
  assert.deepEqual(llamadas, ['voz:1:{"tipo":"canto","canto":"truco"}']);
});

test("la carta ajena se despacha con volumen y la propia sin opciones", () => {
  const { llamadas, destino } = destinoContador();
  despacharEfectos({ tipo: "carta", asiento: 1, carta, propia: false }, true, destino);
  despacharEfectos({ tipo: "carta", asiento: 0, carta, propia: true }, true, destino);
  assert.deepEqual(llamadas, ["efecto:naipe@0.5", "efecto:naipe"]);
});

test("cada texto de canto vuelve a su acción para elegir el clip", () => {
  assert.deepEqual(fraseDeCanto("Vale cuatro"), { tipo: "canto", canto: "vale-cuatro" });
  assert.deepEqual(fraseDeCanto("Yo no canto"), { tipo: "canto", canto: "paso-flor" });
  assert.deepEqual(fraseDeCanto("Con flor quiero"), { tipo: "canto", canto: "con-flor-quiero" });
  assert.deepEqual(fraseDeCanto("Me voy al mazo"), { tipo: "canto", canto: "mazo" });
  assert.deepEqual(fraseDeCanto("No quiero"), { tipo: "canto", canto: "no-quiero" });
  assert.deepEqual(fraseDeCanto("7 de envido"), { tipo: "tantos", motivo: "envido", total: 7 });
  assert.equal(fraseDeCanto("Hola"), null);
});

test("un canto sin clip no suena pero igual avisa si es para mí", () => {
  assert.deepEqual(efectosDe({ tipo: "canto", asiento: 1, texto: "Hola", paraMi: true }), { vibracion: "aviso" });
});
