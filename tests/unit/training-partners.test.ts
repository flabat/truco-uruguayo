import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline } from "@eltruco/motor/mesa-online.ts";
import { scheduledDeal } from "../../training/arena/index.ts";
import { observe } from "../../training/seat/index.ts";
import { signalRules } from "../../training/signals/index.ts";
import type { Move } from "../../training/contracts/index.ts";
import { exportActor, initialize, trainingBatch } from "../../training/partners/train.ts";
import { digest, loadPartnerPolicy, monteCarloId } from "../../training/partners/policy.ts";
import { compareEndgame, prescriptionValue, solveEndgame } from "../../training/partners/oracle.ts";
import { crossplay } from "../../training/partners/crossplay.ts";

for (const format of ["pairs","pairs-private-senas"] as const) {
  test(format + " mantiene el actor privado, normalizado e independiente del crítico y de otros asientos", () => {
    const cp = initialize(format,24,4,0.04,2,"cpu"), actor = exportActor(cp);
    const policy = loadPartnerPolicy(actor,0);
    const cards = scheduledDeal(format,42,0,0);
    const alternate = {...cards, manos:[cards.manos[0],cards.manos[2],cards.manos[3],cards.manos[1]]};
    const result = [cards,alternate].map(deal => {
      const obs = observe(iniciarOnline(deal),0,format,[]);
      const legal = format === "pairs-private-senas" ? signalRules.legalActions(obs.legalActions as Move[]) : obs.legalActions;
      return policy.decide({...obs,legalActions:legal},legal);
    });
    assert.deepEqual(result[0],result[1]);
    assert.ok(result[0].every(p => p >= 0 && Number.isFinite(p)));
    assert.ok(Math.abs(result[0].reduce((a,b)=>a+b,0) - 1) < 1e-9);
    cp.learner.critic.fill(9); cp.learner.velocity = { private:1 };
    assert.equal(digest(exportActor(cp)), digest(actor));
    assert.ok(result[0].length > 0);
    assert.ok(!("critic" in actor) && !("seed" in actor) && !("velocity" in actor));
    assert.throws(() => loadPartnerPolicy({...actor, schema:"broken" as never},0));
  });
  test(format + " calcula retornos por chico y compara dos políticas con parejas computacionales", () => {
    const cp = initialize(format,11,2,0.04,2,"cpu");
    const clone = structuredClone(cp);
    const batch = trainingBatch(cp,2);
    assert.deepEqual(trainingBatch(clone,2),batch);
    assert.equal(digest(cp.values),digest(clone.values));
    assert.ok(cp.mcExamples>0 && batch.length>0);
    assert.equal(new Set(batch.map(r=>r.seat)).size,4);
    assert.ok(batch.every(r=>Math.abs(r.reward)===1 && r.actions[r.choice] && r.critic.length===9));
    const mc = exportActor(cp,true); assert.equal(mc.kind,monteCarloId);
    const actor = exportActor(cp), partner = exportActor(initialize(format,99,2,0.04,2,"cpu"));
    const report = crossplay(actor,partner,mc,781,1);
    assert.equal(report.reports.length, format === "pairs" ? 9 : 18);
    assert.ok(report.reports.every(r=>r.outcomes.length===1 && r.games===2));
    assert.equal(report.deltas.length, format === "pairs" ? 0 : 9);
  });
}

test("el juego reducido a 39–39 resuelve las dieciséis prescripciones con jugadas legales", () => {
  assert.equal(prescriptionValue([0,0],[0,0]),0);
  assert.equal(prescriptionValue([1,1],[1,0]),1);
  assert.equal(solveEndgame().value,1);
  const {value,optimum} = compareEndgame(exportActor(initialize("pairs",81,4,0.04,2,"cpu")));
  assert.ok(value>0 && value<optimum);
});
