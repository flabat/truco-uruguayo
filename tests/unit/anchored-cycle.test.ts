import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import { createServing } from "../../api/serving.ts";
import { playMatchAsync } from "../../training/arena/index.ts";
import { initial, cycleFormats } from "../../training/anchored/actor.ts";
import { propose } from "../../training/anchored/fit.ts";
import { incumbent } from "../../training/seat/index.ts";

test("el ciclo abre actores registrados y sirve íntegramente los tres formatos de la mesa", async () => {
  for (const format of cycleFormats) {
    const anchor = initial(format);
    const alternatives = propose(anchor);
    assert.deepEqual(alternatives[0], anchor);
    assert.equal(new Set(alternatives.map(a => a.bands.join("|"))).size, alternatives.length);
    assert.throws(() => openActor({...anchor, bands:["unknown", "v1", "v1"]}, format, 0));
    if (format === "pairs-private-senas") assert.throws(() => openActor(anchor, "pairs-senas", 0));
    const model = alternatives.at(-1)!;
    const pin = artifactPin(model);
    const serving = createServing({deadlineMs:3000, loadArtifact:async () => model});
    try {
      const game = await playMatchAsync({format,seed:307,leg:0,pair:0,responders:seat=>async(obs,u)=>{
        if (seat%2) return obs.legalActions[incumbent.decide(obs,obs.legalActions).indexOf(1)];
        const chosen = await serving.decide(pin,obs,u);
        assert.equal(chosen.fallback,null);
        assert.equal(chosen.policy,pin);
        return chosen.action;
      }});
      assert.equal(Math.max(...game.score),40);
    } finally { await serving.close(); }
  }
});

test("antes de ajustar exige la paridad de todos los formatos, incluso el de señas de equipo", () => {
  const root=mkdtempSync(join(tmpdir(),"anchored-barrier-"));
  writeFileSync(join(root,"protocol.json"),"{}");
  for (const format of cycleFormats) {
    mkdirSync(join(root,format));
    writeFileSync(join(root,format,"parity.json"),JSON.stringify({passed:format!=="pairs-private-senas"}));
  }
  const attempt=spawnSync(process.execPath,["training/anchored/cycle.ts",root,"duel","fit"],{encoding:"utf8"});
  assert.notEqual(attempt.status,0);
  assert.match(attempt.stderr,/false !== true/);
});
