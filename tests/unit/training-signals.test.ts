import assert from "node:assert/strict";
import test from "node:test";
import { aplicarOnline, iniciarOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import { signals, type ActionId, type Move, type PublicTurn } from "../../training/contracts/index.ts";
import { observe } from "../../training/seat/index.ts";
import { commitTurn, signalRules } from "../../training/signals/index.ts";

const deal: RepartoOnline = {
  versionReparto: "online-1", mano: 0, dador: 3, muestra: "oros-06",
  manos: [["oros-02", "copas-07", "bastos-03"], ["bastos-06", "bastos-10", "espadas-07"],
    ["espadas-01", "espadas-02", "espadas-03"], ["copas-04", "copas-05", "copas-06"]],
};

test("el menú combina cada jugada con silencio y las trece señas de la guía, en orden estable", () => {
  assert.deepEqual(signals, ["cejas", "beso", "nariz", "ojo-derecho", "ojo-izquierdo", "labios-derecha",
    "labios-izquierda", "labio-inferior", "boca", "lengua", "ojos-cerrados", "labio-superior", "cachetes"]);
  const moves: readonly Move[] = ["espadas-03", "flor"];
  const ids = signalRules.legalActions(moves);
  assert.deepEqual(ids.slice(0, 2), moves);
  assert.equal(new Set(ids).size, 28);
  for (const [i, id] of ids.entries()) {
    const move = moves[i % moves.length];
    const signal = signals[Math.floor(i / moves.length) - 1];
    assert.deepEqual(signalRules.decode(id), signal ? { move, signal } : { move });
  }
  assert.deepEqual(signalRules.legalActions([]), []);
  for (const invalid of ["cejas", "cejas/", "cejas/nariz/truco", "otra/truco", "nariz/espadas-09", "toString", "/flor"]) {
    assert.throws(() => signalRules.decode(invalid as ActionId));
  }
});

test("un cambio en las manos de compañero y adversarios conserva la distribución de acciones posibles", () => {
  const alternate = { ...deal, manos: [deal.manos[0], deal.manos[3], deal.manos[1], deal.manos[2]] };
  const menus = [deal, alternate].map(cards => {
    const observation = observe(iniciarOnline(cards), 0, "pairs-senas", []);
    return signalRules.legalActions(observation.legalActions as readonly Move[]);
  });
  assert.deepEqual(menus[0], menus[1]);
  // El 0 no tiene flor, pero puede hacer esa seña y seguir jugando una carta.
  assert.ok(menus[0].includes("cachetes/copas-07"));
});

test("la seña se confirma con su jugada, precede a los cobros y llega una vez a cada asiento tras restaurar", () => {
  const sequence = [
    [0, "cachetes/truco"], [1, "envido"], [0, "quiero"],
    [2, "cejas/flor"], [3, "flor"], [3, "labios-derecha/quiero"],
  ] as const;
  let state = iniciarOnline(deal);
  const history: PublicTurn[] = [];
  for (const [seat, id] of sequence) {
    const step = commitTurn(state, seat, "pairs-senas", id);
    history.push(step.turn);
    state = step.state;
  }
  assert.deepEqual(history.map(t => t.signal ?? null), ["cachetes", null, null, "cejas", null, "labios-derecha"]);
  assert.deepEqual(history.map(t => t.action.tipo), ["truco", "envido", "quiero", "flor", "flor", "quiero"]);
  assert.deepEqual(history.slice(0, -1).flatMap(t => t.awards), []);
  assert.equal(history.at(-1)!.awards[0].motivo, "flor");
  assert.deepEqual(history.at(-1)!.awards, state.cobros);
  assert.equal(state.acciones.length, sequence.length);

  let restored = iniciarOnline(deal);
  const persisted: PublicTurn[] = JSON.parse(JSON.stringify(history));
  for (const t of persisted) {
    const move = t.action.tipo === "carta" ? t.action.carta : t.action.tipo;
    const id: ActionId = t.signal ? `${t.signal}/${move}` : move;
    const replay = commitTurn(restored, t.action.asiento, "pairs-senas", id);
    assert.deepEqual(replay.turn, t);
    restored = replay.state;
  }
  assert.deepEqual(restored, state);
  for (const seat of [0, 1, 2, 3] as const) {
    const expected = history.map(({signal, action, awards}) =>
      signal && action.asiento % 2 === seat % 2 ? {signal, action, awards} : {action, awards});
    assert.deepEqual(observe(restored, seat, "pairs-senas", persisted).history, expected);
  }
});

test("la seña no permite saltar ni postergar una flor forzada", () => {
  const florDeal = { ...deal, manos: [deal.manos[2], deal.manos[0], deal.manos[1], deal.manos[3]] };
  const state = iniciarOnline(florDeal);
  const view = observe(state, 0, "pairs-senas", []);
  assert.deepEqual(view.legalActions, ["flor"]);
  const ids = signalRules.legalActions(["flor"]);
  assert.equal(ids.length, 14);
  for (const id of ids) {
    const step = commitTurn(state, 0, "pairs-senas", id);
    assert.deepEqual(step.state.flores, [0]);
    assert.equal(step.turn.action.tipo, "flor");
    assert.equal(step.state.acciones.length, 1);
  }
  assert.throws(() => commitTurn(state, 0, "pairs-senas", "cejas/truco"), /rechazada/);
  assert.throws(() => commitTurn(state, 0, "pairs-senas", "cejas" as ActionId));
  assert.deepEqual(state.acciones, []);
});

test("las jugadas sin seña reproducen el motor anterior en duelos y parejas", () => {
  const duel: RepartoOnline = { ...deal, dador: 1, manos: deal.manos.slice(0, 2) };
  for (const [format, cards] of [["duel", duel], ["pairs", deal]] as const) {
    const state = iniciarOnline(cards);
    const action = { tipo: "carta", carta: "copas-07", asiento: 0 } as const;
    const ordinary = aplicarOnline(state, action);
    assert.ok(ordinary.ok);
    const step = commitTurn(state, 0, format, action.carta);
    assert.deepEqual(step.state, ordinary.estado);
    assert.deepEqual(step.turn, { action, awards: [] });
    assert.throws(() => commitTurn(state, 0, format, "cachetes/copas-07"), /no admite/);
    assert.throws(() => commitTurn(state, 1, format, action.carta));
  }
});
