import assert from "node:assert/strict";
import test from "node:test";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initial, type CycleFormat } from "../../training/anchored/actor.ts";
import { read, save } from "../../training/anchored/io.ts";
import { openTrainingTeam, runSlice } from "../../training/selfplay/train.ts";

function fixture(format: CycleFormat) {
  const root=mkdtempSync(join(tmpdir(),"truco-league-worker-"));
  const input=join(root,"input",format), active=join(root,format);
  mkdirSync(join(input,"archive"),{recursive:true});
  mkdirSync(active,{recursive:true});
  const actor=initial(format);
  save(join(input,"starter.json"),actor);
  save(join(input,"anchor-v1.json"),actor);
  save(join(active,"champion.json"),actor);
  save(join(root,"protocol.json"),{seed:"worker-test"});
  return root;
}

function learned(state: ReturnType<typeof runSlice>) {
  const {trainingSeconds,totalTrainingSeconds,...deterministic}=state;
  return deterministic;
}

test("dos trozos reanudados producen los mismos pesos, optimizador, rivales, decisiones y RNG", () => {
  const one=fixture("duel"), two=fixture("duel");
  try {
    const whole=runSlice(one,"duel","a",{epoch:1,seconds:0,games:18});
    const partial=runSlice(two,"duel","a",{epoch:1,seconds:0,games:7});
    assert.equal(partial.games,7);
    assert.equal(partial.counterGames,1);
    const resumed=runSlice(two,"duel","a",{epoch:1,seconds:0,games:18});
    assert.deepEqual(learned(resumed),learned(whole));
    assert.ok(resumed.learnerUpdates>0 && resumed.counterUpdates>0 && resumed.learningDecisions<resumed.decisions);
    assert.ok(resumed.learner.actor.weights.some(w=>w!==0));
    assert.ok(resumed.specialist.actor.weights.some(w=>w!==0));
    assert.ok(resumed.record["latest-self"].games>0 && resumed.record["best-response"].games>0);
    const dir=join(two,"duel","a");
    assert.deepEqual(read(join(dir,"candidate.json")),read(join(dir,"archive","1-candidate.json")));
    assert.deepEqual(read(join(dir,"counter.json")),resumed.specialist.actor);
    // Repeating an already committed wall-time target regenerates the exports without playing a game.
    rmSync(join(dir,"candidate.json"));
    const duplicate=runSlice(two,"duel","a",{epoch:1,seconds:resumed.trainingSeconds});
    assert.deepEqual(resumed,duplicate);
    assert.deepEqual(read(join(dir,"candidate.json")),resumed.learner.actor);
  } finally { for (const root of [one,two]) rmSync(root,{recursive:true,force:true}); }
});

test("en parejas rota el compañero independiente, cambia de campeón por época y omite gestos privados del log",() => {
  const f="pairs-private-senas",root=fixture(f);
  try {
    const input=join(root,"input",f), dir=join(root,f,"a");
    save(join(input,"archive","silent.json"),initial("pairs"));
    // An archived opponent with the historical public gesture format cannot enter training.
    save(join(input,"archive","public.json"),{...initial(f),format:"pairs-senas"});
    assert.throws(()=>runSlice(root,f,"a",{epoch:1,seconds:0,games:1}),/Incompatible/);
    // Rejecting input before a durable checkpoint does not make an invalid epoch reusable.
    rmSync(join(input,"archive","public.json"));
    const one=runSlice(root,f,"a",{epoch:1,seconds:0,games:10});
    const other=runSlice(root,f,"b",{epoch:1,seconds:0,games:4});
    assert.notEqual(one.seed,other.seed);
    save(join(root,f,"champion.json"),one.learner.actor);
    const two=runSlice(root,f,"a",{epoch:2,seconds:0,games:17});
    const context=read(join(dir,"epochs","2.json"));
    assert.equal(context.peers[0].name,"peer:epoch-1");
    assert.deepEqual(context.peers[0].model,other.learner.actor);
    assert.equal(context.previous.name,one.counterTarget);
    assert.notEqual(two.counterTarget,one.counterTarget);
    assert.equal(two.targetCounterGames,1);
    assert.throws(()=>runSlice(root,f,"a",{epoch:1,seconds:0,games:20}),/obsolete/);
    const events=readFileSync(join(root,"events",f+".jsonl"),"utf8").trim().split("\n").map(line=>JSON.parse(line));
    assert.ok(events.some(e=>e.teammate && e.teammate!=="self"));
    for(const event of events) {
      assert.doesNotMatch(event.action??"", /\/|cejas|nariz|beso|labios|lengua/);
      assert.equal("observation" in event,false);
    }
    assert.throws(()=>openTrainingTeam({...initial("pairs"),format:"duel"},"pairs"),/Incompatible/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("solo un proceso puede escribir cada linaje y el presupuesto confirmado no se cobra dos veces",() => {
  const root=fixture("pairs"),dir=join(root,"pairs","a");
  mkdirSync(dir);
  const fd=openSync(join(dir,"writer.lock"),"a");
  try {
    const lock=spawnSync("python3",["-c","import fcntl; fcntl.flock(3, fcntl.LOCK_EX)"],{stdio:["ignore","ignore","pipe",fd]});
    assert.equal(lock.status,0);
    assert.throws(()=>runSlice(root,"pairs","a",{epoch:1,seconds:0}),/Another process/);
  } finally {closeSync(fd);}
  try {
    const first=runSlice(root,"pairs","a",{epoch:1,seconds:0.02});
    assert.ok(first.trainingSeconds>=0.02 && first.games>0);
    const second=runSlice(root,"pairs","a",{epoch:1,seconds:0.02});
    assert.deepEqual(first,second);
  } finally {rmSync(root,{recursive:true,force:true});}
});
