import { createHash } from "node:crypto";
import { aDecidir, iniciarOnline, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import { playMatch, sample, scheduledDeal } from "../arena/index.ts";
import { versions, type Move, type Policy, type PublicTurn, type Score, type SeatObservation } from "../contracts/index.ts";
import { incumbent, observe } from "../seat/index.ts";
import { commitTurn } from "../signals/index.ts";
import { coordinates, duelActorId, duelSchema, width, type DuelExport } from "./actor.ts";
import { normalized, uniform, type RandomState } from "./math.ts";
import { newReference, referenceStep, type ReferenceState } from "./reference.ts";

export interface DuelConfig {
  seed: number;
  iterations: number;
  buckets: number;
  expandDepth: number;
  exploration: number;
  referenceSteps: number;
  saveEvery: number;
}
export function validateConfig(config: DuelConfig) {
  for (const [k, min, max] of [
    ["seed", 0, 0xffffffff], ["iterations", 1, 1e9], ["buckets", 1, 65536], ["expandDepth", 1, 3],
    ["referenceSteps", 1, 1000000], ["saveEvery", 1, 1000000],
  ] as const) {
    if (!Number.isSafeInteger(config[k]) || config[k] < min || config[k] > max) throw new RangeError("Valor inválido de " + k);
  }
  if (!Number.isFinite(config.exploration) || config.exploration <= 0 || config.exploration > 1) {
    throw new RangeError("Exploración fuera de rango.");
  }
  return config;
}
interface Row { regret: number[]; average: number[]; visits: number }
export interface DuelState {
  schema: "duel-checkpoint-v1";
  config: DuelConfig;
  iteration: number;
  rootRng: RandomState;
  rolloutRng: [RandomState, RandomState];
  dealSeed: number;
  rows: Record<string, Row>;
  reference: ReferenceState;
  counters: { prefixDecisions: number; branches: number; terminalRollouts: number; maxRows: number };
}
function seedFor(seed: number, field: string) {
  return createHash("sha256").update("duel-training-v1/" + seed + "/" + field).digest().readUInt32BE();
}
export function newDuel(config: DuelConfig): DuelState {
  validateConfig(config);
  return {
    schema: "duel-checkpoint-v1", config: { ...config }, iteration: 0, rows: {},
    rootRng: { value: seedFor(config.seed, "root") },
    rolloutRng: [{ value: seedFor(config.seed, "rollout0") }, { value: seedFor(config.seed, "rollout1") }],
    dealSeed: seedFor(config.seed, "deal"),
    reference: newReference(seedFor(config.seed, "reference")),
    counters: { prefixDecisions: 0, branches: 0, terminalRollouts: 0, maxRows: 0 },
  };
}
function zeros(): number[] { return Array(width).fill(0); }
function rowFor(state: DuelState, k: string) {
  return state.rows[k] ??= { regret: zeros(), average: zeros(), visits: 0 };
}
function strategy(state: DuelState, obs: SeatObservation) {
  const { bucket, slots } = coordinates(obs, obs.legalActions, state.config.buckets);
  const row = state.rows[bucket];
  const regrets = slots.map(i => row?.regret[i] ?? 0);
  const base = regrets.some(v => v > 0) ? normalized(regrets) : incumbent.decide(obs, obs.legalActions);
  const e = state.config.exploration;
  return { bucket, slots, p: base.map(v => v * (1 - e) + e / slots.length) };
}
interface Node { state: EstadoOnline; hand: number; history: readonly PublicTurn[] }
function play(node: Node, seat: Asiento, move: Move): Node {
  const { state, turn } = commitTurn(node.state, seat, "duel", move);
  return { hand: node.hand, state, history: [...node.history, turn] };
}
function scoreOf(state: EstadoOnline): Score {
  const score: [number, number] = [...state.puntosInicio];
  for (const c of state.cobros) score[c.equipo] = Math.min(state.meta, score[c.equipo] + c.tantos);
  return score;
}
const prefix: Policy = {
  id: "uniform-prefix-v1",
  decide(_observation, legal) { return legal.map(() => 1 / legal.length); },
};

export function duelStep(state: DuelState) {
  const update = state.iteration % 2;
  let root: Node | undefined;
  let choices = 0;
  const ownReach = [1, 1];
  // Una política de cobertura fija visita conjuntos, independiente de los pesos que
  // aprende. Acumulamos la estrategia actual con su alcance propio hasta cada visita.
  playMatch({
    format: "duel", seed: state.dealSeed, pair: state.iteration, leg: 0, policies: () => prefix,
    onDecision(d) {
      const sigma = strategy(state, d.observation);
      const row = rowFor(state, sigma.bucket);
      row.visits++;
      sigma.slots.forEach((slot, i) => { row.average[slot] += ownReach[d.seat] * sigma.p[i]; });
      ownReach[d.seat] *= sigma.p[d.observation.legalActions.indexOf(d.action)];
      state.counters.prefixDecisions++;
      if (d.seat === update && uniform(state.rootRng) < 1 / ++choices) {
        root = { state: d.state, hand: d.hand, history: d.observation.history };
      }
    },
  });
  const delta = new Map<string, number[]>();
  // La estrategia queda congelada durante todo el árbol. En la frontera sólo
  // cambia la política de muestreo: se juega hasta el ganador del chico real.
  function traverse(start: Node, depth: number): number {
    let node = start;
    while (true) {
      if (node.state.resultado) {
        const score = scoreOf(node.state);
        if (Math.max(...score) >= 40) {
          state.counters.terminalRollouts++;
          return score[update] === 40 ? 1 : -1;
        }
        const hand = node.hand + 1;
        node = { hand, state: iniciarOnline(scheduledDeal("duel", state.dealSeed, state.iteration, hand), score), history: [] };
      }
      const seat = aDecidir(node.state)[0];
      const obs = observe(node.state, seat, "duel", node.history);
      const actions = obs.legalActions as readonly Move[];
      const { bucket, slots, p } = strategy(state, obs);
      if (seat === update && depth > 0 && actions.length > 1) {
        const values = actions.map(move => traverse(play(node, seat, move), depth - 1));
        const expected = values.reduce((sum, v, i) => sum + v * p[i], 0);
        const change = delta.get(bucket) ?? zeros();
        slots.forEach((slot, i) => { change[slot] += values[i] - expected; });
        delta.set(bucket, change);
        state.counters.branches++;
        return expected;
      }
      node = play(node, seat, actions[sample(p, actions.length, uniform(state.rolloutRng[seat as 0 | 1]))]);
    }
  }
  if (root) traverse(root, state.config.expandDepth);
  for (const [k, change] of delta) {
    const row = rowFor(state, k);
    change.forEach((v, i) => { row.regret[i] += v; });
  }
  state.counters.maxRows = Math.max(state.counters.maxRows, Object.keys(state.rows).length);
  for (let i = 0; i < state.config.referenceSteps; i++) referenceStep(state.reference);
  state.iteration++;
}

export function exportDuel(state: DuelState): DuelExport {
  const average = Object.fromEntries(Object.entries(state.rows).map(([k, row]) => [k, [...row.average]]));
  return { schema: duelSchema, format: "duel", actor: versions.actor, observation: versions.observation,
    actions: versions.actions, rules: versions.rules, buckets: state.config.buckets, id: duelActorId(state.config.buckets, average), average };
}
