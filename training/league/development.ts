import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { crearAzar, type Asiento } from "@eltruco/motor/reparto.ts";
import { playMatch } from "../arena/index.ts";
import { baseline, styles } from "../baselines/index.ts";
import { formats, type Format, type Policy } from "../contracts/index.ts";
import { loadDuelActor } from "../duel/actor.ts";
import { openActor } from "../../api/actor-registry.ts";
import { loadPartnerPolicy } from "../partners/policy.ts";
import { incumbent } from "../seat/index.ts";

export const trainingSeeds = [71039,72043,73061];
export const field = [incumbent.id, ...styles];
const developmentSeed = 18890627;
export type Team = (seat: Asiento) => Policy;
export const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
export const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export function save(path: string, data: unknown) {
  mkdirSync(dirname(path), {recursive:true});
  const temp = path + "." + process.pid + ".tmp";
  writeFileSync(temp, JSON.stringify(data)+"\n",{flush:true});
  renameSync(temp,path);
}
/** Cualquier actor de duelo del registro (Ceibo, regularizado) o una exportación Monte Carlo. */
export function loadDuelPolicy(path: string): Policy {
  const data = json(path);
  return data && typeof data === "object" && "kind" in data ? openActor(data, "duel", 0) : loadDuelActor(path);
}
export function loadTeam(format: Format, path: string): Team {
  if (format === "duel") {
    const actor = loadDuelPolicy(path);
    return () => actor;
  }
  const data = json(path);
  if (data.format !== format) throw Error("El artefacto pertenece a otro formato.");
  const policies = ([0,1,2,3] as const).map(seat => loadPartnerPolicy(data,seat));
  return seat => policies[seat];
}
export function rate(values: readonly number[]) { return values.reduce((a,b) => a+b,0)/values.length; }
export function interval(values: readonly number[]) {
  const rng = crearAzar(392481);
  const means = [];
  for (let b=0; b<2000; b++) {
    let sum=0; for (let i=0;i<values.length;i++) sum+=values[Math.floor(rng()*values.length)];
    means.push(sum/values.length);
  }
  means.sort((a,b)=>a-b);
  return {mean:rate(values),lower:means[49],upper:means[1949]};
}
function stageActor(run:string, stage:string, format:Format, seed:number) {
  const path=stage==="early" ? join(run,format,String(seed),"profile-frozen.json")
    : join(run,"snapshots",stage,format,String(seed),"actor.json");
  const expected=stage==="early" ? json(join(run,"profile-"+format+".json")).samples.find((s:{seed:number})=>s.seed===seed)?.actor
    : json(join(run,"snapshots",stage,"index.json")).find((s:{file:string})=>resolve(run,s.file)===resolve(path))?.sha256;
  if(!expected||sha(path)!==expected)throw Error("El actor no coincide con la etapa congelada.");
  return path;
}
interface Player { id:string; team:Team; sha256?:string }
export interface Matchup { left:string; right:string; pairs: number[]; pairSeconds?:number[]; interval:ReturnType<typeof interval> }
interface Report {
  kind:string; format:Format; stage:string; seed:number; budget:number;
  artifacts:{id:string;sha256?:string}[]; edges:Matchup[];
  durationSeconds?:number; actorLatencyMs:Record<string,{samples:number;p50:number;p95:number;p99:number}>;
}
export function pairOutcomes(format:Format, a:Team,b:Team, pairs:number, seed=developmentSeed) {
  const results=[], times=[];
  for (let pair=0;pair<pairs;pair++) {
    const start=performance.now();
    let wins=0;
    for (const leg of [0,1] as const) {
      const match=playMatch({format,seed,pair,leg,
        policies:seat=>(seat%2===leg?a:b)(seat)});
      wins+=Number(match.winner===leg);
    }
    results.push(wins/2);times.push((performance.now()-start)/1000);
  }
  return {results,times};
}
export function matrix(run:string, stage:string, format:Format, budget:number) {
  const begin=performance.now();
  const players:Player[]=trainingSeeds.map(seed=>{
    const path=stageActor(run,stage,format,seed);
    return {id:String(seed),team:loadTeam(format,path),sha256:sha(path)};
  });
  players.push(...field.map(id=>({id,team:()=>baseline(id)})));
  const edges:Matchup[]=[];
  const timings=new Map<string,number[]>();
  for (const player of players) {
    const samples:number[]=[];
    const build=player.team;
    const count= format==="duel" ? 2 : 4;
    const seats=Array.from({length:count},(_,i)=>{
      const actor=build(i as Asiento);
      return {id:actor.id,decide(obs,legal){
        const start=performance.now(), response=actor.decide(obs,legal);
        if(samples.length<50_000) samples.push(performance.now()-start);
        return response;
      }} satisfies Policy;
    });
    player.team=seat=>seats[seat]; timings.set(player.id,samples);
  }
  for (const [i,left] of players.entries()) for (const right of players.slice(i+1)) {
    const {results:pairs,times}=pairOutcomes(format,left.team,right.team,budget);
    edges.push({left:left.id,right:right.id,pairs,pairSeconds:times,interval:interval(pairs)});
  }
  const actorLatencyMs:Report["actorLatencyMs"]={};
  for (const [id,samples] of timings) {
    samples.sort((a,b)=>a-b);
    const q=(p:number)=>samples[Math.floor((samples.length-1)*p)];
    actorLatencyMs[id]={samples:samples.length,p50:q(.5),p95:q(.95),p99:q(.99)};
  }
  const report:Report={kind:"development-round-robin-v1",format,stage,seed:developmentSeed,budget,
    artifacts:players.map(({id,sha256})=>({id,sha256})),edges,actorLatencyMs,durationSeconds:(performance.now()-begin)/1000};
  return report;
}
export function outcomes(report:Report,id:string) {
  return Array.from({length:report.budget},(_,p)=>rate(field.map(opponent=>{
    const edge=report.edges.find(m=>m.left===id&&m.right===opponent||m.right===id&&m.left===opponent);
    if(!edge) throw Error("Falta un emparejamiento requerido.");
    return edge.left===id?edge.pairs[p]:1-edge.pairs[p];
  })));
}
export function learningCurve(early:Report,profile:Report,pilot:Report) {
  if([early,profile].some(r=>r.budget!==pilot.budget||r.seed!==pilot.seed||r.format!==pilot.format)) {
    throw Error("Las curvas requieren los mismos repartos y formato.");
  }
  const curves=trainingSeeds.map(seed=>{
    const points=[early,profile,pilot].map(r=>outcomes(r,String(seed)));
    return {seed,means:points.map(rate),fromEarly:interval(points[2].map((v,i)=>v-points[0][i])),
      fromProfile:interval(points[2].map((v,i)=>v-points[1][i]))};
  });
  // Resample complete deal pairs after equal weighting of prespecified seeds and opponents.
  const differences=(base:Report)=>Array.from({length:pilot.budget},(_,i)=>rate(trainingSeeds.map(s=>
    outcomes(pilot,String(s))[i]-outcomes(base,String(s))[i])));
  const earlyDelta=interval(differences(early)), recentDelta=interval(differences(profile));
  const median=curves.map(c=>c.fromProfile.mean).sort((a,b)=>a-b)[1];
  return {format:pilot.format,curves,earlyDelta,recentDelta,
    extendOvernight:earlyDelta.lower>0&&recentDelta.lower>0&&median>0,
    order:curves.sort((a,b)=>b.means[2]-a.means[2]||a.seed-b.seed).map(c=>c.seed)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {values}=parseArgs({options:{run:{type:"string"},stage:{type:"string"},format:{type:"string"},pairs:{type:"string"}}});
  if(!values.run||!values.stage||!["early","profile","pilot","overnight"].includes(values.stage)
      ||!formats.includes(values.format as Format)) throw Error("Usá --run, --stage y --format.");
  const format=values.format as Format,budget=Number(values.pairs??48);
  if(!Number.isSafeInteger(budget)||budget<2)throw Error("Presupuesto inválido.");
  const path=join(values.run,"development",format,values.stage+".json");
  if(existsSync(path))throw Error("Ya existe la matriz congelada de esta etapa.");
  save(path,matrix(values.run,values.stage,format,budget));
}
