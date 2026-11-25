import assert from "node:assert/strict";
import test from "node:test";
import { registrarSonido, sonido } from "../../app/src/mesa/sonido.ts";
import { crearEventos } from "../../app/src/mesa/eventos.ts";

function doble() {
  const llamadas: string[] = [];
  return {
    llamadas,
    s: {
      reproducirVoz: (a: number, f: unknown) => { llamadas.push(`voz:${a}:${JSON.stringify(f)}`); },
      reproducirEfecto: (n: string, o?: { volumen?: number }) => { llamadas.push("efecto:" + n + (o ? "@" + o.volumen : "")); },
      precargar: async (asientos: readonly number[]) => { llamadas.push("precargar:" + asientos.join(",")); },
    },
  };
}

test("sin sonido registrado no pasa nada", async () => {
  registrarSonido(null);
  assert.doesNotThrow(() => {
    sonido.reproducirEfecto("ficha");
    sonido.reproducirVoz(0, { tipo: "canto", canto: "truco" });
  });
  await sonido.precargar([0, 1]);
});

test("registrado delega voces, efectos con volumen y precarga; desregistrar corta", async () => {
  const { llamadas, s } = doble();
  registrarSonido(s);
  sonido.reproducirEfecto("naipe", { volumen: 0.5 });
  sonido.reproducirVoz(2, { tipo: "pie", frase: "veni" });
  await sonido.precargar([0, 1, 2]);
  registrarSonido(null);
  sonido.reproducirEfecto("festejo");
  assert.deepEqual(llamadas, ["efecto:naipe@0.5", 'voz:2:{"tipo":"pie","frase":"veni"}', "precargar:0,1,2"]);
});

test("una precarga que falla no rompe la mesa", async () => {
  registrarSonido({ ...doble().s, precargar: () => Promise.reject(new Error("sin red")) });
  await sonido.precargar([0]);
  registrarSonido(null);
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
