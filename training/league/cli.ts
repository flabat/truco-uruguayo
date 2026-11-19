import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { arch, cpus, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { formats, type Format } from "../contracts/index.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const command = promisify(execFile);
const read = (path: string) => JSON.parse(readFileSync(path,"utf8"));
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const seeds = [71039, 72043, 73061];
const budget = {smoke:0, profile:15*60, pilot:2*60*60, overnight:8*60*60};
const {positionals:[stage],values} = parseArgs({allowPositionals:true,options:{run:{type:"string"},formats:{type:"string"}}});
if (!Object.hasOwn(budget,stage) || !values.run) throw new Error("league smoke|profile|pilot|overnight --run <directorio>");
const duration = budget[stage as keyof typeof budget];
const run = resolve(values.run);
mkdirSync(run,{recursive:true});
const selected = values.formats ? values.formats.split(",") as Format[] : [...formats];
if (!selected.length || selected.some(f => !formats.includes(f)) || new Set(selected).size !== selected.length) throw new Error("Formatos inválidos.");
function save(path:string, value:unknown) {
  const temp = path+"."+randomUUID()+".tmp";
  writeFileSync(temp,JSON.stringify(value)+"\n",{flag:"wx",flush:true});
  renameSync(temp,path);
}
const first = join(run,"plan.json");
const plan = {schema:"league-v1",seeds, formats, budgets:budget, device:"cpu", node:process.version,
  cpu:cpus()[0].model, arch:arch(),memory:totalmem(),revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim()};
if (!existsSync(first)) save(first,plan);
else if (JSON.stringify(read(first))!==JSON.stringify(plan)) throw new Error("Retomá con la revisión y el entorno fijados en el plan.");
interface Sample {seed:number; before:number; completed:number; seconds:number; actor:string; checkpoint:string;
  rssKiB:number|null; actorBytes:number; visits:number; trainDecisions:number; developmentWinRate:number|null}
async function lane(format:Format) {
  const log = join(run,stage+"-"+format+".json");
  const samples:Sample[] = existsSync(log) ? read(log).samples : [];
  const phaseStart = Date.now();
  const path = join(run,format);
  mkdirSync(path,{recursive:true});
  const cfg = read(join(root,"training/configs/"+format+"-local.json"));
  if (format === "duel") cfg.saveEvery = 256;
  cfg.device = "cpu";
  save(join(path,"config.json"),cfg);
  for (;;) {
    const used = seeds.map(seed => samples.filter(s=>s.seed===seed).reduce((t,s)=>t+s.seconds,0));
    const minimum = Math.min(...used);
    if ((duration === 0 && seeds.every(seed=>samples.some(s=>s.seed===seed))) || (duration>0 && minimum >= duration/seeds.length)) break;
    const seed = seeds[used.indexOf(minimum)];
    const dir = join(path,String(seed));
    const checkpoint = join(dir,"checkpoint");
    const prior = existsSync(checkpoint) ? read(checkpoint).state : null;
    const before = prior?.iteration ?? prior?.completed ?? 0;
    const step = stage === "smoke" ? 4 : format === "duel" ? 512 : 128;
    const target = before+step;
    const args = prior ? ["--resume",checkpoint] : ["--format",format,"--config",join(path,"config.json"),"--run",dir,"--seed",String(seed)];
    args.push(format === "duel" ? "--iterations" : "--matches",String(target));
    if (format === "duel") args.push("--eval-pairs","8");
    const started = performance.now();
    await command(process.execPath,[join(root,"training/cli.ts"),...args],{cwd:root,maxBuffer:1024*1024});
    const seconds = (performance.now()-started)/1000;
    const actor = join(dir,"actor.json");
    const metadata = read(join(dir,format==="duel" ? "manifest.json" : "training.json"));
    const s:Sample = {seed,before,completed:target,seconds,actor:digest(actor),checkpoint:digest(checkpoint),
      rssKiB:metadata.maxRssKiB??null,actorBytes:readFileSync(actor).length,visits:metadata.tableRows??0,
      trainDecisions:metadata.turns??metadata.counters.prefixDecisions,
      developmentWinRate:metadata.matches ? metadata.matches.filter((m:{won:boolean})=>m.won).length/metadata.matches.length : null};
    samples.push(s);
    const snapshot = join(dir,stage+"-frozen.json");
    if (!existsSync(snapshot)) copyFileSync(actor,snapshot);
    save(log,{format,stage,secondsPerSeed:duration/seeds.length,samples});
  }
  console.log(JSON.stringify({format,stage,secondsThisInvocation:(Date.now()-phaseStart)/1000,samples:samples.length}));
}
await Promise.all(selected.map(lane));
