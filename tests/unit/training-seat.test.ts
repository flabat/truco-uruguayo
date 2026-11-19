import assert from "node:assert/strict";
import test from "node:test";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, vistaOnline,
  type AccionOnline, type RepartoOnline,
} from "../../src/motor/mesa-online.ts";
import { repartir, type Asiento } from "../../src/motor/reparto.ts";
import type { Format, Move, PublicTurn, Score, SeatObservation } from "../../training/contracts/index.ts";
import { challenger, decodeMove, incumbent, observe } from "../../training/seat/index.ts";

const falta: RepartoOnline = {
  versionReparto: "online-1", dador: 1, mano: 0, muestra: "bastos-01",
  manos: [["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"]],
};

function hand(deal = falta, start: Score = [0, 0]) {
  let state = iniciarOnline(deal, start);
  const history: PublicTurn[] = [];
  return {
    get state() { return state; },
    history,
    play(action: AccionOnline) {
      const step = aplicarOnline(state, action);
      assert.ok(step.ok, JSON.stringify(action));
      history.push({ action: step.estado.acciones.at(-1)!, awards: step.estado.cobros.slice(state.cobros.length) });
      state = step.estado;
    },
    see(seat: Asiento, format: Format = deal.manos.length === 2 ? "duel" : "pairs") {
      return observe(state, seat, format, history);
    },
  };
}

function choose(observation: SeatObservation, policy = incumbent) {
  const actions = observation.legalActions;
  const probs = policy.decide(observation, actions);
  assert.equal(probs.length, actions.length);
  assert.ok(probs.every(p => Number.isFinite(p) && (p === 0 || p === 1)));
  assert.equal(probs.reduce((sum, p) => sum + p, 0), actions.length ? 1 : 0);
  const move = actions[probs.indexOf(1)] as Move | undefined;
  return move === undefined ? null : decodeMove(move, observation.view.asiento);
}

test("la falta de apertura de 36 contra 27 termina el chico con V1 y cuesta un tanto con el desafiante", () => {
  for (const score of [[0, 0], [39, 39]] as const) {
    for (const policy of [incumbent, challenger]) {
      const game = hand(falta, score);
      const opening = game.see(0);
      assert.deepEqual(opening.legalActions.slice(0, 3), falta.manos[0]);
      assert.deepEqual(choose(opening), { tipo: "falta-envido", asiento: 0 });
      game.play(choose(opening)!);
      const pending = game.see(1);
      assert.equal(pending.view.tantosPropios.total, 27);
      assert.deepEqual(pending.relativeSeats, [1, 0]);
      assert.deepEqual(pending.stakes.side, { accept: 40 - score[0], decline: 1 });
      assert.deepEqual(choose(pending, policy), { tipo: policy === incumbent ? "quiero" : "no-quiero", asiento: 1 });
      game.play(choose(pending, policy)!);
      const end = game.see(0);
      assert.deepEqual(end.score, [policy === incumbent ? 40 : score[0] + 1, score[1]]);
      const award = end.history[1].awards[0];
      assert.equal(award.tantos, policy === incumbent ? 40 - score[0] : 1);
      assert.deepEqual(award, end.view.cobros[0]);
      assert.equal(end.view.resultado !== null, end.score[0] === 40);
      assert.deepEqual(end.stakes.side, null);
      if (end.view.resultado) assert.deepEqual(policy.decide(end, end.legalActions), []);
    }
  }
});

test("el desafiante conserva V1 con 35, ante una subida, una falta tras otro canto o una flor obligatoria", () => {
  const exactly35: RepartoOnline = { ...falta, manos: [falta.manos[0], ["bastos-05", "oros-07", "copas-02"]] };
  const withFlor: RepartoOnline = { ...falta, manos: [falta.manos[0], ["oros-07", "oros-11", "oros-05"]] };
  for (const [deal, sequence, lastSeat, expected] of [
    [exactly35, ["falta-envido"], 1, "quiero"],
    [withFlor, ["falta-envido"], 1, "flor"],
    [falta, ["envido", "falta-envido"], 0, "quiero"],
    [falta, ["truco", "falta-envido"], 0, "quiero"],
  ] as const) {
    const game = hand(deal);
    for (const move of sequence) game.play(decodeMove(move, aDecidir(game.state)[0]));
    const view = game.see(lastSeat);
    if (deal === exactly35) assert.equal(view.view.tantosPropios.total, 35);
    assert.deepEqual(choose(view, challenger), choose(view));
    assert.equal(choose(view, challenger)?.tipo, expected);
  }
});

test("en duelos y parejas V1 reproduce cada decisión del bot y ofrece una acción distinta por carta", () => {
  for (const seats of [2, 4] as const) {
    for (let seed = 0; seed < 40; seed++) {
      const dealer = (seed % seats) as Asiento;
      const deal = repartir(seed, dealer);
      const game = hand({ ...falta, muestra: deal.muestra, manos: deal.manos.slice(0, seats),
        dador: dealer, mano: ((dealer + 1) % seats) as Asiento }, [seed, 39 - seed]);
      while (!game.state.resultado) {
        const actors = aDecidir(game.state);
        for (const seat of actors) {
          const obs = game.see(seat);
          const reference = vistaOnline(game.state, seat);
          const expected = elegirAccionOnline(reference);
          // La mesa ubica el cobro en el historial y muestra el desglose de la flor.
          const { indiceCobroLateral, ...vistaV1 } = reference;
          const cobrosV1 = reference.cobros.map(({ comparacionFlor, ...cobro }) => cobro);
          assert.deepEqual(obs.view, { ...vistaV1, cobros: cobrosV1 });
          assert.deepEqual(obs.originalCards, deal.manos[seat]);
          assert.deepEqual(obs.legalActions, reference.legales.flatMap<Move>(type => type === "carta" ? [...reference.cartas] : [type]));
          assert.deepEqual(choose(obs), expected);
          if (seats === 4) assert.deepEqual(choose(obs, challenger), expected);
        }
        game.play(choose(game.see(actors[0]))!);
      }
      for (const policy of [incumbent, challenger]) assert.equal(choose(game.see(0), policy), null);
    }
  }
});

const tiedPairs: RepartoOnline = {
  ...falta, dador: 1, mano: 2, muestra: "oros-06", manos: [
    ["espadas-07", "bastos-04", "copas-11"], ["bastos-07", "espadas-06", "copas-12"],
    ["copas-07", "bastos-06", "espadas-10"], ["oros-07", "espadas-05", "bastos-12"],
  ],
};

test("truco pendiente bajo el envido, empate desde mano y cobro condicionado por las consultas de flor", () => {
  const game = hand(tiedPairs, [39, 39]);
  for (const [move, seat] of [["truco", 2], ["envido", 3]] as const) game.play(decodeMove(move, seat));
  const pending = game.see(2);
  assert.deepEqual(pending.stakes, { side: { accept: 2, decline: 1 }, truco: { accept: 2, decline: 1 }, florByTeam: [0, 0] });
  for (const [move, seat] of [["quiero", 2], ["paso-flor", 0]] as const) game.play(decodeMove(move, seat));
  assert.deepEqual(game.see(1).score, [39, 39]);
  game.play(decodeMove("paso-flor", 1));
  const terminal = game.see(1);
  assert.deepEqual(terminal.history.flatMap(t => t.awards), [{ equipo: 0, asiento: 2, tantoGanador: 7, tantos: 2, motivo: "envido" }]);
  assert.deepEqual(terminal.history.map(t => t.awards.length), [0, 0, 0, 0, 1]);
  assert.deepEqual(terminal.score, [40, 39]);
  assert.deepEqual(terminal.stakes.truco, null);
});

test("la seña o flor solo aparece al declararse y cambiar cartas ajenas, incluso del compañero, conserva las decisiones", () => {
  const base: RepartoOnline = { ...tiedPairs, dador: 3, mano: 0 };
  const alternate: RepartoOnline = { ...base, manos: [
    base.manos[0], ["copas-02", "copas-03", "copas-04"], ["oros-01", "bastos-01", "espadas-01"], base.manos[3],
  ] };
  const games = [base, alternate].map(deal => hand(deal));
  for (const format of ["pairs", "pairs-senas"] as const) {
    const a = games[0].see(0, format), b = games[1].see(0, format);
    assert.deepEqual(a, b);
    for (const policy of [incumbent, challenger]) assert.deepEqual(policy.decide(a, a.legalActions), policy.decide(b, b.legalActions));
  }
  for (const game of games) game.play(decodeMove("envido", 0));
  assert.deepEqual(games[0].see(0), games[1].see(0));
  assert.deepEqual(games[1].see(1).legalActions, ["flor"]);
  games[1].play(decodeMove("flor", 1));
  assert.deepEqual(games[1].see(2).stakes.florByTeam, [0, 3]);
  const signaled = games[1].history.map((turn, i) => i === 0 ? { ...turn, signal: "cejas" as const, privateSeed: 123 } : turn);
  const visible = observe(games[1].state, 2, "pairs-senas", signaled);
  assert.deepEqual(visible.history[0], { action: { tipo: "envido", asiento: 0 }, signal: "cejas", awards: [] });
  assert.equal(visible.view.porDeclararFlor, 2);
  assert.throws(() => observe(games[1].state, 0, "pairs", signaled), /Seña/);
});

test("no se incluyen campos del árbitro ni se aceptan historias incompatibles", () => {
  const game = hand();
  game.play(decodeMove("falta-envido", 0));
  game.play(decodeMove("quiero", 1));
  const view = game.see(1);
  assert.throws(() => observe(game.state, 0, "pairs", game.history), /asientos/);
  assert.throws(() => observe(game.state, 0, "duel", []), /historial/);
  assert.throws(() => observe(game.state, 0, "duel", game.history.toReversed()), /acción/);
  assert.throws(() => observe(game.state, 0, "duel", game.history.map(turn => ({ ...turn, awards: [] }))), /cobros/);
  for (const hidden of [...falta.manos[0], "manos", "restantes", "reparto", "semilla"]) {
    assert.equal(JSON.stringify(view).includes(hidden), false);
  }
  Reflect.set(view.originalCards, 0, "copas-10");
  Reflect.set(view.history[0].action, "asiento", 3);
  assert.deepEqual(game.see(1).originalCards, falta.manos[1]);
  assert.deepEqual(game.history[0].action, { tipo: "falta-envido", asiento: 0 });
});
