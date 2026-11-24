import assert from "node:assert/strict";
import test from "node:test";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano } from "@eltruco/motor/mano.ts";
import { repartir, type RepartoV1 } from "@eltruco/motor/reparto.ts";

const reparto: RepartoV1 = {
  versionReparto: 1, semilla: 22, dador: 3, mano: 0, muestra: "copas-04",
  manos: [
    ["bastos-03", "oros-04", "espadas-03"],
    ["copas-12", "espadas-01", "copas-03"],
    ["oros-03", "bastos-05", "bastos-01"],
    ["copas-02", "oros-06", "oros-05"],
  ],
};

function tirar(estado: EstadoMano, carta: CardId): EstadoMano {
  assert.ok(estado.turno !== null);
  const paso = jugarCarta(estado, { asiento: estado.turno, carta });
  assert.ok(paso.ok, JSON.stringify(paso));
  return paso.estado;
}

function enTurno(estado: EstadoMano) {
  assert.ok(estado.turno !== null);
  return vistaPara(estado, estado.turno);
}

test("sale con la más fuerte y desempata por orden del mazo aunque cambie el orden de la mano", () => {
  const vista = enTurno(iniciarMano(reparto));
  assert.equal(elegirJugada(vista), "espadas-03");
  assert.equal(elegirJugada({ ...vista, cartas: [...vista.cartas].reverse() }), "espadas-03");
  assert.deepEqual(vista.cartas, reparto.manos[0]);
});

test("frente al tres rival gana con el as de espadas y guarda el rey que hace de pieza", () => {
  const estado = tirar(iniciarMano(reparto), "espadas-03");
  assert.equal(elegirJugada(enTurno(estado)), "espadas-01");
});

test("al cerrar la vuelta descarta si el compañero gana y cubre si emparda o pierde", () => {
  const salida = tirar(iniciarMano(reparto), "espadas-03");
  const ganando = tirar(tirar(salida, "copas-12"), "bastos-01");
  const parda = tirar(tirar(salida, "copas-03"), "bastos-05");
  const perdiendo = tirar(tirar(tirar(iniciarMano(reparto), "oros-04"), "copas-03"), "bastos-01");
  for (const [estado, esperada, ganador] of [
    [ganando, "oros-05", 1], [parda, "copas-02", 3], [perdiendo, "copas-02", 3],
  ] as const) {
    const carta = elegirJugada(enTurno(estado));
    assert.equal(carta, esperada);
    const siguiente = tirar(estado, carta);
    assert.deepEqual(siguiente.vueltas[0].resultado, {
      tipo: "ganada", equipo: 1, asiento: ganador,
    });
  }
});

test("busca la parda cuando no puede ganar y guarda su tres si el compañero ya emparda", () => {
  const mesa = iniciarMano({
    ...reparto,
    manos: [
      ["copas-06", "oros-04", "espadas-03"],
      ["copas-01", "espadas-12", "copas-03"],
      reparto.manos[2],
      ["bastos-03", "oros-06", "oros-05"],
    ],
  });
  const salida = tirar(mesa, "espadas-03");
  const empate = elegirJugada(enTurno(salida));
  assert.equal(empate, "copas-03");
  const ultima = tirar(tirar(salida, empate), "bastos-05");
  const descarte = elegirJugada(enTurno(ultima));
  assert.equal(descarte, "oros-05");
  assert.deepEqual(tirar(ultima, descarte).vueltas[0].resultado, { tipo: "parda" });
});

test("si todas pierden, descarta la más débil", () => {
  const estado = tirar(tirar(iniciarMano(reparto), "oros-04"), "espadas-01");
  assert.equal(elegirJugada(enTurno(estado)), "bastos-05");
});

test("con la misma vista elige la misma carta aunque cambien la semilla y las manos ajenas", () => {
  const otro: RepartoV1 = {
    ...reparto, semilla: 91,
    manos: [
      ["copas-02", "oros-06", "espadas-03"],
      ["bastos-03", "oros-04", "copas-03"],
      reparto.manos[2],
      ["copas-12", "espadas-01", "oros-05"],
    ],
  };
  const vistas = [reparto, otro].map(mundo =>
    enTurno(tirar(tirar(iniciarMano(mundo), "espadas-03"), "copas-03")));
  for (const vista of vistas) {
    assert.equal(vista.asiento, 2);
    for (const privado of ["semilla", "reparto", "manos", "restantes"]) {
      assert.equal(privado in vista, false);
    }
  }
  assert.deepEqual(vistas[0], vistas[1]);
  assert.deepEqual(vistas.map(elegirJugada), ["bastos-01", "bastos-01"]);
});

test("el aprendiz y los tres asientos automáticos completan manos por el mismo jugarCarta", () => {
  for (const dador of [0, 1, 2, 3]) {
    for (const semilla of [0, 1, 22, 217, 99121]) {
      let estado = iniciarMano(repartir(semilla, dador));
      while (estado.turno !== null) {
        const vista = enTurno(estado);
        const carta = vista.asiento === 0 ? vista.cartas[0] : elegirJugada(vista);
        assert.ok(vista.cartas.includes(carta));
        estado = tirar(estado, carta);
      }
      assert.ok(estado.vueltas.length === 2 || estado.vueltas.length === 3);
      assert.notEqual(estado.equipoGanador, null);
      assert.throws(() => elegirJugada(vistaPara(estado, 1)), RangeError);
    }
  }
  assert.throws(() => elegirJugada(vistaPara(iniciarMano(reparto), 1)), RangeError);
});
