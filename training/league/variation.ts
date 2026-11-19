import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { baseline } from "../baselines/index.ts";
import { formats, type Format } from "../contracts/index.ts";
import { trainDuel } from "../duel/cli.ts";
import { digest } from "../partners/policy.ts";
import { exportActor, initialize, optimizer, update, type Checkpoint } from "../partners/train.ts";
import { field, interval, json, loadTeam, pairOutcomes, rate, save, sha, trainingSeeds } from "./development.ts";

async function partners(run:string,format:"pairs"|"pairs-private-senas",seed:number,alternative:boolean,dir:string,games:number) {
  const config=json(join(run,format,"config.json"));
  const checkpoint=join(dir,"checkpoint");
  const cp:Checkpoint=existsSync(checkpoint)?json(checkpoint).state:initialize(format,seed,games,config.rate,config.batchMatches,"cpu");
  if(existsSync(checkpoint)&&digest(cp)!==json(checkpoint).sha256)throw Error("Checkpoint de variante corrupto.");
  const other=trainingSeeds.filter(s=>s!==seed).map(s=>json(join(run,"snapshots","profile",format,String(s),"actor.json")));
  const opt=optimizer();
  try {
    while(cp.completed<games){
      const period=Math.floor(cp.completed/cp.batchMatches)%3;
      cp.opponent=alternative&&period>0?other[period-1]:undefined;
      await update(cp,opt.fit,Math.min(cp.batchMatches,games-cp.completed));
      save(checkpoint,{state:cp,sha256:digest(cp)});
    }
  }finally{await opt.close();}
  save(join(dir,"actor.json"),exportActor(cp));
}
export async function variation(run:string,format:Format,units:number,pairs:number){
  const output=join(run,"representation",format),results=[];
  const reportPath=join(output,"comparison.json");
  if(existsSync(reportPath))return json(reportPath);
  for(const seed of trainingSeeds){
    const paths=[];
    for(const alternative of [false,true]){
      const dir=join(output,String(seed),alternative?"alternative":"control"),actor=join(dir,"actor.json");
      if(!existsSync(actor)){
        if(format==="duel"){
          const cfg=json(join(run,format,"config.json")); cfg.buckets*=alternative?4:1;
          const configPath=join(dir,"config.json");save(configPath,cfg);
          const checkpoint=join(dir,"checkpoint");
          const args=existsSync(checkpoint)?["--resume",checkpoint]:["--format","duel","--run",dir,"--config",configPath,"--seed",String(seed)];
          trainDuel([...args,"--iterations",String(units),"--eval-pairs","8"]);
        }else await partners(run,format,seed,alternative,dir,units);
      }
      paths.push(actor);
    }
    const [control,alternative]=paths.map(path=>loadTeam(format,path));
    const families=field.map(id=>{
      const foe=()=>baseline(id);
      const old=pairOutcomes(format,control,foe,pairs).results;
      const changed=pairOutcomes(format,alternative,foe,pairs).results;
      return {id,control:old,alternative:changed,delta:interval(changed.map((p,i)=>p-old[i]))};
    });
    const delta=Array.from({length:pairs},(_,p)=>rate(families.map(f=>f.alternative[p]-f.control[p])));
    results.push({seed,control:sha(paths[0]),alternative:sha(paths[1]),families,pairedChange:interval(delta)});
  }
  const report={format,units,pairs,developmentOnly:true,results,
    change:format==="duel"?"cuadruplicar tablas de agrupación, misma política de muestreo":
      "rotar cada tres lotes entre autojuego/V1 y dos campeones independientes congelados, mismo presupuesto y semilla"};
  save(reportPath,report);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {values:v}=parseArgs({options:{run:{type:"string"},format:{type:"string"},units:{type:"string"},pairs:{type:"string"}}});
  if(!v.run||!formats.includes(v.format as Format))throw Error("Formato inválido.");
  const units=Number(v.units??(v.format==="duel"?2048:256)),pairs=Number(v.pairs??48);
  if(!Number.isSafeInteger(units)||!Number.isSafeInteger(pairs)||units<1||pairs<2)throw Error("Presupuesto inválido.");
  await variation(v.run,v.format as Format,units,pairs);
}
