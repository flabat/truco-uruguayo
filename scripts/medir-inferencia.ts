// node scripts/medir-inferencia.ts formato ruta/actor.json [pares] [semilla]
import {readFileSync} from "node:fs";
import {artifactPin, createServing, defaultDeadlineMs} from "../api/serving.ts";
import {formats,type Format} from "../training/contracts/index.ts";
import {playMatchAsync,replayMatch} from "../training/arena/index.ts";
import {incumbent} from "../training/seat/index.ts";

const [format,path,rawPairs="6",rawSeed="8010131"]=process.argv.slice(2);
const pairs=Number(rawPairs), seed=Number(rawSeed);
if (!formats.includes(format as Format) || !Number.isInteger(pairs) || pairs < 1 || !path) throw Error("Se requieren formato, archivo y pares positivos.");
const artifact=JSON.parse(readFileSync(path,"utf8"));
const pin=artifactPin(artifact);
const serving=createServing({loadArtifact:async()=>artifact});
const samples:number[]=[];
let fallbacks=0, hands=0;
try {
  for (let pair=0;pair<pairs;pair++) for(const leg of [0,1] as const) {
    const record=await playMatchAsync({format:format as Format, seed,pair,leg,responders:seat=>async(obs,uniform)=>{
      const candidate=seat%2===leg;
      const decision=await serving.decide(candidate?pin:incumbent.id,obs,uniform);
      if(candidate) {samples.push(decision.latencyMs); if(decision.fallback) fallbacks++;}
      return decision.action;
    }});
    replayMatch(record,seed);
    hands+=record.hands.length;
  }
} finally {await serving.close();}
const coldMs=samples[0];
samples.sort((a,b)=>a-b);
const percentile=(p:number)=>samples[Math.ceil(samples.length*p)-1];
console.log(JSON.stringify({format,pin,seed,pairs,hands,node:process.version,deadlineMs:defaultDeadlineMs,
  decisions:samples.length,coldMs,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),
  fallbackCount:fallbacks,fallbackRate:fallbacks/samples.length}));
