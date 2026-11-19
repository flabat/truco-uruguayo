import assert from "node:assert/strict";
import test from "node:test";
import { artifactPin, createServing } from "../../api/serving.ts";
import { playMatch, playMatchAsync, replayMatch, sample } from "../../training/arena/index.ts";
import { initialize, exportActor } from "../../training/partners/train.ts";
import { newDuel, exportDuel } from "../../training/duel/train.ts";
import { formats, type SeatObservation } from "../../training/contracts/index.ts";
import { incumbent } from "../../training/seat/index.ts";

test("los lectores exportados sirven chicos completos desde la misma vista y simulan fallos con respaldo legal", async () => {
  assert.equal(artifactPin({z:[1],a:2}), artifactPin({a:2,z:[1]}));
  let opening: SeatObservation | undefined;
  for (const format of formats) {
    const actor = format === "duel" ? exportDuel(newDuel({seed:1,iterations:1,buckets:16,expandDepth:1,
      exploration:.1,referenceSteps:1,saveEvery:1})) : exportActor(initialize(format,7,1,.01,1,"cpu"));
    const pin = artifactPin(actor);
    let loaded = 0;
    const serving = createServing({loadArtifact:async () => { loaded++; return actor; },deadlineMs:3000});
    try {
      const game = await playMatchAsync({format,seed:42,pair:1,leg:0, responders: seat => async(obs, uniform) => {
        if (!opening) opening=obs;
        assert.equal(obs.view.asiento,seat);
        const move = await serving.decide(pin, obs, uniform);
        assert.equal(move.fallback,null);
        assert.equal(move.policy,pin);
        return move.action;
      }});
      assert.deepEqual(replayMatch(game,42),game.score);
      assert.equal(loaded,1);
    } finally { await serving.close(); }
    const fixed = {format, seed:43, pair:2, leg:0 as const};
    assert.deepEqual(await playMatchAsync({...fixed, responders: () => (obs, u) =>
      obs.legalActions[sample(incumbent.decide(obs,obs.legalActions),obs.legalActions.length,u)]}),
    playMatch({...fixed,policies:()=>incumbent}));
  }
  assert.ok(opening);
  const invalid = {format:"duel",schema:"bad"};
  for (const [pin,load,deadline,fallback] of [
    ["missing",async()=>null,500,"missing"],
    [artifactPin(invalid),async()=>invalid,3000,"incompatible"],
    ["timeout",()=>new Promise(resolve=>setTimeout(resolve,20)),1,"timeout"],
  ] as const) {
    const service=createServing({loadArtifact:load,deadlineMs:deadline});
    try {
      const result=await service.decide(pin,opening,.5);
      assert.equal(result.fallback,fallback);
      assert.equal(result.policy,incumbent.id);
      assert.ok(opening.legalActions.includes(result.action));
    } finally { await service.close(); }
  }
});
