import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { playMatch } from "../arena/index.ts";
import { versions, type Format, type Policy } from "../contracts/index.ts";
import { coordinates, duelActorId, duelSchema, loadDuelActor, width, type DuelExport } from "../duel/actor.ts";
import { incumbent } from "../seat/index.ts";
import { main as trainPartners } from "../partners/cli.ts";
import { domainSeed, digest, monteCarloId, recurrentId } from "../partners/policy.ts";
import { interval, json, loadTeam, pairOutcomes, rate, save, sha } from "./development.ts";

interface CounterState {
  schema: "duel-mc-counter-v1"; target: string; seed:number; completed:number; decisions:number; buckets:number;
  cells: Record<string, {sum:number[]; count:number[]; prior:number[]; baseSum?:number; baseCount?:number}>;
}
type CounterFamily = "duel-mc" | typeof monteCarloId | typeof recurrentId;

export function counterFamily(format: Format, path: string): CounterFamily {
  const actor = json(path);
  if (actor.format !== format) throw Error("El formato del contrajugador no coincide.");
  if (format === "duel" && actor.schema === duelSchema) return "duel-mc";
  if (format !== "duel" && (actor.kind === monteCarloId || actor.kind === recurrentId)) return actor.kind;
  throw Error("Familia desconocida en el actor de respuesta.");
}

export function selectResponse(format: Format, responses: {path:string; outcomes:number[]}[]) {
  return responses.map(({path,outcomes}) => ({
    file:basename(path), family:counterFamily(format,path), sha256:sha(path),
    winRate:rate(outcomes), interval:interval(outcomes), outcomes,
  })).sort((a,b) => b.winRate - a.winRate);
}

export function verifyCounterFamily(format: Format, path: string, receipt: {
  chosen:string; chosenFamily:CounterFamily; trainingStateSchema:string;
}) {
  const family = counterFamily(format,path);
  const schema = format === "duel" ? "duel-mc-counter-v1" : versions.checkpoint;
  if (receipt.chosen !== sha(path) || receipt.chosenFamily !== family || receipt.trainingStateSchema !== schema) {
    throw Error("El actor o la familia no coincide con el recibo de entrenamiento.");
  }
  return family;
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
  if (!Number.isSafeInteger(matches) || matches < 1 || state.completed > matches) {
    throw Error("El presupuesto no puede retroceder el checkpoint del contrajugador.");
  }
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
      if(slot===fallback){row.baseSum=(row.baseSum??0)+reward;row.baseCount=(row.baseCount??0)+1;}
    }
    state.completed++;
    if(state.completed%checkpointEvery===0||state.completed===matches)save(checkpoint,state);
  }
  const average=Object.fromEntries(Object.entries(state.cells).map(([bucket,row])=>
    [bucket,row.count.map((n,s)=>n?strengths(row,s):0)]));
  const artifact:DuelExport={schema:duelSchema,actor:versions.actor,observation:versions.observation,actions:versions.actions,
    rules:versions.rules,format:"duel",buckets:state.buckets,id:duelActorId(state.buckets,average),average};
  const dense=join(out,"mc-dense.json");save(dense,artifact);
  const conservative:Record<string,number[]>={};
  for(const [key,row] of Object.entries(state.cells)){
    const base=(row.baseSum??0)/((row.baseCount??0)+1);
    const sorted=row.count.map((n,slot)=>({slot,n,value:row.sum[slot]/(n+1)-base-1.28/Math.sqrt(n||1)}))
      .filter(a=>a.n>=8&&a.value>0).sort((a,b)=>b.value-a.value);
    if(sorted.length){const weights=zeros();weights[sorted[0].slot]=1;conservative[key]=weights;}
  }
  const sparse=join(out,"mc-sparse.json");
  save(sparse,{...artifact,id:duelActorId(state.buckets,conservative),average:conservative});
  return [dense,...(Object.keys(conservative).length?[sparse]:[])];
}
export async function trainCounter(format:"duel"|"pairs"|"pairs-senas",target:string,out:string,seed:number,
    configFile:string,matches:number) {
  let paths:string[];
  let checkpoint:string;
  let against:string;
  let trainingStateSchema:string;
  let completedMatches:number;
  if(format==="duel"){
    paths=duelCounter(target,out,seed,matches);
    checkpoint=join(out,"counter-state.json");
    const state = json(checkpoint);
    against=state.target; trainingStateSchema=state.schema; completedMatches=state.completed;
  }else{
    checkpoint=join(out,"checkpoint");
    const args=existsSync(checkpoint)?["--resume",checkpoint]:["--format",format,"--config",configFile,"--run",out,"--seed",String(seed)];
    await trainPartners([...args,"--opponent",target,"--matches",String(matches)]);
    const state=json(checkpoint).state;
    if(digest(state.opponent)!==digest(json(target))||state.seed!==seed||state.completed!==matches)throw Error("El checkpoint no confirma el rival.");
    against=sha(target); trainingStateSchema=state.schema; completedMatches=state.completed; paths=[join(out,"mc-actor.json"),join(out,"actor.json")];
  }
  if(against!==sha(target))throw Error("El contrajugador se entrenó contra otro actor.");
  const selectionSeed=domainSeed(seed,"counter-response-selection-v1");
  const champion=loadTeam(format,target);
  const selection = selectResponse(format, paths.map(path => ({
    path, outcomes:pairOutcomes(format,loadTeam(format,path),champion,48,selectionSeed).results,
  })));
  const winner = selection[0];
  const receipt = {format,trainingSeed:seed,completedMatches,trainingStateSchema,
    trainedAgainstSha256:against,storedOpponentContent:format==="duel"?null:digest(json(checkpoint).state.opponent),
    checkpointSha256:sha(checkpoint),selectionSeed,selectionPairs:48,selection,
    selectionRule:"Maximum mean response win rate on 48 common seat-swapped development pairs against the frozen candidate. Stable input order breaks ties.",
    chosen:winner.sha256,chosenFamily:winner.family};
  const selectedPath = join(out,winner.file);
  verifyCounterFamily(format,selectedPath,receipt);
  save(join(out,"training-receipt.json"),receipt);
  return selectedPath;
}
