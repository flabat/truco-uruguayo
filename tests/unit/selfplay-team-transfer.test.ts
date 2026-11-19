import {mkdtempSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {save} from "../../training/anchored/io.ts";
import {runTransferStudy} from "../../training/selfplay/team-transfer-study.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {artifactPin, openActor} from "../../api/actor-registry.ts";
import {initial} from "../../training/anchored/actor.ts";
import {playMatch} from "../../training/arena/index.ts";
import type {ActionId, Policy} from "../../training/contracts/index.ts";
import {createLearner} from "../../training/selfplay/learner.ts";
import {initialTeamMixture, openTeamMixture} from "../../training/selfplay/team-mixture.ts";
import {silentTransfer} from "../../training/selfplay/team-transfer.ts";

for (const origin of ["pairs-private-senas", "pairs"] as const) {
  test(origin + " transfiere probabilidades de cartas y apuestas sin recibir ni enviar señas", () => {
    const anchor = initial(origin);
    if (origin === "pairs-private-senas") anchor.bands.fill("support-stakes-signals");
    const finalist = createLearner(anchor).actor;
    finalist.updates = 10;
    finalist.weights.fill(0.12);
    const source = initialTeamMixture(finalist, anchor);
    source.routes.opening = "team";
    source.routes.truco = "anchor";
    const direct = openTeamMixture(source);
    const frozen = silentTransfer(source);
    const format = frozen.format;
    const actor = openActor(JSON.parse(JSON.stringify(frozen)), format, 0);
    assert.equal(artifactPin(frozen), artifactPin(JSON.parse(JSON.stringify(frozen))));
    assert.throws(() => openActor({...frozen, format:origin}, origin, 0));
    assert.throws(() => openActor(frozen, "duel", 0));
    const signer:Policy = {id:"gesture-probe", decide(obs, legal) {
      const probabilities = actor.decide(obs, legal);
      if (format !== "pairs-private-senas") return probabilities;
      const base = legal[probabilities.findIndex(p => p > 0)];
      const signed = legal.indexOf(("cejas/" + base) as ActionId);
      return legal.map((_, i) => Number(i === signed));
    }};
    let decisions = 0, signedTurns = 0, cueObserved = 0, bets = 0, cards = 0;
    playMatch({format, seed: 167001, pair: 1, leg: 0, policies:seat => seat === 2 ? signer : actor,
      onDecision({observation:obs, action, seat}) {
        const moves = obs.legalActions.filter(a => !a.includes("/"));
        const history = obs.history.map(({action, awards}) => ({action, awards}));
        const reference = direct.decide({...obs, history, legalActions:moves, format:origin}, moves);
        const before = actor.decide(obs, obs.legalActions);
        assert.deepEqual(before.filter((_, i) => !obs.legalActions[i].includes("/")), reference);
        for (const [i, id] of obs.legalActions.entries()) if (id.includes("/")) assert.equal(before[i], 0);
        const changed = {...obs, history:obs.history.map(t => ({...t,signal:"nariz" as const}))};
        assert.deepEqual(actor.decide(changed, obs.legalActions), before);
        assert.deepEqual(actor.decide(obs, []), []);
        if (obs.history.some(t => t.signal)) cueObserved++;
        if (action.includes("/")) { assert.equal(seat, 2); signedTurns++; }
        if (action.split("/").at(-1)!.match(/-[0-9]+$/)) cards++; else bets++;
        decisions++;
      }});
    assert.ok(decisions > 1 && bets && cards);
    if (format === "pairs-private-senas") assert.ok(signedTurns && cueObserved);
    else assert.equal(signedTurns, 0);
  });
}

test("la medición emparejada reanuda el protocolo fijo y detecta una modificación de datos", () => {
  const area = mkdtempSync(join(tmpdir(), "team-transfer-"));
  try {
    const formats = ["pairs", "pairs-private-senas"] as const;
    const pins:Record<string,string> = {}, inputs:Record<string,string> = {};
    for (const format of formats) {
      const anchor = initial(format);
      const source = initialTeamMixture(createLearner(anchor).actor, anchor);
      const artifact = silentTransfer(source);
      mkdirSync(join(area,artifact.format));
      save(join(area,artifact.format,"transfer.json"), artifact);
      pins[artifact.format]=artifactPin(artifact); inputs[format]=artifactPin(source);
    }
    const protocol = {rules:"senas-equipo-v1",computerOnly:true,pins,inputs,controls:["native","anchor","finalist"],
      fixtures:["strong-cards","champion","finalist","V1","caller","strong-cards/V1-teammate","native"],
      pairs:{train:2,dev:2},seeds:{pairs:{train:10,dev:11},"pairs-private-senas":{train:12,dev:13}}};
    save(join(area,"protocol.json"), protocol);
    const result = runTransferStudy(area, "pairs");
    assert.equal(result[1].games, 112);
    assert.ok(result[1].fixtures.every(row => row.pairedDifferences.native.mean===0));
    assert.deepEqual(runTransferStudy(area,"pairs"), result);
    protocol.seeds.pairs.dev = 14;
    save(join(area,"protocol.json"), protocol);
    assert.throws(() => runTransferStudy(area,"pairs"));
  } finally {rmSync(area,{recursive:true,force:true});}
});
