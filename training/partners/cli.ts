import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { requireTrainingFormat, trainingVersions, versions } from "../contracts/index.ts";
import { crossplay } from "./crossplay.ts";
import { digest, partnerships, type Partnership } from "./policy.ts";
import { exportActor, initialize, optimizer, pythonDir, seatPolicies, trainingBatch, update, type Checkpoint } from "./train.ts";
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
function readCheckpoint(path: string): Checkpoint {
  const checkpoint = read(path);
  if (checkpoint.sha256 !== digest(checkpoint.state) || checkpoint.state.schema !== versions.checkpoint) {
    throw Error("El checkpoint está dañado o es incompatible.");
  }
  requireTrainingFormat(checkpoint.state.format);
  return checkpoint.state;
}

// El proceso auxiliar sostiene el bloqueo POSIX hasta que el escritor cierre su pipe.
// Un cierre abrupto del padre libera el lock; el siguiente proceso verifica el checksum.
async function withRunLock(dir: string, action: () => Promise<void>) {
  mkdirSync(dir, {recursive:true});
  const program = [
    "import fcntl, sys",
    "with open(sys.argv[1], 'a') as lock:",
    "  try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)",
    "  except BlockingIOError: sys.exit(3)",
    "  print('ok', flush=True)",
    "  sys.stdin.read()",
  ].join("\n");
  const child = spawn(process.env.TRUCO_PYTHON ?? pythonDir + ".venv/bin/python",
    ["-c",program,join(dir,".writer.lock")],{stdio:["pipe","pipe","inherit"]});
  await new Promise<void>((resolve,reject) => {
    child.once("error", reject);
    child.once("exit", code => reject(Error(code === 3 ? "Otro proceso escribe este run." : "Falló el bloqueo del run.")));
    child.stdout.once("data", () => resolve());
  });
  const closed = once(child, "close");
  try { await action(); } finally { child.stdin.end(); await closed; }
}

export async function main(args = process.argv.slice(2)) {
  const { values: v } = parseArgs({ args, options: {
    format: {type:"string"}, config:{type:"string"}, run:{type:"string"}, seed:{type:"string"}, matches:{type:"string"},
    resume:{type:"string"}, until:{type:"string"}, device:{type:"string"}, partner:{type:"string"}, pairs:{type:"string"},
    benchmarkData:{type:"string"}, crossplay:{type:"boolean"}, opponent:{type:"string"},
  } });
  if (v.format !== undefined) requireTrainingFormat(v.format);
  const run = v.resume ? dirname(resolve(v.resume)) : resolve(v.run ?? ".");
  if (v.crossplay) {
    if (!v.run || !v.partner) throw Error("Especificá --run y --partner con un actor entrenado en otra semilla.");
    const training = readCheckpoint(join(run,"checkpoint"));
    const independent = readCheckpoint(join(dirname(v.partner),"checkpoint"));
    if (digest(exportActor(independent)) !== digest(read(v.partner))) throw Error("El actor del compañero no coincide con su checkpoint.");
    if (training.seed === independent.seed) throw Error("El compañero de desarrollo precisa otra semilla de entrenamiento.");
    const report = crossplay(read(join(run,"actor.json")), read(v.partner), read(join(run,"mc-actor.json")),
      integer(v.seed ?? 91107,"seed",0), integer(v.pairs ?? 8,"pairs",1));
    save(join(run,"development.json"), report); return;
  }
  if (!v.resume && (!v.run || !v.config)) throw Error("Especificá --config y --run.");
  await withRunLock(run, async () => {
    let cp: Checkpoint;
    const path = join(run,"checkpoint");
    if (v.resume) {
      cp = readCheckpoint(v.resume);
      if (v.opponent && digest(read(v.opponent)) !== digest(cp.opponent ?? null)) throw Error("No se puede cambiar el rival fijado.");
      if (v.format && cp.format !== v.format) throw Error("El formato no coincide con el checkpoint.");
      if (v.matches !== undefined) cp.goal = integer(v.matches,"matches",cp.completed || 1);
    } else {
      if (!v.config || !v.run) throw Error("Especificá --config y --run.");
      const config = read(v.config);
      const format = v.format ?? config.format;
      requireTrainingFormat(format);
      if (!partnerships.includes(format) || config.format !== format) throw Error("Configuración de formato inválida.");
      if (!(config.rate > 0 && config.rate <= 1)) throw Error("Tasa de aprendizaje inválida.");
      const device = v.device ?? config.device;
      if (device !== "cpu" && device !== "mps") throw Error("Usá cpu o mps.");
      cp = initialize(format as Partnership, integer(v.seed ?? config.seed,"seed",0), integer(v.matches ?? config.matches,"matches",1),
        config.rate, integer(config.batchMatches,"batchMatches",1), device);
      if (v.opponent) {
        const frozen = read(v.opponent);
        if (frozen.format !== cp.format) throw Error("El rival debe jugar el mismo formato.");
        seatPolicies(frozen);
        cp.opponent = frozen;
      }
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
    if (cp.completed < until) {
      const opt = optimizer();
      try {
        while (cp.completed < until) {
          await update(cp, opt.fit, Math.min(until-cp.completed, cp.batchMatches));
          save(path,{sha256:digest(cp),state:cp});
        }
      } finally { await opt.close(); }
    }
    const actor = exportActor(cp), mc = exportActor(cp,true);
    save(join(run,"actor.json"),actor); save(join(run,"mc-actor.json"),mc);
    const revision = execFileSync("git",["rev-parse","HEAD"],{ encoding:"utf8" }).trim();
    const fileSha = (name: string) => createHash("sha256").update(readFileSync(join(run,name))).digest("hex");
    save(join(run,"training.json"),{ format:cp.format,seed:cp.seed,codeRevision:revision,versions:trainingVersions,
      trainer:"pairs-rnn-mc-v1",turns:cp.examples,mcTurns:cp.mcExamples,matchesPerLearner:cp.completed,
      goal:cp.goal,batchMatches:cp.batchMatches,rate:cp.learner.rate,optimizer:"SGD; momentum=0.7; clip=1",
      device:cp.device,node:process.version,python:"3.12.14",torch:"2.14.1",machine:[process.platform,process.arch],
      stream:"SHA256(seed,domain); arena-v1 indexed by match; deterministic optimizer",
      criticFeatures:"team, score, stake and four private tantos; training only",loss:cp.loss,parity:cp.parity,
      checkpointSha256:digest(cp),actorSha256:digest(actor),mcSha256:digest(mc),
      artifactFileSha256:{checkpoint:fileSha("checkpoint"),actor:fileSha("actor.json"),mc:fileSha("mc-actor.json")},
      frozenOpponent:cp.opponent ? digest(cp.opponent) : null,oracle:compareEndgame(actor),
      command:process.argv.slice(1),resume:["node","training/partners/cli.ts","--resume",path] });
    console.log(JSON.stringify({format:cp.format,matchesPerLearner:cp.completed,actor:digest(actor),parity:cp.parity}));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {console.error(error.message);process.exitCode=1;});
}
