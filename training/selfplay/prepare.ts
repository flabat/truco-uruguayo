import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {activeFormats, teamSignalsVersion} from "../contracts/index.ts";
import {initial} from "../anchored/actor.ts";
import {artifactPin, openActor} from "../../api/actor-registry.ts";

export function prepare(root: string, previous: string, seed = randomBytes(24).toString("hex")) {
  const field = join(previous, "field"), files: Record<string,string> = {};
  if (existsSync(join(root, "protocol.json"))) throw new Error("Run already prepared");
  function store(path: string, value: unknown, tracked=true) {
    const json = JSON.stringify(value) + "\n";
    const output = join(root, path);
    mkdirSync(dirname(output), {recursive:true});
    if (existsSync(output)) assert.equal(readFileSync(output,"utf8"), json, "Conflicting input " + output);
    else writeFileSync(output, json, {flag:"wx"});
    if (tracked) files[path] = createHash("sha256").update(json).digest("hex");
  }
  const read = (file: string) => JSON.parse(readFileSync(file,"utf8"));
  for (const format of activeFormats) {
    const anchor=initial(format), starter=read(join(previous,format,"candidate.json"));
    assert.equal(starter.format,format);
    assert.equal(artifactPin(starter),read(join(previous,format,"result.json")).pin);
    const start = format === "duel" ? anchor : starter;
    for (const [name, model] of [["anchor-v1",anchor],["starter",starter],["champion-at-start",start]] as const) {
      openActor(model,format,0);
      store(join("input",format,name+".json"), model);
    }
    store(join(format,"champion.json"),start,false);
    const archive = join("input",format,"archive"), evalDir = join("evaluation-input",format);
    store(join(archive,"previous-anchored.json"),starter);
    const old=read(join(field,format,"candidate.json"));
    assert.equal(old.format,format === "pairs-private-senas" ? "pairs" : format);
    store(join(archive,"older-candidate.json"),old);
    const independent=read(join(field,format,"independent.json"));
    assert.equal(independent.format,old.format);
    store(join(evalDir,"independent.json"),independent);
    if (format !== "duel") {
      const unseen=read(join(field,format,"partner.json"));
      assert.equal(unseen.format,old.format);
      assert.notEqual(artifactPin(unseen),artifactPin(old));
      store(join(evalDir,"unfamiliar.json"),unseen);
    }
    if (format === "pairs-private-senas") {
      for (const [name,training] of [["candidate",true],["independent",false]] as const) {
        const saved=read(join(previous,"team-signal-study","frozen-"+name+".json"));
        assert.equal(saved.format,format); assert.equal(saved.signals,teamSignalsVersion);
        const specialist = {...anchor,bands:Array(3).fill(saved.selected.id)};
        openActor(specialist,format,0);
        store(join(training?archive:evalDir,training?"signal-specialist.json":"unfamiliar-signaler.json"),specialist);
      }
    }
  }
  const protocol = {
    schema:"continual-selfplay-league-v1", registeredAt:new Date().toISOString(), seed,
    formats:activeFormats, computerOnly:true, signals:teamSignalsVersion, epochs:18, trainSecondsPerEpoch:1200,
    trainingHours:6, maxWallHours:8, workers:{duel:2,pairs:1,"pairs-private-senas":1},
    screeningPairs:48,epochPairs:128,finalPairs:1024,epochResamples:3000,finalResamples:10000,
    directLowerBound:0.5, familyDeltaLowerBound:-0.02, files,
    selection:"Compare frozen candidate checkpoints on a separate screening pool. Rank mean win rate across the reference, caller, strong-cards and rotating opposition. Gates use independent paired deals per epoch. Final confirms one finalist vs the immutable starting research champion.",
    deployment:"Local research only; no automatic activation."
  };
  store("protocol.json",protocol,false);
  return protocol;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,previous,seed]=process.argv.slice(2);
  if (!root || !previous) throw new Error("prepare.ts NEW_RUN PREVIOUS_CYCLE [SEED]");
  prepare(resolve(root),resolve(previous),seed);
}
