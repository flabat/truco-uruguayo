import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli.ts";
import { digest } from "./policy.ts";

const dir = mkdtempSync(join(tmpdir(), "truco-parejas-verificar-"));
for (const format of ["pairs", "pairs-private-senas"]) {
  const whole = join(dir,format), partial = join(dir,format+"-resume");
  const args = ["--format",format,"--config","training/configs/"+format+"-local.json","--seed","40312","--matches","8"];
  await main([...args,"--run",whole]);
  await main([...args,"--run",partial,"--until","4"]);
  await main(["--resume",join(partial,"checkpoint")]);
  for (const file of ["checkpoint","actor.json","mc-actor.json"]) {
    assert.equal(readFileSync(join(whole,file),"utf8"),readFileSync(join(partial,file),"utf8"),file);
  }
  const cp = JSON.parse(readFileSync(join(whole,"checkpoint"),"utf8"));
  assert.equal(cp.sha256,digest(cp.state));
  console.log(format, "8 chicos por aprendiz, checkpoint y actores idénticos", cp.sha256);
}

const run = join(dir,"crash"), checkpoint = join(run,"checkpoint");
await main(["--format","pairs","--config","training/configs/pairs-local.json","--run",run,
  "--matches","400","--until","0","--opponent",join(dir,"pairs","actor.json")]);
const worker = spawn(process.execPath, ["training/partners/cli.ts","--resume",checkpoint], {stdio:"ignore"});
const stopped = once(worker,"close");
try {
  const deadline = Date.now()+90_000;
  while (JSON.parse(readFileSync(checkpoint,"utf8")).state.completed === 0) {
    if (worker.exitCode !== null || Date.now()>deadline) throw Error("El proceso no confirmó el primer lote.");
    await delay(50);
  }
  await assert.rejects(main(["--resume",checkpoint]), /Otro proceso/);
} finally { worker.kill("SIGKILL"); await stopped; }
const committed = JSON.parse(readFileSync(checkpoint,"utf8")).state.completed;
await main(["--resume",checkpoint,"--matches",String(committed+4)]);
const restored = JSON.parse(readFileSync(checkpoint,"utf8")).state;
assert.equal(restored.completed,committed+4);
assert.ok(restored.opponent && restored.examples>0 && restored.mcExamples>0);
const corrupted = join(dir,"corrupt"); mkdirSync(corrupted);
writeFileSync(join(corrupted,"checkpoint"),JSON.stringify({sha256:"bad",state:restored}));
await assert.rejects(main(["--resume",join(corrupted,"checkpoint")]), /dañado/);
console.log("Escritor simultáneo rechazado, SIGKILL y contraestrategia reanudada, checksum verificado.");
