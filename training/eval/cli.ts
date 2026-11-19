import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { arch, cpus, release, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { baseline, styles } from "../baselines/index.ts";
import { formats, versions, type Format } from "../contracts/index.ts";
import { incumbent } from "../seat/index.ts";
import { replayMatch, streamVersion, type MatchRecord } from "../arena/index.ts";
import { hash, runPair, type Team } from "./tournament.ts";
import { summarize, type PairOutcome } from "./statistics.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const json = (value: unknown) => JSON.stringify(value);
type Pool = "training" | "development" | "promotion" | "final";
const pools: Pool[] = ["training", "development", "promotion", "final"];
export interface Entry {
  id: string;
  lineage: string;
  /** An independently supplied serving artifact, resolved relative to the plan. */
  file?: string;
  sha256?: string;
  kind?: "duel" | "partners";
}
export interface Field {
  format: Format;
  pool: Pool;
  pairs: number;
  candidate: Entry;
  opponents: Entry[];
}
interface Plan extends Field {
  schema: "paired-eval-v1"; code: string; source: string; commitment: string; bootstrap: number;
  versions: typeof versions; streams: typeof streamVersion;
}

function source() {
  const files = execFileSync("git", ["ls-files","-z","src/motor","training"], {cwd:root,encoding:"utf8"})
    .split("\0").filter(f => /\.(ts|py)$/.test(f)).sort();
  return hash(json(files.map(f => [f,hash(readFileSync(join(root,f)))])));
}
function validate(field: Field) {
  assert.ok(formats.includes(field.format) && pools.includes(field.pool));
  assert.ok(Number.isSafeInteger(field.pairs) && field.pairs >= 2);
  assert.ok(Array.isArray(field.opponents) && field.opponents.some(e => e.id === incumbent.id));
  assert.equal(new Set(field.opponents.map(o=>o.id)).size, field.opponents.length);
  for (const entry of [field.candidate,...field.opponents]) {
    assert.ok(typeof entry.id === "string" && entry.id.length && typeof entry.lineage === "string" && entry.lineage.length);
    if (entry.file) {
      assert.match(entry.sha256 ?? "", /^[0-9a-f]{64}$/);
      assert.equal(entry.kind, field.format === "duel" ? "duel" : "partners");
    } else baseline(entry.id);
  }
  if (field.pool === "promotion" || field.pool === "final") {
    assert.ok(field.candidate.file, "Se requiere un candidato congelado.");
    assert.ok(field.opponents.some(o => o.file && o.lineage !== field.candidate.lineage), "Falta un linaje independiente.");
    assert.ok(field.opponents.every(o => o.id !== field.candidate.id && o.lineage !== field.candidate.lineage),
      "Un linaje de entrenamiento no puede integrar el campo sellado.");
  }
}
function exclusive(path: string, content: Buffer | string) {
  const temp = path + "." + randomUUID();
  writeFileSync(temp, content, {flag:"wx", mode:0o600});
  try { linkSync(temp,path); }
  finally { unlinkSync(temp); }
}
export function freeze(field: Field, directory: string) {
  validate(field);
  mkdirSync(dirname(resolve(directory)), {recursive:true});
  mkdirSync(directory, {mode:0o700});
  const secret = randomBytes(32).toString("hex");
  const plan: Plan = {...field, schema:"paired-eval-v1", code:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    source:source(), commitment:hash(secret), bootstrap:10000, versions, streams:streamVersion};
  exclusive(join(directory,"referee-key"), secret);
  exclusive(join(directory,"plan.json"), json(plan)+"\n");
  return plan;
}
async function team(entry: Entry, directory: string): Promise<Team> {
  if (!entry.file) return () => baseline(entry.id);
  const path = resolve(directory, entry.file);
  assert.equal(hash(readFileSync(path)), entry.sha256);
  // Only the dedicated serving reader sees the actor artifact; policies never receive the plan.
  if (entry.kind === "duel") {
    const {loadDuelActor} = await import("../duel/actor.ts");
    return () => loadDuelActor(path);
  }
  const {loadPartnerPolicy} = await import("../partners/policy.ts");
  const data = JSON.parse(readFileSync(path,"utf8"));
  return seat => loadPartnerPolicy(data,seat);
}
interface Packet { plan: string; opponent: string; pair: number; records: {arm:"candidate"|"incumbent"; record:MatchRecord}[] }
function readPair(packet: Packet, planHash: string, opponent: string, pair: number, seed: number, format: Format): PairOutcome {
  assert.equal(packet.plan, planHash);
  assert.equal(packet.pair, pair);
  assert.equal(packet.opponent, opponent);
  assert.equal(packet.records.length, 4);
  const result: PairOutcome = {pair, candidate:[0,0], incumbent:[0,0]};
  for (const [i,{arm,record}] of packet.records.entries()) {
    assert.equal(arm, i < 2 ? "candidate" : "incumbent");
    assert.equal(record.pair, pair);
    assert.equal(record.leg, i % 2);
    assert.equal(record.format, format);
    replayMatch(record,seed);
    result[arm][record.leg] = Number(record.winner === record.leg);
  }
  return result;
}

export async function evaluate(path: string, out: string, verifyOnly = false) {
  const raw = readFileSync(path);
  const plan: Plan = JSON.parse(raw.toString());
  validate(plan);
  assert.equal(plan.schema,"paired-eval-v1");
  assert.deepEqual(plan.versions,versions);
  assert.equal(plan.streams,streamVersion);
  assert.equal(plan.source,source(),"Cambió el código de evaluación. Usá el checkout congelado.");
  assert.equal(plan.bootstrap,10000);
  const planHash = hash(raw), directory = dirname(path);
  const secret = readFileSync(join(directory,"referee-key"),"utf8");
  assert.equal(hash(secret),plan.commitment);
  const seed = parseInt(hash(json([plan.pool,plan.format,secret])).slice(0,12),16);
  const candidate = await team(plan.candidate, directory);
  const old: Team = () => incumbent;
  if (!verifyOnly) mkdirSync(out,{recursive:true,mode:0o700});
  const receipts: {file:string; sha256:string}[] = [];
  const start = performance.now();
  const families = [];
  for (const [index, entry] of plan.opponents.entries()) {
    const opponent = await team(entry, directory);
    const pairs = [];
    for (let pair = 0; pair < plan.pairs; pair++) {
      const file = join(out, index + "-" + pair + ".json.gz");
      if (!verifyOnly && !existsSync(file)) {
        const records: Packet["records"] = [];
        runPair(plan.format,seed,pair,candidate,old,opponent,(arm,record) => records.push({arm,record}));
        const packet: Packet = {plan:planHash, opponent:entry.id, pair, records};
        try { exclusive(file,gzipSync(json(packet),{level:1})); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      }
      const bytes = readFileSync(file);
      pairs.push(readPair(JSON.parse(gunzipSync(bytes).toString()),planHash,entry.id,pair,seed,plan.format));
      receipts.push({file:basename(file), sha256:hash(bytes)});
    }
    families.push({id:entry.id,pairs});
  }
  const report = {schema:"paired-report-v1",planSha256:planHash,format:plan.format,pool:plan.pool,
    matchCount:plan.pairs * 4 * families.length, receiptsSha256:hash(json(receipts)),
    ...summarize(families,incumbent.id,plan.bootstrap)};
  const manifest = join(out,"manifest.json");
  if (!verifyOnly && !existsSync(manifest)) {
    const run = {report, receipts, elapsedMs:Math.round(performance.now()-start), revision:plan.code, source:plan.source,
      runtime:{node:process.version,system:release(),arch:arch(),cpu:cpus()[0].model,memory:totalmem()}};
    try { exclusive(manifest,json(run)+"\n"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  }
  const saved = JSON.parse(readFileSync(manifest,"utf8"));
  assert.deepEqual(saved.report,report);
  assert.deepEqual(saved.receipts,receipts);
  return report;
}

export async function main(args: string[]) {
  const {values} = parseArgs({args,options:{plan:{type:"string"},output:{type:"string"},verify:{type:"boolean"},
    freeze:{type:"string"},format:{type:"string"},pairs:{type:"string"}}});
  if (!values.output) throw new Error("Se requiere --output.");
  if (values.freeze) {
    const field: Field = JSON.parse(readFileSync(values.freeze,"utf8"));
    console.log(json(freeze(field,values.output)));
  } else if (values.plan) {
    console.log(json(await evaluate(values.plan,values.output,values.verify)));
  } else {
    const field: Field = {format:(values.format ?? "duel") as Format,pool:"development",pairs:Number(values.pairs ?? 16),
      candidate:{id:"duel-direct-falta-35-v1",lineage:"v1-rule-change"},
      opponents:[incumbent.id,...styles].map(id=>({id,lineage:id}))};
    console.log(json(freeze(field,values.output)));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
