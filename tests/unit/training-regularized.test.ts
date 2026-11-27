import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline, vistaParaPolitica, type AccionOnline } from "@eltruco/motor/mesa-online.ts";
import type { RepartoOnline } from "@eltruco/motor/reparto.ts";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import { observe } from "../../training/seat/index.ts";
import { actionOf, encode, featureSize, slotCount, slotOf } from "../../training/regularized/features.ts";
import { contextOf, playChico, rng, type Agent, type Mode } from "../../training/regularized/env.ts";
import { encodeNetwork, regularizedKind, type Network, type RegularizedArtifact } from "../../training/regularized/network.ts";
import { duelBaseline, pieBaseline } from "../../training/regularized/opponents.ts";
import { featureVersion } from "../../training/regularized/features.ts";

function randomNetwork(seed: number, hidden = [16, 16]): Network {
  const r = rng(seed);
  const sizes = [featureSize(), ...hidden, slotCount];
  return { layers: sizes.slice(1).map((rows, i) => ({ rows, cols: sizes[i],
    w: Float32Array.from({ length: rows * sizes[i] }, () => (r() - 0.5) * 0.4), b: new Float32Array(rows) })) };
}
function artifact(seed: number): RegularizedArtifact {
  return { kind: regularizedKind, format: "duel", features: featureVersion, memory: "opponent", ...encodeNetwork(randomNetwork(seed)) };
}

/** Comprueba cada decisión del agente envuelto antes de delegarla. */
function checked(inner: Agent, seen: { decisions: number }): Agent {
  return { id: inner.id, act(s) {
    const ctx = contextOf(s);
    const { x, mask, cards } = encode(ctx);
    assert.equal(x.length, featureSize());
    assert.ok(x.every(Number.isFinite));
    const legal = new Set<number>();
    for (const tipo of ctx.vista.legales) {
      if (tipo === "carta") for (const c of ctx.vista.cartas) legal.add(slotOf({ tipo, carta: c }, cards));
      else legal.add(slotOf({ tipo }, cards));
    }
    assert.deepEqual([...mask.keys()].filter(i => mask[i]), [...legal].sort((a, b) => a - b));
    for (const slot of legal) {
      const action = actionOf(slot, cards, s.seat);
      assert.equal(slotOf(action as { tipo: AccionOnline["tipo"]; carta?: never }, cards), slot);
    }
    seen.decisions++;
    return inner.act(s);
  } };
}

test("las ranuras cubren exactamente las jugadas legales en duelo y al pie", () => {
  const seen = { decisions: 0 };
  const cases: [Mode, Agent][] = [["duel-prod", duelBaseline("v1")], ["duel-arena", duelBaseline("frequent-bluff")],
    ["pie", pieBaseline("pie-parejas-v2")], ["pie", pieBaseline("pie-strong-cards")]];
  const random = rng(7);
  for (const [mode, agent] of cases) {
    for (let i = 0; i < 6; i++) {
      const a = checked(agent, seen);
      const result = playChico(mode, mode === "pie" ? [a, a, a, a] : [a, a], random);
      assert.equal(Math.max(...result.score), 40);
    }
  }
  assert.ok(seen.decisions > 1000);
});

test("los rasgos del actor no dependen de la mano del rival", () => {
  const base: RepartoOnline = { versionReparto: "online-1", dador: 1, mano: 0, muestra: "bastos-01",
    manos: [["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"]] };
  const other: RepartoOnline = { ...base, manos: [base.manos[0], ["copas-04", "copas-05", "espadas-12"]] };
  const view = (deal: RepartoOnline) => encode({ vista: vistaParaPolitica(iniciarOnline(deal), 0), score: [3, 5], target: 40 }).x;
  assert.deepEqual(view(base), view(other));
});

test("el actor regularizado se registra y reparte probabilidad sobre las jugadas legales", () => {
  const model = artifact(3);
  assert.match(artifactPin(model), /^[0-9a-f]{64}$/);
  const deal: RepartoOnline = { versionReparto: "online-1", dador: 1, mano: 0, muestra: "oros-05",
    manos: [["oros-02", "espadas-01", "copas-03"], ["bastos-07", "oros-12", "copas-01"]] };
  for (const seat of [0, 1] as const) {
    const actor = openActor(model, "duel", seat);
    const state = iniciarOnline(deal, [10, 20]);
    const obs = { ...observe(state, 0, "duel", [], vistaParaPolitica), rivalCounts: Array(12).fill(1) };
    const p = actor.decide(obs, obs.legalActions);
    assert.equal(p.length, obs.legalActions.length);
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(p.every(v => v >= 0 && Number.isFinite(v)));
  }
  assert.throws(() => openActor({ ...model, features: "otra" }, "duel", 0), /incompatible/);
  assert.throws(() => openActor({ ...model, weights: model.weights.slice(0, 40) }, "duel", 0));
});

test("el actor al pie elige una jugada legal en parejas y tercetos", async () => {
  const { openRegularizedPie } = await import("../../training/regularized/actor.ts");
  const { vistaOnline, aDecidir } = await import("@eltruco/motor/mesa-online.ts");
  const { vistaDelPie } = await import("@eltruco/motor/senas-pie.ts");
  const { deal } = await import("../../training/regularized/env.ts");
  for (const [format, mode, seats, target] of [["pairs-private-senas", "pie", 4, 40], ["triples", "tercetos", 6, 50]] as const) {
    const decide = openRegularizedPie({ ...artifact(9), format, memory: undefined });
    const estado = iniciarOnline(deal(mode, rng(4), 0), [0, 0], target, 1);
    const seat = aDecidir(estado)[0];
    const vista = vistaOnline(estado, seat);
    const action = decide(vista, vistaDelPie(estado, seat, []), [], [0, 0], target, 0.3);
    assert.ok(action && (vista.legales as string[]).includes(action.tipo), format);
    assert.equal(vista.asiento, action.asiento);
    assert.equal(seats, estado.mano.reparto.manos.length);
  }
});
