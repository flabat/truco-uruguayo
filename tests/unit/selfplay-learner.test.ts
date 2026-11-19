import assert from "node:assert/strict";
import test from "node:test";
import {iniciarOnline} from "../../src/motor/mesa-online.ts";
import type {Asiento, RepartoOnline} from "../../src/motor/reparto.ts";
import {playMatch, scheduledDeal} from "../../training/arena/index.ts";
import {initial, openAnchored, type CycleFormat} from "../../training/anchored/actor.ts";
import type {ActionId, Move} from "../../training/contracts/index.ts";
import {collect, createLearner, exportSelfplay, openSelfplay} from "../../training/selfplay/learner.ts";
import {incumbent, observe} from "../../training/seat/index.ts";
import {commitTurn, signalRules} from "../../training/signals/index.ts";

function opening(format: CycleFormat) {
  for (let i=0;i<100;i++) {
    const state=iniciarOnline(scheduledDeal(format,23,i,0));
    const obs=observe(state,state.mano.turno!,format,[]);
    if (obs.legalActions.length<3) continue;
    return format==="pairs-private-senas" ? {...obs,legalActions:signalRules.legalActions(obs.legalActions as Move[])} : obs;
  }
  throw Error("Missing multiaction fixture");
}

for (const format of ["duel","pairs","pairs-private-senas"] as const) {
  test(format+" arranca idéntico al ancla, aprende jugadas y reproduce el optimizador al reanudar",()=>{
    const obs=opening(format), legal=obs.legalActions;
    const anchor=initial(format);
    const high= createLearner(anchor), low=JSON.parse(JSON.stringify(high));
    const before=exportSelfplay(high), frozen=openSelfplay(before);
    assert.deepEqual(frozen.decide(obs,legal),openAnchored(anchor).decide(obs,legal));
    const championMove=legal[frozen.decide(obs,legal).indexOf(1)];
    const other=legal.find(m=>m!==championMove&&!m.includes("/"))!;
    for (const [learner,reward] of [[high,1],[low,-1]] as const) {
      const collector=collect(learner), distribution=collector.policy.decide(obs,legal);
      assert.ok(Math.abs(distribution.reduce((a,b)=>a+b,0)-1)<1e-10);
      assert.ok(distribution[legal.indexOf(other)]>0);
      collector.record(obs,other);
      assert.throws(()=>collector.record(obs,other));
      collector.finish(reward);
      assert.throws(()=>collector.finish(reward));
      assert.equal(learner.actor.updates,1);
    }
    assert.deepEqual(frozen.decide(obs,legal),openAnchored(anchor).decide(obs,legal));
    assert.ok(openSelfplay(exportSelfplay(high)).decide(obs,legal)[legal.indexOf(other)]>
      openSelfplay(exportSelfplay(low)).decide(obs,legal)[legal.indexOf(other)]);
    const copy=JSON.parse(JSON.stringify(high));
    for (const next of [high,copy]) {
      const c=collect(next);c.policy.decide(obs,legal);c.record(obs,other);c.finish(1);
    }
    assert.deepEqual(copy,high);
    assert.equal("critic" in exportSelfplay(high),false);
    assert.equal("squaredGradient" in exportSelfplay(high),false);
    const empty=collect(high);empty.finish(-1);
    assert.equal(high.actor.updates,2);
    assert.throws(()=>openSelfplay({...exportSelfplay(high),weights:[NaN]}));
  });
}

const deal:RepartoOnline={versionReparto:"online-1",muestra:"copas-04",mano:0,dador:3,manos:[
  ["oros-05","copas-12","bastos-03"], ["bastos-04","espadas-07","oros-01"],
  ["oros-02","espadas-05","bastos-01"], ["copas-02","espadas-12","oros-06"],
]};
const format="pairs-private-senas";
function projected(seat:Asiento, first:ActionId) {
  const start=iniciarOnline(deal);
  const step=commitTurn(start,0,format,first);
  const obs=observe(step.state,seat,format,[step.turn]);
  return {...obs,legalActions:signalRules.legalActions(obs.legalActions as Move[])};
}
test("la distribución del rival es idéntica ante la seña, otra seña y silencio",()=>{
  const learner=createLearner(initial(format));
  const predict=(first:ActionId)=>{
    const obs=projected(1,first);
    const c=collect(learner);
    assert.ok(obs.legalActions.length>1);
    return c.policy.decide(obs,obs.legalActions);
  };
  assert.deepEqual(predict("cejas/envido"),predict("beso/envido"));
  assert.deepEqual(predict("cejas/envido"),predict("envido"));
  const obs=projected(1,"envido");
  const contaminated={...obs,history:obs.history.map(t=>({...t,signal:"nariz" as const}))};
  const c=collect(learner);
  assert.deepEqual(c.policy.decide(obs,obs.legalActions),c.policy.decide(contaminated,obs.legalActions));
});
test("el aprendizaje explora señas veraces de cartas restantes y respeta la máscara",()=>{
  const state=iniciarOnline(deal);
  const obs=observe(state,0,format,[]);
  const legal=signalRules.legalActions(obs.legalActions as Move[]);
  const c=collect(createLearner(initial(format)));
  const dist=c.policy.decide({...obs,legalActions:legal},legal);
  assert.ok(dist[legal.indexOf("beso/oros-05")]>0);
  assert.equal(dist[legal.indexOf("cejas/oros-05")],0);
  assert.equal(dist[legal.indexOf("beso/copas-12")],0);
  const signed=legal.filter((id,i)=>id.includes("/")&&dist[i]>0);
  assert.ok(signed.length>0);
  const silent=c.policy.decide(obs,obs.legalActions);
  assert.equal(silent.length,obs.legalActions.length);
  assert.ok(Math.abs(silent.reduce((a,b)=>a+b,0)-1)<1e-10);
});
test("la actualización espera el ganador del chico y usa ambas decisiones del equipo",()=>{
  const learner=createLearner(initial(format)), c=collect(learner);
  const seats=new Set<number>();
  const before=exportSelfplay(learner);
  let decisions=0;
  const record=playMatch({format,seed:4622,pair:0,leg:0,policies:s=>s%2===0?c.policy:incumbent,
    onDecision(d){if (d.seat%2===0) {seats.add(d.seat);decisions++;c.record(d.observation,d.action);}}});
  assert.deepEqual(exportSelfplay(learner),before);
  c.finish(record.winner===0?1:-1);
  assert.equal(seats.size,2);
  assert.ok(decisions>1 && learner.actor.weights.some(w=>w!==0) && learner.critic.some(v=>v!==0));
});
