import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { featureSize, featureVersion, privilegedSize, slotCount } from "./features.ts";
import { encodeNetwork, regularizedKind, type RegularizedArtifact } from "./network.ts";
import { rawNetwork } from "./agents.ts";
import { Pool, Python, winRate } from "./pool.ts";
import type { Mode } from "./env.ts";
import type { Lineup, WeightsMessage } from "./worker.ts";

/**
 * Entrenamiento por autojuego regularizado.
 *
 *   node training/regularized/run.ts --format duel --run runs/regularized/duel-a --hours 6
 *   node training/regularized/run.ts --run runs/regularized/duel-a --hours 2   # reanuda
 *
 * `--exploit <artefacto>` entrena un contrajugador: solo contra ese actor fijo, sin ancla.
 */
const { values: args } = parseArgs({ options: {
  format: { type: "string" }, run: { type: "string" }, hours: { type: "string", default: "1" },
  workers: { type: "string" }, rows: { type: "string", default: "65536" },
  "bc-rows": { type: "string", default: "786432" }, "bc-epochs": { type: "string", default: "4" },
  hidden: { type: "string", default: "256,256" }, seed: { type: "string", default: "1" },
  eta: { type: "string", default: "0.05" }, "magnet-every": { type: "string", default: "50" },
  lr: { type: "string", default: "0.0003" }, entropy: { type: "string", default: "0.005" },
  exploit: { type: "string" }, init: { type: "string" }, "eval-every": { type: "string", default: "40" },
  "eval-pairs": { type: "string", default: "96" }, "no-bc": { type: "boolean", default: false },
  mix: { type: "string", default: "league" },
  shaping: { type: "string" }, "self-share": { type: "string" }, "snap-share": { type: "string" }, "fixed-share": { type: "string" },
} });

const run = resolve(args.run!);
mkdirSync(join(run, "snapshots"), { recursive: true });
const configPath = join(run, "config.json");
const resumed = existsSync(configPath);
const config = resumed ? JSON.parse(readFileSync(configPath, "utf8")) : {
  format: args.format, seed: Number(args.seed), hidden: args.hidden!.split(",").map(Number), workers: Number(args.workers ?? 8),
  rows: Number(args.rows), eta: Number(args.eta), magnetEvery: Number(args["magnet-every"]), lr: Number(args.lr),
  entropy: Number(args.entropy), exploit: args.exploit ? (existsSync(args.exploit) ? resolve(args.exploit) : args.exploit) : null, init: args.init ? resolve(args.init) : null,
  mix: args.mix, featureVersion, created: new Date().toISOString(),
};
// Las proporciones de la liga se pueden cambiar al reanudar.
for (const [key, arg] of [["selfShare", "self-share"], ["snapShare", "snap-share"], ["fixedShare", "fixed-share"]] as const) {
  if (args[arg] !== undefined) config[key] = Number(args[arg]);
}
if (args.workers !== undefined) config.workers = Number(args.workers);
config.selfShare ??= 0.33; config.snapShare ??= 0.2; config.fixedShare ??= 0.45;
if (args.shaping !== undefined) config.shaping = args.shaping === "on";
config.shaping ??= !resumed;
writeFileSync(configPath, JSON.stringify(config, null, 2));
if (!resumed) {
  if (!["duel", "pie", "tercetos"].includes(config.format)) throw new Error("Usá --format duel, pie o tercetos.");
}
const format: "duel" | "pie" | "tercetos" = config.format;
const target = format === "tercetos" ? 50 : 40;
const champion = format === "duel" ? "ceibo" : format === "pie" ? "pie-parejas-v2" : "pie-clasico-v1";
/** Finalista de la liga de noviembre: linaje independiente que le gana a Ceibo. */
const finalist = "actor:" + new URL("../../runs/regularized/champions/finalista-duel.json", import.meta.url).pathname;
const deadline = Date.now() + Number(args.hours) * 3600_000;
const log = (entry: Record<string, unknown>) => {
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry });
  appendFileSync(join(run, "progress.jsonl"), line + "\n");
  console.log(line);
};

const modes: Mode[] = format === "duel" ? ["duel-prod", "duel-arena"] : [format];
const modeWeights = format === "duel" ? [0.75, 0.25] : [1];
const solo = (spec: string) => format === "duel" ? [spec] : format === "pie" ? [spec, spec] : [spec, spec, spec];
const fixed: [string, number][] = format === "tercetos"
  ? [["pie-clasico-v1", 0.2], ["pie-caller", 0.05], ["pie-folder", 0.05], ["pie-frequent-bluff", 0.05],
    ["pie-rare-bluff", 0.05], ["pie-strong-cards", 0.05]]
  : format === "duel"
  ? [["ceibo", 0.12], ["v1", 0.05], ["challenger", 0.04], ["caller", 0.04], ["folder", 0.04], ["frequent-bluff", 0.06],
    ["rare-bluff", 0.04], ["strong-cards", 0.06], [finalist, 0.06]]
  : [["pie-parejas-v2", 0.15], ["pie-clasico-v1", 0.05], ["pie-caller", 0.04], ["pie-folder", 0.04], ["pie-frequent-bluff", 0.05],
    ["pie-rare-bluff", 0.04], ["pie-strong-cards", 0.05]];

/** Tasa del campeón contra cada rival fijo (la marca de la puerta) y promedio móvil del aprendiz. */
let targets: Record<string, number> = {};
const ema: Record<string, number> = {};
/** PFSP según la puerta: más chicos contra quien el aprendiz queda por debajo de la marca del campeón. */
function boost(spec: string) {
  const target = targets[spec];
  const current = ema[spec];
  if (target === undefined || current === undefined) return 1;
  return Math.min(4, Math.max(0.3, 1 + (target + 0.03 - current) / 0.05));
}
function league(snapshots: string[]): Lineup[] {
  if (config.exploit) {
    const target = existsSync(config.exploit) ? "net:" + config.exploit : config.exploit;
    return [{ a: solo("learner"), b: solo(target), name: "target" }];
  }
  const mix: Lineup[] = [{ a: solo("learner"), b: solo("learner"), weight: config.selfShare, name: "self" }];
  const recent = snapshots.slice(-8);
  for (const s of recent) mix.push({ a: solo("learner"), b: solo("net:" + s), weight: config.snapShare / recent.length, name: "snap" });
  const share = config.fixedShare;
  const boosted = fixed.map(([spec, w]) => [spec, w * boost(spec)] as const);
  const total = boosted.reduce((a, [, w]) => a + w, 0);
  for (const [spec, w] of boosted) mix.push({ a: solo("learner"), b: solo(spec), weight: w * share / total, name: spec });
  if (format === "pie") mix.push({ a: ["learner", "pie-parejas-v2"], b: solo("pie-parejas-v2"), weight: 0.1, name: "partner-v2" });
  if (format === "tercetos") mix.push({ a: ["learner", "pie-clasico-v1", "pie-clasico-v1"], b: solo("pie-clasico-v1"), weight: 0.1,
    name: "partner-clasico" });
  return mix;
}

const evalField = format === "tercetos"
  ? ["pie-clasico-v1", "pie-caller", "pie-folder", "pie-frequent-bluff", "pie-rare-bluff", "pie-strong-cards"]
  : format === "duel"
  ? ["ceibo", "v1", "challenger", "caller", "folder", "frequent-bluff", "rare-bluff", "strong-cards", finalist]
  : ["pie-parejas-v2", "pie-clasico-v1", "pie-caller", "pie-folder", "pie-frequent-bluff", "pie-rare-bluff", "pie-strong-cards"];

const pool = new Pool(config.workers);
const python = new Python(resolve("training/partners/python/.venv/bin/python"), new URL("./learner.py", import.meta.url).pathname,
  s => appendFileSync(join(run, "python.log"), s));
const state = resumed && existsSync(join(run, "state.json")) ? JSON.parse(readFileSync(join(run, "state.json"), "utf8"))
  : { iteration: 0, snapshots: [] as string[], chicos: 0, rows: 0, cloned: false };

/** Lee los pesos crudos sin caché: `current.bin` cambia en cada iteración. */
function weightsFrom(path: string): WeightsMessage {
  const { shapes } = JSON.parse(readFileSync(path + ".json", "utf8")) as { shapes: [number, number][] };
  const bytes = readFileSync(path);
  const data = new Float32Array(new SharedArrayBuffer(bytes.byteLength));
  data.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  return { shapes, data };
}

async function exportCurrent(path: string) {
  await python.send({ cmd: "export", path });
  return weightsFrom(path);
}

/** Artefacto servible por api/actor-registry.ts. */
export function artifactFrom(path: string, meta: Record<string, unknown>): RegularizedArtifact {
  const { shapes, data } = weightsFrom(path);
  const net = rawNetwork(shapes, data);
  return { kind: regularizedKind, format: format === "duel" ? "duel" : format === "pie" ? "pairs-private-senas" : "triples",
    features: featureVersion,
    ...(format === "duel" && { memory: "opponent" as const }), ...encodeNetwork(net), meta };
}

async function evaluateNow(weights: WeightsMessage, tag: string) {
  const out: Record<string, unknown> = {};
  for (const opp of evalField) {
    const r = winRate(await pool.evaluate({ a: solo("current"), b: solo(opp) }, modes[0], Number(args["eval-pairs"]), 777, weights, 0, target));
    out[opp.startsWith("actor:") ? "finalista" : opp] = Number(r.rate.toFixed(3));
  }
  log({ event: "eval", tag, iteration: state.iteration, ...out });
}

async function main() {
  const init = await python.send({ cmd: "init", cfg: { F: featureSize(), P: privilegedSize, S: slotCount, hidden: config.hidden,
    lr: config.lr, seed: config.seed } });
  log({ event: "start", resumed, device: init.device, torch: init.torch, format, F: featureSize(), P: privilegedSize });
  const checkpoint = join(run, "checkpoint.pt");
  if (resumed && existsSync(checkpoint)) await python.send({ cmd: "restore", path: checkpoint });
  else if (config.init) {
    await python.send({ cmd: "restore", path: config.init, optimizers: false });
    state.cloned = true;
  }

  const targetsPath = join(run, "targets.json");
  if (existsSync(targetsPath)) targets = JSON.parse(readFileSync(targetsPath, "utf8"));
  if (!config.exploit && fixed.some(([spec]) => !(spec in targets))) {
    for (const [spec] of fixed) {
      if (spec in targets) continue;
      targets[spec] = spec === champion ? 0.6
        : winRate(await pool.evaluate({ a: solo(champion), b: solo(spec) }, modes[0], 128, 4242, undefined, 0, target)).rate;
    }
    writeFileSync(targetsPath, JSON.stringify(targets, null, 2));
    log({ event: "targets", ...targets });
  }
  if (existsSync(join(run, "ema.json"))) Object.assign(ema, JSON.parse(readFileSync(join(run, "ema.json"), "utf8")));
  let weights = await exportCurrent(join(run, "current.bin"));
  if (!state.cloned && !args["no-bc"] && !config.exploit) {
    // Clonación del campeón: el maestro juega contra la liga fija y contra sí mismo.
    const teacher = "teacher:" + champion;
    const mix: Lineup[] = [{ a: solo(teacher), b: solo(champion), weight: 0.5 }, ...fixed.map(([s, w]) => ({ a: solo(teacher), b: solo(s), weight: w }))];
    const paths: string[] = [];
    const goal = Number(args["bc-rows"]);
    let rows = 0, part = 0;
    while (rows < goal) {
      const c = await pool.collect(weights, mix, modes, modeWeights, Math.min(131072, goal - rows), config.seed * 13 + part, target);
      const p = join(run, `bc-${part++}.f32`);
      writeFileSync(p, Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength));
      paths.push(p); rows += c.rows;
      log({ event: "bc-collect", rows, chicos: c.chicos });
    }
    const r = await python.send({ cmd: "clone", paths, epochs: Number(args["bc-epochs"]) });
    log({ event: "bc", ...r });
    state.cloned = true;
    weights = await exportCurrent(join(run, "current.bin"));
    await python.send({ cmd: "save", path: checkpoint });
    writeFileSync(join(run, "state.json"), JSON.stringify(state));
    await evaluateNow(weights, "bc");
  }

  const trainCfg = { eta: config.exploit ? 0 : config.eta, magnet_every: config.exploit ? 0 : config.magnetEvery,
    entropy: config.entropy, clip: 0.2, epochs: 2, batch: 4096, lambda: 0.95 };
  // Canalización: mientras Python aprende del lote anterior, los trabajadores juntan el siguiente con los pesos vigentes.
  let collecting = pool.collect(weights, league(state.snapshots), modes, modeWeights, config.rows, config.seed * 100003 + state.iteration, target, config.shaping);
  while (Date.now() < deadline) {
    const batch = await collecting;
    const dataPath = join(run, "batch.f32");
    writeFileSync(dataPath, Buffer.from(batch.data.buffer, batch.data.byteOffset, batch.data.byteLength));
    const mix = league(state.snapshots);
    collecting = pool.collect(weights, mix, modes, modeWeights, config.rows, config.seed * 100003 + state.iteration + 1, target, config.shaping);
    const stats = await python.send({ cmd: "train", path: dataPath, cfg: trainCfg });
    weights = await exportCurrent(join(run, "current.bin"));
    state.iteration++; state.chicos += batch.chicos; state.rows += batch.rows;
    const vs: Record<string, string> = {};
    const names = league(state.snapshots).map(l => l.name ?? "?");
    const agg = new Map<string, [number, number]>();
    names.forEach((n, i) => { const a = agg.get(n) ?? [0, 0]; a[0] += batch.wins[i] ?? 0; a[1] += batch.games[i] ?? 0; agg.set(n, a); });
    for (const [n, [w, g]] of agg) if (g && n !== "self") {
      vs[n] = (w / g).toFixed(2);
      if (n in targets) ema[n] = ema[n] === undefined ? w / g : ema[n] + Math.min(1, g / 400) * 0.1 * (w / g - ema[n]);
    }
    log({ event: "iter", iteration: state.iteration, rows: batch.rows, chicos: batch.chicos, ...stats, vs });
    if (state.iteration % 25 === 0) {
      const snap = join(run, "snapshots", `iter-${state.iteration}.bin`);
      writeFileSync(snap, readFileSync(join(run, "current.bin")));
      writeFileSync(snap + ".json", readFileSync(join(run, "current.bin.json")));
      state.snapshots.push(snap);
      await python.send({ cmd: "save", path: checkpoint });
      writeFileSync(join(run, "state.json"), JSON.stringify(state));
      writeFileSync(join(run, "ema.json"), JSON.stringify(ema));
      log({ event: "boost", ...Object.fromEntries(fixed.map(([spec]) => [spec, Number(boost(spec).toFixed(2))])) });
    }
    if (state.iteration % Number(args["eval-every"]) === 0) {
      await collecting;
      await evaluateNow(weights, "iter");
      collecting = pool.collect(weights, league(state.snapshots), modes, modeWeights, config.rows, config.seed * 100003 + state.iteration + 7, target, config.shaping);
    }
  }
  await collecting;
  await python.send({ cmd: "save", path: checkpoint });
  writeFileSync(join(run, "state.json"), JSON.stringify(state));
  const artifact = artifactFrom(join(run, "current.bin"), { iteration: state.iteration, chicos: state.chicos, run: config });
  writeFileSync(join(run, "actor.json"), JSON.stringify(artifact));
  await evaluateNow(weights, "final");
  log({ event: "done", iteration: state.iteration, chicos: state.chicos });
  python.close();
  await pool.close();
}

main().catch(error => { console.error(error); process.exit(1); });
