import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { arch, availableParallelism, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { playMatch, replayMatch, streamVersion } from "../arena/index.ts";
import { versions } from "../contracts/index.ts";
import { challenger, incumbent } from "../seat/index.ts";
import { loadDuelActor } from "./actor.ts";
import { exactResponses, referenceAverage } from "./reference.ts";
import { duelStep, exportDuel, newDuel, validateConfig, type DuelState } from "./train.ts";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const hash = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
function atomic(path: string, value: unknown) {
  const contents = JSON.stringify(value) + "\n";
  const temporary = path + "." + randomUUID() + ".tmp";
  writeFileSync(temporary, contents, { flag: "wx", flush: true });
  renameSync(temporary, path);
  return hash(contents);
}
function saveCheckpoint(path: string, state: DuelState) {
  return atomic(path, { checksum: hash(JSON.stringify(state)), state });
}
export function loadCheckpoint(path: string): DuelState {
  const { checksum, state } = JSON.parse(readFileSync(path, "utf8"));
  if (!state || state.schema !== "duel-checkpoint-v1" || checksum !== hash(JSON.stringify(state))) {
    throw new Error("Checkpoint de duelo corrupto o incompatible.");
  }
  validateConfig(state.config);
  return state;
}
export function trainDuel(args: string[]) {
  const { values } = parseArgs({ args, options: Object.fromEntries(
    ["format", "run", "config", "seed", "iterations", "resume", "eval-pairs"].map(k => [k, { type: "string" as const }]),
  ) }) as { values: Record<string, string | undefined> };
  if (values.format && values.format !== "duel") throw new Error("Formato incompatible.");
  if (values.resume && (values.run || values.config || values.seed)) throw new Error("Al reanudar se conserva la configuración guardada.");
  if (!values.resume && (!values.run || !values.config)) throw new Error("Se requiere --run y --config, o --resume.");
  const directory = values.resume ? dirname(resolve(values.resume)) : resolve(values.run!);
  mkdirSync(directory, { recursive: true });
  // Publicar el PID antes de mirar los otros evita que dos procesos empiecen
  // a escribir. Si ambos se detectan, ambos pueden reintentar sin pisar archivos.
  const marker = ".writer-" + process.pid + "-" + randomUUID();
  writeFileSync(join(directory, marker), "", { flag: "wx" });
  try {
    for (const file of readdirSync(directory)) {
      const match = /^\.writer-(\d+)-/.exec(file);
      if (!match || file === marker) continue;
      try {
        process.kill(Number(match[1]), 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") continue;
        throw e;
      }
      throw new Error("Otro entrenador está escribiendo esta corrida.");
    }
    return run(directory, values);
  } finally {
    unlinkSync(join(directory, marker));
  }
}

function run(directory: string, values: Record<string, string | undefined>) {
  const checkpoint = join(directory, "checkpoint");
  if (!values.resume && existsSync(checkpoint)) throw new Error("La corrida existe; reanudar con --resume.");
  const state = values.resume ? loadCheckpoint(resolve(values.resume)) : newDuel({
    ...JSON.parse(readFileSync(values.config!, "utf8")), ...(values.seed ? { seed: Number(values.seed) } : {}),
  });
  const target = Number(values.iterations ?? state.config.iterations);
  const pairs = Number(values["eval-pairs"] ?? 8);
  if (!Number.isSafeInteger(target) || target < state.iteration || target < 1 || !Number.isSafeInteger(pairs) || pairs < 1) {
    throw new Error("El presupuesto debe ser un entero positivo y no retroceder el checkpoint.");
  }
  const startIteration = state.iteration;
  const start = performance.now();
  while (state.iteration < target) {
    duelStep(state);
    if (state.iteration % state.config.saveEvery === 0) saveCheckpoint(checkpoint, state);
  }
  const trainMs = performance.now() - start;
  const checkpointHash = saveCheckpoint(checkpoint, state);
  const actorPath = join(directory, "actor.json");
  const actorHash = atomic(actorPath, exportDuel(state));
  const candidate = loadDuelActor(actorPath);
  // Holdout de ingeniería reproducible. La promoción tiene sus propios planes,
  // rivales y semillas selladas del evaluador independiente.
  const evaluationSeed = createHash("sha256").update("duel-dev-v1/" + state.config.seed).digest().readUInt32BE();
  const opponents = [incumbent, challenger];
  const matches = [];
  for (const opponent of opponents) for (let pair = 0; pair < pairs; pair++) for (const leg of [0, 1] as const) {
    const match = playMatch({ format: "duel", seed: evaluationSeed, pair, leg, policies: s => s === leg ? candidate : opponent });
    replayMatch(match, evaluationSeed);
    matches.push({ pair, leg, opponent: opponent.id, won: match.winner === leg, score: match.score, hands: match.hands.length });
  }
  const git = (...cmd: string[]) => execFileSync("git", ["-C", repo, ...cmd], { encoding: "utf8" }).trim();
  const manifest = {
    kind: "duel-training-v1", format: "duel", schemas: versions, revision: git("rev-parse", "HEAD"),
    seedSchedule: { arena: streamVersion, training: "duel-training-v1", evaluation: "duel-dev-v1", evaluationSeed },
    hardware: { platform: platform(), arch: arch(), parallelism: availableParallelism(), node: process.version },
    config: state.config, iteration: state.iteration, budgets: { startIteration, target, pairs }, trainMs,
    counters: state.counters, tableRows: Object.keys(state.rows).length, maxRssKiB: process.resourceUsage().maxRSS,
    artifacts: { checkpoint: checkpointHash, "actor.json": actorHash }, actor: candidate.id,
    reference: { iterations: state.reference.iteration, ...exactResponses(referenceAverage(state.reference)) },
    opponentCode: Object.fromEntries(["src/motor/mesa-online.ts", "src/motor/jugadores.ts", "training/seat/index.ts"]
      .map(path => [path, hash(readFileSync(join(repo, path)))])),
    field: opponents.map(o => o.id), matches, promotion: "not-tested",
  };
  atomic(join(directory, "manifest.json"), manifest);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const m = trainDuel(process.argv.slice(2));
  console.log(JSON.stringify({ actor: m.actor, iteration: m.iteration, rows: m.tableRows, reference: m.reference,
    wins: Object.fromEntries(m.field.map(id => [id, m.matches.filter(r => r.opponent === id && r.won).length])),
    matchesPerOpponent: m.budgets.pairs * 2, artifacts: m.artifacts }));
}
