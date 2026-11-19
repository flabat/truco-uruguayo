import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { versions } from "../contracts/index.ts";
import { crossplay } from "./crossplay.ts";
import { digest, type Partnership } from "./policy.ts";
import { exportActor, initialize, optimizer, trainingBatch, update, type Checkpoint } from "./train.ts";
import { compareEndgame } from "./oracle.ts";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
function save(file: string, data: unknown) {
  const temp = file + "." + randomUUID() + ".tmp";
  writeFileSync(temp, JSON.stringify(data) + "\n", { flag: "wx", flush: true });
  renameSync(temp, file);
}
function integer(value: unknown, label: string, minimum: number) {
  const val = Number(value);
  if (!Number.isSafeInteger(val) || val < minimum) throw new RangeError(label + " fuera de rango.");
  return val;
}
export async function main(args = process.argv.slice(2)) {
  const { values: v } = parseArgs({ args, options: {
    format: {type:"string"}, config:{type:"string"}, run:{type:"string"}, seed:{type:"string"}, matches:{type:"string"},
    resume:{type:"string"}, until:{type:"string"}, device:{type:"string"}, partner:{type:"string"}, pairs:{type:"string"},
    benchmarkData:{type:"string"}, crossplay:{type:"boolean"},
  } });
  const run = v.resume ? dirname(resolve(v.resume)) : resolve(v.run ?? ".");
  if (v.crossplay) {
    if (!v.run || !v.partner) throw Error("Especificá --run y --partner con un actor entrenado en otra semilla.");
    const training = read(join(run,"checkpoint")).state as Checkpoint;
    const independent = read(join(dirname(v.partner),"checkpoint")).state as Checkpoint;
    if (training.seed === independent.seed) throw Error("El compañero de desarrollo precisa otra semilla de entrenamiento.");
    const report = crossplay(read(join(run,"actor.json")), read(v.partner), read(join(run,"mc-actor.json")),
      integer(v.seed ?? 91107,"seed",0), integer(v.pairs ?? 8,"pairs",1));
    save(join(run,"development.json"), report); return;
  }
  let cp: Checkpoint;
  const path = join(run,"checkpoint");
  if (v.resume) {
    const checkpoint = read(v.resume);
    if (checkpoint.sha256 !== digest(checkpoint.state) || checkpoint.state.schema !== versions.checkpoint) {
      throw Error("El checkpoint está dañado o es incompatible.");
    }
    cp = checkpoint.state;
    if (v.format && cp.format !== v.format) throw Error("El formato no coincide con el checkpoint.");
    if (v.matches !== undefined) cp.goal = integer(v.matches,"matches",cp.completed || 1);
  } else {
    if (!v.config || !v.run) throw Error("Especificá --config y --run.");
    const config = read(v.config);
    const format = v.format ?? config.format;
    if (!["pairs","pairs-senas"].includes(format) || config.format !== format) throw Error("Configuración de formato inválida.");
    if (!(config.rate > 0 && config.rate <= 1)) throw Error("Tasa de aprendizaje inválida.");
    const device = v.device ?? config.device;
    if (device !== "cpu" && device !== "mps") throw Error("Usá cpu o mps.");
    cp = initialize(format as Partnership, integer(v.seed ?? config.seed,"seed",0), integer(v.matches ?? config.matches,"matches",1),
      config.rate, integer(config.batchMatches,"batchMatches",1), device);
    mkdirSync(run, {recursive:true});
    if (existsSync(path)) throw Error("El run ya existe. Usá --resume.");
    save(path, {sha256:digest(cp),state:cp});
  }
  if (v.benchmarkData) {
    const start = performance.now();
    const rows = trainingBatch(structuredClone(cp), cp.batchMatches);
    save(v.benchmarkData,{format:cp.format,seed:cp.seed,generationSeconds:(performance.now()-start)/1000,state:cp.learner,rows});
    return;
  }
  const until = v.until === undefined ? cp.goal : integer(v.until,"until",cp.completed);
  if (until > cp.goal || until !== cp.goal && until % cp.batchMatches !== 0) {
    throw Error("--until debe ser la meta o el final de un lote.");
  }
  const opt = optimizer();
  try {
    while (cp.completed < until) {
      await update(cp, opt.fit, Math.min(until-cp.completed, cp.batchMatches));
      save(path,{sha256:digest(cp),state:cp});
    }
  } finally { await opt.close(); }
  const actor = exportActor(cp), mc = exportActor(cp,true);
  save(join(run,"actor.json"),actor); save(join(run,"mc-actor.json"),mc);
  const revision = execFileSync("git",["rev-parse","HEAD"],{ encoding:"utf8" }).trim();
  save(join(run,"training.json"),{ format:cp.format,seed:cp.seed,codeRevision:revision,versions,
    trainer:"pairs-rnn-mc-v1",turns:cp.examples,mcTurns:cp.mcExamples,matchesPerLearner:cp.completed,
    goal:cp.goal,batchMatches:cp.batchMatches,rate:cp.learner.rate,optimizer:"SGD; momentum=0.7; clip=1",
    device:cp.device,node:process.version,python:"3.12.14",torch:"2.14.1",machine:[process.platform,process.arch],
    stream:"SHA256(seed,domain); arena-v1 indexed by match; deterministic optimizer",
    criticFeatures:"team, score, stake and four private tantos; training only",loss:cp.loss,parity:cp.parity,
    checkpointSha256:digest(cp),actorSha256:digest(actor),mcSha256:digest(mc),oracle:compareEndgame(actor),
    command:process.argv.slice(1),resume:["node","training/partners/cli.ts","--resume",path] });
  console.log(JSON.stringify({format:cp.format,matchesPerLearner:cp.completed,actor:digest(actor),parity:cp.parity}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {console.error(error.message);process.exitCode=1;});
}
