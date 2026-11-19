import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { playMatch, replayMatch } from "../../training/arena/index.ts";
import { incumbent } from "../../training/seat/index.ts";
import { asDuelActor, loadDuelActor } from "../../training/duel/actor.ts";
import { loadCheckpoint, trainDuel } from "../../training/duel/cli.ts";
import { exactResponses, newReference, referenceAverage, referenceStep, type ReferencePolicy } from "../../training/duel/reference.ts";
import { duelStep, exportDuel, newDuel } from "../../training/duel/train.ts";

const local = { seed: 17, iterations: 9, buckets: 64, expandDepth: 1, exploration: 0.1, referenceSteps: 4, saveEvery: 1 };

test("la referencia exacta verifica el equilibrio mixto de Kuhn y detecta otra respuesta explotable", () => {
  const mixed: ReferencePolicy = {};
  // Equilibrio de la familia con alfa=1/3. Cada par expresa [pasar, apostar]
  // o [retirarse, pagar], según el historial ya observado.
  const bet = (p: number) => [1 - p, p];
  const odds = { "": [1 / 3, 0, 1], p: [1 / 3, 0, 1], b: [0, 1 / 3, 1], pb: [0, 2 / 3, 1] };
  for (const [h, frequencies] of Object.entries(odds)) frequencies.forEach((p, card) => { mixed[card + "/" + h] = bet(p); });
  const exact = exactResponses(mixed);
  assert.ok(Math.abs(exact.value + 1 / 18) < 1e-12);
  assert.ok(exact.exploitability < 1e-12);
  mixed["2/b"] = [1, 0];
  assert.ok(exactResponses(mixed).exploitability > 0.04);
});

test("el muestreo externo converge contra respuestas exactas con tres semillas fijas", () => {
  for (const seed of [17, 64, 821]) {
    const state = newReference(seed);
    for (let i = 0; i < 14000; i++) referenceStep(state);
    const average = referenceAverage(state);
    for (const probabilities of Object.values(average)) {
      assert.ok(probabilities.every(v => Number.isFinite(v) && v >= 0));
      assert.ok(Math.abs(probabilities.reduce((s, p) => s + p, 0) - 1) < 1e-10);
    }
    const answer = exactResponses(average);
    assert.ok(answer.exploitability < 0.025, JSON.stringify(answer));
    assert.ok(Math.abs(answer.value + 1 / 18) < 0.008, JSON.stringify(answer));
  }
});

test("la estrategia media de pb pesa la probabilidad de haber pasado antes", () => {
  const state = newReference(1);
  state.rows["1/"].regret = [1, 3];
  state.rows["1/pb"].regret = [1, 0];
  referenceStep(state);
  assert.deepEqual(state.rows["1/pb"].average, [0.25, 0]);
  assert.deepEqual(state.rows["1/"].average, [0.25, 0.75]);
});

test("una corrida acotada juega hasta 40, conserva el límite de filas y exporta sólo el actor", () => {
  const state = newDuel(local);
  for (let i = 0; i < local.iterations; i++) duelStep(state);
  const artifact = exportDuel(state);
  const policy = asDuelActor(artifact);
  assert.ok(state.counters.branches > 0);
  assert.ok(state.counters.terminalRollouts > state.counters.branches);
  assert.ok(Object.keys(artifact.average).length > 0 && Object.keys(artifact.average).length <= local.buckets);
  for (const k of ["rows", "regret", "dealSeed", "reference", "rootRng", "rolloutRng"]) assert.ok(!(k in artifact));
  const record = playMatch({ format: "duel", seed: 8467, pair: 12, leg: 0, policies: seat => seat === 0 ? policy : incumbent,
    onDecision(d) {
      const cloned = structuredClone(d.observation);
      assert.deepEqual(policy.decide(cloned, cloned.legalActions), policy.decide(d.observation, d.observation.legalActions));
    },
  });
  assert.deepEqual(replayMatch(record, 8467), record.score);
  assert.equal(Math.max(...record.score), 40);
  assert.throws(() => asDuelActor({ ...artifact, average: { 0: [NaN] } }), /inválida/);
});

test("el checkpoint guarda RNG, progresos y tablas: reanudar reproduce el actor y los resultados byte a byte", t => {
  const dir = mkdtempSync(join(tmpdir(), "duel-checkpoint-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, "config.json");
  writeFileSync(config, JSON.stringify(local));
  const split = join(dir, "split"), whole = join(dir, "whole");
  trainDuel(["--config", config, "--run", split, "--iterations", "3", "--eval-pairs", "1"]);
  const checkpoint = join(split, "checkpoint");
  assert.equal(loadCheckpoint(checkpoint).iteration, 3);
  const resumed = trainDuel(["--resume", checkpoint, "--eval-pairs", "1"]);
  const direct = trainDuel(["--config", config, "--run", whole, "--eval-pairs", "1"]);
  assert.deepEqual(resumed.artifacts, direct.artifacts);
  assert.deepEqual(resumed.matches, direct.matches);
  assert.equal(readFileSync(checkpoint, "utf8"), readFileSync(join(whole, "checkpoint"), "utf8"));
  assert.equal(loadDuelActor(join(split, "actor.json")).id, direct.actor);
  const corrupted = JSON.parse(readFileSync(checkpoint, "utf8"));
  corrupted.state.rolloutRng[0].value++;
  writeFileSync(checkpoint, JSON.stringify(corrupted));
  assert.throws(() => loadCheckpoint(checkpoint), /corrupto/);
});
