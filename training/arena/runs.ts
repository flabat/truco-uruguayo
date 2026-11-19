import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { formats, signals, versions, type ActionId, type Format, type Policy } from "../contracts/index.ts";
import { challenger, incumbent } from "../seat/index.ts";
import { playMatch, replayMatch, streamVersion, type MatchRecord, type SignalRules } from "./index.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const json = (x: unknown) => JSON.stringify(x);
type Adapters = Partial<Record<Format, SignalRules>>;

interface Plan {
  schema: "arena-plan-v1";
  formats: Format[];
  pairs: number;
  seed: number;
  versions: typeof versions;
  streams: typeof streamVersion;
  schedule: string;
  policies: Record<string, string>;
  revision: string;
  source: string;
  runtime: {node: string; system: string; arch: string; cpu: string; memory: number};
}
interface Receipt {id: string; sha256: string; winner: number; hands: number}
interface Manifest {
  schema: "arena-result-v1";
  planSha256: string;
  receipts: Receipt[];
  elapsedMs: number;
  verified: number;
  fallback: number;
}

/** Exercises public gestures in smoke runs without giving a seat private information. */
const signalProbe: Policy = {
  id: "arena-public-signals-probe-v1",
  decide(observation, actions) {
    const silent = incumbent.decide(observation, actions);
    const move = actions[silent.indexOf(1)];
    const signal = signals[observation.history.length % signals.length];
    const index = actions.indexOf((signal + "/" + move) as ActionId);
    assert.ok(index >= 0);
    return actions.map((_, i) => Number(i === index));
  },
};

function hashSources(files: readonly string[]) {
  return digest(json(files.map(file => [file, digest(readFileSync(join(root, file)))])));
}

function sourceHashes() {
  const motor = readdirSync(join(root, "src/motor")).filter(f => f.endsWith(".ts")).sort().map(f => "src/motor/" + f);
  const actors = [...motor, "training/seat/index.ts", "training/contracts/index.ts"];
  const files = [...actors, "training/arena/index.ts", "training/arena/runs.ts", "training/arena/cli.ts"];
  if (existsSync(join(root, "training/signals/index.ts"))) files.push("training/signals/index.ts");
  const model = hashSources(actors);
  const probe = hashSources([...actors, "training/arena/runs.ts", "training/signals/index.ts"]);
  return {source: hashSources(files), policies: Object.fromEntries([incumbent, challenger, signalProbe].map(p => [p.id, digest(json([p.id, p === signalProbe ? probe : model]))]))};
}

function entries(plan: Plan) {
  return (function* () {
    for (let pair = 0; pair < plan.pairs; pair++) {
      for (const format of plan.formats) {
        for (const leg of [0, 1] as const) yield {pair, format, leg, id: format + "-" + pair + "-" + leg};
      }
    }
  })();
}

function validate(plan: Plan) {
  assert.equal(plan.schema, "arena-plan-v1");
  assert.deepEqual(plan.versions, versions);
  assert.equal(plan.streams, streamVersion);
  assert.ok(Number.isSafeInteger(plan.seed) && plan.seed >= 0, "Semilla inválida.");
  assert.ok(Number.isSafeInteger(plan.pairs) && plan.pairs >= 1, "Cantidad de pares inválida.");
  assert.ok(plan.formats.length && new Set(plan.formats).size === plan.formats.length
    && plan.formats.every(f => formats.includes(f)), "Formatos inválidos.");
}

function immutableFile(path: string, bytes: Buffer | string) {
  const temporary = path + "." + randomUUID() + ".tmp";
  writeFileSync(temporary, bytes, {mode: 0o600, flag: "wx"});
  try {
    // A complete file becomes visible at once. A competing/resumed writer cannot replace it.
    linkSync(temporary, path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    assert.deepEqual(readFileSync(path), Buffer.from(bytes), "Existe otro resultado para el mismo archivo.");
  } finally {
    unlinkSync(temporary);
  }
}

export function newRun(directory: string, selected: Format[], pairs: number, seed: number) {
  const plan: Plan = {
    schema: "arena-plan-v1", formats: selected, pairs, seed, versions, streams: streamVersion,
    schedule: "mano=(pair+hand)%seats; every hand/deal shared across legs; team=leg uses falta challenger in duel or signal probe in pairs-senas; V1 elsewhere",
    ...sourceHashes(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], {cwd: root, encoding: "utf8"}).trim(),
    runtime: {node: process.version, system: platform() + " " + release(), arch: arch(), cpu: cpus()[0].model, memory: totalmem()},
  };
  validate(plan);
  mkdirSync(dirname(resolve(directory)), {recursive: true});
  mkdirSync(directory, {mode: 0o700});
  mkdirSync(join(directory, "matches"), {mode: 0o700});
  immutableFile(join(directory, "plan.json"), json(plan) + "\n");
}

function readPlan(directory: string): Plan {
  const plan = JSON.parse(readFileSync(join(directory, "plan.json"), "utf8"));
  validate(plan);
  return plan;
}

function recordFile(dir: string, id: string) {
  return join(dir, "matches", id + ".json.gz");
}
function readRecord(path: string) {
  const {record, sha256} = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  assert.equal(digest(json(record)), sha256, "Registro alterado.");
  return record as MatchRecord;
}
function receipt(record: MatchRecord): Receipt {
  return {id: record.id, sha256: digest(json(record)), winner: record.winner, hands: record.hands.length};
}
function validateRecord(record: MatchRecord, schedule: {id: string; format: Format; leg: number; pair: number}, plan: Plan, adapters: Adapters) {
  for (const key of ["id", "format", "leg", "pair"] as const) assert.equal(record[key], schedule[key]);
  replayMatch(record, plan.seed, adapters[record.format]);
}

/** Each match is an atomic resumable unit. Incomplete temporary output is never read. */
export function run(directory: string, limit = Infinity, adapters: Adapters = {}) {
  const plan = readPlan(directory);
  if (existsSync(join(directory, "manifest.json"))) return verify(join(directory, "manifest.json"), adapters);
  assert.deepEqual({source: plan.source, policies: plan.policies}, sourceHashes(), "Cambió el código o la política del plan.");
  const started = performance.now();
  const receipts: Receipt[] = [];
  let added = 0;
  for (const schedule of entries(plan)) {
    const {pair, format, leg, id} = schedule;
    const file = recordFile(directory, id);
    let record: MatchRecord;
    if (existsSync(file)) {
      record = readRecord(file);
    } else {
      if (added >= limit) return {complete: false, verified: receipts.length};
      record = playMatch({pair, format, leg, seed: plan.seed, signalRules: adapters[format],
        policies: seat => {
          if (seat % 2 !== leg) return incumbent;
          if (format === "duel") return challenger;
          return format === "pairs-senas" ? signalProbe : incumbent;
        }});
      validateRecord(record, schedule, plan, adapters);
      immutableFile(file, gzipSync(json({record, sha256: digest(json(record))}), {level: 1}));
      receipts.push(receipt(record));
      added++;
      continue;
    }
    validateRecord(record, schedule, plan, adapters);
    receipts.push(receipt(record));
  }
  const manifest: Manifest = {schema: "arena-result-v1", planSha256: digest(readFileSync(join(directory, "plan.json"))),
    elapsedMs: Math.round(performance.now() - started), verified: receipts.length, fallback: 0, receipts};
  // Runtime is observational, so two concurrent finalizers may produce different timings.
  try { writeManifest(directory, manifest); }
  catch (error) { if (!existsSync(join(directory, "manifest.json"))) throw error; }
  return verify(join(directory, "manifest.json"), adapters);
}

function writeManifest(directory: string, manifest: Manifest) {
  immutableFile(join(directory, "manifest.json"), json(manifest) + "\n");
}
export function verify(manifestPath: string, adapters: Adapters = {}, match?: string) {
  const dir = dirname(manifestPath), plan = readPlan(dir);
  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, "arena-result-v1");
  assert.equal(manifest.planSha256, digest(readFileSync(join(dir, "plan.json"))));
  const total = plan.pairs * 2 * plan.formats.length;
  assert.equal(manifest.receipts.length, total);
  assert.equal(manifest.verified, total);
  assert.equal(manifest.fallback, 0);
  let index = 0, matches = 0, hands = 0;
  let selected: MatchRecord | undefined;
  for (const schedule of entries(plan)) {
    const expected = manifest.receipts[index++];
    assert.equal(expected.id, schedule.id);
    if (match && expected.id !== match) continue;
    const record = readRecord(recordFile(dir, expected.id));
    validateRecord(record, schedule, plan, adapters);
    assert.deepEqual(receipt(record), expected);
    matches++; hands += record.hands.length;
    if (match) selected = record;
  }
  if (match && !selected) throw new Error("El chico no figura en el manifiesto.");
  // Console replay is public. Private input, sealed decks and unplayed hands remain in referee files.
  const replay = selected && {id: selected.id, score: selected.score, winner: selected.winner,
    hands: selected.hands.map(h => ({hand: h.hand, dador: h.deal.dador, muestra: h.deal.muestra,
      startScore: h.startScore, endScore: h.endScore, turns: h.turns}))};
  return {complete: true, verified: matches, hands, matchesPerFormat: plan.pairs * 2,
    formats: plan.formats, resultsSha256: digest(json(manifest.receipts)), ...(replay && {replay})};
}
