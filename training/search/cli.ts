import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { playMatch, replayMatch } from "../arena/index.ts";
import { formats, seatsFor, trainingVersions, type Format, type Policy } from "../contracts/index.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { loadDuelActor } from "../duel/actor.ts";
import { summarize, type PairOutcome } from "../eval/statistics.ts";
import { loadPartnerPolicy } from "../partners/policy.ts";
import { incumbent } from "../seat/index.ts";
import { calibrate, fitContinuation, type Field } from "./continuation.ts";
import { boundedSearch, type Diagnostics } from "./index.ts";

const { values } = parseArgs({ options: Object.fromEntries(
  ["output", "formats", "seed", "fit", "holdout", "pairs", "worlds", "deadline-ms", "duel", "pairs-actor", "senas-actor"]
    .map(k => [k, { type: "string" as const }]),
) }) as { values: Record<string, string | undefined> };
function integer(name: string, fallback: number, min: number) {
  const val = Number(values[name] ?? fallback);
  if (!Number.isSafeInteger(val) || val < min) throw new RangeError(name);
  return val;
}
const requested = (values.formats ?? "all") === "all" ? formats : values.formats!.split(",") as Format[];
const output = resolve(values.output ?? "runs/search");
const seed = integer("seed", 81029, 0), fit = integer("fit", 64, 1), holdout = integer("holdout", 32, 1);
const pairs = integer("pairs", 8, 2), worlds = integer("worlds", 2, 1), deadlineMs = integer("deadline-ms", 6, 1);
if (seed > 0xffffffff - 2 || requested.some(f => !formats.includes(f))) throw new RangeError("Formato o semilla inválidos.");
mkdirSync(output, { recursive: true });
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
function timed(policy: Policy, fallbackPolicy: Policy, timings: number[], fallback: { count: number }) : Policy {
  return { id: policy.id, decide(obs, legal) {
    const start = performance.now();
    const p = policy.decide(obs, legal);
    const elapsed = performance.now() - start;
    timings.push(elapsed);
    if (elapsed <= deadlineMs) return p;
    fallback.count++;
    return fallbackPolicy.decide(obs, legal);
  } };
}
function latency(list: number[]) {
  const xs = [...list].sort((a,b) => a-b);
  const pct = (q: number) => xs[Math.floor((xs.length - 1) * q)] ?? null;
  return { decisions: xs.length, p50: pct(.5), p95: pct(.95), p99: pct(.99) };
}
for (const format of requested) {
  const path = format === "duel" ? values.duel : format === "pairs" ? values["pairs-actor"] : values["senas-actor"];
  let field: Field = () => incumbent;
  if (path) {
    if (format === "duel") { const actor = loadDuelActor(path); field = () => actor; }
    else {
      const artifact = JSON.parse(readFileSync(path, "utf8"));
      if (artifact.format !== format) throw new Error("Actor de otro formato.");
      const bySeat = Array.from({ length: seatsFor(format) }, (_, i) => loadPartnerPolicy(artifact, i as Asiento));
      field = s => bySeat[s];
    }
  }
  const table = fitContinuation(format, field, seed, fit);
  const calibration = calibrate(table, field, seed + 1, holdout);
  const options = { table, field, worlds, proposals: worlds * 12, deadlineMs, duelRisk: .02 };
  const decisions: Record<Diagnostics["result"], number> = { searched: 0, forced: 0, timeout: 0, "no-worlds": 0 };
  let zeroLikelihood = 0;
  const search = boundedSearch(options, d => { decisions[d.result]++; zeroLikelihood += Number(d.zeroLikelihood); });
  const delays = { on: [] as number[], off: [] as number[] };
  const fallback = { on: { count: 0 }, off: { count: 0 } };
  const matchRecords: PairOutcome[] = [];
  for (let pair = 0; pair < pairs; pair++) {
    const scores: PairOutcome = { pair, candidate: [0,0], incumbent: [0,0] };
    for (const leg of [0,1] as const) for (const arm of ["on","off"] as const) {
      const match = playMatch({ format, seed: seed + 2, pair, leg,
        policies: s => s % 2 === leg ? timed(arm === "on" ? search : field(s), arm === "on" ? field(s) : incumbent, delays[arm], fallback[arm]) : field(s) });
      replayMatch(match, seed + 2);
      scores[arm === "on" ? "candidate" : "incumbent"][leg] = Number(match.winner === leg);
    }
    matchRecords.push(scores);
  }
  const statistics = summarize([{ id: "frozen", pairs: matchRecords }], "frozen");
  const saved = JSON.stringify(table) + "\n";
  const tableName = format + "-continuation.json";
  writeFileSync(join(output, tableName), saved);
  const report = { format, schemas: trainingVersions, revision: execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(),
    runtime: process.version, field: table.field, artifact: path ? { path: resolve(path), sha256: digest(readFileSync(path)) } : incumbent.id,
    seeds: { fit: seed, heldoutCalibration: seed + 1, heldoutComparison: seed + 2 }, fitMatches: fit, holdoutMatches: holdout,
    worlds, proposals: options.proposals, duelRisk: options.duelRisk, deadlineMs, calibration, table: { path: tableName, sha256: digest(saved) },
    decisions, zeroLikelihood, timedFallbacks: fallback, latencyMs: { on: latency(delays.on), off: latency(delays.off) },
    matchRecords, statistics, release: "off", note: "Desarrollo local. La activación requiere el campeonato independiente." };
  writeFileSync(join(output, format + "-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ format, calibration, decisions, latencyMs: report.latencyMs, advantage: statistics.families[0].delta, release: report.release }));
}
