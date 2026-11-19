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
});
