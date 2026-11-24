import assert from "node:assert/strict";
import test from "node:test";
import {openActor} from "../../api/actor-registry.ts";
import {compararCartas} from "@eltruco/motor/jerarquia.ts";
import {iniciarOnline} from "@eltruco/motor/mesa-online.ts";
import type {RepartoOnline} from "@eltruco/motor/reparto.ts";
import {initial} from "../../training/anchored/actor.ts";
import type {SeatObservation} from "../../training/contracts/index.ts";
import {duelDeals} from "../../training/search/belief.ts";
import {observe} from "../../training/seat/index.ts";
import {duelCardOdds} from "../../training/selfplay/duel-card-odds.ts";
import {collect, createLearner, duelOddsKind, exportSelfplay, openSelfplay, withDuelCardOdds} from "../../training/selfplay/learner.ts";
import {commitTurn} from "../../training/signals/index.ts";

const deal: RepartoOnline = {versionReparto:"online-1", mano:0, dador:1, muestra:"oros-06",
  manos:[["oros-04","copas-07","bastos-04"],["oros-02","espadas-01","bastos-06"]]};

function afterFirst(reply: "oros-02" | "espadas-01") {
  const lead = commitTurn(iniciarOnline(deal), 0, "duel", "bastos-04");
  const response = commitTurn(lead.state, 1, "duel", reply);
  return observe(response.state, 0, "duel", [lead.turn, response.turn]);
}

function checkAgainstEnumeration(obs: SeatObservation) {
  const odds = duelCardOdds(obs);
  const opponent = 1 - obs.view.asiento;
  const exposed = obs.history.filter(({action}) => action.asiento === opponent && action.tipo === "carta").length;
  const counts = obs.view.cartas.map(() => ({higher:0, tiedBest:0}));
  let deals = 0;
  for (const world of duelDeals(obs)) {
    const remaining = world.manos[opponent].slice(exposed);
    for (const [i, card] of obs.view.cartas.entries()) {
      const strongest = Math.max(...remaining.map(rival => compararCartas(rival, card, obs.view.muestra)));
      if (strongest > 0) counts[i].higher++;
      if (strongest === 0) counts[i].tiedBest++;
    }
    deals++;
  }
  for (const [i, card] of obs.view.cartas.entries()) {
    assert.deepEqual(odds.get(card), {higher:counts[i].higher/deals, tiedBest:counts[i].tiedBest/deals});
  }
}

test("el conteo exacto distingue dos bazas perdidas y excluye la muestra y las tres cartas propias", () => {
  const opening = observe(iniciarOnline(deal), 0, "duel", []);
  const spent = afterFirst("oros-02"), stillHidden = afterFirst("espadas-01");
  assert.deepEqual(duelCardOdds(opening).get("oros-04"), {higher:3/36, tiedBest:0});
  assert.deepEqual(duelCardOdds(spent).get("oros-04"), {higher:0, tiedBest:0});
  assert.deepEqual(duelCardOdds(stillHidden).get("oros-04"), {higher:2/35, tiedBest:0});
  for (const obs of [opening, spent, stillHidden]) checkAgainstEnumeration(obs);
});

test("usa la jerarquía de la muestra, los empates y solo la información visible al asiento", () => {
  const alternate: RepartoOnline = {...deal, mano:1, dador:0, muestra:"oros-02",
    manos:[["oros-12","espadas-01","bastos-06"],deal.manos[0]]};
  const obs = observe(iniciarOnline(alternate), 1, "duel", []);
  const hidden = observe(iniciarOnline({...alternate, manos:[["copas-01","copas-05","espadas-07"],alternate.manos[1]]}), 1, "duel", []);
  assert.deepEqual(duelCardOdds(obs), duelCardOdds(hidden));
  assert.equal(duelCardOdds(obs).get("oros-04")!.higher, 3/36); // El rey sustituye al dos.
  assert.ok(duelCardOdds(obs).get("copas-07")!.tiedBest > 0);
  checkAgainstEnumeration(obs);
});

test("al responder un truco, el modelo distingue un cuatro firme de uno que todavía puede perder", () => {
  const source = createLearner(initial("duel")).actor;
  source.updates = 1;
  source.weights[0] = 0.25;
  const counted = withDuelCardOdds(source);
  // The quiero action, in the 'our strongest card cannot be beaten' feature bin.
  counted.weights[13 * 256 + 31 * 8] = 1;
  for (const reply of ["oros-02", "espadas-01"] as const) {
    const lead = commitTurn(iniciarOnline(deal), 0, "duel", "bastos-04");
    const response = commitTurn(lead.state, 1, "duel", reply);
    const raise = commitTurn(response.state, 1, "duel", "truco");
    const obs = observe(raise.state, 0, "duel", [lead.turn, response.turn, raise.turn]);
    const at = obs.legalActions.indexOf("quiero");
    assert.ok(at >= 0);
    const antes = openSelfplay(source).decide(obs, obs.legalActions)[at];
    const despues = openSelfplay(counted).decide(obs, obs.legalActions)[at];
    if (reply === "oros-02") assert.ok(despues > antes);
    else assert.equal(despues, antes);
  }
});

test("exporta el actor de conteo, actualiza sus pesos y conserva la conducta del modelo original", () => {
  const learner = createLearner(initial("duel"));
  learner.actor.updates = 2;
  learner.actor.weights[0] = 0.25;
  learner.actor.weights[255] = 3; // A formerly ignored position.
  const baseline = exportSelfplay(learner);
  const upgraded = withDuelCardOdds(baseline);
  const obs = observe(iniciarOnline(deal), 0, "duel", []);
  const decide = (actor: typeof upgraded) => openActor(JSON.parse(JSON.stringify(actor)), "duel", 0).decide(obs, obs.legalActions);
  assert.equal(upgraded.kind, duelOddsKind);
  assert.equal(upgraded.weights.length, baseline.weights.length);
  assert.equal(upgraded.weights.length, 7424);
  assert.equal(upgraded.weights[0], 0.25);
  assert.equal(upgraded.weights[255], 0);
  assert.equal(baseline.weights[255], 3);
  assert.deepEqual(decide(upgraded), decide(baseline));

  learner.actor = upgraded;
  const collector = collect(learner);
  collector.policy.decide(obs, obs.legalActions);
  collector.record(obs, "oros-04");
  collector.finish(1);
  const learned = exportSelfplay(learner);
  assert.ok(learned.weights.some((weight, i) => i % 256 >= 232 && weight !== 0));
  assert.ok(learner.critic.slice(248).some(weight => weight !== 0));
  assert.deepEqual(withDuelCardOdds(learned), learned);
  const withoutOdds = {...learned, kind:baseline.kind};
  assert.notDeepEqual(decide(learned), decide(withoutOdds));
  const pairs = createLearner(initial("pairs")).actor;
  assert.throws(() => withDuelCardOdds(pairs));
  assert.throws(() => openSelfplay({...pairs, kind:duelOddsKind}));
});
