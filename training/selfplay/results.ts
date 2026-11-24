import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {artifactPin, openActor} from "../../api/actor-registry.ts";
import type {CycleFormat} from "../anchored/actor.ts";
import {dealSeed, read} from "../anchored/io.ts";
import {activeFormats, teamSignalsVersion} from "../contracts/index.ts";
import {summarize, type PairOutcome} from "../eval/statistics.ts";
import {qualifies, qualificationFamilies} from "./evaluate.ts";

export type LeagueProfile = "standard" | "pilot" | "local-pilot" | "extended";

export function leagueBudget(profile: LeagueProfile) {
  assert(["standard","pilot","local-pilot","extended"].includes(profile), "Unknown league profile");
  const paired = profile !== "standard";
  const short = profile === "pilot" || profile === "local-pilot";
  return {
    epochs: short ? 3 : 18, trainSecondsPerEpoch: 1200, trainingHours: short ? 1 : 6,
    maxWallHours: short ? 2 : 8, screeningPairs: paired ? 128 : 48, epochPairs: paired ? 256 : 128,
    finalPairs: paired ? 4096 : 1024, epochResamples: 3000, finalResamples: 10000,
    ...(paired ? {finalScreeningPairs:768} : {}),
  };
}

const sha256 = (bytes:Buffer) => createHash("sha256").update(bytes).digest("hex");

export function readFrozenInput(root:string, pins:Record<string,string>, relative:string) {
  const bytes = readFileSync(join(root, relative));
  assert.equal(sha256(bytes), pins[relative], "Changed frozen input " + relative);
  return JSON.parse(bytes.toString("utf8"));
}

interface EvidenceProtocol {
  seed:string; finalPairs:number; finalResamples:number; familyError?:number;
  directLowerBound:number; familyDeltaLowerBound:number;
}

export function verifyFinal(assessment:string, format:CycleFormat, source:EvidenceProtocol, incumbent:unknown) {
  const final = read(join(assessment, "eval-final.json"));
  const challenger = read(join(assessment, "final-candidate.json"));
  const counter = read(join(assessment, "assessments", "final", "counter.json"));
  assert.equal(final.epoch, "final");
  assert.equal(final.format, format);
  for (const [pin, model] of [[final.pin,challenger], [final.counter,counter], [final.reference,incumbent]]) {
    openActor(model, format, 0);
    assert.equal(artifactPin(model), pin, "Changed final model");
  }
  assert.equal(final.evaluation.pairs, source.finalPairs);
  assert.equal(final.evaluation.resamples, source.finalResamples);
  const field = qualificationFamilies(format);
  assert.deepEqual(final.evaluation.families.map((f:{id:string})=>f.id), field);
  assert.equal(final.games, 4 * source.finalPairs * field.length);
  const seed = dealSeed(source.seed, format, "gate", "final");
  const evidence = field.map((id,i) => {
    const record = read(join(assessment, "assessments", "final", "family-"+i+".json"));
    assert(record.id===id && record.seed===seed && record.pin===final.pin && record.refPin===final.reference,
      "Held-out deals do not match " + format + "/" + id);
    return {id,pairs:record.rows};
  });
  const evaluation = summarize(evidence, "champion", source.finalResamples, source.familyError??0.05);
  assert.deepEqual(evaluation, final.evaluation, "Final result differs from its deal outcomes");
  assert.equal(final.improved, qualifies(evaluation, source.directLowerBound, source.familyDeltaLowerBound));
  return {final,challenger,counter,evaluation};
}

export function validateCompletedLeague(root:string, protocol:ReturnType<typeof read>, nextProfile?:LeagueProfile) {
  assert.equal(protocol.schema, "continual-selfplay-league-v1", "Expected a completed self-play league");
  assert.equal(protocol.computerOnly, true);
  assert.equal(protocol.signals, teamSignalsVersion);
  assert.deepEqual(protocol.formats, activeFormats);
  assert(typeof protocol.seed === "string" && protocol.seed.length > 0, "Missing league seed");
  assert.equal(protocol.directLowerBound, 0.5, "Changed direct-win threshold");
  assert.equal(protocol.familyDeltaLowerBound, -0.02, "Changed opponent-family threshold");
  assert(protocol.familyError === undefined || protocol.familyError === 0.05, "Expected simultaneous 95% intervals");
  const profile = protocol.profile === undefined ? "standard" : protocol.profile;
  const expected = leagueBudget(profile);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(protocol[key], value, "Unexpected " + key + " for " + profile);
  }
  assert.deepEqual(protocol.workers, {duel:2,pairs:1,"pairs-private-senas":1});
  if (profile === "standard") {
    assert.equal(protocol.sampler, undefined);
    assert.equal(protocol.externalTeamCandidate, undefined);
  } else {
    assert.equal(protocol.sampler, "paired-regression-v1");
    assert.equal(protocol.externalTeamCandidate, profile === "pilot");
  }

  const summaryFile = join(root, "ops", "summary.json");
  assert(existsSync(summaryFile), "Final results require a completed run (missing ops/summary.json)");
  const summary = read(summaryFile);
  assert.equal(summary.state, "complete", "Final results require a completed run");
  assert.equal(summary.completedEpochs, expected.epochs, "Unfinished training epochs");
  for (const [relative, pin] of Object.entries(protocol.files)) {
    assert(/^(input|evaluation-input)\/[a-z0-9/-]+\.json$/.test(relative), "Unexpected frozen input path");
    assert.equal(sha256(readFileSync(join(root,relative))), pin, "Changed frozen input " + relative);
  }
  for (const lane of ["duel-a", "duel-b", "pairs", "pairs-private-senas"]) {
    const seconds = summary.resources?.[lane]?.trainingSeconds;
    assert(Number.isFinite(seconds) && seconds >= expected.trainSecondsPerEpoch * expected.epochs - 0.01,
      "Unfinished training for " + lane);
  }
  const finals = [];
  for (const format of activeFormats) {
    const file = join(format, "eval-final.json");
    const receipt = summary.evaluations?.[format];
    assert(receipt?.file === file && receipt.format === format && receipt.epoch === "final",
      "Missing final receipt for " + format);
    const bytes = readFileSync(join(root,file));
    assert.equal(sha256(bytes), receipt.sha256, "Changed final receipt for " + format);
    const final = JSON.parse(bytes.toString("utf8"));
    assert(receipt.pin === final.pin && receipt.games === final.games && receipt.improved === final.improved,
      "Final receipt disagrees with the supervisor for " + format);
    finals.push(final);
  }
  if (nextProfile === "extended" && protocol.profile === "local-pilot") {
    assert(pilotExtension(root,protocol,finals)?.allowed,
      "Pilot falls short of the preregistered extension criteria. Start another short pilot.");
  }
}

// Apply only to a standalone pilot. Historical pilots could have a separate
// candidate confirmation and playoff, outside the primary league's receipts.
export function pilotExtension(root:string, protocol:ReturnType<typeof read>, finals:ReturnType<typeof read>[]) {
  if (protocol.profile !== "local-pilot") return null;
  const partnerships = (["pairs", "pairs-private-senas"] as const).map(format => {
    const final = finals.find(row => row.format === format);
    assert(final, "Missing verified final for " + format);
    const prior = readFrozenInput(root,protocol.files,join("input",format,"archive","last-finalist.json"));
    const priorPin = artifactPin(prior);
    const index = qualificationFamilies(format).indexOf("strong-cards");
    const family = read(join(root,format,"assessments","final","family-"+index+".json"));
    assert(family.id === "strong-cards" && family.pin === final.pin && family.refPin === final.reference
      && family.seed === dealSeed(protocol.seed,format,"gate","final"), "Different strong-cards assessment");
    assert(final.previousFinalist === priorPin && family.priorPin === priorPin, "Changed preceding finalist");
    const pairs:PairOutcome[] = family.rows;
    assert(Array.isArray(family.priorWins) && family.priorWins.length === pairs.length
      && pairs.length === protocol.finalPairs, "Missing preceding finalist outcomes");
    let netWins = 0;
    for (const [i, row] of pairs.entries()) {
      const priorLegs = family.priorWins[i];
      assert(Array.isArray(priorLegs) && priorLegs.length === 2 && priorLegs.every(x => x === 0 || x === 1),
        "Invalid preceding finalist outcomes");
      if (priorPin === final.pin) assert.deepEqual(priorLegs, row.candidate);
      if (priorPin === final.reference) assert.deepEqual(priorLegs, row.incumbent);
      netWins += row.candidate[0] + row.candidate[1] - priorLegs[0] - priorLegs[1];
    }
    const change = netWins / (2*pairs.length);
    assert.equal(change, final.versusPrevious?.["strong-cards"]?.estimate, "Changed strong-cards comparison");
    return {format, directLower:final.evaluation.direct.lower as number, change};
  });
  const allowed = partnerships.every(team => team.directLower > 0.5 && team.change >= -0.02)
    && partnerships.some(team => team.change >= 0.01);
  return {allowed, partnerships};
}

export function readLeagueResults(root:string) {
  const protocol = read(join(root, "protocol.json"));
  validateCompletedLeague(root, protocol);
  const finals = [];
  const results = activeFormats.map(format => {
    const incumbentPath = join("input", format, "champion-at-start.json");
    const incumbent = readFrozenInput(root, protocol.files, incumbentPath);
    const {final,evaluation} = verifyFinal(join(root,format), format, protocol, incumbent);
    finals.push(final);
    const worst = evaluation.families.reduce((a,b) => b.delta.lower < a.delta.lower ? b : a);
    return {format, improved:final.improved as boolean, direct:evaluation.direct, worst, games:final.games as number,
      artifact:resolve(root, final.improved ? join(format,"final-candidate.json") : incumbentPath)};
  });
  return {results, extension:pilotExtension(root, protocol, finals), profile:protocol.profile};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, "Usage: node training/selfplay/results.ts RUN");
    const {results,extension,profile} = readLeagueResults(resolve(process.argv[2]));
    const percent = (fraction:number) => (100*fraction).toFixed(2) + "%";
    if (profile === "pilot") console.log("Primary pilot results. Supplemental confirmations and playoffs have separate reports.");
    for (const {format,improved,direct,worst,games,artifact} of results) {
      console.log(`${format} — ${improved ? "challenger qualified" : "starting champion retained"}`);
      console.log(`  Challenger vs starting champion: ${percent(direct.estimate)} (simultaneous 95% CI ${percent(direct.lower)} to ${percent(direct.upper)})`);
      console.log(`  Worst family by lower bound: ${worst.id} (${(100*worst.delta.lower).toFixed(2)} percentage points). ${games} final games.`);
      console.log("  Research champion: " + artifact);
    }
    if (extension) {
      console.log(extension.allowed ? "Pilot qualifies for an extended run." : "Pilot falls short of extension criteria. Another short pilot is available.");
      for (const team of extension.partnerships) {
        console.log(`  ${team.format}: direct lower bound ${percent(team.directLower)}, change vs previous finalist against strong-cards ${(100*team.change).toFixed(2)} percentage points.`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
