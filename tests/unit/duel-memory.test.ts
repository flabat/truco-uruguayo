import assert from "node:assert/strict";
import test from "node:test";
import {countPublicHand} from "../../training/contracts/duel-memory.ts";

test("duel memory attributes openings and responses to the acting seat",()=>{
  const counts=[Array(12).fill(0),Array(12).fill(0)];
  countPublicHand(counts,[{asiento:1,tipo:"envido"},{asiento:0,tipo:"falta-envido"},{asiento:1,tipo:"no-quiero"}]);
  countPublicHand(counts,[{asiento:0,tipo:"truco"},{asiento:1,tipo:"quiero"}]);
  assert.deepEqual(counts,[[1,0,1,0,0,0,0,0,0,0,0,0],[1,1,0,0,0,1,1,0,1,0,1,0]]);
});
