import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import test, {type TestContext} from "node:test";
import {artifactPin} from "../../api/actor-registry.ts";
import {initial} from "../../training/anchored/actor.ts";
import {read, save} from "../../training/anchored/io.ts";
import {teamSignalsVersion} from "../../training/contracts/index.ts";
import {createLearner, duelInteractionsKind, duelOddsKind, selfplayKind} from "../../training/selfplay/learner.ts";
import {openTrainingTeam} from "../../training/selfplay/train.ts";
import {interval, pairOutcomes} from "../../training/league/development.ts";

const cli = fileURLToPath(new URL("../../training/selfplay/compare-duel.ts", import.meta.url));

function pilotFixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "truco-duel-odds-"));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const pilot = join(dir, "pilot"), run = join(dir, "comparison");
  const champion = createLearner(initial("duel")).actor;
  champion.weights[0] = 0.125;
  champion.updates = 1;
  const files: Record<string, string> = {};
  function register(path: string, model: unknown) {
    const target = join(pilot, path);
    mkdirSync(dirname(target), {recursive:true});
    save(target, model);
    files[path] = createHash("sha256").update(readFileSync(target)).digest("hex");
  }
  register("input/duel/champion-at-start.json", champion);
  register("input/duel/anchor-v1.json", initial("duel"));
  register("input/duel/archive/previous-anchored.json", initial("duel"));
  register("input/duel/archive/older-candidate.json", champion);
  // A pilot may contain a research starter that did not qualify as champion.
  register("input/duel/starter.json", initial("duel"));
  save(join(pilot, "protocol.json"), {
    schema:"continual-selfplay-league-v1", computerOnly:true, signals:teamSignalsVersion,
    seed:"parent-deals", sampler:"paired-regression-v1", files
  });
  function runCli(...options: string[]) {
    return spawnSync(process.execPath, [cli, "--from", pilot, "--run", run, "--seconds-per-arm", "0.001",
      "--pairs", "3", "--seed", "comparison-test", ...options], {encoding:"utf8", timeout:30_000});
  }
  return {pilot, run, champion, runCli};
}

const comparisons = [["baseline", "odds"], ["baseline", "odds", "interactions"]] as const;
for (const arms of comparisons) test(`el comparador de ${arms.length} modelos iguala el presupuesto y reproduce cada cruce con los asientos invertidos`, t => {
  const {pilot, run, champion, runCli} = pilotFixture(t);
  const options = arms.length === 3 ? ["--interactions"] : [];
  const result = runCli(...options);
  assert.equal(result.status, 0, result.stderr);
  const report = read(join(run, "comparison.json"));
  assert.deepEqual(Object.keys(report.arms).sort(), [...arms].sort());
  assert.equal(report.secondsPerArm, 0.001);
  assert.equal(report.pairs, 3);
  assert.equal(report.sourceChampionPin, artifactPin(champion));
  assert.notEqual(report.trainingSeed, report.evaluationSeed);

  const reference = openTrainingTeam(champion, "duel");
  type Team = typeof reference;
  const compare = (left: Team, right: Team) =>
    pairOutcomes("duel", seat => left[seat], seat => right[seat], report.pairs, report.evaluationSeed).results;
  const frozenContext = read(join(run, "baseline", "duel", "a", "epochs", "1.json"));
  const expectedKinds = {baseline:selfplayKind, odds:duelOddsKind, interactions:duelInteractionsKind};
  const trained = arms.map(arm => {
    const actor = read(join(run, arm, "duel", "a", "candidate.json"));
    const frozen = read(join(run, arm, "duel", "a", "epochs", "1.json"));
    const state = read(join(run, arm, "duel", "a", "checkpoint.json"));
    assert.deepEqual(frozen.champion.model, champion);
    assert.deepEqual(frozen, frozenContext);
    assert.equal(state.starterPin, artifactPin(champion));
    assert.equal(state.seed, report.trainingSeed);
    assert.ok(report.arms[arm].trainingSeconds >= report.secondsPerArm);
    assert.ok(report.arms[arm].games > 0);
    assert.equal(actor.weights.length, report.arms[arm].weights);
    assert.equal(artifactPin(actor), report.arms[arm].pin);
    assert.equal(actor.kind, expectedKinds[arm]);
    assert.equal(actor.weights.length, arm === "interactions" ? 11_264 : champion.weights.length);
    for (const learner of [state.learner, state.specialist]) {
      assert.equal(learner.actor.kind, actor.kind);
      assert.equal(learner.squaredGradient.length, actor.weights.length);
    }
    if (arm === "interactions") assert.ok(actor.weights.slice(champion.weights.length).some((w: number) => w !== 0));
    return openTrainingTeam(actor, "duel");
  });
  const [baseline, odds, interactions] = trained;
  const direct = compare(odds, baseline);
  assert.deepEqual(report.headToHead, interval(direct));
  assert.deepEqual(report.dealPairWinRates.oddsVsBaseline, direct);
  const [controlResults, oddsResults, interactionResults] = trained.map((team, i) => {
    const results = compare(team, reference);
    assert.deepEqual(report.againstChampion[arms[i]], interval(results));
    assert.deepEqual(report.dealPairWinRates[arms[i] + "VsChampion"], results);
    return results;
  });
  assert.deepEqual(report.againstChampion.delta, interval(oddsResults.map((wins, i) => wins - controlResults[i])));
  if (interactions) {
    const interactionsVsBaseline = compare(interactions, baseline), interactionsVsOdds = compare(interactions, odds);
    assert.deepEqual(report.matchups, {oddsVsBaseline:interval(direct),
      interactionsVsBaseline:interval(interactionsVsBaseline), interactionsVsOdds:interval(interactionsVsOdds)});
    assert.deepEqual(report.dealPairWinRates.interactionsVsBaseline, interactionsVsBaseline);
    assert.deepEqual(report.dealPairWinRates.interactionsVsOdds, interactionsVsOdds);
    assert.deepEqual(report.againstChampion.interactionsMinusOdds,
      interval(interactionResults.map((wins, i) => wins - oddsResults[i])));
  }
  assert.deepEqual(read(join(pilot, "input/duel/champion-at-start.json")), champion);

  const previous = readFileSync(join(run, "comparison.json"), "utf8");
  assert.notEqual(runCli(...options).status, 0);
  const wrongMode = interactions ? runCli("--resume") : runCli("--interactions", "--resume");
  assert.notEqual(wrongMode.status, 0);
  assert.equal(readFileSync(join(run, "comparison.json"), "utf8"), previous);
  rmSync(join(run, "comparison.json"));
  const resumed = runCli(...options, "--resume");
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(read(join(run, "comparison.json")), report);
  if (interactions) {
    const reopened = runCli("--interactions", "--resume");
    assert.equal(reopened.status, 0, reopened.stderr);
    const candidatePath = join(run, report.arms.interactions.model);
    const candidate = read(candidatePath);
    candidate.updates++;
    save(candidatePath, candidate);
    assert.notEqual(runCli("--interactions", "--resume").status, 0);
  }
});

test("rechaza un campeón del piloto modificado después de registrar sus entradas", t => {
  const {pilot, champion, runCli} = pilotFixture(t);
  champion.updates++;
  save(join(pilot, "input/duel/champion-at-start.json"), champion);
  const result = runCli();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /champion-at-start|hash|pin|changed/i);
});

test("el destino nunca crea archivos dentro del piloto de origen", t => {
  const {pilot, run, runCli} = pilotFixture(t);
  symlinkSync(pilot, run, "dir");
  const nested = join(run, "new", "comparison");
  const result = runCli("--run", nested);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(pilot, "new")), false);
});
