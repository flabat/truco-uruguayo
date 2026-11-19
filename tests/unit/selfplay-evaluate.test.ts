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
