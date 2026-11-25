import assert from "node:assert/strict";
import test from "node:test";
import { configurarSonido, registrarSonido, sonido } from "../../app/src/mesa/sonido.ts";
import { crearEventos } from "../../app/src/mesa/eventos.ts";

function doble() {
  const llamadas: string[] = [];
  return {
    llamadas,
    s: {
      reproducirVoz: (a: number, f: string) => { llamadas.push(`voz:${a}:${f}`); },
      reproducirEfecto: (n: string) => { llamadas.push("efecto:" + n); },
    },
  };
}

test("arranca apagado hasta que se configura la preferencia", () => {
  const { llamadas, s } = doble();
  registrarSonido(s as never);
  sonido.reproducirEfecto("naipe");
  assert.deepEqual(llamadas, []);
});

test("sin sonido registrado no pasa nada", () => {
  configurarSonido(true);
  registrarSonido(null);
  assert.doesNotThrow(() => { sonido.reproducirEfecto("ficha"); sonido.reproducirVoz(0, "Truco"); });
});

test("encendido delega, apagado silencia y desregistrar corta", () => {
  const { llamadas, s } = doble();
  registrarSonido(s as never);
  configurarSonido(true);
  sonido.reproducirEfecto("naipe");
  sonido.reproducirVoz(2, "Envido");
  configurarSonido(false);
  sonido.reproducirEfecto("ficha");
  configurarSonido(true);
  registrarSonido(null);
  sonido.reproducirEfecto("festejo");
  assert.deepEqual(llamadas, ["efecto:naipe", "voz:2:Envido"]);
});

test("un oyente que lanza no corta a los demás", () => {
  const eventos = crearEventos();
  const vistos: string[] = [];
  const aviso = console.warn;
  console.warn = () => {};
  try {
    eventos.escuchar(() => { throw new Error("falla"); });
    eventos.escuchar(e => vistos.push(e.tipo));
    eventos.emitir({ tipo: "chico", nuestro: true });
  } finally {
    console.warn = aviso;
  }
  assert.deepEqual(vistos, ["chico"]);
});
