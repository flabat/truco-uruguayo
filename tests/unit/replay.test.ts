import assert from "node:assert/strict";
import test from "node:test";
import { iniciarMano, jugarCarta, type EstadoMano, type Jugada } from "@eltruco/motor/mano.ts";
import { repartir, type RepartoV1 } from "@eltruco/motor/reparto.ts";
import { capturarReplay, reproducirReplay } from "@eltruco/motor/replay.ts";
import vector from "../fixtures/replay-v1.json" with { type: "json" };

const reparto: RepartoV1 = {
  versionReparto: 1, semilla: 217, dador: 3, mano: 0, muestra: "bastos-10",
  manos: [
    ["bastos-12", "espadas-06", "copas-11"],
    ["espadas-11", "copas-07", "oros-11"],
    ["oros-05", "bastos-07", "espadas-03"],
    ["bastos-06", "bastos-11", "oros-03"],
  ],
};

function reproducir(datos: unknown): EstadoMano {
  const resultado = reproducirReplay(datos);
  assert.ok(resultado.ok, JSON.stringify(resultado));
  return resultado.estado;
}

function jugar(estado: EstadoMano, jugada: Jugada): EstadoMano {
  const resultado = jugarCarta(estado, jugada);
  assert.ok(resultado.ok, JSON.stringify(resultado));
  return resultado.estado;
}

test("la captura fija conserva el reparto, las tres vueltas y el ganador de la primera tras la parda", () => {
  const { jugadas } = vector;
  const final = {
    reparto, turno: null, vueltaActual: null, restantes: [[], [], [], []], equipoGanador: 0,
    vueltas: [
      { salida: 0, jugadas: jugadas.slice(0, 4), resultado: { tipo: "ganada", asiento: 0, equipo: 0 } },
      { salida: 0, jugadas: jugadas.slice(4, 8), resultado: { tipo: "ganada", asiento: 3, equipo: 1 } },
      { salida: 3, jugadas: jugadas.slice(8), resultado: { tipo: "parda" } },
    ],
  };
  assert.deepEqual(reproducir(vector), final);
  assert.deepEqual(reproducir(JSON.stringify(vector)), final);
});

test("cada prefijo se puede guardar, restaurar y continuar desde su turno", () => {
  let mesa = iniciarMano(reparto);
  for (let cantidad = 0; cantidad <= vector.jugadas.length; cantidad++) {
    const prefijo = { ...vector, jugadas: vector.jugadas.slice(0, cantidad) };
    const captura = capturarReplay(mesa);
    assert.deepEqual(captura, prefijo);
    const restaurada = reproducir(JSON.stringify(captura));
    assert.deepEqual(restaurada, mesa);
    if (cantidad < vector.jugadas.length) {
      const siguiente = vector.jugadas[cantidad];
      assert.equal(restaurada.turno, siguiente.asiento);
      mesa = jugar(restaurada, siguiente as Jugada);
    }
  }
});

test("la misma semilla admite otra salida y el replay respeta la carta elegida", () => {
  const otra = { asiento: 0, carta: "copas-11" } as const;
  const mesa = jugar(iniciarMano(reparto), otra);
  const captura = capturarReplay(mesa);
  assert.deepEqual(captura.jugadas, [otra]);
  assert.deepEqual(reproducir(captura), mesa);
  assert.notDeepEqual(reproducir({ ...vector, jugadas: vector.jugadas.slice(0, 1) }), mesa);
});

test("la captura por semilla rechaza repartos legales que cambian la muestra o el orden de las cartas", () => {
  const [a, b, c, d] = reparto.manos;
  const reordenado: RepartoV1 = { ...reparto, manos: [a, b, c, [d[0], d[2], d[1]]] };
  for (const escenario of [reordenado, { ...reparto, muestra: "oros-01" } as const]) {
    const mesa = jugar(iniciarMano(escenario), { asiento: 0, carta: a[0] });
    assert.throws(() => capturarReplay(mesa), /difiere del que generan su semilla y dador/);
  }
});

test("un JSON interrumpido y una cabecera malformada devuelven un error sin estado", () => {
  assert.deepEqual(reproducirReplay(JSON.stringify(vector).slice(0, -1)), { ok: false, error: "json-invalido" });
  for (const datos of [
    null, [], true, {}, "null", JSON.stringify(JSON.stringify(vector)),
    { ...vector, version: "1" }, { ...vector, versionReglas: null },
    { ...vector, versionReparto: undefined }, { ...vector, semilla: -1 },
    { ...vector, semilla: 2 ** 32 }, { ...vector, semilla: 0.5 }, { ...vector, dador: 4 },
    { ...vector, jugadas: {} }, { ...vector, jugadas: null },
  ]) {
    assert.deepEqual(reproducirReplay(datos), { ok: false, error: "formato-invalido" });
  }
  for (const campo of ["version", "versionReglas", "versionReparto"]) {
    assert.deepEqual(reproducirReplay({ ...vector, [campo]: 2 }), { ok: false, error: "version-desconocida", campo });
  }
});

test("una jugada malformada o ilegal invalida todo el historial e indica su posición", () => {
  const primera = vector.jugadas.slice(0, 4);
  const conQuinta = (quinta: unknown) => reproducirReplay({ ...vector, jugadas: [...primera, quinta] });
  for (const jugada of [null, 0, [], {}, { asiento: 0 }, { asiento: 4, carta: "oros-01" }, { asiento: 0, carta: "oros-08" }]) {
    assert.deepEqual(conQuinta(jugada), { ok: false, error: "jugada-invalida", posicion: 5 });
  }
  assert.deepEqual(conQuinta(vector.jugadas[5]), { ok: false, error: "fuera-de-turno", posicion: 5 });
  assert.deepEqual(conQuinta({ asiento: 0, carta: "oros-03" }), { ok: false, error: "carta-ajena", posicion: 5 });
  assert.deepEqual(conQuinta(primera[0]), { ok: false, error: "carta-ya-jugada", posicion: 5 });
  assert.deepEqual(reproducirReplay({ ...vector, jugadas: [...vector.jugadas, primera[0]] }),
    { ok: false, error: "mano-cerrada", posicion: 13 });
});

test("una mano cerrada en dos vueltas conserva las cartas restantes y rechaza la novena jugada", () => {
  let mesa = iniciarMano(repartir(4, 3));
  for (let i = 0; i < 8; i++) {
    const asiento = mesa.turno;
    assert.ok(asiento !== null);
    mesa = jugar(mesa, { asiento, carta: mesa.restantes[asiento][0] });
  }
  assert.equal(mesa.equipoGanador, 0);
  assert.equal(mesa.vueltas[1].resultado.tipo, "parda");
  const captura = capturarReplay(mesa);
  assert.deepEqual(reproducir(captura), mesa);
  const jugadas = [...captura.jugadas, { asiento: 0, carta: mesa.restantes[0][0] }];
  assert.deepEqual(reproducirReplay({ ...captura, jugadas }), { ok: false, error: "mano-cerrada", posicion: 9 });
});
