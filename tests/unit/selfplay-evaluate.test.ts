import assert from "node:assert/strict";
import test from "node:test";
import { qualifies } from "../../training/selfplay/evaluate.ts";
import { summarize, type PairOutcome } from "../../training/eval/statistics.ts";

test("la promoción requiere ganar el duelo directo y proteger cada familia", () => {
  const compare = (direct: [number,number], opponent: [number,number]) => {
    const rows = (candidate: [number,number]): PairOutcome[] =>
      [0,1,2,3].map(pair => ({pair,candidate,incumbent:[1,0]}));
    return qualifies(summarize([
      {id:"champion",pairs:rows(direct)},
      {id:"unfamiliar-teammate",pairs:rows(opponent)}
    ],"champion",1000),0.5,-0.02);
  };
  assert.equal(compare([1,1],[1,0]),true);
  assert.equal(compare([1,0],[1,1]),false);
  assert.equal(compare([1,1],[0,0]),false);
});

test("la confirmación adicional puede exigir intervalos simultáneos más conservadores", () => {
  const pairs = Array.from({length:48},(_,pair):PairOutcome=>({pair,candidate:[Number(pair%3>0),Number(pair%5>1)],incumbent:[1,0]}));
  const field = [{id:"champion",pairs}];
  const usual = summarize(field,"champion",2000), strict = summarize(field,"champion",2000,0.01);
  assert.equal(usual.direct.estimate,strict.direct.estimate);
  assert(strict.direct.lower<=usual.direct.lower && strict.direct.upper>=usual.direct.upper);
  assert.throws(()=>summarize(field,"champion",2000,0));
});

test("el desempate conserva las parejas de repartos y solo adopta ante una ventaja suficiente", async () => {
  const {playoffResult}=await import("../../training/selfplay/playoff.ts");
  const plan={schema:"qualified-playoff-v1",seed:"0123456789abcdef",pairs:1000,maxFormats:3,familyError:0.01};
  const draws=Array(1000).fill(1);
  assert.equal(playoffResult(plan,draws).preferSupplement,false);
  assert.equal(playoffResult(plan,Array(1000).fill(2)).preferSupplement,true);
  assert.throws(()=>playoffResult(plan,[1,2]));
});
