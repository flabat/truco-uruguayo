import assert from "node:assert/strict";
import test from "node:test";
import { evaluarTantos } from "@eltruco/motor/tantos.ts";
import { crearAzar, type RepartoOnline } from "@eltruco/motor/reparto.ts";
import { iniciarOnline } from "@eltruco/motor/mesa-online.ts";
import { baseline } from "../../training/baselines/index.ts";
import { incumbent } from "../../training/seat/index.ts";
import { commitTurn } from "../../training/signals/index.ts";
import { drawDeal, duelRange, inferWorld, posterior, seatView } from "../../training/search/belief.ts";
import { calibrate, continuation, fitContinuation, type Continuation } from "../../training/search/continuation.ts";
import { boundedSearch, refine, type Diagnostics } from "../../training/search/index.ts";

const duel: RepartoOnline = { versionReparto: "online-1", dador: 1, mano: 0, muestra: "bastos-01",
  manos: [["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"]] };
const field = () => incumbent;
const table: Continuation = { schema: "score-continuation-v1", format: "duel", seed: 7, matches: 1,
  field: [incumbent.id, incumbent.id], exact: {}, bands: {} };
const options = { table, field, deadlineMs: 1000, worlds: 3, proposals: 64, duelRisk: .02 };

test("la falta inicial de la regresión pondera 7140 manos y cambia con el estilo del cantor", () => {
  const offer = commitTurn(iniciarOnline(duel), 0, "duel", "falta-envido");
  const obs = seatView(offer.state, 1, "duel", [offer.turn]);
  for (const [style, expectedSupport, expectedWin] of [
    [incumbent, 403, 0], [baseline("frequent-bluff"), 5918, .5181744091279195],
  ] as const) {
    const range = duelRange(obs, () => style);
    assert.equal(range.enumerated, 7140);
    assert.equal(range.worlds.length, 5918); // Las flores no pueden abrir con falta.
    assert.equal(range.probabilities.filter(w => w > 0).length, expectedSupport);
    let win = 0;
    range.worlds.forEach((w, i) => {
      const hidden = w.state.mano.reparto.manos[0];
      assert.ok(hidden.every(c => c !== obs.view.muestra && !obs.originalCards.includes(c)));
      // El empate lo gana el rival que es mano en este fixture.
      if (evaluarTantos(hidden, obs.view.muestra).total < obs.view.tantosPropios.total) win += range.probabilities[i];
    });
    assert.ok(Math.abs(win - expectedWin) < 1e-10);
  }
  const accepted = commitTurn(offer.state, 1, "duel", "quiero");
  assert.deepEqual(accepted.state.resultado, { equipo: 0, tantos: 40, motivo: "envido" });
});

test("los repartos conjuntos respetan cartas vistas, rechazan revelaciones incompatibles y reproducen las señas", () => {
  const pairs = { ...duel, dador: 3, mano: 0, manos: [...duel.manos,
    ["espadas-01","espadas-02","espadas-04"], ["oros-01","copas-01","espadas-05"]] } as RepartoOnline;
  const first = commitTurn(iniciarOnline(pairs), 0, "pairs-private-senas", "cejas/espadas-03");
  const obs = seatView(first.state, 2, "pairs-private-senas", [first.turn]);
  const seenByOpponent = seatView(first.state, 1, "pairs-private-senas", [first.turn]);
  const silentTurn = {action:first.turn.action, awards:first.turn.awards};
  assert.deepEqual(seenByOpponent, seatView(first.state, 1, "pairs-private-senas", [silentTurn]));
  const alwaysSignals = () => ({id:"seña con cada carta", decide(_obs, legal) {
    return legal.map(id => Number(id === "cejas/espadas-03"));
  }}) satisfies ReturnType<typeof field>;
  assert.equal(inferWorld(seenByOpponent, pairs, alwaysSignals)?.logLikelihood, 0);
  const rng = crearAzar(12);
  for (let i = 0; i < 60; i++) {
    const d = drawDeal(obs, rng);
    assert.equal(new Set([d.muestra, ...d.manos.flat()]).size, 13);
    assert.deepEqual(d.manos[2], obs.originalCards);
    assert.ok(d.manos[0].includes("espadas-03"));
    const world = inferWorld(obs, d, field);
    if (evaluarTantos(d.manos[0], d.muestra).modalidad === "flor") assert.equal(world, null);
    else { assert.ok(world); assert.equal(world.logLikelihood, -Infinity); }
  }
  const w = inferWorld(obs, pairs, field)!;
  assert.deepEqual(posterior([w, w]), { probabilities: [.5,.5], uniformFallback: true });
  assert.equal(inferWorld({ ...obs, history: [{ ...first.turn, awards: [{ equipo: 0, tantos: 40, motivo: "truco" }] }] }, pairs, field), null);
});

test("continuación usa formato, ambos tanteadores y el siguiente dador, con extremos exactos", () => {
  const evidence = { ...table, exact: { "19/37/0": { wins: 8, hands: 8 }, "19/37/1": { wins: 0, hands: 8 } },
    bands: { "2/4/0": { wins: 8, hands: 8 }, "2/4/1": { wins: 0, hands: 8 } } };
  assert.ok(continuation(evidence, [19,37], 0) > continuation(evidence,[19,37],1));
  assert.equal(continuation(evidence,[40,39],1), 1);
  assert.equal(continuation(evidence,[39,40],0), 0);
  assert.throws(() => continuation(evidence,[40,40],0), /inválido/);
  assert.throws(() => continuation(evidence,[20,20],2), /inválido/);
  for (const format of ["duel","pairs","pairs-private-senas"] as const) {
    const trained = fitContinuation(format, field, 218, 4);
    const calibration = calibrate(trained, field, 219, 3);
    assert.ok(calibration[0].hands >= 3);
    assert.ok(calibration.every(b => b.brier == null || (b.brier >= 0 && b.brier <= 1)));
    assert.throws(() => calibrate(trained, field, 218, 2), /independiente/);
  }
});

test("el límite contrafáctico por tenencia contiene la pérdida de la desviación ganadora en promedio", () => {
  const prior = [1,0], returns = [[.9,.7],[.1,.9]], range = [.2,.8];
  assert.deepEqual(refine(prior, returns, range, null), [0,1]);
  assert.deepEqual(refine(prior, returns, range, 0), prior);
  const safe = refine(prior, returns, range, .02);
  assert.ok(Math.abs(safe[1] - .1) < 1e-12);
});

test("el mismo asiento produce las mismas probabilidades y, si vence el plazo, devuelve su base legal", () => {
  const first = iniciarOnline(duel);
  const other = iniciarOnline({ ...duel, manos: [duel.manos[0], ["copas-02","copas-03","copas-04"]] });
  const a = seatView(first,0,"duel",[]), b = seatView(other,0,"duel",[]);
  const visits: Diagnostics[] = [];
  const policy = boundedSearch(options, d => visits.push(d), () => 0);
  assert.deepEqual(policy.decide(a,a.legalActions), policy.decide(b,b.legalActions));
  assert.ok(visits.every(d => d.result === "searched" && d.worlds === 3));
  const expired = boundedSearch({ ...options, deadlineMs: 0 }, d => visits.push(d), () => 0);
  assert.deepEqual(expired.decide(a,a.legalActions), incumbent.decide(a,a.legalActions));
  assert.equal(visits.at(-1)?.result, "timeout");
});
