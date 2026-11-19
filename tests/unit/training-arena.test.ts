import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { formats, seatsFor } from "../../training/contracts/index.ts";
import { incumbent } from "../../training/seat/index.ts";
import { playMatch, playMatchAsync, replayMatch, sample, scheduledDeal } from "../../training/arena/index.ts";
import { newRun, run, verify } from "../../training/arena/runs.ts";

test("repartos por par y mano, rondas desde mano en las dos mesas", () => {
  assert.deepEqual(scheduledDeal("duel", 42, 0, 0), {
    versionReparto: "online-1", mano: 0, dador: 1, muestra: "bastos-05",
    manos: [["copas-02", "bastos-11", "espadas-11"], ["copas-07", "copas-01", "espadas-01"]],
  });
  assert.deepEqual(scheduledDeal("pairs", 42, 0, 0), {
    versionReparto: "online-1", mano: 0, dador: 3, muestra: "espadas-10",
    manos: [["bastos-07", "copas-04", "bastos-01"], ["copas-03", "espadas-04", "espadas-07"],
      ["copas-06", "oros-02", "oros-06"], ["espadas-11", "copas-07", "oros-10"]],
  });
  for (const format of formats) {
    for (let h = 0; h < 12; h++) {
      const d = scheduledDeal(format, 42, 3, h);
      assert.equal(d.mano, (3 + h) % seatsFor(format));
      assert.equal(new Set([...d.manos.flat(), d.muestra]).size, seatsFor(format) * 3 + 1);
    }
  }
});

test("muestreo respeta ceros, probabilidades y límites de cada intervalo", () => {
  assert.equal(sample([0, .25, 0, .75], 4, 0), 1);
  assert.equal(sample([0, .25, 0, .75], 4, .25), 3);
  for (const bad of [[1, 1], [NaN, 1], [Infinity, 0], [-.1, 1.1], [1]]) {
    assert.throws(() => sample(bad, 2, .5));
  }
});

test("un actor por asiento, simetría en las dos mangas, replay independiente y rechazo de cobros duplicados", () => {
  for (const format of formats) {
    const seats = new Set<number>();
    const base = {format, seed: 313, pair: 2, policies: (seat: number) => {
      assert.ok(!seats.has(seat)); seats.add(seat); return incumbent;
    }};
    const a = playMatch({...base, leg: 0});
    assert.equal(seats.size, seatsFor(format));
    const b = playMatch({...base, leg: 1, policies: () => incumbent});
    assert.deepEqual(a.hands, b.hands);
    assert.equal(a.winner + (1 - b.winner), 1);
    assert.deepEqual(replayMatch(a, 313), a.score);
    const changed = structuredClone(a);
    const turn = changed.hands.flatMap(h => h.turns).find(t => t.awards.length)!;
    Reflect.set(turn, "awards", [...turn.awards, ...turn.awards]);
    assert.throws(() => replayMatch(changed, 313));
    assert.throws(() => replayMatch(a, 312));
  }
});

test("reanudar en un límite de chico reproduce el manifiesto y detecta corrupción", t => {
  const dir = mkdtempSync(join(tmpdir(), "truco-arena-test-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const a = join(dir, "a"), b = join(dir, "b");
  for (const path of [a,b]) newRun(path, [...formats], 2, 401);
  assert.deepEqual(run(a, 3), {complete:false, verified:3});
  assert.deepEqual(run(a), run(b));
  const path = join(a, "manifest.json");
  const selected = verify(path, {}, "pairs-private-senas-0-0");
  assert.ok(selected.replay);
  assert.ok(selected.replay.hands.every(h => h.turns.every(turn => !Object.hasOwn(turn,"signal"))));
  assert.ok(!JSON.stringify(selected.replay).includes('"manos"'));
  const record = join(a, "matches", "duel-0-0.json.gz");
  const decoded = JSON.parse(gunzipSync(readFileSync(record)).toString());
  assert.equal(decoded.record.id, "duel-0-0");
  writeFileSync(record, "interrumpido");
  assert.throws(() => verify(path));
});

test("un cambio de política permite reproducir lo confirmado y protege el torneo sin terminar", t => {
  const dir = mkdtempSync(join(tmpdir(), "truco-replay-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, "finished"), planPath = join(path, "plan.json"), manifestPath = join(path, "manifest.json");
  newRun(path, ["duel"], 1, 708);
  run(path);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  plan.policies[incumbent.id] = "f".repeat(64);
  const recorded = JSON.stringify(plan) + "\n";
  writeFileSync(planPath, recorded);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.planSha256 = createHash("sha256").update(recorded).digest("hex");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.equal(verify(manifestPath, {}, "duel-0-0").verified, 1);
  const pending = join(dir, "pending");
  newRun(pending, ["duel"], 1, 708);
  writeFileSync(join(pending, "plan.json"), recorded);
  assert.throws(() => run(pending), /política/);
});

test("la arena rechaza señas públicas antes de consultar al primer jugador", async t => {
  const legacy = {format:"pairs-senas", seed:42, pair:0, leg:0} as const;
  const dir = mkdtempSync(join(tmpdir(), "truco-privacidad-"));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  assert.throws(() => newRun(join(dir,"run"), [legacy.format], 1, 42), /entre compañeros/);
  const unexpected = {id:"unexpected", decide() { throw new Error("actor consultado"); }};
  assert.throws(() => playMatch({...legacy, policies:() => unexpected}), /entre compañeros/);
  await assert.rejects(playMatchAsync({...legacy, responders:() => () => {throw new Error("actor consultado");}}), /entre compañeros/);
});
