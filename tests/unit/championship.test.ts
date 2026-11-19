import assert from "node:assert/strict";
import test from "node:test";
import { summarize } from "../../training/eval/statistics.ts";
import { decision } from "../../training/championship/event.ts";
import { families } from "../../training/championship/field.ts";

test("el campeonato mantiene los umbrales directos, familiares y operativos", () => {
  const arm = (wins: [number,number],old:[number,number]) => Array.from({length:32},(_,pair)=>({pair,candidate:wins,incumbent:old}));
  const score = (direct:[number,number], challenge:[number,number]) => summarize([
    {id:"v1",pairs:arm(direct,[0,1])},{id:"counter",pairs:arm(challenge,[1,1])}],"v1",1000);
  assert.equal(decision(score([1,1],[1,1]),0,.005),"pass");
  assert.equal(decision(score([1,1],[1,1]),.006,.005),"failed");
  assert.equal(decision(score([1,1],[0,0]),0,.005),"failed");
  assert.equal(decision(score([0,0],[1,1]),0,.005),"failed");
  const uncertain=arm([1,0],[1,0]);
  uncertain.forEach((p,i)=>p.candidate=[i%2,i%2]);
  assert.equal(decision(summarize([{id:"v1",pairs:uncertain}],"v1",1000),0,.005),"inconclusive");
});

test("se pesa igual a los adversarios, con ambos tipos de compañero en parejas", () => {
  for(const format of ["duel","pairs","pairs-senas"] as const) {
    const entries=families({format} as Parameters<typeof families>[0]);
    assert.equal(new Set(entries.map(f=>f.id)).size,entries.length);
    assert.ok(entries.some(f=>f.opponent==="counter"));
    assert.ok(entries.some(f=>f.opponent==="independent"));
    for(const opponent of new Set(entries.map(f=>f.opponent))) {
      assert.deepEqual(entries.filter(f=>f.opponent===opponent).map(f=>f.lineup),format==="duel"?["fixed"]:["fixed","unseen"]);
    }
  }
});
