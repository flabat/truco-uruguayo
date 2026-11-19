import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { formats, type Format } from "../contracts/index.ts";
import { trainCounter } from "./counters.ts";
import { interval, json, loadTeam, outcomes, pairOutcomes, rate, save, sha, trainingSeeds } from "./development.ts";

export async function profileCounter(run:string,format:Format,matches:number) {
  const out=join(run,"counters-profile",format);
  const result=join(out,"result.json");
  if(existsSync(result))return json(result);
  const report=json(join(run,"development",format,"profile.json"));
  const seed=trainingSeeds.map(seed=>({seed,rate:rate(outcomes(report,String(seed)))}))
    .sort((a,b)=>b.rate-a.rate||a.seed-b.seed)[0].seed;
  const actor=join(run,"snapshots","profile",format,String(seed),"actor.json");
  const counterSeed=831193+formats.indexOf(format);
  const counter=await trainCounter(format,actor,out,counterSeed,join(run,format,"config.json"),matches);
  const games=pairOutcomes(format,loadTeam(format,actor),loadTeam(format,counter),48);
  const evidence={format,development:true,seed,candidate:sha(actor),counter:sha(counter),counterSeed,matches,
    pairs:games.results,championWinRate:interval(games.results)};
  save(result,evidence);return evidence;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {values:v}=parseArgs({options:{run:{type:"string"},format:{type:"string"},matches:{type:"string"}}});
  if(!v.run||!formats.includes(v.format as Format))throw Error("Formato inválido.");
  const matches=Number(v.matches??512);
  if(!Number.isSafeInteger(matches)||matches<2)throw Error("Presupuesto inválido.");
  await profileCounter(v.run,v.format as Format,matches);
}
