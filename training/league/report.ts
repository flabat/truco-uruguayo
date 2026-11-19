import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { supportedFormats, type Format } from "../contracts/index.ts";
import type { evidence } from "./evidence.ts";
import { field, json, save, sha, type Matchup } from "./development.ts";

type SeedEvidence = ReturnType<typeof evidence>["runs"][number];

function reference(root: string, file: string) {
  const path = join(root, file);
  return { file, sha256: sha(path), bytes: statSync(path).size };
}

function timeBox(root: string, stage: string) {
  const clock = json(join(root, stage + "-clock.json"));
  return {
    startedUTC: new Date(clock.startedUTC * 1000).toISOString(),
    deadlineUTC: new Date(clock.deadlineUTC * 1000).toISOString(),
    finishedUTC: new Date(clock.finishedUTC * 1000).toISOString(),
    stageBudgetSeconds: clock.deadlineUTC - clock.startedUTC,
  };
}

/** Cycles are descriptive. Requiring all three paired lower bounds above 50% also reports the stronger evidence. */
export function cycles(edges: Matchup[]) {
  const beats = new Map<string, Set<string>>();
  const clear = new Map<string, Set<string>>();
  function add(graph: Map<string, Set<string>>, from: string, to: string) {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  }
  for (const edge of edges) {
    if (edge.interval.mean > .5) add(beats, edge.left, edge.right);
    if (edge.interval.mean < .5) add(beats, edge.right, edge.left);
    if (edge.interval.lower > .5) add(clear, edge.left, edge.right);
    if (edge.interval.upper < .5) add(clear, edge.right, edge.left);
  }
  function triangles(graph: Map<string, Set<string>>) {
    const out: string[][] = [];
    for (const [a, opponents] of graph) {
      for (const b of opponents) {
        for (const c of graph.get(b) ?? []) {
          if (a < b && a < c && graph.get(c)?.has(a)) out.push([a,b,c]);
        }
      }
    }
    return out.sort((a,b) => a.join(",").localeCompare(b.join(",")));
  }
  const all = triangles(beats), supported = triangles(clear);
  return { count: all.length, examples: all.slice(0, 5), threePairwiseBoundsExcludeHalf: supported };
}

export function publicSummary(root: string) {
  const plan = json(join(root, "plan.json"));
  const decisions = json(join(root, "resource-decision.json"));
  const formats: Format[] = plan.formats;
  if (!Array.isArray(formats) || !formats.every(f => supportedFormats.includes(f))) throw new Error("Plan de liga inválido.");
  return {
    schema: "league-public-report-v1",
    runDirectory: "runs/" + basename(root),
    objective: "Computer-only full 40-point chicos; outcome measured against the preregistered development field.",
    trainingRevision: plan.revision,
    evidenceRevision: execFileSync("git", ["rev-parse","HEAD"], {encoding:"utf8"}).trim(),
    rules: "online-1", formats: formats.map(format => {
      const bundleDir = "championship-input/" + format;
      const bundle = json(join(root, bundleDir, "bundle.json"));
      const stages = bundle.stage === "overnight" ? ["profile", "pilot", "overnight"] : ["profile","pilot"];
      const curves = bundle.development.curve;
      const comparison = join("representation",format,"comparison.json");
      const variant = existsSync(join(root,comparison)) ? json(join(root,comparison)) : null;
      const final = json(join(root,"development",format,bundle.stage+".json"));
      const roles = Object.fromEntries(["candidate","independent","partner","counter"].filter(k=>bundle[k]).map(k=>{
        const entry=bundle[k];
        return [k,{id:entry.id,lineage:entry.lineage,trainingSeed:entry.trainingSeed,family:entry.family,
          actor:reference(root,join(bundleDir,entry.file)),contentSHA256:entry.contentSha256,
          registryPin:bundle.registryPins[entry.id],trainedAgainstSHA256:entry.trainedAgainstSha256}];
      }));
      const receiptPath=join(bundleDir,bundle.counter.trainingReceipt);
      const receipt=json(join(root,receiptPath));
      const profileCounter=json(join(root,"counters-profile",format,"result.json"));
      return {
        format, finalStage:bundle.stage, trainingSeeds:plan.seeds,
        stages: stages.map(stage=>{
          const evidence=json(join(root,"evidence",format,stage+".json"));
          return {stage, frozenManifest:reference(root,join("snapshots",stage,"index.json")),
            evidence:reference(root,join("evidence",format,stage+".json")),
            matrix:reference(root,join("development",format,stage+".json")),
            seeds:evidence.runs.map((r:SeedEvidence)=>{
              const dir=join("snapshots",stage,format,String(r.seed));
              return {seed:r.seed,unitsBefore:r.before,unitsAfter:r.completed,tableEntries:r.tableEntries,
                tableCapacity:r.tableRowCapacity,decisions:r.trainingDecisions,mcDecisions:r.monteCarloDecisions,
                completedChunkHours:r.measuredLaneHours,timedCompletedUnits:r.timedCompletedUnits,
                unitsOutsideTimedChunks:r.unitsOutsideMeasuredChunks,cpuHoursObservedLowerBound:r.sampledCpuHoursLowerBound,
                decisionsPerMeasuredSecond:r.decisionsPerMeasuredSecond,peakSampledProcessTreeMiB:
                r.sampledProcessTreePeakRSSKiB===null?null:r.sampledProcessTreePeakRSSKiB/1024,
                actorLatencyMs:r.developmentActorLatencyMs,meanWinRate:r.devMean,worstFamily:r.worstFamily,
                checkpoint:reference(root,join(dir,"checkpoint")),actor:reference(root,join(dir,"actor.json"))};
            })};
        }),
        learning:{earlyToPilot:curves.earlyDelta,profileToPilot:curves.recentDelta,
          seeds:curves.curves.map((c:{seed:number;means:number[]})=>({seed:c.seed,early:c.means[0],profile:c.means[1],pilot:c.means[2]}))},
        extension:{used:curves.extendOvernight,rule:"Both 95% paired lower limits positive, plus positive median seed change since profile.",
          finding:curves.extendOvernight?"Pilot met the sustained local progress criterion.":"Pilot did not establish sustained progress under this criterion."},
        alternative:variant?{change:variant.change,unitsPerSeed:variant.units,pairsPerFamily:variant.pairs,
          comparisons:variant.results.map((r:{seed:number;pairedChange:object})=>({seed:r.seed,pairedDelta:r.pairedChange})),
          report:reference(root,comparison)}:null,
        matrix:{opponents:field,seed:final.seed,pairsPerEdge:final.budget,edges:final.edges.length,cycles:cycles(final.edges)},
        profileCounter:{seed:profileCounter.counterSeed,fullTrainingChicos:profileCounter.matches,championWinRate:profileCounter.championWinRate},
        championshipInput:{bundle:reference(root,join(bundleDir,"bundle.json")),roles,
          counterTrainingReceipt:reference(root,receiptPath),counterTrainingChicos:receipt.completedMatches,
          frozenAgainstSHA256:receipt.trainedAgainstSha256,suggestedBudget:bundle.suggestedFinalBudget},
      };
    }),
    pilot: timeBox(root,"pilot"), overnight: existsSync(join(root,"overnight-clock.json")) ? timeBox(root,"overnight") : null,
    hardware:{cpu:plan.cpu,arch:plan.arch,memoryBytes:plan.memory,node:plan.node,backend:plan.device},
    resourceDecision:decisions.cloud,
    computeScope:"Per-format elapsed time sums trained chunks. Sampled CPU hours exclude unobserved process startup/exit. RSS is the sampled process-tree sum.",
    latencyScope:"Development actor decide calls in the arena. Serving deadline, fallbacks, sealed results and activation are evaluated separately.",
    freshCheckout:reference(root,"fresh-verification/receipt.json"),
  };
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {values} = parseArgs({options:{run:{type:"string"},output:{type:"string"}}});
  if(!values.run||!values.output)throw Error("Especificá --run y --output.");
  save(values.output, publicSummary(resolve(values.run)));
}
