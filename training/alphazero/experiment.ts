import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import { playMatch } from "../arena/index.ts";
import type { Policy } from "../contracts/index.ts";
import { summarize, type PairOutcome } from "../eval/statistics.ts";
import { fitContinuation, type Continuation } from "../search/continuation.ts";
import { evaluator, learn, networkShape, newNetwork, type Example, type Network } from "./model.ts";
import { metalWorker } from "./metal.ts";
import { search, type SearchStats } from "./search.ts";

const {positionals, values} = parseArgs({allowPositionals:true,options:{
  ceibo:{type:"string"}, seed:{type:"string"}, epochs:{type:"string"},
  "train-pairs":{type:"string"}, "eval-pairs":{type:"string"}, simulations:{type:"string"},
  device:{type:"string"}, "primary-only":{type:"boolean"}, "budget-seconds":{type:"string"}, "reserve-seconds":{type:"string"},
}});
const [directory] = positionals;
if (positionals.length!==1) throw new Error("Use run.py RUN [--ceibo FILE].");
const file = (name: string) => join(directory,`${name}.json`);
function read<T>(name: string): T {return JSON.parse(readFileSync(file(name),"utf8"));}
function write(name: string, data: unknown) {
  writeFileSync(file(name)+".tmp",JSON.stringify(data)+"\n");
  renameSync(file(name)+".tmp",file(name));
}
const pin = "d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3";
const arms = ["learned-search","learned-policy","initial-search"] as const;
const legs = [0,1] as const;
type Arm = typeof arms[number];
type Wins = [number, number];
interface Plan {
  schema: string; source: string; pin: string; seed: number; epochs: number;
  simulations: number; trainPairs: number; evalPairs: number; continuationGames: number;
  device: "cpu"|"mps"; primaryOnly: boolean;
  budget: {startedAt:number; trainUntil:number; endAt:number} | null;
}
interface Checkpoint {plan: string; completed: number; net: Network; examples: number}
interface Evaluation {policy: string; results: Record<Arm,Wins[]>; stats: Record<Arm,SearchStats>}
function integer(value: string | undefined, fallback: number, min: number, max: number) {
  const n = value===undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n<min || n>max) throw new Error(`Expected an integer in [${min}, ${max}].`);
  return n;
}
function sourcePin() {
  const root = new URL("../../",import.meta.url);
  const files = ["api/actor-registry.ts"];
  for (const dir of ["src/motor","training"]) {
    const names = readdirSync(new URL(dir+"/",root),{recursive:true,encoding:"utf8"});
    files.push(...names.filter(name => (name.endsWith(".ts") || (dir==="training" && name==="alphazero/metal.py")) && !name.split("/").some(part=>part.startsWith("."))).map(
      name=>dir+"/"+name));
  }
  const hash = createHash("sha256").update(process.version);
  for (const name of files.sort()) hash.update(name).update(readFileSync(new URL(name,root)));
  return hash.digest("hex");
}
const source = sourcePin();
function prepare(): Plan {
  if (!values.ceibo) throw new Error("Supply the published duel actor via --ceibo FILE.");
  const ceibo = JSON.parse(readFileSync(values.ceibo,"utf8"));
  if (artifactPin(ceibo)!==pin) throw new Error("The file is not the published Ceibo Duelo actor.");
  const device = values.device ?? "cpu";
  if (device !== "cpu" && device !== "mps") throw new Error("Use --device cpu or --device mps.");
  const budgetSeconds = integer(values["budget-seconds"],0,0,86400);
  const reserveSeconds = integer(values["reserve-seconds"],Math.floor(budgetSeconds/4),0,86400);
  if (reserveSeconds>=budgetSeconds && reserveSeconds!==0 || budgetSeconds && reserveSeconds<1) {
    throw new Error("Reserve part of the time budget for evaluation.");
  }
  const startedAt = Date.now();
  const budget = budgetSeconds ? {startedAt,trainUntil:startedAt+(budgetSeconds-reserveSeconds)*1000,
    endAt:startedAt+budgetSeconds*1000} : null;
  const plan: Plan = {schema:"truco-alphazero-duel-v2",source,pin,seed:integer(values.seed,27601,0,0xffffffff),
    epochs:integer(values.epochs,12,1,1000),trainPairs:integer(values["train-pairs"],4,1,64),
    evalPairs:integer(values["eval-pairs"],128,2,4096),simulations:integer(values.simulations,16,2,512),
    continuationGames:512,device,budget,primaryOnly:values["primary-only"] ?? false};
  write("ceibo",ceibo);
  write("plan",plan);
  return plan;
}

const existing = existsSync(file("plan"));
if (existing && Object.keys(values).length) throw new Error("The plan is frozen. Resume with the run directory alone.");
const plan = existing ? read<Plan>("plan") : prepare();
if (plan.source!==source || plan.pin!==pin || plan.schema!=="truco-alphazero-duel-v2") throw new Error("Resume in the original checkout and Node version.");
const ceibo = read("ceibo");
if (artifactPin(ceibo)!==pin) throw new Error("Frozen Ceibo does not match.");
const planHash = artifactPin(plan);
const seed = (domain: string) => createHash("sha256").update(`${plan.seed}:${domain}`).digest().readUInt32BE();
const frozen = [openActor(ceibo,"duel",0),openActor(ceibo,"duel",1)];
const field = (seat: Asiento) => frozen[seat];
const table = existsSync(file("continuation")) ? read<Continuation>("continuation")
  : fitContinuation("duel",field,seed("continuation"),plan.continuationGames);
if (!existsSync(file("continuation"))) write("continuation",table);
const initial = newNetwork(seed("init"));
const checkpoint = existsSync(file("checkpoint")) ? read<Checkpoint>("checkpoint")
  : {plan:planHash,completed:0,net:structuredClone(initial),examples:0};
if (checkpoint.plan!==planHash || checkpoint.completed>plan.epochs) throw new Error("Checkpoint does not match.");
const progress = (phase: string, completed: number, total: number) =>
  write("progress",{phase,completed,total,device:plan.device,budget:plan.budget});
const past = (deadline: number | undefined) => deadline!==undefined && Date.now()>=deadline;

async function run(metal: ReturnType<typeof metalWorker> | null) {
  if (metal && !existsSync(file("train-frozen"))) {
    const backend = await metal.check();
    if (existsSync(file("backend")) && artifactPin(read("backend"))!==artifactPin(backend)) {
      throw new Error("The Metal backend changed since the previous checkpoint.");
    }
    write("backend",backend);
    console.log("Aprendiz",JSON.stringify(backend));
  }

  if (!existsSync(file("train-frozen"))) {
    progress("training",checkpoint.completed,plan.epochs);
    training:
    for (let epoch=checkpoint.completed; epoch<plan.epochs; epoch++) {
      const started = performance.now();
      const decide = search(checkpoint.net,{field,table,simulations:plan.simulations,seed:seed("selfplay-"+epoch)});
      const examples: Example[] = [];
      for (let index=0; index<plan.trainPairs; index++) for (const leg of legs) {
        if (past(plan.budget?.trainUntil)) break training;
        const turns: {seat:Asiento; example:ReturnType<typeof decide>}[] = [];
        const actor: Policy = {id:"selfplay-search",decide(obs) {
          const example = decide(obs,true);
          turns.push({seat:obs.view.asiento,example});
          return example.probabilities;
        }};
        const match = playMatch({format:"duel",seed:seed("training"),pair:epoch*plan.trainPairs+index,leg,policies:()=>actor});
        for (const {seat,example} of turns) examples.push({position:example.position,visits:example.visits,outcome:seat===match.winner?1:-1});
      }
      // Freeze the weights while generating the epoch, then optimize on the selected device.
      const now = performance.now();
      let trainingMetrics: object;
      if (metal) {
        const {net,...metrics} = await metal.update(checkpoint.net,networkShape,examples);
        checkpoint.net = net;
        trainingMetrics = metrics;
      } else {
        const metrics = [];
        for (let i=0; i<examples.length; i+=64) {
          const batch = examples.slice(i,i+64);
          metrics.push(learn(checkpoint.net,batch,.08/batch.length));
        }
        const mean = (key:"policyLoss"|"valueLoss") => metrics.reduce((total,row)=>total+row[key],0)/metrics.length;
        trainingMetrics = {policyLoss:mean("policyLoss"),valueLoss:mean("valueLoss"),updateSeconds:(performance.now()-now)/1000};
      }
      checkpoint.completed = epoch+1;
      checkpoint.examples += examples.length;
      write("checkpoint",checkpoint);
      progress("training",checkpoint.completed,plan.epochs);
      console.log(`Época ${checkpoint.completed}/${plan.epochs} · ${examples.length} posiciones ·`,
        JSON.stringify({...trainingMetrics,seconds:(performance.now()-started)/1000}));
    }
    if (!checkpoint.completed) {
      progress("budget-exhausted-before-training",0,plan.epochs);
      process.exitCode = 75;
      return;
    }
    write("train-frozen",{epoch:checkpoint.completed,time:Date.now(),checkpoint:artifactPin(checkpoint)});
  }
  if (read<{checkpoint:string}>("train-frozen").checkpoint!==artifactPin(checkpoint)) throw new Error("Frozen checkpoint does not match.");
  const artifact = {schema:"truco-alphazero-policy-v1",plan:planHash,ceibo:pin,net:checkpoint.net,continuation:table};
  const policy = artifactPin(artifact);
  write("policy",artifact);
  const blank = () => ({decisions:0,fallbacks:0,milliseconds:0});
  const evalLog: Evaluation = existsSync(file("evaluation")) ? read("evaluation") : {
    policy,results:{"learned-search":[],"learned-policy":[],"initial-search":[]},
    stats:{"learned-search":blank(),"learned-policy":blank(),"initial-search":blank()},
  };
  const activeArms = plan.primaryOnly ? arms.slice(0,1) : arms;
  const count = evalLog.results["learned-search"].length;
  if (evalLog.policy!==policy || count>plan.evalPairs || activeArms.some(arm=>evalLog.results[arm].length!==count)) throw new Error("Invalid evaluation checkpoint.");
  const config = {field,table,simulations:plan.simulations,seed:seed("search-evaluation")};
  const learnedSearch = search(checkpoint.net,config,evalLog.stats["learned-search"]);
  const initialSearch = search(initial,config,evalLog.stats["initial-search"]);
  const learned = legs.map(seat=>evaluator(checkpoint.net,field(seat)));
  const candidates: Record<Arm,Policy> = {
    "learned-search":{id:"learned-search",decide:obs=>learnedSearch(obs).probabilities},
    "initial-search":{id:"initial-search",decide:obs=>initialSearch(obs).probabilities},
    "learned-policy":{id:"learned-policy",decide:obs=>learned[obs.view.asiento](obs).probabilities},
  };
  progress("evaluation",count,plan.evalPairs);
  for (let pair=count; pair<plan.evalPairs; pair++) {
    if (past(plan.budget?.endAt)) {
      progress("budget-exhausted-in-evaluation",pair,plan.evalPairs);
      console.error(`Tiempo agotado con ${pair}/${plan.evalPairs} pares. Se conservan las partidas confirmadas.`);
      process.exitCode = 75;
      return;
    }
    for (const arm of activeArms) {
      const wins = legs.map(leg => Number(playMatch({format:"duel",seed:seed("holdout"),pair,leg,
        policies:seat=>seat===leg?candidates[arm]:field(seat)}).winner===leg)) as Wins;
      evalLog.results[arm].push(wins);
    }
    write("evaluation",evalLog);
    progress("evaluation",pair+1,plan.evalPairs);
    if ((pair+1)%8===0 || pair+1===plan.evalPairs) console.log(`Evaluación ${pair+1}/${plan.evalPairs} pares`);
  }
  const results = activeArms.map(arm => {
    const pairs: PairOutcome[] = evalLog.results[arm].map((candidate,pair)=>({pair,candidate,
      incumbent:[1-candidate[0],1-candidate[1]]}));
    const {direct} = summarize([{id:arm,pairs}],arm,10000,.10);
    const wins = pairs.reduce((total,pair)=>total+pair.candidate[0]+pair.candidate[1],0);
    return {arm,wins,games:2*plan.evalPairs,...direct,search:evalLog.stats[arm]};
  });
  const primary = results[0];
  write("result",{format:"duel",plan:planHash,policy,ceibo:pin,device:plan.device,epochs:checkpoint.completed,examples:checkpoint.examples,
    simulations:plan.simulations,trainGames:2*plan.trainPairs*checkpoint.completed,pairedDeals:plan.evalPairs,
    durationSeconds:plan.budget ? (Date.now()-plan.budget.startedAt)/1000 : null,
    verdict:primary.lower>.5 ? "beats Ceibo" : primary.upper<.5 ? "loses to Ceibo" : "inconclusive against Ceibo",results});
  progress("finished",plan.evalPairs,plan.evalPairs);
  console.table(results.map(({search,...result})=>result));
}
const metal = plan.device==="mps" && !existsSync(file("train-frozen"))
  ? metalWorker(process.env.TRUCO_PYTHON ?? fileURLToPath(new URL("../partners/python/.venv/bin/python",import.meta.url)))
  : null;
try {
  await run(metal);
} finally {
  metal?.close();
}
