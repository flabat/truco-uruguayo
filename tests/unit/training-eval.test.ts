import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {incumbent} from "../../training/seat/index.ts";
import {baseline} from "../../training/baselines/index.ts";
import {runPair} from "../../training/eval/tournament.ts";
import {legacyOpenings} from "../../training/eval/legacy.ts";
import {evaluate, freeze, type Field} from "../../training/eval/cli.ts";
import {summarize} from "../../training/eval/statistics.ts";

test("el perfil legado reproduce las ofertas y aceptaciones en 20000 aperturas", () => {
  assert.deepEqual(legacyOpenings(),{deals:20000,offered:1103,accepted:499,won:484});
});
test("dos copias deterministas intercambian el ganador al invertir la perspectiva en los tres formatos", () => {
  const team = () => incumbent;
  for (const format of ["duel","pairs","pairs-senas"] as const) {
    const p = runPair(format,7712,0,team,team,team,() => {});
    assert.equal(p.candidate[0]+p.candidate[1],1);
    assert.deepEqual(p.candidate,p.incumbent);
  }
});
test("el signo informa la ventaja del candidato y remuestrea el par completo", () => {
  const pairs = Array.from({length:8},(_,pair) => ({pair,candidate:[1,1] as [number,number],incumbent:[0,1] as [number,number]}));
  const pos = summarize([{id:"ref",pairs}],"ref",1000);
  assert.deepEqual(pos.families[0].delta,{estimate:0.5,lower:0.5,upper:0.5});
  const mirrored = pairs.map(p=>({...p,candidate:p.incumbent,incumbent:p.candidate}));
  assert.equal(summarize([{id:"ref",pairs:mirrored}],"ref",1000).families[0].delta.estimate,-0.5);
  const old = () => incumbent;
  const weak = () => baseline("folder");
  const actual = Array.from({length:24},(_,pair)=>runPair("duel",19102026,pair,weak,old,old,()=>{}));
  assert.ok(summarize([{id:"ref",pairs:actual}],"ref",1000).families[0].delta.estimate < 0);
});
test("se congela el campo antes de evaluar y se regenera el informe desde todos los chicos confirmados", async () => {
  const dir = mkdtempSync(join(tmpdir(),"truco-eval-"));
  try {
    const field:Field = {format:"pairs-senas",pool:"development",pairs:2,
      candidate:{id:"folder",lineage:"fold-v1"},opponents:[{id:incumbent.id,lineage:"v1"}]};
    const registration = join(dir,"frozen"), file = join(registration,"plan.json"), out = join(dir,"games");
    const plan = freeze(field,registration);
    assert.equal(JSON.stringify(plan).includes(readFileSync(join(registration,"referee-key"),"utf8")),false);
    assert.throws(()=>freeze(field,registration));
    assert.throws(()=>freeze({...field,pool:"final"},join(dir,"invalid")),/congelado/);
    const report = await evaluate(file,out);
    assert.equal(report.matchCount,8);
    assert.deepEqual(await evaluate(file,out,true),report);
    writeFileSync(join(out,"0-0.json.gz"),"corrupto");
    await assert.rejects(evaluate(file,out,true));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
