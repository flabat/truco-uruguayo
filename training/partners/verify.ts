import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli.ts";
import { digest } from "./policy.ts";

const dir = mkdtempSync(join(tmpdir(), "truco-parejas-verificar-"));
for (const format of ["pairs", "pairs-senas"]) {
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
