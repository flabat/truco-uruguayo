import assert from "node:assert/strict";
import {spawn, spawnSync, type ChildProcess} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const python = process.env.PYTHON ?? "python3";
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
async function until(check: () => Promise<boolean>, milliseconds=90_000) {
  const end = Date.now() + milliseconds;
  let lastError;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (error) { lastError=error; }
    await delay(100);
  }
  throw new Error("Timed out waiting for the test scheduler.", {cause:lastError});
}
function run(name: string, args: string[]) {
  return spawn(python, [join(root, "training/selfplay", name), ...args], {stdio:"pipe"});
}
function cleanup(child: ChildProcess | undefined) {
  if (child && child.exitCode === null && !child.signalCode) child.kill();
}
test("checkpoint-aware scheduler, retry, independent evaluation and final monitor", {timeout:150_000}, async () => {
  const dir = await mkdtemp(join(tmpdir(),"truco-selfplay-ops-"));
  let supervisor: ChildProcess | undefined;
  let monitor: ChildProcess | undefined;
  try {
    const stages = ["training/selfplay/train.ts","training/selfplay/evaluate.ts"];
    for(const fixture of stages) {
      const path=join(dir,"runtime",fixture);
      await mkdir(dirname(path),{recursive:true});
      await copyFile(join(root,"tests/fixtures/selfplay-stage.mjs"),path);
    }
    await writeFile(join(dir,"runtime","package.json"),JSON.stringify({type:"module"}));
    const formats=["duel","pairs","pairs-private-senas"];
    await writeFile(join(dir,"protocol.json"),JSON.stringify({computerOnly:true,signals:"senas-equipo-v1",formats,epochs:2,trainSecondsPerEpoch:1,maxWallHours:1,epochPairs:2,finalPairs:2}));
    for(const format of formats) {
      await mkdir(join(dir,"input",format),{recursive:true});
      await mkdir(join(dir,format),{recursive:true});
      const model={kind:"test",format};
      await writeFile(join(dir,"input",format,"champion-at-start.json"),JSON.stringify(model));
      await writeFile(join(dir,format,"champion.json"),JSON.stringify(model));
    }
    monitor=run("monitor.py",[dir,"--file-only"]);
    supervisor=run("supervise.py",[dir,"--node",process.execPath]);
    await until(async()=> (await json(join(dir,"ops/schedule.json"))).status==="waiting" && (await readFile(join(dir,"monitor.html"),"utf8")).includes("Training workers"));
    const duplicate=spawnSync(python,[join(root,"training/selfplay/supervise.py"),dir,"--node",process.execPath],{encoding:"utf8"});
    assert.notEqual(duplicate.status,0);
    assert.match(duplicate.stderr,/already running/);
    await writeFile(join(dir,"READY"),"fixture only\n");
    await until(async()=> (await json(join(dir,"ops/tasks/e01-train-duel-b.json"))).state==="retry");
    supervisor.kill("SIGTERM");
    await until(async()=> supervisor?.exitCode !== null || supervisor?.signalCode !== null);
    supervisor=run("supervise.py",[dir,"--node",process.execPath]);
    await until(async()=> (await json(join(dir,"ops/summary.json"))).state==="complete");
    const summary=await json(join(dir,"ops/summary.json"));
    assert.equal(summary.completedEpochs,2);
    for(const lane of ["duel-a","duel-b","pairs","pairs-private-senas"]) assert.equal(summary.resources[lane].trainingSeconds,2);
    const retry=await json(join(dir,"ops/tasks/e01-train-duel-b.json"));
    assert.equal(retry.attempts.length,2);assert.equal(retry.attempts[0].exitCode,75);
    assert.equal((await json(join(dir,"duel/b/checkpoint.json"))).totalTrainingSeconds,2);
    for(const f of ["pairs","pairs-private-senas"]) {
      assert.equal((await json(join(dir,f,"a/checkpoint.json"))).epoch,1);
      assert.equal((await json(join(dir,f,"b/checkpoint.json"))).epoch,2);
    }
    await until(async()=> {
      const page=await readFile(join(dir,"monitor.html"),"utf8");
      return page.includes("Starting champion retained") && formats.every(f=>page.includes(f+"/eval-final.json")) && !page.includes('http-equiv="refresh"');
    });
    await until(async()=>supervisor?.exitCode !== null || supervisor?.signalCode !== null);
    const html=await readFile(join(dir,"monitor.html"),"utf8");
    for(const f of formats)assert.ok(html.includes(f+"/eval-final.json"));
    assert.match(html,/Final candidate \/ reference/);
    const privateLines=(await readFile(join(dir,"progress.log"),"utf8")).split("\n").filter(row=>row.includes(" pairs-private-senas @"));
    assert.ok(privateLines.length);assert.ok(privateLines.every(l=>!l.includes("cejas")));
    const rerun=spawnSync(python,[join(root,"training/selfplay/supervise.py"),dir,"--node",process.execPath],{encoding:"utf8"});
    assert.equal(rerun.status,0,rerun.stderr);
    assert.deepEqual(await json(join(dir,"ops/summary.json")),summary);
  } finally {
    cleanup(supervisor);cleanup(monitor);
    await rm(dir,{recursive:true,force:true});
  }
});
