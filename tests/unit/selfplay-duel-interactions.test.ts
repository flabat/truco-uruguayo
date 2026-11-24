import assert from "node:assert/strict";
import test from "node:test";
import {openActor} from "../../api/actor-registry.ts";
import {aDecidir, iniciarOnline} from "@eltruco/motor/mesa-online.ts";
import type {RepartoOnline} from "@eltruco/motor/reparto.ts";
import {initial} from "../../training/anchored/actor.ts";
import type {Move, PublicTurn, SeatObservation} from "../../training/contracts/index.ts";
import {observe} from "../../training/seat/index.ts";
import {duelCardOdds} from "../../training/selfplay/duel-card-odds.ts";
import {collect, createLearner, duelInteractionsKind, openSelfplay, scaleDuelResidual,
  withDuelCardOdds, withDuelInteractions, type SelfplayActor} from "../../training/selfplay/learner.ts";
import {commitTurn} from "../../training/signals/index.ts";

const deal: RepartoOnline = {versionReparto:"online-1", mano:0, dador:1, muestra:"oros-06",
  manos:[["oros-02","espadas-05","bastos-06"],["copas-05","bastos-04","copas-06"]]};
function after(moves: Move[], cards = deal) {
  let state = iniciarOnline(cards);
  const history: PublicTurn[] = [];
  for (const move of moves) {
    const step = commitTurn(state, aDecidir(state)[0], "duel", move);
    state = step.state;
    history.push(step.turn);
  }
  return observe(state, aDecidir(state)[0], "duel", history);
}
function probability(actor: SelfplayActor, obs: SeatObservation, move: Move) {
  const position = obs.legalActions.indexOf(move);
  assert.ok(position >= 0, "Expected legal move " + move);
  return openSelfplay(actor).decide(obs, obs.legalActions)[position];
}
const baseSize = 7424, situationSize = 16, actionSize = 256;
function higherCell(action: number, firstTrick: number, stake: number, bin: number) {
  return baseSize + action * actionSize + (firstTrick * 4 + stake - 1) * situationSize + bin;
}

test("el nuevo actor conserva los pesos, la conducta y el formato de sus predecesores", () => {
  const old = createLearner(initial("duel")).actor;
  old.weights[0] = 0.75;
  old.updates = 2;
  const odds = withDuelCardOdds(old);
  odds.weights[31 * 8] = 0.5;
  for (const source of [old, odds]) {
    const upgraded = withDuelInteractions(source);
    assert.equal(upgraded.kind, duelInteractionsKind);
    assert.equal(upgraded.weights.length, 11264);
    assert.deepEqual(upgraded.weights.slice(0, baseSize), source.weights);
    assert.ok(upgraded.weights.slice(baseSize).every(w => w === 0));
    const reopened = openActor(JSON.parse(JSON.stringify(upgraded)), "duel", 0);
    for (const obs of [after([]), after(["truco"]), after(["espadas-05","bastos-04"])]) {
      assert.deepEqual(reopened.decide(obs, obs.legalActions), openSelfplay(source).decide(obs, obs.legalActions));
    }
    upgraded.weights[baseSize] = 0.5;
    upgraded.weights[upgraded.weights.length - 1] = 0.5;
    assert.deepEqual(withDuelInteractions(upgraded), upgraded);
    const calibrated = scaleDuelResidual(upgraded, "v1", 0.25, 0.5);
    assert.equal(calibrated.weights[baseSize], 0.125);
    assert.equal(calibrated.weights.at(-1), 0.25);
    assert.throws(() => openSelfplay({...upgraded, weights:source.weights}));
    assert.throws(() => openSelfplay({...source, weights:upgraded.weights}));
    assert.equal(source.weights.length, baseSize);
  }
  assert.throws(() => withDuelInteractions(createLearner(initial("pairs")).actor));
});

test("un peso de quiero distingue fuerza, primera ganada, perdida o parda y precio de la oferta", () => {
  const source = withDuelCardOdds(createLearner(initial("duel")).actor);
  source.updates = 1;
  source.weights[0] = 0.1;
  const actor = withDuelInteractions(source);
  // Quiero jugado con primera ganada, por dos tantos y con una carta imbatible.
  actor.weights[higherCell(13, 2, 2, 0)] = 1;
  const win: Move[] = ["espadas-05","bastos-04","bastos-06","truco"];
  const atTwo = after(win);
  assert.ok(probability(actor, atTwo, "quiero") > probability(source, atTwo, "quiero"));
  const beatable: RepartoOnline = {...deal, manos:[["oros-04","espadas-05","bastos-06"],deal.manos[1]]};
  for (const obs of [
    after(win, beatable),                                              // El dos todavía puede estar afuera.
    after(["espadas-05","truco"]),                                     // Primera abierta.
    after(["espadas-05","copas-06","truco"]),                         // Primera perdida.
    after(["espadas-05","copas-05","bastos-06","truco"]),             // Primera parda.
    after(["truco","quiero","espadas-05","bastos-04","bastos-06","retruco"]) // Aceptar vale tres.
  ]) assert.equal(probability(actor, obs, "quiero"), probability(source, obs, "quiero"));
});

test("al aprender una carta usa sus propias probabilidades y el valor aceptado; al cantar usa el propuesto", () => {
  const learner = createLearner(initial("duel"));
  learner.actor = withDuelInteractions(learner.actor);
  assert.throws(() => collect(learner), /training state/);
  learner.squaredGradient = Array(learner.actor.weights.length).fill(0);
  const opening = after([]);
  const odds = duelCardOdds(opening);
  assert.ok(odds.get("espadas-05")!.higher > 0.5);
  assert.equal(odds.get("oros-02")!.higher, 0);
  const collector = collect(learner);
  collector.policy.decide(opening, opening.legalActions);
  collector.record(opening, "espadas-05");
  collector.finish(1);
  const weights = learner.actor.weights;
  const weakestCard = higherCell(0, 0, 1, 0);
  assert.equal(weights[weakestCard], 0);
  assert.ok(weights.slice(weakestCard + 1, weakestCard + 8).some(w => w > 0));
  assert.ok(weights.slice(weakestCard + 8, weakestCard + 16).some(w => w > 0)); // Empate.
  assert.ok(weights[higherCell(2, 0, 1, 0)] < 0); // Carta firme.
  assert.ok(weights[higherCell(10, 0, 2, 0)] < 0); // Cantar truco propone dos.
  assert.equal(weights[higherCell(10, 0, 1, 0)], 0);
  assert.ok(weights.every(Number.isFinite));
});

test("responder envido interpuesto en un truco conserva el valor aceptado para las bazas", () => {
  const source = withDuelCardOdds(createLearner(initial("duel")).actor);
  source.weights[0] = 0.1;
  source.updates = 1;
  const actor = withDuelInteractions(source);
  const obs = after(["truco","envido"]);
  assert.ok(obs.stakes.side && obs.stakes.truco);
  actor.weights[higherCell(13, 0, 2, 0)] = 1;
  assert.equal(probability(actor, obs, "quiero"), probability(source, obs, "quiero"));
  actor.weights[higherCell(13, 0, 1, 0)] = 1;
  assert.ok(probability(actor, obs, "quiero") > probability(source, obs, "quiero"));
});
