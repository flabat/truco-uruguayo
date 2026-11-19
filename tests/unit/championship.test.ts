import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { artifactPin } from "../../api/actor-registry.ts";
import { versions } from "../../training/contracts/index.ts";
import { duelActorId, duelSchema, width } from "../../training/duel/actor.ts";
import { summarize } from "../../training/eval/statistics.ts";
import { decision, register } from "../../training/championship/event.ts";
import { checkArtifact, families, roleAt, sha } from "../../training/championship/field.ts";

test("el campeonato mantiene los umbrales directos, familiares y operativos", () => {
  const arm = (wins: [number, number], old: [number, number]) =>
    Array.from({ length: 32 }, (_, pair) => ({ pair, candidate: wins, incumbent: old }));
  const score = (direct: [number, number], challenge: [number, number]) =>
    summarize(
      [
        { id: "v1", pairs: arm(direct, [0, 1]) },
        { id: "counter", pairs: arm(challenge, [1, 1]) },
      ],
      "v1",
      1000,
    );
  assert.equal(decision(score([1, 1], [1, 1]), 0, .005), "pass");
  assert.equal(decision(score([1, 1], [1, 1]), .006, .005), "failed");
  assert.equal(decision(score([1, 1], [0, 0]), 0, .005), "failed");
  assert.equal(decision(score([0, 0], [1, 1]), 0, .005), "failed");
  const uncertain = arm([1, 0], [1, 0]);
  uncertain.forEach((p, i) => p.candidate = [i % 2, i % 2]);
  assert.equal(decision(summarize([{ id: "v1", pairs: uncertain }], "v1", 1000), 0, .005), "inconclusive");
});

test("reintentar la inscripción conserva el compromiso y comprueba sus archivos", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "championship-registration-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const registryPins: Record<string, string> = {};
  function fixture(id: string, trainingSeed: number) {
    const average = { "0": Array(width).fill(trainingSeed) };
    const model = {
      ...versions,
      schema: duelSchema,
      id: duelActorId(64, average),
      buckets: 64,
      format: "duel",
      average,
    };
    const raw = JSON.stringify(model);
    registryPins[id] = artifactPin(model);
    const file = id + ".json";
    writeFileSync(join(dir, file), raw);
    return { id, lineage: id, file, trainingSeed, sha256: sha(raw) };
  }
  const candidate = fixture("candidate", 1),
    independent = fixture("independent", 2),
    response = fixture("counter", 3);
  const proof = JSON.stringify({
    format: "duel",
    completedMatches: 1,
    trainingSeed: response.trainingSeed,
    trainedAgainstSha256: candidate.sha256,
    chosen: response.sha256,
  });
  writeFileSync(join(dir, "proof.json"), proof);
  const counter = {
    ...response,
    trainedAgainstSha256: candidate.sha256,
    trainingReceipt: "proof.json",
    trainingReceiptSha256: sha(proof),
  };
  const bundle = join(dir, "bundle.json"), target = join(dir, "plan");
  writeFileSync(
    bundle,
    JSON.stringify({
      schema: "league-championship-input-v1",
      format: "duel",
      registryPins,
      candidate,
      independent,
      counter,
    }),
  );
  const registered = await register(bundle, target);
  assert.deepEqual(await register(bundle, target), registered);
  assert.equal(sha(readFileSync(join(target, "plan.json"))), registered.sha256);
  writeFileSync(join(target, "referee-key"), "alterada");
  await assert.rejects(register(bundle, target));
});

test("se pesa igual a los adversarios, con ambos tipos de compañero en parejas", () => {
  for (const format of ["duel", "pairs", "pairs-senas"] as const) {
    const entries = families({ format } as Parameters<typeof families>[0]);
    assert.equal(new Set(entries.map((f) => f.id)).size, entries.length);
    assert.ok(entries.some((f) => f.opponent === "counter"));
    assert.ok(entries.some((f) => f.opponent === "independent"));
    for (const opponent of new Set(entries.map((f) => f.opponent))) {
      assert.deepEqual(
        entries.filter((f) => f.opponent === opponent).map((f) => f.lineup),
        format === "duel" ? ["fixed"] : ["fixed", "unseen"],
      );
    }
  }
});

test("la inscripción verifica cada asiento y el compañero desconocido rota en las dos mangas", async () => {
  const { header, monteCarloId } = await import("../../training/partners/policy.ts");
  const bytes = Buffer.from(JSON.stringify({ ...header("pairs"), kind: monteCarloId, seats: [{}, {}, {}, null] }));
  assert.throws(() => checkArtifact(bytes, "pairs", sha(bytes)), /inválidos/);
  for (const leg of [0, 1]) {
    assert.equal(roleAt(leg, leg, 0, "unseen"), "teammate");
    assert.equal(roleAt(leg + 2, leg, 0, "unseen"), "tested");
    assert.equal(roleAt(leg + 2, leg, 1, "unseen"), "teammate");
    assert.equal(roleAt(1 - leg, leg, 0, "unseen"), "opponent");
    assert.equal(roleAt(leg, leg, 0, "fixed"), "tested");
  }
});
