import test from "node:test";
import assert from "node:assert/strict";
import {openActor} from "../../api/actor-registry.ts";
import {playMatch} from "../../training/arena/index.ts";
import {initial} from "../../training/anchored/actor.ts";
import {incumbent} from "../../training/seat/index.ts";
import {createLearner,openSelfplay} from "../../training/selfplay/learner.ts";
import {initialTeamMixture,openTeamMixture,teamContexts} from "../../training/selfplay/team-mixture.ts";

for(const format of ["pairs","pairs-private-senas"] as const) {
  test(format+" admite el router en el servicio y reproduce la política final inicial",()=>{
    const anchor=initial(format), finalist=createLearner(anchor).actor;
    finalist.updates=15; finalist.weights[1]=0.4;
    const old=openSelfplay(finalist), model=initialTeamMixture(finalist,anchor);
    const restored=openActor(JSON.parse(JSON.stringify(model)),format,0);
    const tactical=structuredClone(model);
    for(const k of teamContexts)tactical.routes[k]="team";
    const alternative=openActor(tactical,format,2);
    let decisions=0;
    playMatch({format,seed:376301,pair:3,leg:1,policies:()=>alternative,onDecision(d){
      assert.deepEqual(restored.decide(d.observation,d.observation.legalActions),old.decide(d.observation,d.observation.legalActions));
      assert.ok(d.observation.legalActions.includes(d.action));
      assert.ok(d.observation.history.every(t=>!t.signal || t.action.asiento%2===d.seat%2));
      const hidden={...d.observation,history:d.observation.history.map(t=>
        t.action.asiento%2!==d.seat%2?{...t,signal:"nariz" as const}:t)};
      assert.deepEqual(alternative.decide(d.observation,d.observation.legalActions),alternative.decide(hidden,d.observation.legalActions));
      decisions++;
    }});
    assert.ok(decisions>1);
    const wrong={...model,routes:{...model.routes,opening:"unknown"}};
    assert.throws(()=>openTeamMixture(wrong as typeof model));
    assert.throws(()=>openActor(model,"duel",0));
  });
}
test("la misma identidad de rival nunca entra al selector ni aparece en la exportación",()=>{
  const a=initial("pairs");const model=initialTeamMixture(createLearner(a).actor,a);
  const p=openTeamMixture(model);
  const changed={...model,routes:{...model.routes}};
  changed.routes.opening="anchor";const q=openTeamMixture(changed);
  const game=playMatch({format:"pairs",seed:118121,pair:0,leg:0,policies:(s)=>s%2===0?p:q});
  assert.ok(game.score.includes(40));
  assert.equal(Object.hasOwn(model,"opponents"),false);
  assert.equal(incumbent.id,"incumbent-online-v1");
});
