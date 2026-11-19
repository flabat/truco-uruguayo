import assert from "node:assert/strict";
import {join, resolve} from "node:path";

import {playMatch, replayMatch} from "../arena/index.ts";
import {incumbent} from "../seat/index.ts";
import {artifactPin, openActor} from "../../api/actor-registry.ts";
import {cycleFormats, initial, type CycleFormat} from "./actor.ts";
import {dealSeed, read, runIO} from "./io.ts";

const [rootArg, formatArg, phase] = process.argv.slice(2);
const format = formatArg as CycleFormat;
assert(rootArg && cycleFormats.includes(format) && ["parity", "fit"].includes(phase));
const root = resolve(rootArg), log = runIO(root, format);
const protocol = read(join(root, "protocol.json"));
try {
  if (phase === "parity") {
    const actor = initial(format), model = openActor(actor, format, 0);
    const seed = dealSeed(protocol.seed, "parity", format);
    let wins = 0, decisions = 0, sample = "";
    log.event("parity", "Testing the unadjusted V1 anchor on mirrored deals.", {opponent:incumbent.id});
    for (let pair = 0; pair < protocol.parityPairs; pair++) {
      for (const leg of [0, 1] as const) {
        const game = playMatch({format, seed, pair, leg, policies: s => s % 2 === leg ? model : incumbent,
          onDecision: ({seat, action, observation}) => {
            if (seat % 2 !== leg) return;
            decisions++;
            const base = incumbent.decide(observation, observation.legalActions);
            assert.equal(action, observation.legalActions[base.indexOf(1)], "Anchor action differs from V1");
            sample = "Seat " + (seat + 1) + " played " + action;
          }});
        if (pair === 0) replayMatch(game, seed);
        wins += Number(game.winner === leg);
      }
      if ((pair + 1) % 64 === 0) log.event("parity", "Checking every candidate action against V1.", {
        completed: (pair + 1)*2, total:protocol.parityPairs*2, unit:"chicos",
        opponent:incumbent.id, partner:format === "duel" ? undefined : "same anchor", wins, games:(pair+1)*2, action:sample
      });
    }
    assert.equal(wins, protocol.parityPairs, "Paired halves must split evenly");
    log.write("anchor", actor);
    log.write("parity", {format, passed:true, games:protocol.parityPairs*2, wins, decisions, mismatchedActions:0,
      kind:"exact V1 initialization", pin:artifactPin(actor), seed});
    log.event("parity", "V1 parity verified on all observed actions and paired outcomes.", {status:"passed",
      wins, games:protocol.parityPairs*2, completed:protocol.parityPairs*2, total:protocol.parityPairs*2, unit:"chicos", metrics:{decisions}});
  } else {
    for (const lane of cycleFormats) assert.equal(read(join(root, lane, "parity.json")).passed, true);
    const {fit} = await import("./fit.ts");
    await fit(root, format, log, protocol);
  }
} catch (error) {
  log.event(phase, String(error), {status:"failed"});
  throw error;
}
