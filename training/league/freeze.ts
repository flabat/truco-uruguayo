import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { formats, type Format } from "../contracts/index.ts";
import { digest, loadPartnerPolicy } from "../partners/policy.ts";
import { trainCounter, verifyCounterFamily } from "./counters.ts";
import { field, json, learningCurve, outcomes, rate, save, sha, trainingSeeds, type Matchup } from "./development.ts";

function artifact(dir:string, source:string, name:string, fmt:Format, seed:number, label:string) {
  const path=join(dir,name+".json");
  if(existsSync(path)){
    if(sha(path)!==sha(source))throw Error("Ya existe otro artefacto fijado.");
  }else copyFileSync(source,path);
  const data=json(path);
  return {id:label+"-"+fmt+"-"+seed,kind:fmt==="duel"?"duel":"partners",lineage:label+"-"+fmt+"-"+seed,
    file:relative(dir,path),sha256:sha(path),actorId:fmt==="duel"?data.id:loadPartnerPolicy(data,0).id,
    contentSha256:digest(data),trainingSeed:seed};
}
const variance=(x:number[])=>{const mean=rate(x);return x.reduce((s,n)=>s+(n-mean)**2,0)/(x.length-1);};

export function sampleBudget(edges:Matchup[],candidate:string,seconds=1800,families=9) {
  const series=edges.filter(e=>(e.left===candidate&&field.includes(e.right))||(e.right===candidate&&field.includes(e.left)));
  const times=series.flatMap(e=>e.pairSeconds??[]).sort((a,b)=>a-b);
  if(!times.length)throw Error("Se necesitan tiempos observados del perfil.");
  const pairSeconds=times[Math.floor(.95*(times.length-1))];
  // Four games per family (candidate and incumbent); development times measured two.
  // A two-fold cost allowance reserves time for in-service dispatch, IO and verification.
  const affordable=Math.max(2,Math.floor(seconds/(4*families*pairSeconds)));
  const vectors=series.map(e=>{
    const other=e.left===candidate?e.right:e.left;
    const actual=e.left===candidate?e.pairs:e.pairs.map(v=>1-v);
    if(other===field[0])return actual;
    const old=edges.find(r=>r.left===field[0]&&r.right===other||r.right===field[0]&&r.left===other);
    if(!old)throw Error("Falta el incumbente en la matriz.");
    return actual.map((v,i)=>v-(old.left===field[0]?old.pairs[i]:1-old.pairs[i]));
  });
  const pairVariance=Math.max(...vectors.map(variance));
  // 3.0 approximates a two-sided normal critical value after correcting nine families.
  const critical=3.0, powerZ=.842, desiredEffect=.04;
  const powered=Math.max(2,Math.ceil(pairVariance*((critical+powerZ)/desiredEffect)**2));
  const pairs=Math.min(affordable,powered);
  return {seconds,families,variancePilot:pairVariance,p95TwoLegSeconds:pairSeconds,
    desiredEffect,normalCritical:critical,powerZ,affordable,powered,pairs,
    minimumDetectableChange:Math.sqrt(pairVariance/pairs)*(critical+powerZ),
    scope:"development estimate; service build may reduce budget before opening final draw"};
}
export async function freezeBundle(run:string, fmt:Format, stage:"pilot"|"overnight", counterMatches:number,registryPath?:string) {
  const reports=join(run,"development",fmt), read=(s:string)=>json(join(reports,s+".json"));
  const early=read("early"),profile=read("profile"),pilot=read("pilot");
  const curve=learningCurve(early,profile,pilot);
  save(join(reports,"pilot-decision.json"),curve);
  if(stage==="pilot"&&curve.extendOvernight)throw Error("Este formato mostró progreso; congelar después de la corrida nocturna.");
  const final=stage==="pilot"?pilot:read("overnight");
  const order=trainingSeeds.map(seed=>({seed,winRate:rate(outcomes(final,String(seed)))}))
    .sort((a,b)=>b.winRate-a.winRate||a.seed-b.seed).map(s=>s.seed);
  const bundle=join(run,"championship-input",fmt);
  mkdirSync(bundle,{recursive:true});
  const actor=(seed:number)=>join(run,"snapshots",stage,fmt,String(seed),"actor.json");
  const candidate=artifact(bundle,actor(order[0]),"candidate",fmt,order[0],"league");
  const independent=artifact(bundle,actor(order[1]),"independent",fmt,order[1],"league");
  const partner=fmt==="duel"?undefined:artifact(bundle,actor(order[2]),"partner",fmt,order[2],"league");
  if(new Set([candidate.sha256,independent.sha256,...(partner?[partner.sha256]:[])]).size!==(partner?3:2)) {
    throw Error("Faltan distintos checkpoints independientes para el campeonato.");
  }
  const seed=923711+formats.indexOf(fmt);
  const path=await trainCounter(fmt,join(bundle,candidate.file),join(bundle,"counter-training"),seed,
    join(run,fmt,"config.json"),counterMatches);
  const receiptPath=join(bundle,"counter-training","training-receipt.json");
  const receipt=json(receiptPath);
  if(receipt.trainingSeed!==seed||receipt.completedMatches!==counterMatches||receipt.trainedAgainstSha256!==candidate.sha256) {
    throw Error("El entrenamiento no corresponde al campeón congelado y su presupuesto.");
  }
  const family=verifyCounterFamily(fmt,path,receipt);
  const counter={...artifact(bundle,path,"counter",fmt,seed,"targeted-"+family),family,trainedAgainstSha256:candidate.sha256,
    matches:counterMatches,trainingReceipt:"counter-training/training-receipt.json",
    trainingReceiptSha256:sha(receiptPath)};
  const registryPaths=registryPath?[resolve(registryPath)]:[resolve("api/actor-registry.ts")];
  if(registryPath&&!existsSync(registryPaths[0]))throw Error("No se encontró el registro solicitado.");
  const pins:Record<string,string>={};
  if(existsSync(registryPaths[0])){
    const {openActor,artifactPin}=await import(pathToFileURL(registryPaths[0]).href);
    for(const entry of [candidate,independent,counter,...(partner?[partner]:[])]){
      const object=json(join(bundle,entry.file));
      for(const seat of (fmt==="duel"?[0,1]:[0,1,2,3]))openActor(object,fmt,seat);
      pins[entry.id]=artifactPin(object);
    }
    if(new Set(Object.values(pins)).size!==Object.keys(pins).length)throw Error("Dos linajes comparten el mismo pin de servicio.");
  }
  save(join(bundle,"bundle.json"),{schema:"league-championship-input-v1",format:fmt,stage,
    candidate,independent,partner,counter,registryPins:pins,trainingSeeds,development:{seed:final.seed,pairsPerEdge:final.budget,
      report:relative(bundle,join(reports,stage+".json")),sha256:sha(join(reports,stage+".json")),curve},
    suggestedFinalBudget:sampleBudget(profile.edges,String(order[0])),production:false,
    provenance:{training:json(join(run,"plan.json")).revision,development:"public seed 18890627, separate from indexed training streams",
      counter:"independent seed; fixed candidate in the opponent seats; only terminal team return",
      championship:"sealed deals generated only by the independent evaluator"}});
  return join(bundle,"bundle.json");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {values:v}=parseArgs({options:{run:{type:"string"},format:{type:"string"},stage:{type:"string"},
   counterMatches:{type:"string"},registry:{type:"string"},"decision-only":{type:"boolean"}}});
 if(!v.run||!formats.includes(v.format as Format)||!["pilot","overnight"].includes(v.stage??""))throw Error("Argumentos inválidos.");
 const matches=Number(v.counterMatches??1024);
 if(!Number.isSafeInteger(matches)||matches<2)throw Error("Presupuesto de contraestrategia inválido.");
 if(v["decision-only"]){
   const dir=join(v.run,"development",v.format!);
   const curve=learningCurve(...(["early","profile","pilot"].map(stage=>json(join(dir,stage+".json"))) as
      [Parameters<typeof learningCurve>[0], Parameters<typeof learningCurve>[1], Parameters<typeof learningCurve>[2]]));
   save(join(dir,"pilot-decision.json"),curve);
 }else console.log(await freezeBundle(v.run,v.format as Format,v.stage as "pilot"|"overnight",matches,v.registry));
}
