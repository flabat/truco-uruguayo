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
const arms = ["full", "summary"] as const;
const coreComparisons = [
  ["full", "ceibo"], ["summary", "ceibo"], ["full", "summary"],
  ...holdouts.flatMap(opponent => arms.map(arm => [arm, opponent] as const)),
] as const;

type Format = keyof typeof pins;
type Match = readonly [string, string, "shared-partner"?];
function matchups(format: Format): Match[] {
  return format === "duel" ? [...coreComparisons] : [...coreComparisons,
    ["full","ceibo","shared-partner"], ["summary","ceibo","shared-partner"], ["full","summary","shared-partner"]];
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
}
function prepare(): Plan {
  const format = args.format ?? "duel";
  requireTrainingFormat(format);
  if (!args.ceibo) throw new Error("The first invocation requires --ceibo FILE.");
  const artifact = JSON.parse(readFileSync(args.ceibo, "utf8"));
  const pin = artifactPin(artifact);
  if (pin !== pins[format]) throw new Error("The file must match the published Ceibo fingerprint for " + format);
  const seed = integer(args.seed, 27201, 0, 0xffffffff);
  const plan = {schema:"ceibo-history-v1", source, format, pin, seed,
    trainingSeed:seedFor(seed,"train"), evaluationSeed:seedFor(seed,"evaluate"),
    warmup:integer(args.warmup, 16, 0, 10000), rounds:integer(args.rounds, 128, 1, 10000),
    batch:integer(args.batch, 4, 1, 16), pairs:integer(args.pairs, 256, 2, 8192), comparisons:matchups(format)};
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
if (plan.source !== source) throw new Error("Resume with the same Node version and source files that prepared this run.");
const comparisons = matchups(plan.format);
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

async function evaluate(checkpoint: string) {
  type LegWins = [number, number];
  interface Ledger {checkpoint: string; results: LegWins[][]}
  const ledger: Ledger = existsSync(path("evaluation.json")) ? read("evaluation.json") : {checkpoint, results:[]};
  if (ledger.checkpoint !== checkpoint || ledger.results.length > plan.pairs) throw new Error("Invalid evaluation checkpoint.");
  function setup([left,right,lineup]: Match, pair: number, leg: 0|1) {
    return playMatchAsync({format:plan.format, seed:plan.evaluationSeed, pair, leg, responders: seat => {
      const fighter = lineup && seat>=2 ? "rare-bluff" : teamOf(seat) === leg ? left : right;
      if (fighter === "full" || fighter === "summary") return async (obs, random) => {
        const probabilities = await learners.predict(fighter,encode(obs,fighter==="full"));
        return obs.legalActions[choose(probabilities,obs,random)];
      };
      const policy = fighter === "ceibo" ? ceibo[seat] : opponents[fighter];
      return (obs, random) => obs.legalActions[choose(policy.decide(obs,obs.legalActions),obs,random)];
    }}).then(game => Number(game.winner===leg));
  }
  for (let start=ledger.results.length; start<plan.pairs; start+=plan.batch) {
    const pairs = Array.from({length:Math.min(plan.batch,plan.pairs-start)}, (_,i) => start+i);
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
  const confirmed = results[0].lower>0.5 && results[2].lower>0.5;
  write("result.json", {format:plan.format, pin:plan.pin, seed:plan.seed, checkpoint,
    warmup:plan.warmup, rounds:plan.rounds, pairs:plan.pairs, confidence:"95% simultaneous paired Hoeffding",
    verdict:confirmed ? "full beats both" : "full did not establish superiority to both", results});
  console.table(results);
}

try {
  const total = plan.warmup + plan.rounds;
  const initial = await learners.command<{completed:number; torch:string; parameters:number}>({
    kind:"init", seed:seedFor(plan.seed,"initialization"), checkpoint:path("checkpoint.pt"), sizes, plan:artifactPin(plan),
  });
  const model = {torch:initial.torch, parameters:initial.parameters};
  if (existsSync(path("model.json")) && artifactPin(read("model.json")) !== artifactPin(model)) {
    throw new Error("Resume with the same PyTorch version.");
  }
  write("model.json", model);
  for (let round=initial.completed; round<stopAfter; round++) {
    const warmup = round < plan.warmup;
    const examples = warmup ? teaching(round) : await selfPlayRound(round);
    const metrics = await learners.command({kind:"learn", round, warmup, examples});
    write("progress.json", {completed:round+1,total,warmup,metrics});
    console.log(`Entrenamiento ${round+1}/${total}`, JSON.stringify(metrics));
  }
  if (Math.max(initial.completed, stopAfter) === total) {
    const checkpoint = createHash("sha256").update(readFileSync(path("checkpoint.pt"))).digest("hex");
    await evaluate(checkpoint);
  }
} finally {
  learners.close();
}
