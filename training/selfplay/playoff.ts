import assert from "node:assert/strict";
import {existsSync, mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {artifactPin} from "../../api/actor-registry.ts";
import {playMatch} from "../arena/index.ts";
import {dealSeed,read,save} from "../anchored/io.ts";
import type {CycleFormat} from "../anchored/actor.ts";
import {requireTrainingFormat} from "../contracts/index.ts";
import {openTrainingTeam} from "./train.ts";

interface Plan {schema:string;seed:string;pairs:number;familyError:number;maxFormats:number}

// Every sample is the average of a pair of correlated opposite-seat games.
// Hoeffding's lower bound uses the number of independent deals, never legs.
export function playoffResult(plan:Plan, rows:number[]) {
  assert(plan.schema==="qualified-playoff-v1" && typeof plan.seed==="string" && plan.seed.length>=16);
  assert(Number.isSafeInteger(plan.pairs) && plan.pairs>=2 && rows.length===plan.pairs);
  assert(plan.familyError>0 && plan.familyError<=0.01 && plan.maxFormats===3);
  assert(rows.every(w=>w===0||w===1||w===2));
  const estimate=rows.reduce((sum,n)=>sum+n,0)/(2*plan.pairs);
  const lower=Math.max(0,estimate-Math.sqrt(Math.log(plan.maxFormats/plan.familyError)/(2*plan.pairs)));
  return {estimate,lower,preferSupplement:lower>0.5};
}
export function verifyPlayoff(root:string,format:CycleFormat,primary:string,supplement:string) {
  const plan=read(join(root,"plan.json")), receipt=read(join(root,format+".json"));
  assert(receipt.format===format && receipt.primary===primary && receipt.supplement===supplement);
  assert.equal(receipt.seed,dealSeed(plan.seed,format,"head-to-head"));
  const result=playoffResult(plan,receipt.rows);
  assert.deepEqual(result,receipt.result);
  return result;
}
export function playOff(primaryRoot:string,extraRoot:string,root:string,format:CycleFormat) {
  const a=read(join(primaryRoot,format,"eval-final.json")), b=read(join(extraRoot,format,"eval-final.json"));
  assert(a.format===format && b.format===format && a.epoch==="final" && b.epoch==="final" && a.reference===b.reference);
  if (!a.improved || !b.improved || a.pin===b.pin) return null;
  mkdirSync(root,{recursive:true});
  const plan=read(join(root,"plan.json")), seed=dealSeed(plan.seed,format,"head-to-head");
  const file=join(root,format+".json");
  if(existsSync(file)) return verifyPlayoff(root,format,a.pin,b.pin);
  const primary=read(join(primaryRoot,format,"final-candidate.json")), other=read(join(extraRoot,format,"final-candidate.json"));
  assert.equal(artifactPin(primary),a.pin);assert.equal(artifactPin(other),b.pin);
  const main=openTrainingTeam(primary,format), challenger=openTrainingTeam(other,format);
  const rows:number[]=[];
  for(let pair=0;pair<plan.pairs;pair++) {
    let wins=0;
    for(const leg of [0,1] as const) {
      const game=playMatch({format,seed,pair,leg,policies:seat=>seat%2===leg?challenger[seat]:main[seat]});
      wins+=Number(game.winner===leg);
    }
    rows.push(wins);
  }
  const result=playoffResult(plan,rows);
  save(file,{format,seed,primary:a.pin,supplement:b.pin,reference:a.reference,rows,result});
  return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [primary,extra,root,format]=process.argv.slice(2);
  requireTrainingFormat(format);
  console.log(playOff(resolve(primary),resolve(extra),resolve(root),format));
}
