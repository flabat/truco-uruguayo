import assert from "node:assert/strict";
import {appendFileSync, existsSync, mkdirSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {artifactPin} from "../../api/actor-registry.ts";
import {playMatch} from "../arena/index.ts";
import {dealSeed,read,save} from "../anchored/io.ts";
import {silence} from "../anchored/matches.ts";
import {openTrainingTeam as open} from "./train.ts";
import type {CycleFormat} from "../anchored/actor.ts";
import {baseline,styles} from "../baselines/index.ts";
import {requireTrainingFormat, type Format, type Policy} from "../contracts/index.ts";
import {summarize,type PairOutcome} from "../eval/statistics.ts";
import {incumbent} from "../seat/index.ts";
import type {Asiento} from "../../src/motor/reparto.ts";

type Model = {format:Format;kind?:string};
type Team = readonly Policy[];
interface Fixture {id:string; opponent:Team; mate?:Team; silent?:boolean}
const load=(p:string):Model => JSON.parse(readFileSync(p,"utf8"));
const team=(name:string):Team => Array(4).fill(baseline(name));
function play(format:CycleFormat, model:Team, fixture:Fixture, seed:number,pair:number) {
  let signalsSent=0;
  const wins:[number,number]=[0,0];
  for(const leg of [0,1] as const) {
    const game=playMatch({format,seed,pair,leg,policies(seat:Asiento) {
      const onTeam=seat%2===leg;
      const other = fixture.mate && Math.floor(seat/2)===pair%2;
      const actor=onTeam ? (other?fixture.mate!:model)[seat] : fixture.opponent[seat];
      return fixture.silent?silence(actor):actor;
    },onDecision:format==="pairs-private-senas"?d=>{
      if(d.seat%2===leg && d.action.includes("/")) signalsSent++;
    }:undefined});
    wins[leg]=Number(game.winner===leg);
  }
  return {wins,signalsSent};
}
export function qualifies(result:ReturnType<typeof summarize>, directBound:number, familyBound:number) {
  return result.direct.lower>directBound && result.families.every(f=>f.delta.lower>familyBound);
}
export function evaluate(root:string,format:Format,label:string) {
  requireTrainingFormat(format);
  assert(label==="final" || /^[1-9][0-9]*$/.test(label),"Expected epoch number or final");
  const protocol=read(join(root,"protocol.json")), final=label==="final";
  assert(protocol.computerOnly===true && protocol.signals==="senas-equipo-v1");
  const dir=join(root,format), stage=join(dir,"assessments",label), evidence=join(root,"evaluation-input",format);
  const file=join(dir,"eval-"+label+".json");
  if(existsSync(file)) return read(file);
  mkdirSync(stage,{recursive:true});
  function event(message:string,fields:Record<string,unknown>={}) {
    appendFileSync(join(root,"events","eval-"+format+".jsonl"),JSON.stringify({ts:new Date().toISOString(),stage:final?"final evaluation":"checkpoint evaluation",
      epoch:final?"final":Number(label),status:"running",message,...fields})+"\n");
  }
  // A retry uses exactly the same benchmark even if the previous attempt updated the champion.
  const refFile=join(stage,"reference.json");
  if(!existsSync(refFile)) save(refFile,load(final?join(root,"input",format,"champion-at-start.json"):join(dir,"champion.json")));
  const ref=load(refFile), reference=open(ref,format), refPin=artifactPin(ref);
  const candidates=new Map<string,Model>();
  const add=(path:string)=>{
    if(existsSync(path)) {
      const m=load(path), pin=artifactPin(m);
      assert.equal(m.format,format);
      if(pin!==refPin) candidates.set(pin,m);
    }
  };
  add(join(dir,"a","candidate.json"));add(join(dir,"b","candidate.json"));
  // Keep a small, reproducible shortlist, including the strongest archived research champion.
  if(final) {
    add(join(dir,"champion.json"));
    for(const k of [3,6,9,12,15,18]) add(join(dir,"assessments",String(k),"selected.json"));
  }
  assert(candidates.size>0,"No distinct trained challenger available");
  const selection=join(stage,"screen.json");
  if(!existsSync(selection)) {
    const rows=[];
    const fixtures:Fixture[]=[{id:"champion",opponent:reference},...["caller","strong-cards","frequent-bluff","folder"].map(id=>({id,opponent:team(id)}))];
    const seed=dealSeed(protocol.seed,format,"screen",label);
    for(const [pin,model] of candidates) {
      const tested=open(model,format);
      const scores=fixtures.map(f=>{
        let wins=0;
        for(let i=0;i<protocol.screeningPairs;i++) {
          const row=play(format,tested,f,seed,i).wins;
          wins+=row[0]+row[1];
        }
        return wins;
      });
      rows.push({pin,scores,total:scores.reduce((a,b)=>a+b,0)});
    }
    rows.sort((a,b)=>b.total-a.total || a.pin.localeCompare(b.pin));
    save(join(stage,"selected.json"),candidates.get(rows[0].pin));
    save(selection,{reference:refPin,seed,pairs:protocol.screeningPairs,rows});
  }
  const model=load(join(stage,"selected.json")), pin=artifactPin(model), tested=open(model,format);
  const screening=read(selection);
  assert.equal(screening.rows[0].pin,pin);assert.equal(screening.reference,refPin);
  const fixtures:Fixture[]=[{id:"champion",opponent:reference},{id:"V1",opponent:team(incumbent.id)}];
  for(const id of styles) fixtures.push({id,opponent:team(id)});
  fixtures.push({id:"independent",opponent:open(load(join(evidence,"independent.json")),format)});
  if(format==="duel") fixtures.push({id:"opening-falta",opponent:team("duel-direct-falta-35-v1")});
  const counterPaths=["a","b"].map(k=>join(dir,k,"counter.json")).filter(existsSync);
  assert(counterPaths.length,"Missing counter-trained opponent");
  const counterDir=join(stage,"counter.json");
  if(!existsSync(counterDir)) save(counterDir,load(counterPaths[(final?0:Number(label)-1)%counterPaths.length]));
  const counter=load(counterDir);
  fixtures.push({id:"trained-counter",opponent:open(counter,format)});
  if(format!=="duel") {
    const mate=open(load(join(evidence,"unfamiliar.json")),format);
    fixtures.push({id:"unfamiliar-teammate",opponent:reference,mate},{id:"strong-cards/unfamiliar",opponent:team("strong-cards"),mate});
    if(format==="pairs-private-senas") {
      const signalMate=open(load(join(evidence,"unfamiliar-signaler.json")),format);
      fixtures.push({id:"signaling-teammate",opponent:reference,mate:signalMate},
        {id:"signaling-teammate/masked",opponent:reference,mate:signalMate,silent:true});
    }
  }
  const n=final?protocol.finalPairs:protocol.epochPairs, seed=dealSeed(protocol.seed,format,"gate",label);
  const families=[], total=4*n*fixtures.length;
  let emitted=0;
  for(const [idx,f] of fixtures.entries()) {
    const receipt=join(stage,"family-"+idx+".json");
    if(!existsSync(receipt)) {
      const rows:PairOutcome[]=[]; let signalsSent=0;
      event("Playing paired 40-point games against "+f.id,{opponent:f.id,completed:idx*n*4,total,unit:"chicos"});
      for(let i=0;i<n;i++) {
        const a=play(format,tested,f,seed,i),b=play(format,reference,f,seed,i);
        rows.push({pair:i,candidate:a.wins,incumbent:b.wins});
        signalsSent+=a.signalsSent;
        if((i+1)%64===0) event("Replaying equal deals from both teams.",{opponent:f.id,completed:(idx*n+i+1)*4,total,unit:"chicos"});
      }
      save(receipt,{pin,refPin,seed,id:f.id,rows,signalsSent});
    }
    const saved=read(receipt);
    assert(saved.id===f.id && saved.seed===seed && saved.pin===pin && saved.refPin===refPin && saved.rows.length===n);
    families.push({id:f.id,pairs:saved.rows as PairOutcome[]});emitted+=saved.signalsSent;
  }
  const evaluation=summarize(families,"champion",final?protocol.finalResamples:protocol.epochResamples);
  const improved=qualifies(evaluation,protocol.directLowerBound,protocol.familyDeltaLowerBound);
  const worst=evaluation.families.reduce((a,b)=>b.delta.lower<a.delta.lower?b:a);
  const relative=(id:string)=>evaluation.families.find(f=>f.id===id);
  const report={format,epoch:final?"final":Number(label),finishedAt:new Date().toISOString(),games:total,seed,pin,reference:refPin,
    counter:artifactPin(counter),improved,evaluation,teamSignalsSent:emitted,
    screeningGames:screening.rows.length*5*protocol.screeningPairs*2,
    worst:worst.id,unfamiliarPartner:relative("unfamiliar-teammate")?.winRate??null,
    signalEffect:format==="pairs-private-senas"?pairedSignalEffect(families):null,
    role:final?"single confirmatory comparison against the starting research champion":"development gate against the current research champion"};
  if(!final && improved) save(join(dir,"champion.json"),model);
  if(final) save(join(dir,"final-candidate.json"),model);
  save(file,report);
  event(improved?"Candidate cleared the research gate.":"Candidate fell short of the research gate.",{status:final?"complete":(improved?"passed":"retained"),completed:total,total,unit:"chicos",games:total,
    metrics:{champion:(!final&&improved?pin:refPin).slice(0,12),winVsChampion:evaluation.direct.estimate,worst:worst.id,worstDelta:worst.delta.estimate,
      unfamiliarPartner:report.unfamiliarPartner,improved,privateSignalsSent:emitted}});
  return report;
}
function pairedSignalEffect(families:{id:string;pairs:PairOutcome[]}[]) {
  const on=families.find(f=>f.id==="signaling-teammate")!.pairs;
  const off=families.find(f=>f.id==="signaling-teammate/masked")!.pairs;
  const changes=on.map((x,i)=>(x.candidate[0]+x.candidate[1]-off[i].candidate[0]-off[i].candidate[1])/2);
  const estimate=changes.reduce((a,b)=>a+b)/changes.length;
  const radius=1.96*Math.sqrt(changes.reduce((a,b)=>a+(b-estimate)**2,0)/(changes.length*(changes.length-1)));
  return {estimate,lower:estimate-radius,upper:estimate+radius,scope:"exploratory paired 95% interval"};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,format,label]=process.argv.slice(2);
  requireTrainingFormat(format);
  evaluate(resolve(root),format,label);
}
