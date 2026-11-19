import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {appendFileSync,existsSync,mkdirSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {artifactPin} from "../../api/actor-registry.ts";
import {playMatch} from "../arena/index.ts";
import {baseline} from "../baselines/index.ts";
import {incumbent} from "../seat/index.ts";
import {openAnchored} from "../anchored/actor.ts";
import {read,save} from "../anchored/io.ts";
import type {Policy} from "../contracts/index.ts";
import {openSelfplay} from "./learner.ts";
import {initialTeamMixture,openTeamMixture,specialists,teamContexts,
  type Specialist,type TeamMixtureActor,type TeamFormat} from "./team-mixture.ts";

type Stage="fit"|"select"|"audit";
type Routes=TeamMixtureActor["routes"];
interface Row {routes:Routes;rates:number[];outcomes:number[][];score:number}
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const key=(r:Routes)=>teamContexts.map(k=>specialists.indexOf(r[k])).join("");
const legMean=(x:number)=>((x&1)+(x>>1))/2;
function interval(xs:number[]) {
  const estimate=mean(xs),radius=1.96*Math.sqrt(xs.reduce((s,x)=>s+(x-estimate)**2,0)/(xs.length*(xs.length-1)));
  return {estimate,lower:estimate-radius,upper:estimate+radius};
}
export function runTeamPilot(format:TeamFormat,previous:string,area:string,destination:string) {
  assert.ok(format==="pairs" || format==="pairs-private-senas");
  const protocol=read(join(area,"protocol.json"));
  assert.equal(protocol.trainOnly,true);
  assert.equal(protocol.formatVersion,"senas-equipo-v1");
  const seeds=Object.values(protocol.seeds).flatMap(stage=>Object.values(stage as Record<string,number>));
  assert.ok(seeds.every(n=>Number.isSafeInteger(n) && n>=0) && new Set(seeds).size===seeds.length,"Seed pools must be disjoint");
  assert.ok(["fit","select","audit"].every(k=>Number.isSafeInteger(protocol.pairs[k]) && protocol.pairs[k]>=2));
  assert.deepEqual(protocol.trainingFixtures,["champion","strong-cards","V1","caller","strong-cards/V1-teammate"]);
  const ids=protocol.inputs[format];
  function input(leaf:string,hash:string) {
    const raw=readFileSync(join(previous,leaf));
    assert.equal(createHash("sha256").update(raw).digest("hex"),hash);
    return JSON.parse(raw.toString());
  }
  const finalist=input(join(format,"final-candidate.json"),ids.finalist);
  const anchor=input(join("input",format,"champion-at-start.json"),ids.anchor);
  const initial=initialTeamMixture(finalist,anchor);
  const experts:Record<string,Policy>={champion:openAnchored(anchor),finalist:openSelfplay(finalist),V1:incumbent,
    "strong-cards":baseline("strong-cards"),caller:baseline("caller")};
  const dir=join(area,format);
  mkdirSync(dir,{recursive:true});
  const signature={protocolSha256:createHash("sha256").update(readFileSync(join(area,"protocol.json"))).digest("hex"),
    finalist:artifactPin(finalist),anchor:artifactPin(anchor),format};
  const identity=join(dir,"inputs.json");
  if(existsSync(identity))assert.deepEqual(read(identity),signature,"Run inputs changed; use a fresh directory");
  else save(identity,signature);
  const log=(stage:string,message:string,details={})=>appendFileSync(join(area,"progress.jsonl"),
    JSON.stringify({ts:new Date().toISOString(),format,stage,message,...details})+"\n");
  function makeRoutes(chosen:Specialist):Routes {
    return Object.fromEntries(teamContexts.map(k=>[k,chosen])) as Routes;
  }
  function paired(policy:Policy,fixture:string,seed:number,pairs:number) {
    const [name,guest]=fixture.split("/");
    const opponent=experts[name];
    assert.ok(opponent && (!guest || guest==="V1-teammate"));
    const outcomes=[];
    for(let i=0;i<pairs;i++) {
      let wins=0;
      for(const leg of [0,1] as const) {
        const game=playMatch({format,seed,pair:i,leg,policies(seat) {
          if(seat%2!==leg)return opponent;
          return guest && Math.floor(seat/2)===i%2 ? incumbent : policy;
        }});
        if(game.winner===leg)wins+=1<<leg;
      }
      outcomes.push(wins);
    }
    return outcomes;
  }
  function evaluate(stage:Stage,routes:Routes):Row {
    const phase=join(dir,stage); mkdirSync(phase,{recursive:true});
    const file=join(phase,key(routes)+".json");
    if(existsSync(file)) {
      const row:Row=read(file);
      assert.deepEqual(row.routes,routes);
      assert.ok(row.outcomes.length===(stage==="audit"?protocol.trainingFixtures.length+protocol.auditExtras.length:protocol.trainingFixtures.length)
        && row.outcomes.every(cell=>cell.length===protocol.pairs[stage] && cell.every(x=>Number.isInteger(x)&&x>=0&&x<=3)));
      assert.deepEqual(row.rates,row.outcomes.map(v=>mean(v.map(legMean))));
      return row;
    }
    const actor=openTeamMixture({...initial,routes}), fixtures:string[]=stage==="audit"
      ? [...protocol.trainingFixtures,...protocol.auditExtras] : protocol.trainingFixtures;
    const outcomes=fixtures.map(f=>paired(actor,f,protocol.seeds[format][stage],protocol.pairs[stage]));
    const row={routes,rates:outcomes.map(v=>mean(v.map(legMean))),outcomes,score:0};
    save(file,row);
    return row;
  }
  function controls(stage:Stage) {
    return {previous:evaluate(stage,makeRoutes("finalist")),anchor:evaluate(stage,makeRoutes("anchor"))};
  }
  const score=(row:Row,refs:ReturnType<typeof controls>)=>{
    const gains=row.rates.map((x,i)=>x-Math.max(refs.previous.rates[i],refs.anchor.rates[i]));
    return 0.5*Math.min(gains[0],gains[1],gains[4])+0.5*mean(gains);
  };
  const cached=new Map<string,Row>();
  const refs=controls("fit");
  function tryRoute(routes:Routes) {
    routes={...routes,compulsory:"finalist"};
    const id=key(routes);
    if(cached.has(id))return cached.get(id)!;
    const row=evaluate("fit",routes);row.score=score(row,refs);cached.set(id,row);
    if(cached.size%4===0)log("fit","Completed computer route contrasts.",{routes:cached.size});
    return row;
  }
  const firstOrder:Row[]=[];
  for(const a of specialists)for(const b of specialists) {
    const r=makeRoutes(b);
    for(const k of ["large-side","small-side","truco","opening","after-lead"] as const)r[k]=a;
    firstOrder.push(tryRoute(r));
  }
  const eligible=(r:Row)=>teamContexts.filter(k=>k!=="compulsory").some(k=>r.routes[k]==="team") ||
    new Set(teamContexts.filter(k=>k!=="compulsory").map(k=>r.routes[k])).size>1;
  const ranked=(rows:Row[])=>rows.filter(eligible).sort((a,b)=>b.score-a.score);
  const starts=ranked(firstOrder).slice(0,2);
  for(const start of starts) {
    let best=start;
    for(let round=0;round<2;round++) {
      const alternatives=[best];
      for(const k of teamContexts)if(k!=="compulsory")for(const choice of specialists) {
        if(choice!==best.routes[k])alternatives.push(tryRoute({...best.routes,[k]:choice}));
      }
      best=ranked(alternatives)[0];
    }
  }
  const top=ranked([...cached.values()]).slice(0,4);
  assert.equal(top.length,4);
  save(join(dir,"fitted.json"),{routesTried:cached.size,top:top.map(r=>({routes:r.routes,score:r.score,rates:r.rates})),seeds:protocol.seeds[format]});
  log("select","Four routes frozen before selection on separate computer deals.",{routesTried:cached.size});
  const devRefs=controls("select");
  const candidates=top.map(r=>{const row=evaluate("select",r.routes);row.score=score(row,devRefs);return row;});
  const winner=ranked(candidates)[0];
  const model={...initial,routes:winner.routes};
  const pin=artifactPin(model);
  const output=join(destination,format);
  mkdirSync(output,{recursive:true});
  const file=join(output,"team.json");
  if(existsSync(file))assert.equal(artifactPin(read(file)),pin,"A different candidate already occupies output");
  else save(file,model);
  save(join(dir,"selection.json"),{source:protocol.source,inputs:ids,seed:protocol.seeds[format].select,pin,
    routes:winner.routes,anchor:devRefs.anchor.rates,previous:devRefs.previous.rates,
    candidates:candidates.map(r=>({routes:r.routes,rates:r.rates,score:r.score}))});
  log("audit","Selected actor frozen; beginning fixed independent development audit.",{pin});
  const auditRefs=controls("audit"), audit=evaluate("audit",winner.routes);
  const fixtures:string[]=[...protocol.trainingFixtures,...protocol.auditExtras];
  const results=audit.outcomes.map((cell,i)=>{
    const rates=cell.map(legMean);
    const diff=(ref:Row)=>interval(rates.map((v,j)=>v-legMean(ref.outcomes[i][j])));
    return {fixture:fixtures[i],win:interval(rates),vsAnchor:diff(auditRefs.anchor),vsFinalist:diff(auditRefs.previous),
      anchorWin:auditRefs.anchor.rates[i],finalistWin:auditRefs.previous.rates[i]};
  });
  const result={format,role:"Independent development measurement; no promotion decision.",pin,seed:protocol.seeds[format].audit,
    pairsPerFixture:protocol.pairs.audit,fixtures:results,interval:"Pointwise 95% normal approximation over complete deal pairs",routes:winner.routes};
  save(join(dir,"audit.json"),result);
  log("complete","Independent development measurements complete.",{pin});
  return result;
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const [format,previous,area,destination]=process.argv.slice(2);
  if(!destination)throw Error("team-pilot FORMAT PRIOR_RUN PREREGISTERED_LOCAL_DIR CANDIDATE_DIR");
  console.log(JSON.stringify(runTeamPilot(format as TeamFormat,resolve(previous),resolve(area),resolve(destination))));
}
