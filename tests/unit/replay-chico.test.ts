import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reproducirChico } from "../../api/replay-chico.ts";

function fixture(nombre: string) {
  return JSON.parse(readFileSync(new URL(`../fixtures/replay-chico/${nombre}.json`, import.meta.url), "utf8"));
}

const finales = [
  { nombre: "duelo", puntos: [40, 0], ganador: 0 },
  { nombre: "parejas", puntos: [2, 0], ganador: 0 },
  { nombre: "tercetos", puntos: [10, 1], ganador: 0 },
  { nombre: "gallo", puntos: [0, 2], ganador: 1 },
];

for (const { nombre, puntos, ganador } of finales) {
  test(`chico-v1 reproduce el resultado y cada prefijo de ${nombre} desde todos los asientos`, () => {
    const juego = fixture(nombre);
    const json = JSON.stringify(juego);
    for (const asiento of juego.asientos.keys()) {
      const fin = reproducirChico(json, asiento);
      assert.equal(fin.estado, "terminado");
      assert.equal(fin.ganador, ganador);
      assert.deepEqual(fin.puntos, puntos);
      for (let pos = 0; pos <= juego.eventos.length; pos++) {
        const prefijo = { ...juego, eventos: juego.eventos.slice(0, pos) };
        assert.deepEqual(reproducirChico(juego, asiento, pos), reproducirChico(prefijo, asiento));
      }
    }
  });
}

test("se diagnostican versiones incompatibles, secuencias perdidas y efectos alterados", () => {
  const juego = fixture("duelo");
  assert.throws(() => reproducirChico({ ...juego, version: "chico-v2" }, 0), /Versión/);
  assert.throws(() => reproducirChico({ ...juego, perfil: "duel-v6" }, 0), /Perfil/);
  assert.throws(() => reproducirChico({ ...juego, motor: { ...juego.motor, version: "online-9" } }, 0), /motor/);
  assert.throws(() => reproducirChico(juego, 2), /Asiento/);
  assert.throws(() => reproducirChico(juego, 0, 5), /Posición/);
  const sinDecision = { ...juego, eventos: juego.eventos.toSpliced(1, 1) };
  assert.throws(() => reproducirChico(sinDecision, 0), /Secuencia 2/);
  assert.doesNotThrow(() => reproducirChico(sinDecision, 0, 1));
  juego.eventos[2].cobros[0].tantos--;
  assert.throws(() => reproducirChico(juego, 0), /Secuencia 3:.*cobros/);
});

test("el cierre respeta el último estado confirmado y puede registrar un chico inconcluso", () => {
  const juego = fixture("duelo");
  const cierre = juego.eventos.at(-1);
  const eventos = [juego.eventos[0], { ...cierre, secuencia: 2, puntos: [0, 0], estado: "inconcluso", ganador: null }];
  assert.equal(reproducirChico({ ...juego, eventos }, 0).estado, "inconcluso");
  assert.equal(reproducirChico({ ...juego, eventos }, 0, 1).estado, "en-juego");
  eventos.push({ ...juego.eventos[1], secuencia: 3 });
  assert.throws(() => reproducirChico({ ...juego, eventos }, 0), /posterior al cierre/);
  assert.throws(() => reproducirChico({ ...juego, eventos: [juego.eventos[0], { ...cierre, secuencia: 2 }] }, 0), /Cierre/);
  cierre.ganador = 1;
  assert.throws(() => reproducirChico(juego, 0), /Secuencia 4:.*Cierre/);
});

test("el siguiente reparto conserva el marcador y rota el dador después de terminar la mano", () => {
  const juego = fixture("tercetos");
  const segundo = juego.eventos.find((e: { manoNumero?: number }) => e.manoNumero === 2);
  const temprano = [juego.eventos[0], { ...segundo, secuencia: 2, puntosInicio: [0, 0] }];
  assert.throws(() => reproducirChico({ ...juego, eventos: temprano }, 0), /Inicio de reparto/);
  segundo.puntosInicio = [0, 0];
  assert.throws(() => reproducirChico(juego, 0), /Inicio de reparto/);
  segundo.puntosInicio = [0, 1];
  segundo.reparto.dador = 3;
  assert.throws(() => reproducirChico(juego, 0), /Dador/);
});

test("el reparto solo puede habilitar la respuesta de una computadora registrada en la cabecera", () => {
  const juego = fixture("duelo");
  const reparto = juego.eventos[0].reparto;
  reparto.reglaFlor = "inmediata-v2";
  reparto.respondenSinFlor = [1];
  assert.doesNotThrow(() => reproducirChico(juego, 0, 1));

  juego.asientos[1] = { tipo: "humano" };
  assert.throws(() => reproducirChico(juego, 0, 1), /Secuencia 1:.*asiento humano/);
  delete reparto.respondenSinFlor;
  assert.doesNotThrow(() => reproducirChico(juego, 0, 1));
});

test("la procedencia privada distingue una política alternativa, un humano y una corrida", () => {
  const juego = fixture("duelo");
  const decision = juego.eventos[2];
  const original = decision.bot;
  delete decision.bot;
  assert.throws(() => reproducirChico(juego, 0), /Secuencia 3:.*computadora/);
  decision.bot = { ...original, aplicada: "fixture-respaldo-v1", fallback: "timeout" };
  assert.throws(() => reproducirChico(juego, 0), /Secuencia 3:.*computadora/);
  decision.bot.latenciaMs = 205;
  assert.deepEqual(reproducirChico(juego, 0).puntos, [40, 0]);
  assert.ok(!JSON.stringify(reproducirChico(juego, 0)).includes("fixture-respaldo"));
  juego.eventos[1].bot = original;
  assert.throws(() => reproducirChico(juego, 0), /asiento humano/);
  delete juego.eventos[1].bot;
  juego.origen = "arena";
  juego.corrida = { id: "corrida-de-prueba", chico: "duel-0-0", par: 0, manga: 0 };
  assert.throws(() => reproducirChico(juego, 0), /Corrida/);
  juego.asientos[0] = juego.asientos[1];
  juego.eventos[1].bot = original;
  assert.deepEqual(reproducirChico(juego, 0).puntos, [40, 0]);
  assert.throws(() => reproducirChico({ ...fixture("gallo"), origen: "mesa" }, 0), /sintético/);
});

function abandonado(juego: ReturnType<typeof fixture>, extra: Record<string, unknown> = {}) {
  const [reparto, decision, , cierre] = juego.eventos;
  const salida = { tipo: "salida", secuencia: 3, asiento: 0, motivo: "abandonada", fecha: "2026-11-19T12:00:30Z" };
  const final = { ...cierre, secuencia: 4, estado: "abandonado", ganador: 1, puntos: [0, 0], ...extra };
  return { salida, final, eventos: [reparto, decision, salida, final] };
}

test("acepta un cierre abandonado después de una salida", () => {
  const juego = fixture("duelo");
  const { eventos } = abandonado(juego);
  const fin = reproducirChico({ ...juego, eventos }, 1);
  assert.equal(fin.ganador, 1);
  assert.equal(fin.estado, "abandonado");
  assert.deepEqual(fin.puntos, [0, 0]);
  assert.equal(reproducirChico({ ...juego, eventos }, 1, 3).estado, "en-juego");
});

test("rechaza un cierre abandonado sin salida", () => {
  const juego = fixture("duelo");
  const { final } = abandonado(juego);
  const eventos = [juego.eventos[0], juego.eventos[1], { ...final, secuencia: 3 }];
  assert.throws(() => reproducirChico({ ...juego, eventos }, 0), /Cierre incompatible/);
});

test("rechaza un cierre abandonado con puntos distintos al tanteador", () => {
  const juego = fixture("duelo");
  const { eventos } = abandonado(juego, { puntos: [1, 0] });
  assert.throws(() => reproducirChico({ ...juego, eventos }, 0), /Cierre incompatible/);
});

test("rechaza una salida mal formada y un abandono con ganador inválido", () => {
  const juego = fixture("duelo");
  const { salida, final } = abandonado(juego);
  const con = (s: object, f: object = final) => ({ ...juego, eventos: [juego.eventos[0], juego.eventos[1], s, f] });
  assert.throws(() => reproducirChico(con({ ...salida, motivo: "otra" }), 0), /Salida/);
  assert.throws(() => reproducirChico(con({ ...salida, asiento: 2 }), 0), /Salida/);
  assert.throws(() => reproducirChico(con({ ...salida, fecha: "ayer" }), 0), /Salida/);
  assert.throws(() => reproducirChico(con(salida, { ...final, ganador: null }), 0), /Cierre incompatible/);
  assert.throws(() => reproducirChico(con(salida, { ...final, ganador: 2 }), 0), /Cierre incompatible/);
});

test("una salida sin cierre no cambia el resultado", () => {
  const juego = fixture("duelo");
  const { salida } = abandonado(juego);
  const [reparto, decision, resto, cierre] = juego.eventos;
  const con = { ...juego, eventos: [reparto, decision, salida, { ...resto, secuencia: 4 }, { ...cierre, secuencia: 5 }] };
  const sin = reproducirChico(juego, 0);
  const luego = reproducirChico(con, 0);
  assert.deepEqual({ ...luego, secuencia: 0 }, { ...sin, secuencia: 0 });
  assert.equal(luego.estado, "terminado");
});
