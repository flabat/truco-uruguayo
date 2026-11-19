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
