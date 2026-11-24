import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import test from "node:test";
import {artifactPin} from "../../api/actor-registry.ts";
import {initial} from "../../training/anchored/actor.ts";
import {dealSeed, save} from "../../training/anchored/io.ts";
import {activeFormats, teamSignalsVersion} from "../../training/contracts/index.ts";
import {qualificationFamilies} from "../../training/selfplay/evaluate.ts";
import {createLearner} from "../../training/selfplay/learner.ts";
import {leagueBudget, readLeagueResults} from "../../training/selfplay/results.ts";

test("los resultados verifican las tres decisiones contra los repartos y señalan el archivo del ganador", () => {
  const root=mkdtempSync(join(tmpdir(),"truco-league-results-"));
  function write(file:string, value:unknown) {
    const dest=join(root,file);
    mkdirSync(dirname(dest),{recursive:true});
    save(dest,value);
    return createHash("sha256").update(readFileSync(dest)).digest("hex");
  }
  const files:Record<string,string> = {}, evaluations:Record<string,unknown> = {};
  const protocol = {schema:"continual-selfplay-league-v1",seed:"official",formats:activeFormats,
    computerOnly:true,signals:teamSignalsVersion,workers:{duel:2,pairs:1,"pairs-private-senas":1},
    directLowerBound:0.5,familyDeltaLowerBound:-0.02,files,...leagueBudget("standard")};
  const interval=(value:number)=>({estimate:value,lower:value,upper:value});
  try {
    for(const format of activeFormats) {
      const incumbent=initial(format), challenger=createLearner(incumbent).actor;
      const refPin=artifactPin(incumbent), pin=artifactPin(challenger), improved=format==="duel";
      const champ=join("input",format,"champion-at-start.json");
      files[champ]=write(champ,incumbent);
      write(join(format,"final-candidate.json"),challenger);
      const stage=join(format,"assessments","final");
      write(join(stage,"counter.json"),challenger);
      // Every deal in a format has the same outcome, so all bootstrap replicates
      // have the same mean. This gives an exact expected report without resampling twice.
      const rate=improved ? 1 : 0.5;
      const rows=Array.from({length:protocol.finalPairs},(_,pair)=>({pair,candidate:[1,Number(improved)],incumbent:[1,0]}));
      const field=qualificationFamilies(format);
      const families=field.map((id,i)=>{
        write(join(stage,"family-"+i+".json"),{id,pin,refPin,rows,seed:dealSeed(protocol.seed,format,"gate","final")});
        return {id,winRate:rate,delta:interval(rate-0.5)};
      });
      const evaluation={pairs:protocol.finalPairs,resamples:protocol.finalResamples,
        simultaneous:"Bonferroni (direct win rate + each family change)",headline:interval(rate),direct:interval(rate),families};
      const file=join(format,"eval-final.json"), games=4*protocol.finalPairs*field.length;
      const sha256=write(file,{format,epoch:"final",pin,counter:pin,reference:refPin,improved,evaluation,games});
      evaluations[format]={file,sha256,format,epoch:"final",pin,improved,games};
    }
    const resources=Object.fromEntries(["duel-a","duel-b","pairs","pairs-private-senas"]
      .map(lane=>[lane,{trainingSeconds:protocol.epochs*protocol.trainSecondsPerEpoch}]));
    const summary={state:"complete",completedEpochs:protocol.epochs,resources,evaluations};
    write("ops/summary.json",summary);
    write("protocol.json",protocol);
    const {results,extension}=readLeagueResults(root);
    assert.equal(extension,null);
    for(const {format,improved,direct,artifact} of results) {
      assert.equal(improved,format==="duel");
      assert.equal(direct.lower,improved ? 1 : 0.5);
      assert.equal(artifact,improved ? join(root,format,"final-candidate.json") : join(root,"input",format,"champion-at-start.json"));
    }
    write("protocol.json",{...protocol,formats:["duel","pairs","pairs-senas"]});
    assert.throws(()=>readLeagueResults(root));
    write("protocol.json",{...protocol,directLowerBound:0.4});
    assert.throws(()=>readLeagueResults(root),/direct-win threshold/);
    write("protocol.json",{...protocol,finalPairs:4});
    assert.throws(()=>readLeagueResults(root),/finalPairs/);
    write("protocol.json",protocol);
    write("ops/summary.json",{...summary,state:"incomplete"});
    assert.throws(()=>readLeagueResults(root),/completed run/);
    write("ops/summary.json",summary);
    write("pairs/eval-final.json",{improved:true});
    assert.throws(()=>readLeagueResults(root),/Changed final receipt/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
