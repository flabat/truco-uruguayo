import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { arch,cpus,release,totalmem } from "node:os";
import { parseArgs } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { replayMatch } from "../arena/index.ts";
import { summarize, type FamilyResult, type PairOutcome } from "../eval/statistics.ts";
import { incumbent } from "../seat/index.ts";
import { buildId, families, prepare, referee, root, sha, type Field, type Receipt } from "./field.ts";

const json=(v:unknown)=>JSON.stringify(v);
const bytes=(f:string)=>readFileSync(f);
const read=(f:string)=>JSON.parse(bytes(f).toString());
function publish(path:string,data:Buffer|string) {
  const temp=path+"."+randomUUID()+".tmp";
  writeFileSync(temp,data,{flag:"wx",mode:0o600,flush:true});
  try { linkSync(temp,path); } finally { unlinkSync(temp); }
}
function point(receipts:Receipt[],pair:number):PairOutcome {
  const outcome:PairOutcome={pair,candidate:[0,0],incumbent:[0,0]};
  assert.equal(receipts.length,4);
  for(const [i,{arm,match}] of receipts.entries()) {
    assert.equal(arm,i<2?"candidate":"incumbent");
    assert.equal(match.pair,pair);
    assert.equal(match.leg,i%2);
    outcome[arm][match.leg]=Number(match.winner===match.leg);
  }
  return outcome;
}
function variance(values:number[]) {
  const avg=values.reduce((a,b)=>a+b)/values.length;
  return values.reduce((a,b)=>a+(b-avg)**2,0)/(values.length-1);
}
const fraction=(a:readonly number[])=>(a[0]+a[1])/2;

/** Independent development draws only; size is fixed before the secret final key exists. */
export async function register(bundle:string,dir:string) {
  const {field,artifacts}=prepare(bundle);
  const service=referee(field,file=>artifacts.get(file)!);
  const devSeed=parseInt(sha("championship-sizing-v1/"+field.format).slice(0,12),16);
  const pilotPairs=12, pilotStart=performance.now();
  const fieldFamilies=families(field);
  const variances:Record<string,number>={};
  try {
    for(const f of fieldFamilies) {
      const points=[];
      for(let pair=0;pair<pilotPairs;pair++) points.push(point(await service.play(f,devSeed,pair),pair));
      variances[f.id]=variance(points.map(p=>fraction(p.candidate)-fraction(p.incumbent)));
      if(f.id===incumbent.id+"/fixed") variances.direct=variance(points.map(p=>fraction(p.candidate)));
    }
  } finally { await service.close(); }
  const pilotMs=performance.now()-pilotStart;
  // 3.2 covers the two-sided Bonferroni normal critical value for this field (up to 17 tests).
  const z=3.2, powerZ=0.842, targetDifference=0.06;
  const worstVariance=Math.max(0.01,...Object.values(variances));
  const wanted=Math.ceil((z+powerZ)**2*worstVariance/targetDifference**2);
  const feasible=Math.max(24,Math.floor(30*60*1000/(pilotMs/pilotPairs)));
  const pairs=Math.min(256,feasible,Math.max(24,wanted));
  mkdirSync(dirname(resolve(dir)),{recursive:true}); mkdirSync(dir,{mode:0o700});
  for(const [file,raw] of artifacts) publish(join(dir,file),raw);
  const secret=randomBytes(32).toString("hex");
  const plan={schema:"chico-championship-v1",field,pairs,commitment:sha(secret),analysis:"paired-bootstrap-bonferroni-10000-v1",
    revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    fieldFamilies,thresholds:{direct:0.5,delta:-0.02},sizing:{pilotPairs,pilotMs,variances,z,powerZ,targetDifference,wanted,feasible,
      estimatedDetectable:(z+powerZ)*Math.sqrt(worstVariance/pairs),maxPairs:256,wallBudgetMinutes:30}};
  publish(join(dir,"referee-key"),secret);
  publish(join(dir,"plan.json"),json(plan)+"\n");
  return {sha256:sha(bytes(join(dir,"plan.json"))),format:field.format,pairs,matchCount:pairs*fieldFamilies.length*4,sizing:plan.sizing};
}
export function decision(summary:ReturnType<typeof summarize>,fallback:number,limit:number) {
  if(fallback>limit || summary.direct.upper<=0.5 || summary.families.some(f=>f.delta.upper<=-0.02)) return "failed";
  return summary.direct.lower>0.5 && summary.families.every(f=>f.delta.lower> -0.02) ? "pass" : "inconclusive";
}
export async function championship(dir:string,output:string,verifyOnly:boolean) {
  const plan=read(join(dir,"plan.json")),field=plan.field as Field;
  assert.equal(plan.schema,"chico-championship-v1"); assert.equal(field.build,buildId());
  assert.deepEqual(plan.fieldFamilies,families(field)); assert.ok(Number.isSafeInteger(plan.pairs)&&plan.pairs>=24&&plan.pairs<=256);
  assert.deepEqual(plan.thresholds,{direct:0.5,delta:-0.02}); assert.equal(field.deadlineMs,200); assert.equal(field.fallbackLimit,0.005);
  const secret=bytes(join(dir,"referee-key")).toString();
  assert.equal(sha(secret),plan.commitment);
  const seed=parseInt(sha(json(["sealed-final-v1",field.format,secret])).slice(0,12),16);
  const planHash=sha(bytes(join(dir,"plan.json")));
  const service=referee(field,file=>bytes(join(dir,file)));
  const summaries:FamilyResult[]=[],files:{path:string;sha256:string}[]=[];
  const latency:number[]=[],fallbacks:Record<string,number>={};
  const awards:Record<string,{won:number;conceded:number}>={};
  const bands:Record<string,{matches:number;wins:number;scorePriorSum:number}>={};
  if(!verifyOnly) mkdirSync(output,{recursive:true,mode:0o700});
  const start=performance.now();
  try {
    for(const [i,f] of families(field).entries()) {
      const pairs:PairOutcome[]=[];
      for(let pair=0;pair<plan.pairs;pair++) {
        const file=i+"-"+pair+".json.gz",path=join(output,file);
        if(!verifyOnly && !existsSync(path)) {
          const records=await service.play(f,seed,pair);
          const data=gzipSync(json({planHash,family:f.id,pair,records}),{level:1});
          try {publish(path,data);} catch(e) {if((e as NodeJS.ErrnoException).code!=="EEXIST") throw e;}
        }
        const data=bytes(path),packet=JSON.parse(gunzipSync(data).toString());
        assert.equal(packet.planHash,planHash); assert.equal(packet.family,f.id); assert.equal(packet.pair,pair);
        const receipts=packet.records as Receipt[];
        pairs.push(point(receipts,pair));
        for(const r of receipts) {
          assert.equal(r.match.format,field.format);
          replayMatch(r.match,seed);
          if(r.arm!=="candidate") continue;
          for(const us of r.latencyUs) {assert.ok(Number.isSafeInteger(us)&&us>=0); latency.push(us);}
          for(const [reason,n] of Object.entries(r.fallbacks)) fallbacks[reason]=(fallbacks[reason]??0)+n;
          const team=r.match.leg;
          const visited=new Set<string>();
          for(const h of r.match.hands) {
            const own=h.startScore[team],other=h.startScore[1-team], band=Math.floor(own/10)+"/"+Math.floor(other/10);
            if(!visited.has(band)) {
              visited.add(band);
              const cell=bands[band]??={matches:0,wins:0,scorePriorSum:0};
              cell.matches++; cell.wins+=Number(r.match.winner===team);
              // Descriptive score-only reference. Continuation-model calibration is measured separately in package 08.
              cell.scorePriorSum+=(40-other)/(80-own-other);
            }
            for(const t of h.turns) for(const c of t.awards) {
              const a=awards[c.motivo]??={won:0,conceded:0};
              if(c.equipo===team) a.won+=c.tantos; else a.conceded+=c.tantos;
            }
          }
        }
        files.push({path:file,sha256:sha(data)});
      }
      summaries.push({id:f.id,pairs});
    }
  } finally {await service.close();}
  const stats=summarize(summaries,incumbent.id+"/fixed");
  assert.ok(latency.length);
  latency.sort((a,b)=>a-b);
  const pct=(p:number)=>latency[Math.ceil(latency.length*p)-1]/1000;
  const fallbackRate=Object.values(fallbacks).reduce((a,b)=>a+b,0)/latency.length;
  const report={format:field.format,planSha256:planHash,matchCount:4*plan.pairs*summaries.length,
    field:stats,latencyMs:{p50:pct(.5),p95:pct(.95),p99:pct(.99)},decisions:latency.length,fallbackRate,fallbacks,
    awards,scoreBands:bands,receiptSha256:sha(json(files)),result:decision(stats,fallbackRate,field.fallbackLimit)};
  const manifest=join(output,"manifest.json");
  if(!verifyOnly && !existsSync(manifest)) publish(manifest,json({schema:"chico-championship-result-v1",report,files,
    elapsedMs:Math.round(performance.now()-start),runtime:{node:process.version,cpu:cpus()[0].model,arch:arch(),system:release(),memory:totalmem()}})+"\n");
  const saved=read(manifest); assert.deepEqual(saved.files,files);assert.deepEqual(saved.report,report);
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {positionals:[cmd],values}=parseArgs({allowPositionals:true,options:{bundle:{type:"string"},plan:{type:"string"},output:{type:"string"}}});
  if(cmd==="register" && values.bundle && values.output) console.log(json(await register(values.bundle,values.output)));
  else if((cmd==="run"||cmd==="verify") && values.plan && values.output) console.log(json(await championship(dirname(resolve(values.plan)),values.output,cmd==="verify")));
  else throw Error("register --bundle bundle.json --output plan-dir | run|verify --plan plan.json --output results-dir");
}
