import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync, mkdirSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import test from "node:test";
import {artifactPin} from "../../api/actor-registry.ts";
import {activeFormats, teamSignalsVersion} from "../../training/contracts/index.ts";
import {initial} from "../../training/anchored/actor.ts";
import {dealSeed, read, save} from "../../training/anchored/io.ts";
import {summarize, type PairOutcome} from "../../training/eval/statistics.ts";
import {createLearner} from "../../training/selfplay/learner.ts";
import {qualificationFamilies} from "../../training/selfplay/evaluate.ts";
import {prepareConfirmation} from "../../training/selfplay/confirm.ts";
import {prepare} from "../../training/selfplay/prepare.ts";
import {leagueBudget, pilotExtension, readLeagueResults, validateCompletedLeague} from "../../training/selfplay/results.ts";
import {runSlice} from "../../training/selfplay/train.ts";

// Fully deterministic final receipts let this fixture exercise both gate outcomes.
test("la siguiente noche hereda los ganadores confirmados, conserva los rivales y usa otros repartos", () => {
  const temp = mkdtempSync(join(tmpdir(),"truco-league-continuation-"));
  const source = join(temp,"parent"), next = join(temp,"next");
  const files:Record<string,string> = {};
  function write(path:string, data:unknown, registered=false) {
    const out = join(source,path);
    mkdirSync(dirname(out),{recursive:true}); save(out,data);
    if (registered) files[path] = createHash("sha256").update(readFileSync(out)).digest("hex");
  }
  try {
    for (const format of activeFormats) {
      const input = join("input",format), anchor = initial(format);
      const candidate = createLearner(anchor).actor;
      candidate.weights[0] = 0.25; candidate.updates = 40;
      const pin = artifactPin(candidate), refPin = artifactPin(anchor), improved = format === "duel";
      const field = qualificationFamilies(format);
      const seed = dealSeed("parent",format,"gate","final");
      for (const name of ["anchor-v1","champion-at-start","archive/previous-anchored","archive/older-candidate"])
        write(join(input,name+".json"),anchor,true);
      write(join(input,"archive","last-counter.json"),candidate,true);
      write(join("evaluation-input",format,"independent.json"),anchor,true);
      if (format!=="duel") write(join("evaluation-input",format,"unfamiliar.json"),anchor,true);
      if (format==="pairs-private-senas") {
        write(join("evaluation-input",format,"unfamiliar-signaler.json"),anchor,true);
        write(join(input,"archive","signal-specialist.json"),anchor,true);
      }
      const evidence = field.map((id,i) => {
        const rows = [0,1,2,3].map((pair):PairOutcome => ({
          pair, candidate:improved?[1,1]:[1,0], incumbent:[1,0]
        }));
        write(join(format,"assessments","final","family-"+i+".json"),{id,seed,pin,refPin,rows});
        return {id,pairs:rows};
      });
      write(join(format,"assessments","final","counter.json"),candidate);
      write(join(format,"final-candidate.json"),candidate);
      write(join(format,"eval-final.json"),{format,epoch:"final",pin,reference:refPin,counter:pin,
        improved,evaluation:summarize(evidence,"champion",1000),games:4*4*field.length});
    }
    write("protocol.json",{schema:"continual-selfplay-league-v1",computerOnly:true,signals:teamSignalsVersion,
      seed:"parent",finalPairs:4,finalResamples:1000,directLowerBound:0.5,familyDeltaLowerBound:-0.02,files});
    assert.throws(()=>prepare(next,source,"parent"),/fresh deals/);
    const protocol = prepare(next,source,"child");
    const short=prepare(join(temp,"short"),source,"short-seed","local-pilot");
    const oldPilot=prepare(join(temp,"legacy"),source,"pilot-seed","pilot");
    assert.equal(short.externalTeamCandidate,false);
    assert.equal(oldPilot.externalTeamCandidate,true);
    assert.equal(short.epochs,3);
    assert.equal(short.maxWallHours,2);
    assert.equal(short.finalPairs,oldPilot.finalPairs);
    assert.equal(short.sampler,oldPilot.sampler);
    assert.throws(()=>readLeagueResults(join(temp,"short")),/completed run/);
    assert.equal(protocol.parent!.models.duel.improved,true);
    for (const format of activeFormats) {
      const path = format==="duel"?join(format,"final-candidate.json"):join("input",format,"champion-at-start.json");
      assert.deepEqual(read(join(next,"input",format,"starter.json")),read(join(source,path)));
      assert.deepEqual(read(join(next,format,"champion.json")),read(join(source,path)));
    }
    const first = runSlice(next,"duel","a",{epoch:1,seconds:0,games:0});
    assert.equal(first.learner.actor.updates,40);
    assert(first.learner.squaredGradient.every(n=>n===0));
    const trained = runSlice(next,"duel","a",{epoch:1,seconds:0,games:10});
    assert.equal(trained.learnerUpdates,trained.learner.actor.updates-40);
    assert.equal(trained.counterUpdates,trained.specialist.actor.updates-40);
    assert(trained.learnerUpdates>0 && trained.counterUpdates>0);
    // A fixed study may contribute a champion only if its complete paired
    // evidence passes and the primary comparison did not qualify a model.
    const extra=join(temp,"extra"), paths:string[]=[];
    mkdirSync(extra);
    const fixedSeed="independent-source-42";
    save(join(extra,"plan.json"),{seed:fixedSeed,finalPairs:4,resamples:1000,familyError:0.01,
      gates:{directLowerAbove:0.5,everyFamilyDeltaLowerAbove:-0.02}});
    for(const f of activeFormats) {
      const actor=read(join(source,f,"final-candidate.json"));
      actor.weights[0]=0.8;
      const path=join(temp,"fixed-"+f+".json"); save(path,actor); paths.push(path);
    }
    const fixed=prepareConfirmation(extra,source,paths);
    for(const f of activeFormats) {
      const dir=join(extra,f), stage=join(dir,"assessments","final");
      mkdirSync(stage,{recursive:true});
      const candidate=read(join(dir,"a","candidate.json")), counter=read(join(dir,"a","counter.json"));
      const pin=fixed.challengers[f], refPin=artifactPin(read(join(dir,"champion.json")));
      const field=qualificationFamilies(f).map((id,i)=>{
        const rows=[0,1,2,3].map((pair):PairOutcome=>({pair,candidate:[1,1],incumbent:[1,0]}));
        save(join(stage,"family-"+i+".json"),{id,pin,refPin,seed:dealSeed(fixedSeed,f,"gate","final"),rows});
        return {id,pairs:rows};
      });
      save(join(stage,"counter.json"),counter);
      save(join(dir,"final-candidate.json"),candidate);
      save(join(dir,"eval-final.json"),{format:f,epoch:"final",pin,counter:fixed.counters[f],reference:refPin,
        evaluation:summarize(field,"champion",1000,0.01),improved:true,games:4*4*field.length});
    }
    const extended=join(temp,"extended");
    const nextProtocol=prepare(extended,source,"new-independent-training","extended",extra);
    assert.equal(nextProtocol.supplement!.models.duel.adopted,false);
    assert.equal(nextProtocol.supplement!.models.pairs.adopted,true);
    assert.equal(read(join(extended,"duel","champion.json")).weights[0],0.25);
    assert.equal(read(join(extended,"pairs","champion.json")).weights[0],0.8);
    const final = read(join(source,"duel","eval-final.json"));
    write(join("duel","eval-final.json"),{...final,improved:false});
    assert.throws(()=>prepare(join(temp,"corrupt"),source,"other"));
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

test("el piloto local exige mejora de las parejas sobre los repartos pareados para extenderse", () => {
  const root = mkdtempSync(join(tmpdir(),"truco-extension-"));
  const formats = ["pairs","pairs-private-senas"] as const;
  const files:Record<string,string> = {};
  const protocol = {profile:"local-pilot", seed:"holdout", files, finalPairs:100};
  function comparison(format:typeof formats[number], change:number, directLower:number) {
    const previous = initial(format), candidate = createLearner(previous).actor;
    const archive = join("input",format,"archive","last-finalist.json");
    mkdirSync(join(root,dirname(archive)),{recursive:true});
    save(join(root,archive),previous);
    files[archive]=createHash("sha256").update(readFileSync(join(root,archive))).digest("hex");
    const priorPin=artifactPin(previous), pin=artifactPin(candidate);
    const n=protocol.finalPairs;
    const rows=Array.from({length:n}, (_,pair)=>({
      pair, candidate:[Number(pair < n/2+Math.round(n*change)),Number(pair < n/2+Math.round(n*change))],
      incumbent:[Number(pair<n/2),Number(pair<n/2)],
    }));
    const family = qualificationFamilies(format).indexOf("strong-cards");
    const dir = join(root,format,"assessments","final");
    mkdirSync(dir,{recursive:true});
    save(join(dir,"family-"+family+".json"), {id:"strong-cards",pin,refPin:priorPin,priorPin,rows,
      seed:dealSeed(protocol.seed,format,"gate","final"),priorWins:rows.map(r=>r.incumbent)});
    return {format,pin,reference:priorPin,previousFinalist:priorPin,evaluation:{direct:{lower:directLower}},
      versusPrevious:{"strong-cards":{estimate:change}}};
  }
  try {
    const decide=(a:number,b:number,directLower=0.51)=>pilotExtension(root,protocol,[
      comparison(formats[0],a,directLower), comparison(formats[1],b,0.6),
    ])!.allowed;
    assert.equal(decide(-0.02,0.01),true);
    assert.equal(decide(-0.03,0.02),false);
    assert.equal(decide(0,0),false);
    assert.equal(decide(0.04,0.01,0.5),false);
    const finals=[comparison(formats[0],0.02,0.6),comparison(formats[1],0,0.55)];
    finals[0].versusPrevious["strong-cards"].estimate=0.1;
    assert.throws(()=>pilotExtension(root,protocol,finals),/Changed strong-cards/);
    assert.equal(pilotExtension(root,{...protocol,profile:"pilot"},finals),null);

    const full = {...protocol,...leagueBudget("local-pilot"),schema:"continual-selfplay-league-v1",computerOnly:true,
      signals:teamSignalsVersion,formats:activeFormats,workers:{duel:2,pairs:1,"pairs-private-senas":1},
      sampler:"paired-regression-v1",externalTeamCandidate:false,directLowerBound:0.5,familyDeltaLowerBound:-0.02};
    protocol.finalPairs=full.finalPairs;
    const evaluations:Record<string,unknown>={};
    for (const format of activeFormats) {
      const result=format==="duel" ? {format,pin:artifactPin(initial(format))} : comparison(format,0,0.55);
      const file=join(format,"eval-final.json"), games=4*full.finalPairs*qualificationFamilies(format).length;
      mkdirSync(join(root,format),{recursive:true});
      save(join(root,file),{...result,epoch:"final",improved:false,games});
      evaluations[format]={file,sha256:createHash("sha256").update(readFileSync(join(root,file))).digest("hex"),
        epoch:"final",format,pin:result.pin,improved:false,games};
    }
    mkdirSync(join(root,"ops"));
    save(join(root,"ops","summary.json"),{state:"complete",completedEpochs:full.epochs,evaluations,
      resources:Object.fromEntries(["duel-a","duel-b",...formats].map(lane=>[lane,{trainingSeconds:3600}]))});
    save(join(root,"protocol.json"),full);
    assert.throws(()=>prepare(join(root,"extended"),root,"child","extended",undefined,undefined,true),/Pilot falls short/);
    assert.doesNotThrow(()=>validateCompletedLeague(root,full,"local-pilot"));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
