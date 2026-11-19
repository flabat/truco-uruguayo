import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trainCounter } from "../../training/league/counters.ts";
import { interval, learningCurve, save, sha } from "../../training/league/development.ts";
import { sampleBudget } from "../../training/league/freeze.ts";
import { duelActorId, duelSchema, loadDuelActor } from "../../training/duel/actor.ts";
import { versions } from "../../training/contracts/index.ts";
import { field, trainingSeeds } from "../../training/league/development.ts";

test("la extensión nocturna exige mejora reciente en semillas y repartos comunes",()=>{
  const series=(value:number[])=>{
    const edges=trainingSeeds.flatMap(seed=>field.map(opponent=>({left:String(seed),right:opponent,pairs:value,interval:interval(value)})));
    return {kind:"development-round-robin-v1",format:"duel" as const,stage:"test",seed:42,budget:value.length,
      artifacts:[],edges,actorLatencyMs:{}};
  };
  const start=series([0,0,0,0]), middle=series([.5,.5,.5,.5]), end=series([1,1,1,1]);
  assert.equal(learningCurve(start,middle,end).extendOvernight,true);
  assert.equal(learningCurve(start,end,end).extendOvernight,false);
  assert.throws(()=>learningCurve(start,middle,{...end,seed:99}));
});

test("el presupuesto de campeonato usa varianza pareada y respeta el tiempo declarado",()=>{
  const edges=field.map((right,i)=>({left:"candidate",right,pairs:i?[1,1,0,0]:[0,.5,.5,1],
    interval:interval([0,0,1,1]),pairSeconds:[.2,.2,.2,.2]}));
  edges.push(...field.slice(1).map(right=>({left:field[0],right,pairs:[0,0,1,1],
    interval:interval([0,0,1,1]),pairSeconds:[.2,.2,.2,.2]})));
  const budget=sampleBudget(edges,"candidate",18,9);
  assert.ok(budget.variancePilot>=1);
  assert.equal(budget.pairs,2);
  assert.ok(budget.powered>budget.affordable);
});

test("el contrajugador de duelo aprende de chicos contra un artefacto fijado y puede reanudarse",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"truco-liga-counter-")), actor=join(dir,"candidate.json");
  save(actor,{schema:duelSchema,actor:versions.actor,observation:versions.observation,actions:versions.actions,
    rules:versions.rules,format:"duel",buckets:16,id:duelActorId(16,{}),average:{}});
  const runA=join(dir,"split"),runB=join(dir,"whole");
  await trainCounter("duel",actor,runA,213,"",2);
  const split=await trainCounter("duel",actor,runA,213,"",4);
  const whole=await trainCounter("duel",actor,runB,213,"",4);
  assert.equal(sha(split),sha(whole));assert.ok(loadDuelActor(split).id.startsWith("duel-"));
  await assert.rejects(trainCounter("duel",actor,runA,214,"",8),/linaje/);
  await assert.rejects(trainCounter("duel",actor,runA,213,"",2),/retroceder/);
});

test("el informe de ciclos considera la orientación y las dos mangas de cada cruce", async () => {
  const {cycles} = await import("../../training/league/report.ts");
  const ahead = interval([1,1,1,1]), behind = interval([0,0,0,0]);
  const report = cycles([
    {left:"a",right:"b",pairs:[1,1,1,1],interval:ahead},
    {left:"b",right:"c",pairs:[1,1,1,1],interval:ahead},
    {left:"a",right:"c",pairs:[0,0,0,0],interval:behind},
  ]);
  assert.deepEqual(report,{count:1,examples:[["a","b","c"]],threePairwiseBoundsExcludeHalf:[["a","b","c"]]});
});

test("el contrajugador de parejas conserva la familia efectiva del export en victorias y empates", async () => {
  const { selectResponse, verifyCounterFamily } = await import("../../training/league/counters.ts");
  const { initialize, exportActor } = await import("../../training/partners/train.ts");
  const dir = mkdtempSync(join(tmpdir(),"truco-liga-familia-"));
  const mc = join(dir,"mc-actor.json"), net = join(dir,"actor.json");
  const state = initialize("pairs",81,4,0.04,2,"cpu");
  save(mc,exportActor(state,true)); save(net,exportActor(state));
  for (const [mcWins, netWins, expected] of [[1,0,"pairs-mc-v1"],[0,1,"pairs-recurrent-v1"],[1,1,"pairs-mc-v1"]] as const) {
    const selected = selectResponse("pairs",[{path:mc,outcomes:[mcWins,mcWins]},{path:net,outcomes:[netWins,netWins]}])[0];
    assert.equal(selected.family,expected);
    const receipt = {chosen:selected.sha256,chosenFamily:selected.family,trainingStateSchema:versions.checkpoint};
    const path=join(dir,selected.file);
    assert.equal(verifyCounterFamily("pairs",path,receipt),expected);
    assert.throws(()=>verifyCounterFamily("pairs",path,{...receipt,chosenFamily:"duel-mc"}),/familia/);
    assert.throws(()=>verifyCounterFamily("pairs",path,{...receipt,trainingStateSchema:"duel-mc-counter-v1"}),/familia/);
  }
});

test("los huecos de un checkpoint recuperado no inflan las decisiones por segundo", async () => {
  const { timedProgress } = await import("../../training/league/evidence.ts");
  const report=timedProgress([
    {before:0,completed:4,seconds:2,trainDecisions:40},
    {before:8,completed:12,seconds:3,trainDecisions:120},
    {before:12,completed:16,seconds:2,trainDecisions:172},
  ],0,0);
  assert.deepEqual(report,{measuredSeconds:7,measuredUnits:12,measuredDecisions:92,decisionSeconds:4});
});

test("el monitor recupera un scheduler adjunto que desaparece y conserva el plazo", async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync("python3",["-B","tests/fixtures/league-monitor.py"]);
});
