import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {artifactPin} from "../../api/actor-registry.ts";
import {playMatch} from "../arena/index.ts";
import {baseline} from "../baselines/index.ts";
import {dealSeed,read,save} from "../anchored/io.ts";
import type {Policy} from "../contracts/index.ts";
import {openTrainingTeam} from "./train.ts";
import {scaleDuelResidual, type SelfplayActor} from "./learner.ts";

interface Variant {anchor:string; cards:number; bets:number}
export function fitDuelWeights(root:string, out:string) {
  mkdirSync(out,{recursive:true});
  const input=join(root,"input","duel"), source:SelfplayActor=read(join(input,"archive","last-finalist.json"));
  const reference=read(join(input,"champion-at-start.json")), incumbent=openTrainingTeam(reference,"duel");
  const fixtures:Record<string,readonly Policy[]>={champion:incumbent};
  for(const name of ["strong-cards","frequent-bluff","caller","rare-bluff"]) fixtures[name]=Array(2).fill(baseline(name));
  const pins:Record<string,string>={source:artifactPin(source),incumbent:artifactPin(reference)};
  for(const name of ["older-candidate","last-counter","previous-anchored"]) {
    const actor=read(join(input,"archive",name+".json"));
    fixtures[name]=openTrainingTeam(actor,"duel"); pins[name]=artifactPin(actor);
  }
  const variants:Variant[]=[];
  for(const anchor of ["v1","pressure","balanced","falta-defense"])
    for(const cards of [0.15,0.55,1]) for(const bets of [0.15,0.45,0.75,1]) variants.push({anchor,cards,bets});
  const protocol=join(out,"protocol.json");
  const plan={pins,fixtures:Object.keys(fixtures),variants,trainPairs:128,selectionPairs:1536,auditPairs:1536,
    selection:"Require >=55% directly, penalize worst training-family deficit beyond 0.5pp, then maximize average wins. Carry eight finalists into selection; freeze winner before audit."};
  if(!existsSync(protocol)) writeFileSync(protocol,JSON.stringify({...plan,seed:randomBytes(24).toString("hex"),registeredAt:new Date().toISOString()})+"\n",{flag:"wx"});
  const {seed,registeredAt,...frozen}=read(protocol); assert.deepEqual(frozen,plan);
  function measure(team:readonly Policy[],stage:string,pairs:number) {
    const seedNumber=dealSeed(seed,"duel-calibration",stage);
    return Object.fromEntries(Object.entries(fixtures).map(([name,opponent])=>{
      let wins=0;
      for(let pair=0;pair<pairs;pair++) for(const leg of [0,1] as const) {
        const game=playMatch({format:"duel",seed:seedNumber,pair,leg,policies:seat=>seat%2===leg?team[seat]:opponent[seat]});
        wins+=Number(game.winner===leg);
      }
      return [name,wins/(2*pairs)];
    }));
  }
  function stage(name:string,specs:Variant[],pairs:number) {
    const file=join(out,name+".json");
    if(existsSync(file)) return read(file);
    const base=measure(incumbent,name,pairs);
    const rows=specs.map(spec=>{
      const actor=scaleDuelResidual(source,spec.anchor,spec.cards,spec.bets);
      const rates=measure(openTrainingTeam(actor,"duel"),name,pairs);
      const delta=Object.keys(rates).map(k=>rates[k]-base[k]);
      return {spec,pin:artifactPin(actor),rates,eligible:rates.champion>=0.55,
        floor:Math.min(0,...delta.map(d=>d+0.005)),average:delta.reduce((a,b)=>a+b,0)/delta.length};
    });
    rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.floor-a.floor||b.average-a.average||a.pin.localeCompare(b.pin));
    const result={pairs,base,rows};save(file,result);return result;
  }
  const train=stage("train",variants,plan.trainPairs);
  const selection=stage("selection",train.rows.slice(0,8).map((r:{spec:Variant})=>r.spec),plan.selectionPairs);
  const best=selection.rows[0], v:Variant=best.spec;
  const actor=scaleDuelResidual(source,v.anchor,v.cards,v.bets);
  assert.equal(artifactPin(actor),best.pin);save(join(out,"candidate.json"),actor);
  stage("audit",[v],plan.auditPairs);
  return best.pin;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,out]=process.argv.slice(2); assert(root && out,"calibrate-duel.ts LEAGUE OUTPUT");
  console.log(fitDuelWeights(resolve(root),resolve(out)));
}
