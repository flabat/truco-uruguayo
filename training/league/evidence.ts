import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { formats, type Format } from "../contracts/index.ts";
import { exportDuel } from "../duel/train.ts";
import { exportActor } from "../partners/train.ts";
import { digest as contentHash } from "../partners/policy.ts";
import { field, json, outcomes, rate, save, sha, trainingSeeds } from "./development.ts";

interface TimedChunk { before:number; completed:number; seconds:number; trainDecisions:number }

export function timedProgress(chunks:TimedChunk[], before:number, startingDecisions:number) {
  let previousUnit=before, previousDecisions=startingDecisions;
  let measuredDecisions=0, decisionSeconds=0, measuredSeconds=0, measuredUnits=0;
  for(const chunk of chunks){
    measuredUnits+=chunk.completed-chunk.before;
    measuredSeconds+=chunk.seconds;
    if(chunk.before===previousUnit){
      measuredDecisions+=chunk.trainDecisions-previousDecisions;
      decisionSeconds+=chunk.seconds;
    }
    previousUnit=chunk.completed;
    previousDecisions=chunk.trainDecisions;
  }
  return {measuredSeconds, measuredUnits, measuredDecisions, decisionSeconds};
}

export function evidence(run:string, format:Format, stage:"profile"|"pilot"|"overnight") {
  const current=join(run,"snapshots",stage,format);
  const previous=stage==="pilot"?"profile":stage==="overnight"?"pilot":null;
  const profile=json(join(run,stage+"-"+format+".json"));
  const timing=join(run,stage+"-telemetry.jsonl");
  const samples=existsSync(timing)?readFileSync(timing,"utf8").trim().split("\n")
    .filter(Boolean).map(line=>JSON.parse(line)).map(v=>v.seeds[format]).filter(Boolean):[];
  const cpuSource=existsSync(join(run,stage+"-cpu-telemetry.jsonl"))?join(run,stage+"-cpu-telemetry.jsonl"):timing;
  const cpuSamples=existsSync(cpuSource)?readFileSync(cpuSource,"utf8").trim().split("\n")
    .filter(Boolean).map(line=>JSON.parse(line)).map(record=>record.seeds[format]).filter(Boolean):[];
  const report=json(join(run,"development",format,stage+".json"));
  const runs=trainingSeeds.map(seed=>{
    const dir=join(current,String(seed)), actor=join(dir,"actor.json"), checkpoint=join(dir,"checkpoint");
    const envelope=json(checkpoint),cp=envelope.state;
    if(contentHash(cp)!==(envelope.checksum??envelope.sha256))throw Error("Falló la integridad del checkpoint.");
    const expected=format==="duel"?exportDuel(cp):exportActor(cp);
    if(contentHash(json(actor))!==contentHash(expected))throw Error("El actor no coincide con el checkpoint.");
    if(format!=="duel"&&contentHash(json(join(dir,"mc-actor.json")))!==contentHash(exportActor(cp,true)))throw Error("El comparador no coincide.");
    const start=previous?json(join(run,"snapshots",previous,format,String(seed),"checkpoint")).state:null;
    const meta=json(join(dir,format==="duel"?"manifest.json":"training.json"));
    const completed=cp.iteration??cp.completed, before=start?.iteration??start?.completed??0;
    const chunks = profile.samples.filter((r:{seed:number})=>r.seed===seed);
    const decisions=cp.counters?.prefixDecisions??cp.examples, old=start?.counters?.prefixDecisions??start?.examples??0;
    const {measuredSeconds,measuredUnits,measuredDecisions,decisionSeconds}=timedProgress(chunks,before,old);
    const memory=samples.filter(row=>Number(row.seed)===seed).map(row=>row.rssKiB);
    const cumulative=new Map<string,number>();
    let cpuSeconds=0;
    for(const sample of cpuSamples.filter(row=>Number(row.seed)===seed)){
      for(const [pid,seconds] of Object.entries(sample.cpuSecondsByPID??{}) as [string,number][]){
        const prior=cumulative.get(pid);
        if(prior!==undefined) cpuSeconds+=Math.max(0,seconds-prior);
        cumulative.set(pid,seconds);
      }
    }
    const means=report.edges.filter((e:{left:string;right:string})=>e.left===String(seed)&&field.includes(e.right))
      .map((e:{right:string;interval:{mean:number}})=>({id:e.right,winRate:e.interval.mean})).sort((a:{winRate:number},b:{winRate:number})=>a.winRate-b.winRate);
    const tableEntries=format==="duel"?Object.keys(cp.rows).length:cp.values.reduce((n:number,s:object)=>n+Object.keys(s).length,0);
    return {seed,before,completed,trainingDecisions:decisions-old,terminalRollouts:cp.counters?.terminalRollouts??null,
      monteCarloDecisions:format==="duel"?null:cp.mcExamples-(start?.mcExamples??0),tableEntries,
      tableRowCapacity:cp.config?.buckets??null,verifiedActorBytes:readFileSync(actor).length,
      checkpointBytes:readFileSync(checkpoint).length,actorSha256:sha(actor),checkpointSha256:sha(checkpoint),
      measuredTrainerWallSeconds:measuredSeconds,measuredLaneHours:measuredSeconds/3600,
      sampledCpuHoursLowerBound:cumulative.size?cpuSeconds/3600:null,
      timedCompletedUnits:measuredUnits,unitsOutsideMeasuredChunks:completed-before-measuredUnits,
      timedDecisions:measuredDecisions,secondsForTimedDecisions:decisionSeconds,
      completedUnitsPerMeasuredSecond:measuredSeconds?measuredUnits/measuredSeconds:null,
      decisionsPerMeasuredSecond:decisionSeconds?measuredDecisions/decisionSeconds:null,
      latestTrainerPeakRSSKiB:meta.maxRssKiB??null,sampledProcessTreePeakRSSKiB:memory.length?Math.max(...memory):null,
      memorySamples:memory.length,devMean:rate(outcomes(report,String(seed))),worstFamily:means[0],
      developmentActorLatencyMs:report.actorLatencyMs[String(seed)]};
  });
  const result={format,stage,runs,field,sourceRevision:json(join(run,"plan.json")).revision,developmentSeed:report.seed,
    developmentPairs:report.budget,developmentReportSha256:sha(join(run,"development",format,stage+".json")),
    throughputScope:"Throughput uses only timed completed chunks; decision throughput excludes any chunk lacking a contiguous starting counter. Recovered units without a matching timer are reported separately.",
    cpuScope:"Lower bound from CPU-time differences for each live PID on two successive samples; process startup/exit tails excluded.",
    memoryScope:"Sampled sum of RSS of trainer and descendants; shared mappings may be counted by two processes."};
  save(join(run,"evidence",format,stage+".json"),result);
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {values:v}=parseArgs({options:{run:{type:"string"},stage:{type:"string"},format:{type:"string"}}});
  if(!v.run||!formats.includes(v.format as Format)||!["profile","pilot","overnight"].includes(v.stage??""))throw Error("Argumentos inválidos.");
  evidence(v.run,v.format as Format,v.stage as "profile"|"pilot"|"overnight");
}
