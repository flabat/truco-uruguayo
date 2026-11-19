import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runTeamPilot} from "../../training/selfplay/team-pilot.ts";
import {artifactPin,openActor} from "../../api/actor-registry.ts";
import {playMatch} from "../../training/arena/index.ts";
import {initial} from "../../training/anchored/actor.ts";
import {observe} from "../../training/seat/index.ts";
import {iniciarOnline} from "../../src/motor/mesa-online.ts";
import {commitTurn} from "../../training/signals/index.ts";
import type {RepartoOnline} from "../../src/motor/reparto.ts";
import type {PublicTurn} from "../../training/contracts/index.ts";
import {createLearner,openSelfplay} from "../../training/selfplay/learner.ts";
import {initialTeamMixture,openTeamMixture,teamContext,teamContexts} from "../../training/selfplay/team-mixture.ts";

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

test("la cubierta del tercer asiento cuenta cartas desconocidas y protege al compañero",()=>{
  const format="pairs";
  const deal:RepartoOnline={versionReparto:"online-1",muestra:"copas-04",mano:0,dador:3,manos:[
    ["oros-05","copas-12","bastos-03"],["bastos-04","espadas-07","oros-01"],
    ["oros-02","espadas-05","bastos-01"],["copas-02","espadas-12","oros-06"]]};
  const history:PublicTurn[]=[];
  let state=iniciarOnline(deal);
  for(const [seat,action] of [[0,"envido"],[1,"quiero"],[2,"paso-flor"],[3,"paso-flor"],
    [0,"oros-05"],[1,"bastos-04"]] as const) {
    const step=commitTurn(state,seat,format,action);state=step.state;history.push(step.turn);
  }
  const obs=observe(state,2,format,history), base=initial(format);
  const model=initialTeamMixture(createLearner(base).actor,base);
  model.routes[teamContext(obs)]="team";
  const dist=openTeamMixture(model).decide(obs,obs.legalActions);
  assert.equal(obs.legalActions[dist.indexOf(1)],"bastos-01");
});

test("el piloto congela su actor antes de auditar y rechaza cambiar las semillas al reanudar",()=>{
  const format="pairs", root=mkdtempSync(join(tmpdir(),"team-router-"));
  try {
    const area=join(root,"research"), previous=join(root,"prior"), output=join(root,"output");
    mkdirSync(join(previous,"input",format),{recursive:true});mkdirSync(join(previous,format));
    mkdirSync(area);
    const anchor=initial(format), finalist=createLearner(anchor).actor;
    const store=(path:string,data:unknown)=>{
      const buffer=JSON.stringify(data);writeFileSync(path,buffer);return createHash("sha256").update(buffer).digest("hex");
    };
    const ids={anchor:store(join(previous,"input",format,"champion-at-start.json"),anchor),
      finalist:store(join(previous,format,"final-candidate.json"),finalist)};
    const protocol={formatVersion:"senas-equipo-v1",trainOnly:true,inputs:{[format]:ids},seeds:{[format]:{fit:43,select:44,audit:45}},
      pairs:{fit:2,select:2,audit:2},trainingFixtures:["champion","strong-cards","V1","caller","strong-cards/V1-teammate"],
      auditExtras:["finalist","champion/V1-teammate"]};
    const file=join(area,"protocol.json");store(file,protocol);
    const result=runTeamPilot(format,previous,area,output);
    const exported=JSON.parse(readFileSync(join(output,format,"team.json"),"utf8"));
    assert.equal(artifactPin(exported),result.pin);assert.equal(result.fixtures.length,7);
    assert.deepEqual(runTeamPilot(format,previous,area,output),result);
    protocol.seeds[format].audit=47;store(file,protocol);
    assert.throws(()=>runTeamPilot(format,previous,area,output),/Run inputs changed/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
