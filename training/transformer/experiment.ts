import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import { playMatch, playMatchAsync, sample } from "../arena/index.ts";
import { baseline } from "../baselines/index.ts";
import { requireTrainingFormat, type Policy, type SeatObservation } from "../contracts/index.ts";
import { Worker, type Arm } from "./bridge.ts";
import { encode, sizes, type Encoded } from "./features.ts";

const {positionals, values: args} = parseArgs({allowPositionals:true, options:{
  ceibo:{type:"string"}, format:{type:"string"}, seed:{type:"string"}, rounds:{type:"string"},
  warmup:{type:"string"}, batch:{type:"string"}, pairs:{type:"string"}, stopAfter:{type:"string"},
  size:{type:"string"}, device:{type:"string"}, arms:{type:"string"}, microbatch:{type:"string"},
  "checkpoint-every":{type:"string"}, "eval-batch":{type:"string"}, "small-reference":{type:"string"},
}});
const [directory, python] = positionals;
if (positionals.length !== 2) throw new Error("Use run.py RUN [--ceibo FILE].");
const path = (file: string) => join(directory, file);
const read = (file: string) => JSON.parse(readFileSync(path(file), "utf8"));
function write(file: string, value: unknown) {
  writeFileSync(path(file + ".tmp"), JSON.stringify(value, null, 2) + "\n");
  renameSync(path(file + ".tmp"), path(file));
}
function integer(value: string | undefined, fallback: number, low: number, high: number) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < low || n > high) throw new Error(`Expected an integer in [${low}, ${high}]`);
  return n;
}
const pins = {
  duel:"d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3",
  pairs:"6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2",
  "pairs-private-senas":"d2b2293d4d8c9ee4f067ee74c1d6d5983eb5c8ad3a4ebce57bbdb561f946b78b",
};
function runtime() {
  const root = new URL("../../", import.meta.url);
  const hash = createHash("sha256").update(process.version);
  const files = ["api/actor-registry.ts"];
  for (const dir of ["src/motor", "training"]) {
    for (const file of readdirSync(new URL(dir + "/", root), {recursive:true, encoding:"utf8"}).filter(name => /\.(ts|py)$/.test(name) && !name.split("/").some(part => part.startsWith(".")))) {
      files.push(dir + "/" + file);
    }
  }
  for (const file of files.sort()) hash.update(file).update(readFileSync(new URL(file, root)));
  return hash.digest("hex");
}
function seedFor(seed: number, purpose: string) {
  return createHash("sha256").update(seed + ":" + purpose).digest().readUInt32BE();
}
const source = runtime();
const holdouts = ["folder", "rare-bluff"] as const;
const sizesByName = ["small", "medium", "large"] as const;
const devices = ["cpu", "mps"] as const;

type Format = keyof typeof pins;
type Size = typeof sizesByName[number];
type Device = typeof devices[number];
type Match = readonly [string, string, "shared-partner"?];
interface Reference {
  plan: string;
  sha256: string;
  completed: number;
  trainingSeed: number;
  legacy: boolean;
}
function fingerprint(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
function option<T extends string>(name: string, value: string, choices: readonly T[]): T {
  const choice = choices.find(item => item === value);
  if (!choice) throw new Error(`Invalid ${name}. Choose ${choices.join(", ")}.`);
  return choice;
}
function matchups(format: Format, arms: readonly Arm[], reference: Reference | null): Match[] {
  const challengers = [...arms, ...(reference ? ["small"] : [])];
  const headToHead: Match[] = arms.length === 2 ? [["full", "summary"]] : [];
  if (reference) headToHead.push(...arms.map(arm => [arm, "small"] as const));
  const main: Match[] = [...challengers.map(arm => [arm, "ceibo"] as const), ...headToHead,
    ...holdouts.flatMap(opponent => challengers.map(arm => [arm, opponent] as const))];
  if (format !== "duel") {
    main.push(...main.filter(([,opponent]) => !holdouts.some(holdout => holdout === opponent)).map(
      ([left,right]) => [left,right,"shared-partner"] as const));
  }
  return main;
}
function freezeReference(directory: string, format: Format): Reference {
  const plan = JSON.parse(readFileSync(join(directory, "plan.json"), "utf8"));
  const result = JSON.parse(readFileSync(join(directory, "result.json"), "utf8"));
  const legacy = plan.schema === "ceibo-history-v1";
  if (!(legacy || (plan.schema === "ceibo-history-v2" && plan.size === "small")) ||
      plan.format !== format || result.format !== format || result.pin !== pins[format]) {
    throw new Error("Use a completed small Transformer run in the selected format.");
  }
  const checkpoint = readFileSync(join(directory, "checkpoint.pt"));
  const sha256 = fingerprint(checkpoint);
  if (result.checkpoint !== sha256 || result.warmup !== plan.warmup || result.rounds !== plan.rounds) {
    throw new Error("The small reference checkpoint does not match its evaluation.");
  }
  writeFileSync(path("small-reference.pt"), checkpoint);
  return {plan:artifactPin(plan), sha256, completed:plan.warmup+plan.rounds, trainingSeed:plan.trainingSeed, legacy};
}
interface Plan {
  schema: string;
  source: string;
  format: Format;
  pin: string;
  seed: number;
  trainingSeed: number;
  evaluationSeed: number;
  warmup: number;
  rounds: number;
  batch: number;
  pairs: number;
  comparisons: Match[];
  size: Size;
  device: Device;
  arms: Arm[];
  microbatch: number;
  evalBatch: number;
  checkpointEvery: number;
  reference: Reference | null;
}
function prepare(): Plan {
  const format = args.format ?? "duel";
  requireTrainingFormat(format);
  if (!args.ceibo) throw new Error("The first invocation requires --ceibo FILE.");
  const artifact = JSON.parse(readFileSync(args.ceibo, "utf8"));
  const pin = artifactPin(artifact);
  if (pin !== pins[format]) throw new Error("The file must match the published Ceibo fingerprint for " + format);
  const size = option("size", args.size ?? "small", sizesByName);
  const device = option("device", args.device ?? (size === "small" ? "cpu" : "mps"), devices);
  const armMode = option("arms", args.arms ?? (size === "small" ? "both" : "full"), ["full", "both"] as const);
  const arms: Arm[] = armMode === "both" ? ["full", "summary"] : ["full"];
  const seed = integer(args.seed, 27401, 0, 0xffffffff);
  const trainingSeed = seedFor(seed,"gpu-v2:train"), evaluationSeed = seedFor(seed,"gpu-v2:evaluate");
  const reference = args["small-reference"] ? freezeReference(args["small-reference"], format) : null;
  if (trainingSeed === evaluationSeed || reference?.trainingSeed === evaluationSeed) {
    throw new Error("The evaluation seed overlaps a training seed. Choose another --seed.");
  }
  const plan = {schema:"ceibo-history-v2", source, format, pin, seed, trainingSeed, evaluationSeed,
    size, device, arms, reference, comparisons: matchups(format, arms, reference),
    warmup:integer(args.warmup, size === "small" ? 16 : 512, 0, 10000),
    rounds:integer(args.rounds, size === "small" ? 128 : 512, 1, 10000),
    batch:integer(args.batch, size === "small" ? 4 : 16, 1, 64),
    pairs:integer(args.pairs, size === "small" ? 256 : 512, 2, 8192),
    evalBatch:integer(args["eval-batch"], 4, 1, 16),
    microbatch:integer(args.microbatch, size === "large" ? 32 : size === "medium" ? 64 : 128, 1, 256),
    checkpointEvery:integer(args["checkpoint-every"], size === "small" ? 1 : 8, 1, 128)};
  write("ceibo.json", artifact);
  write("plan.json", plan);
  return plan;
}

mkdirSync(directory, {recursive:true});
const saved = existsSync(path("plan.json"));
if (saved && Object.keys(args).some(key => key !== "stopAfter")) {
  throw new Error("This plan is frozen. Resume with the run directory and optional --stopAfter.");
}
const plan: Plan = saved ? read("plan.json") : prepare();
requireTrainingFormat(plan.format);
const stopAfter = integer(args.stopAfter, plan.warmup + plan.rounds, 0, plan.warmup + plan.rounds);
if (plan.schema !== "ceibo-history-v2" || plan.source !== source) {
  throw new Error("Resume with the same Node version and source checkout that prepared this run.");
}
const {arms} = plan;
const reference = plan.reference && {...plan.reference, path:path("small-reference.pt")};
if (reference && fingerprint(readFileSync(reference.path)) !== reference.sha256) throw new Error("Frozen small reference does not match the plan.");
const comparisons = matchups(plan.format, arms, reference);

if (artifactPin(plan.comparisons) !== artifactPin(comparisons)) throw new Error("Evaluation matchups differ from the plan.");
const artifact = read("ceibo.json");
if (artifactPin(artifact) !== plan.pin || plan.pin !== pins[plan.format]) throw new Error("Frozen Ceibo does not match the plan.");
const ceibo = [0,1,2,3].slice(0,plan.format === "duel" ? 2 : 4).map(seat =>
  openActor(artifact, plan.format, seat as 0|1|2|3));
const learners = new Worker(python);
function choose(probabilities: readonly number[], obs: SeatObservation, uniform: number) {
  const sum = probabilities.reduce((a,b) => a + b, 0);
  return sample(probabilities.map(p => p / sum), obs.legalActions.length, uniform);
}
const legs = [0, 1] as const;
type Example = { row: Encoded; choice: number; reward: number; teacher?: readonly number[] };
const teamOf = (seat: number) => seat % 2;
const opponents: Record<string,Policy> = Object.fromEntries(
  ["caller", "strong-cards", ...holdouts].map(id => [id,baseline(id)]),
);
const trainingOpponents = ["ceibo", "caller", "strong-cards", "self"];

function teaching(round: number) {
  const examples: Record<Arm, Example[]> = { full:[], summary:[] };
  for (let i=0; i<plan.batch; i++) {
    const pair = round*plan.batch + i;
    const foe = trainingOpponents[pair % trainingOpponents.length];
    for (const leg of legs) {
      const turns: {seat: number; row: SeatObservation; teacher: readonly number[]; choice: number}[] = [];
      const game = playMatch({format:plan.format, seed:plan.trainingSeed, pair, leg,
        policies: seat => seat%2 === leg || !opponents[foe] ? ceibo[seat] : opponents[foe],
        onDecision({seat, observation, probabilities, action}) {
          if (seat%2 === leg) turns.push({seat, row:observation, teacher:probabilities, choice:observation.legalActions.indexOf(action)});
        },
      });
      for (const turn of turns) {
        for (const arm of arms) examples[arm].push({row:encode(turn.row,arm==="full"), choice:turn.choice,
          reward:teamOf(turn.seat)===game.winner ? 1 : -1, teacher:turn.teacher});
      }
    }
  }
  return examples;
}

async function selfPlayRound(round: number) {
  const examples: Record<Arm, Example[]> = {full:[], summary:[]};
  const jobs = arms.flatMap(arm => Array.from({length:plan.batch}, (_,i) => {
    const pair = round*plan.batch+i;
    const foe = trainingOpponents[pair % trainingOpponents.length];
    return legs.map(async leg => {
      const turns: Example[] = [];
      const game = await playMatchAsync({format:plan.format, seed:plan.trainingSeed, pair, leg, responders: seat => {
        if (teamOf(seat) !== leg && foe !== "self") {
          const policy = opponents[foe] ?? ceibo[seat];
          return (obs, random) => obs.legalActions[choose(policy.decide(obs,obs.legalActions),obs,random)];
        }
        return async (obs, random) => {
          const row = encode(obs,arm==="full");
          const probabilities = await learners.predict(arm,row);
          const choice = choose(probabilities,obs,random);
          turns.push({row, choice, reward:teamOf(seat)});
          return obs.legalActions[choice];
        };
      }});
      return {arm, turns:turns.map(turn => ({...turn, reward:turn.reward===game.winner ? 1 : -1}))};
    });
  }).flat());
  for (const {arm, turns} of await Promise.all(jobs)) examples[arm].push(...turns);
  return examples;
}

async function evaluate(checkpoint: string, policies: Record<string,string>) {
  type LegWins = [number, number];
  interface Ledger {checkpoint: string; results: LegWins[][]}
  const ledger: Ledger = existsSync(path("evaluation.json")) ? read("evaluation.json") : {checkpoint, results:[]};
  if (ledger.checkpoint !== checkpoint || ledger.results.length > plan.pairs) throw new Error("Invalid evaluation checkpoint.");
  function setup([left,right,lineup]: Match, pair: number, leg: 0|1) {
    return playMatchAsync({format:plan.format, seed:plan.evaluationSeed, pair, leg, responders: seat => {
      const fighter = lineup && seat>=2 ? "rare-bluff" : teamOf(seat) === leg ? left : right;
      if (fighter === "full" || fighter === "summary" || fighter === "small") return async (obs, random) => {
        const probabilities = await learners.predict(fighter,encode(obs,fighter!=="summary"));
        return obs.legalActions[choose(probabilities,obs,random)];
      };
      const policy = fighter === "ceibo" ? ceibo[seat] : opponents[fighter];
      return (obs, random) => obs.legalActions[choose(policy.decide(obs,obs.legalActions),obs,random)];
    }}).then(game => Number(game.winner===leg));
  }
  for (let start=ledger.results.length; start<plan.pairs; start+=plan.evalBatch) {
    const pairs = Array.from({length:Math.min(plan.evalBatch,plan.pairs-start)}, (_,i) => start+i);
    const outcomes = await Promise.all(pairs.map(pair => Promise.all(comparisons.map(match =>
      Promise.all(legs.map(leg => setup(match,pair,leg))) as Promise<LegWins>))));
    ledger.results.push(...outcomes);
    write("evaluation.json", ledger);
    console.log(`Evaluación ${ledger.results.length}/${plan.pairs} repartos pareados`);
  }
  // The two legs share deals. Treat their mean as one bounded observation.
  // Correct for all reported comparisons, including the field of holdout opponents.
  const radius = Math.sqrt(Math.log(2 * comparisons.length / 0.05) / (2 * plan.pairs));
  const results = comparisons.map(([left,right,lineup],i) => {
    const wins = ledger.results.reduce((total,pair) => total + pair[i][0] + pair[i][1], 0);
    const rate = wins / (2*plan.pairs);
    return {left,right,lineup:lineup??"whole-team",wins,games:2*plan.pairs,rate,lower:Math.max(0,rate-radius),upper:Math.min(1,rate+radius)};
  });
  const benchmark = ["ceibo", ...(arms.includes("summary") ? ["summary"] : []), ...(reference ? ["small"] : [])];
  const confirmed = benchmark.every(right => results.some(result =>
    result.left === "full" && result.right === right && result.lineup === "whole-team" && result.lower > 0.5));
  write("result.json", {format:plan.format, pin:plan.pin, seed:plan.seed, checkpoint,
    size:plan.size, device:plan.device, reference:plan.reference?.sha256 ?? null, benchmark, policies,
    warmup:plan.warmup, rounds:plan.rounds, pairs:plan.pairs, confidence:"95% simultaneous paired Hoeffding",
    verdict:confirmed ? "full beats all primary benchmarks" : "full did not establish superiority to all primary benchmarks", results});
  console.table(results);
}

try {
  const total = plan.warmup + plan.rounds;
  const {completed, ...model} = await learners.command<{
    completed:number; torch:string; parameters:number; device:Device; architecture:number[];
  }>({kind:"init", seed:seedFor(plan.seed,"initialization"), checkpoint:path("checkpoint.pt"), sizes, plan:artifactPin(plan),
    device:plan.device, size:plan.size, arms, microbatch:plan.microbatch, reference});
  if (existsSync(path("model.json")) && artifactPin(read("model.json")) !== artifactPin(model)) {
    throw new Error("Resume with the same PyTorch version.");
  }
  write("model.json", model);
  let checkpointRound = completed;
  write("progress.json", {completed,total,checkpointRound});
  console.log(`Dispositivo ${model.device}, ${model.parameters} parámetros por modelo. Checkpoint ${completed}/${total}.`);
  for (let round=completed; round<stopAfter; round++) {
    const start = performance.now();
    const warmup = round < plan.warmup;
    const examples = warmup ? teaching(round) : await selfPlayRound(round);
    const save = (round+1)%plan.checkpointEvery === 0 || round+1 === stopAfter;
    const metrics = await learners.command({kind:"learn", round, warmup, examples, save});
    if (save) checkpointRound = round+1;
    const seconds = (performance.now() - start)/1000;
    const gamesPerSecond = 2 * plan.batch * (warmup ? 1 : arms.length) / seconds;
    const progress = {completed:round+1,total,checkpointRound,warmup,seconds,gamesPerSecond,metrics};
    write("progress.json", progress);
    console.log(`Entrenamiento ${round+1}/${total}`, JSON.stringify(progress));
  }
  if (Math.max(completed, stopAfter) === total) {
    const checkpoint = fingerprint(readFileSync(path("checkpoint.pt")));
    const exported = await learners.command<Arm[]>({kind:"export"});
    const policies = Object.fromEntries(exported.map(arm => {
      const file = `policy-${arm}.pt`;
      return [file,fingerprint(readFileSync(path(file)))];
    }));
    await evaluate(checkpoint, policies);
  }
} finally {
  learners.close();
}
