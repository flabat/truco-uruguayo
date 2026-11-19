import { existsSync } from "node:fs";
import { join } from "node:path";
import { playMatch } from "../arena/index.ts";
import { versions, type Policy } from "../contracts/index.ts";
import { coordinates, duelActorId, duelSchema, loadDuelActor, width, type DuelExport } from "../duel/actor.ts";
import { incumbent } from "../seat/index.ts";
import { main as trainPartners } from "../partners/cli.ts";
import { json, save, sha } from "./development.ts";

interface CounterState {
  schema: "duel-mc-counter-v1"; target: string; seed:number; completed:number; decisions:number; buckets:number;
  cells: Record<string, {sum:number[]; count:number[]; prior:number[]}>;
}
const zeros=()=>Array(width).fill(0) as number[];
function strengths(row:CounterState["cells"][string], slot:number) {
  // Beta-style shrinkage of completed-match team returns; prior is the incumbent's
  // frequency at visits to this bucket. Neither entry has referee-only features.
  const prior=(row.prior[slot]+1)/(row.count[slot]+12);
  return Math.exp(3*row.sum[slot]/(row.count[slot]+12))*Math.min(4,Math.max(.05,prior));
}
function duelCounter(path:string,out:string,seed:number,matches:number) {
  const opponent=loadDuelActor(path),target=sha(path),checkpoint=join(out,"counter-state.json");
  const state:CounterState=existsSync(checkpoint) ? json(checkpoint) : {schema:"duel-mc-counter-v1",target,seed,
    completed:0,decisions:0,buckets:256,cells:{}};
  if(state.target!==target||state.seed!==seed||state.schema!=="duel-mc-counter-v1")throw Error("Otro rival o linaje en el checkpoint.");
  const learner:Policy={id:"counter-mc-training",decide(obs,legal){
    const {bucket,slots}=coordinates(obs,legal,state.buckets), row=state.cells[bucket];
    const old=incumbent.decide(obs,legal),w=slots.map((slot,i)=>row?strengths(row,slot):old[i]);
    const sum=w.reduce((a,b)=>a+b,0);
    return w.map((v,i)=>.45*old[i]+.45*v/sum+.1/w.length);
  }};
  const checkpointEvery=64;
  while(state.completed<matches){
    const index=state.completed, side=index%2, visits:{bucket:string;slot:number;fallback:number}[]=[];
    const result=playMatch({format:"duel",seed,pair:index,leg:0,policies:s=>s===side?learner:opponent,
      onDecision(d){
        if(d.seat!==side)return;
        const legal=d.observation.legalActions, {bucket,slots}=coordinates(d.observation,legal,state.buckets);
        const old=incumbent.decide(d.observation,legal);
        visits.push({bucket,slot:slots[legal.indexOf(d.action)],fallback:slots[old.indexOf(1)]});
      }});
    const reward=result.winner===side?1:-1;
    for(const {bucket,slot,fallback} of visits){
      const row=state.cells[bucket]??= {sum:zeros(),count:zeros(),prior:zeros()};
      row.sum[slot]+=reward;row.count[slot]++;row.prior[fallback]++;state.decisions++;
    }
    state.completed++;
    if(state.completed%checkpointEvery===0||state.completed===matches)save(checkpoint,state);
  }
  const average=Object.fromEntries(Object.entries(state.cells).map(([bucket,row])=>
    [bucket,row.count.map((n,s)=>n?strengths(row,s):0)]));
  const artifact:DuelExport={schema:duelSchema,actor:versions.actor,observation:versions.observation,actions:versions.actions,
    rules:versions.rules,format:"duel",buckets:state.buckets,id:duelActorId(state.buckets,average),average};
  const result=join(out,"counter.json");save(result,artifact);return result;
}
export async function trainCounter(format:"duel"|"pairs"|"pairs-senas",target:string,out:string,seed:number,
    configFile:string,matches:number) {
  if(format==="duel")return duelCounter(target,out,seed,matches);
  const checkpoint=join(out,"checkpoint");
  const args=existsSync(checkpoint)?["--resume",checkpoint]:["--format",format,"--config",configFile,"--run",out,"--seed",String(seed)];
  await trainPartners([...args,"--opponent",target,"--matches",String(matches)]);
  return join(out,"mc-actor.json");
}
