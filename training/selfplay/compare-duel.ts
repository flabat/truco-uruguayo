import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, realpathSync, statSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {artifactPin} from "../../api/actor-registry.ts";
import {kind} from "../anchored/actor.ts";
import {dealSeed, read} from "../anchored/io.ts";
import {interval, pairOutcomes, save} from "../league/development.ts";
import {selfplayKind} from "./learner.ts";
import {openTrainingTeam, runSlice, withWriter} from "./train.ts";

const armNames = ["baseline", "odds"] as const;
type Arm = typeof armNames[number];
const sampler = "paired-regression-v1";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));

interface Options {
  from: string;
  run: string;
  secondsPerArm: number;
  pairs: number;
  seed?: string;
  resume?: boolean;
}

// Follow the local ES module imports of this entry point. Ignore unrelated
// website files and installed tools when checking a run opened in the same code.
function runtimeFingerprint() {
  const digest = createHash("sha256");
  const pending = new Set([fileURLToPath(import.meta.url)]);
  for (const file of pending) {
    const source = readFileSync(file, "utf8");
    digest.update(JSON.stringify([relative(sourceRoot, file), hash(source)]));
    for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)["'](\.\.?\/[^"']+\.ts)["']/g))
      pending.add(resolve(dirname(file), match[1]));
  }
  return digest.digest("hex");
}

function frozenInputs(from: string) {
  const protocol = read(join(from, "protocol.json"));
  assert(protocol.schema === "continual-selfplay-league-v1" && protocol.computerOnly === true,
    "Expected a computer-only league pilot");
  const input = "input/duel/";
  const archive = Object.keys(protocol.files).filter(file => /^input\/duel\/archive\/[\w.-]+\.json$/.test(file)).sort();
  const names = [input + "champion-at-start.json", input + "anchor-v1.json", ...archive];
  const files = names.map(name => {
    const bytes = readFileSync(join(from, name));
    const sha256 = hash(bytes);
    assert.equal(sha256, protocol.files[name], "Changed or unregistered frozen input " + name);
    const model = JSON.parse(bytes.toString("utf8"));
    openTrainingTeam(model, "duel");
    return {name, sha256, model};
  });
  const champion = files[0].model;
  assert(champion.kind === selfplayKind || champion.kind === kind, "The control needs a pre-card-odds duel champion");
  return {champion, files};
}

function pinInput(path: string, value: unknown) {
  if (existsSync(path)) assert.deepEqual(read(path), value, "Changed comparison input " + path);
  else save(path, value);
}

export function compareDuel({from, run, secondsPerArm, pairs, seed, resume = false}: Options) {
  assert(Number.isFinite(secondsPerArm) && secondsPerArm > 0, "Seconds per arm must be positive");
  assert(Number.isSafeInteger(pairs) && pairs >= 2, "Use at least two deal pairs");
  assert(seed === undefined || seed.length > 0, "Provide a nonempty seed");
  from = realpathSync(from);
  run = resolve(run);
  let ancestor = run;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  run = resolve(realpathSync(ancestor), relative(ancestor, run));
  assert(run !== from && !run.startsWith(from + sep), "Choose an output outside the source pilot");
  const {champion, files} = frozenInputs(from);
  if (!resume) {
    mkdirSync(dirname(run), {recursive: true});
    mkdirSync(run);
  }
  else assert(existsSync(join(run, "plan.json")), "No registered comparison to resume");

  return withWriter(run, () => {
    const planPath = join(run, "plan.json");
    const existing = resume ? read(planPath) : null;
    const masterSeed = seed ?? existing?.seed ?? randomBytes(24).toString("hex");
    const trainingSeed = dealSeed(masterSeed, "residual-selfplay-training", "duel", "a");
    const evaluationSeed = dealSeed(masterSeed, "held-out-duel-card-odds-comparison");
    assert.notEqual(trainingSeed, evaluationSeed, "Use another master seed");
    const sourceChampionPin = artifactPin(champion);
    const plan = {schema: "duel-card-odds-comparison-v1", from, sourceChampionPin, sampler, secondsPerArm, pairs,
      seed: masterSeed, trainingSeed, evaluationSeed, runtime: runtimeFingerprint(), node: process.version,
      files: Object.fromEntries(files.map(f => [f.name, f.sha256]))};
    pinInput(planPath, plan);
    const reportPath = join(run, "comparison.json");
    for (const arm of armNames) {
      const dir = join(run, arm);
      for (const file of files) pinInput(join(dir, file.name), file.model);
      pinInput(join(dir, "input/duel/starter.json"), champion);
      pinInput(join(dir, "duel/champion.json"), champion);
      pinInput(join(dir, "protocol.json"), {seed: masterSeed, sampler, duelCardOdds: arm === "odds"});
    }
    if (existsSync(reportPath)) {
      const report = read(reportPath);
      assert(report.schema === plan.schema && report.sourceChampionPin === sourceChampionPin &&
        report.trainingSeed === trainingSeed && report.evaluationSeed === evaluationSeed &&
        report.pairs === pairs && report.secondsPerArm === secondsPerArm, "Changed comparison report");
      for (const arm of armNames) {
        const model = read(join(run, arm, "duel/a/candidate.json"));
        assert.equal(artifactPin(model), report.arms[arm].pin, "Changed completed model " + arm);
      }
      return report;
    }

    const trained = (arm: Arm) => {
      const dir = join(run, arm);
      const state = runSlice(dir, "duel", "a", {seconds: secondsPerArm, epoch: 1});
      const model = join(arm, "duel/a/candidate.json");
      return {trainingSeconds: state.totalTrainingSeconds, games: state.games, weights: state.learner.actor.weights.length,
        bytes: statSync(join(run, model)).size, pin: artifactPin(state.learner.actor), model};
    };
    console.log("Training the baseline duel model…");
    const baseline = trained("baseline");
    console.log("Training the card-odds duel model…");
    const odds = trained("odds");
    console.log("Evaluating the frozen models on " + pairs + " fresh, seat-swapped deal pairs per matchup…");
    const control = openTrainingTeam(read(join(run, baseline.model)), "duel");
    const challenger = openTrainingTeam(read(join(run, odds.model)), "duel");
    const reference = openTrainingTeam(champion, "duel");
    function match(a: typeof control, b: typeof control) {
      return pairOutcomes("duel", seat => a[seat], seat => b[seat], pairs, evaluationSeed).results;
    }
    const direct = match(challenger, control);
    const baselineVsChampion = match(control, reference);
    const oddsVsChampion = match(challenger, reference);
    const report = {schema: plan.schema, secondsPerArm, pairs, trainingSeed, evaluationSeed, sourceChampionPin,
      arms: {baseline, odds}, headToHead: interval(direct), againstChampion: {
        baseline: interval(baselineVsChampion), odds: interval(oddsVsChampion),
        delta: interval(oddsVsChampion.map((w, i) => w - baselineVsChampion[i]))},
      dealPairWinRates: {oddsVsBaseline: direct, baselineVsChampion, oddsVsChampion}};
    save(reportPath, report);
    return report;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {from: {type: "string"}, run: {type: "string"}, seed: {type: "string"},
    "seconds-per-arm": {type: "string", default: "10800"}, pairs: {type: "string", default: "256"},
    resume: {type: "boolean"}, help: {type: "boolean", short: "h"}}});
  const usage = "node training/selfplay/compare-duel.ts --from PILOT --run NEW_DIR [--seconds-per-arm 10800] [--pairs 256] [--seed TEXT] [--resume]";
  if (values.help) console.log(usage);
  else {
    if (!values.from || !values.run) throw new Error(usage);
    const result = compareDuel({from: values.from, run: values.run, secondsPerArm: Number(values["seconds-per-arm"]),
      pairs: Number(values.pairs), seed: values.seed, resume: values.resume});
    const pct = (n: number) => (100 * n).toFixed(1);
    const h = result.headToHead;
    console.log("Card odds vs equally trained baseline won " + pct(h.mean) + "% (paired 95% bootstrap interval " +
      pct(h.lower) + "% to " + pct(h.upper) + "%).");
    console.log("Full comparison saved to " + resolve(values.run, "comparison.json"));
  }
}
