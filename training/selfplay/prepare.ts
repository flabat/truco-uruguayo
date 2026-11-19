import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {dealSeed} from "../anchored/io.ts";
import {summarize} from "../eval/statistics.ts";
import {qualifies, qualificationFamilies} from "./evaluate.ts";
import {activeFormats, teamSignalsVersion} from "../contracts/index.ts";
import {initial} from "../anchored/actor.ts";
import {artifactPin, openActor} from "../../api/actor-registry.ts";

type Profile = "standard" | "pilot" | "extended";
export function prepare(root: string, previous: string, seed = randomBytes(24).toString("hex"), profile:Profile="standard") {
  assert(["standard","pilot","extended"].includes(profile),"Unknown league profile");
  const paired = profile!=="standard";
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
  const source = read(join(previous,"protocol.json"));
  const continuing = source.schema === "continual-selfplay-league-v1";
  const parentModels: Record<string,{candidate:string; reference:string; improved:boolean}> = {};
  if (paired) assert(continuing,"The paired league needs a completed parent league");
  if (continuing) {
    assert.equal(source.computerOnly,true);
    assert.equal(source.signals,teamSignalsVersion);
    assert.notEqual(source.seed,seed,"A subsequent league must use fresh deals");
  }
  for (const format of activeFormats) {
    if (continuing) {
      const input = join("input",format), assessment = join(previous,format);
      function registered(path: string) {
        const bytes = readFileSync(join(previous,path));
        assert.equal(createHash("sha256").update(bytes).digest("hex"),source.files[path],"Changed parent input " + path);
        return JSON.parse(bytes.toString("utf8"));
      }
      const final = read(join(assessment,"eval-final.json"));
      const challenger = read(join(assessment,"final-candidate.json"));
      const counter = read(join(assessment,"assessments","final","counter.json"));
      const incumbent = registered(join(input,"champion-at-start.json"));
      assert.equal(final.epoch,"final"); assert.equal(final.format,format);
      for (const [pin,model] of [[final.pin,challenger],[final.counter,counter],[final.reference,incumbent]]) {
        openActor(model,format,0);
        assert.equal(artifactPin(model),pin,"Changed final model");
      }
      assert.equal(final.evaluation.pairs,source.finalPairs);
      assert.equal(final.evaluation.resamples,source.finalResamples);
      const rows = final.evaluation.families;
      assert.deepEqual(rows.map((f:{id:string})=>f.id),qualificationFamilies(format));
      assert.equal(final.games,4*source.finalPairs*rows.length);
      const seed = dealSeed(source.seed,format,"gate","final");
      const evidence = rows.map(({id}:{id:string},i:number) => {
        const record = read(join(assessment,"assessments","final","family-"+i+".json"));
        assert(record.id===id && record.seed===seed && record.pin===final.pin && record.refPin===final.reference);
        return {id,pairs:record.rows};
      });
      const verified = summarize(evidence,"champion",source.finalResamples);
      assert.deepEqual(verified,final.evaluation,"Final result differs from its deal outcomes");
      assert.equal(final.improved,qualifies(verified,source.directLowerBound,source.familyDeltaLowerBound));
      const winner = final.improved ? challenger : incumbent;
      parentModels[format] = {candidate:final.pin,reference:final.reference,improved:final.improved};
      store(join(input,"anchor-v1.json"),registered(join(input,"anchor-v1.json")));
      // A research finalist can be used for optimization without being named the
      // champion. Context routers keep their residual expert as trainable weights.
      const researchStarter = paired ? challenger : winner;
      const starter = researchStarter.kind==="team-context-mixture-v1" ? researchStarter.finalist : researchStarter;
      openActor(starter,format,0);
      store(join(input,"starter.json"),starter);
      store(join(input,"champion-at-start.json"),winner);
      store(join(format,"champion.json"),winner,false);
      // Keep the original field and the immediately preceding league. Replacing
      // these three guests bounds archive size across arbitrarily many nights.
      for (const name of ["previous-anchored","older-candidate",...(format==="pairs-private-senas"?["signal-specialist"]:[])]) {
        const path = join(input,"archive",name+".json");
        store(path,registered(path));
      }
      for (const [name,model] of [["last-incumbent",incumbent],["last-finalist",challenger],["last-counter",counter]] as const)
        store(join(input,"archive",name+".json"),model);
      const guests = ["independent",...(format!=="duel"?["unfamiliar"]:[]),...(format==="pairs-private-senas"?["unfamiliar-signaler"]:[])];
      for (const guest of guests) {
        const path = join("evaluation-input",format,guest+".json");
        store(path,registered(path));
      }
      continue;
    }
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
    ...(continuing ? {parent:{protocolSha256:createHash("sha256").update(readFileSync(join(previous,"protocol.json"))).digest("hex"),models:parentModels}} : {}),
    selection:"Compare frozen candidate checkpoints on a separate screening pool. Rank mean win rate across the reference, caller, strong-cards, frequent-bluff and folder. Gates use independent paired deals per epoch. Final confirms one finalist vs the immutable starting research champion.",
    ...(paired ? {
      profile, sampler:"paired-regression-v1", epochs:profile==="pilot"?3:18, trainingHours:profile==="pilot"?1:6,
      maxWallHours:profile==="pilot"?2:8, epochPairs:256, finalPairs:4096,
      screeningPairs:128,finalScreeningPairs:768,
      screen:"Paired development games against the starting/current reference, scripted styles, and a training archive opponent. Prefer direct rate >=55%, minimize observed regression beyond 1pp, then maximize total wins.",
      externalTeamCandidate:profile==="pilot",
      extendIf:"Both partnership finalists win directly with simultaneous lower bounds >50%, neither loses over 2 points against its prior finalist in the strong-cards matchup and at least one gains >=1 point on those same fresh deals. Confirmed champions are retained per format."
    } : {}),
    deployment:"Local research only; no automatic activation."
  };
  store("protocol.json",protocol,false);
  return protocol;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,previous,seed,profile]=process.argv.slice(2);
  if (!root || !previous) throw new Error("prepare.ts NEW_RUN PREVIOUS_CYCLE [SEED] [standard|pilot|extended]");
  prepare(resolve(root),resolve(previous),seed,profile as Profile|undefined);
}
