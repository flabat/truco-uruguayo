import { parentPort } from "node:worker_threads";
import { playChico, rng, seatsOf, type Agent, type Mode } from "./env.ts";
import { makeAgent, rawNetwork, ROW, writeRows } from "./agents.ts";
import type { Network } from "./network.ts";

/** Una entrada de la liga: el equipo A (aprendiz o candidato) contra el equipo B. Un asiento por elemento y equipo. */
export interface Lineup { a: string[]; b: string[]; weight?: number; name?: string }
export interface WeightsMessage { shapes: [number, number][]; data: Float32Array }
export interface CollectJob { type: "collect"; id: number; weights: WeightsMessage; mix: Lineup[]; modes: Mode[]; modeWeights: number[];
  rows: number; seed: number; target?: number }
export interface EvalJob { type: "eval"; id: number; weights?: WeightsMessage; lineup: Lineup; mode: Mode; pairs: number[]; seed: number;
  target?: number }
export interface PairResult { pair: number; wins: [number, number]; hands: number; points: number[] }

function agentsFor(lineup: Lineup, mode: Mode, swap: boolean, current: Network | undefined): { agents: Agent[]; teamA: 0 | 1 } {
  const n = seatsOf(mode);
  const teamA = (swap ? 1 : 0) as 0 | 1;
  const agents: Agent[] = [];
  for (let seat = 0; seat < n; seat++) {
    const team = seat % 2;
    const specs = team === teamA ? lineup.a : lineup.b;
    const spec = specs[Math.floor(seat / 2) % specs.length];
    agents.push(makeAgent(spec, mode, current));
  }
  return { agents, teamA };
}

function pick(weights: readonly number[], u: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) { acc += weights[i] / total; if (u < acc) return i; }
  return weights.length - 1;
}

let cached: { data: Float32Array; net: Network } | undefined;
function network(w?: WeightsMessage) {
  if (!w) return undefined;
  if (cached?.data === w.data) return cached.net;
  cached = { data: w.data, net: rawNetwork(w.shapes, w.data) };
  return cached.net;
}

function collect(job: CollectJob) {
  const random = rng(job.seed);
  const current = network(job.weights);
  const out = new Float32Array((job.rows + 400) * ROW);
  let rows = 0, chicos = 0;
  const games = new Array(job.mix.length).fill(0), wins = new Array(job.mix.length).fill(0);
  const weights = job.mix.map(l => l.weight ?? 1);
  while (rows < job.rows) {
    const index = pick(weights, random());
    const mode = job.modes[pick(job.modeWeights, random())];
    const { agents, teamA } = agentsFor(job.mix[index], mode, random() < 0.5, current);
    const result = playChico(mode, agents, random, job.target ?? 40);
    const needed = result.records.reduce((a, r) => a + r.length, 0);
    if ((rows + needed + 1) * ROW > out.length) break;
    rows = writeRows(result, seat => (seat % 2) as 0 | 1, index, out, rows);
    games[index]++;
    if (result.winner === teamA) wins[index]++;
    chicos++;
  }
  const data = out.slice(0, rows * ROW);
  parentPort!.postMessage({ id: job.id, rows, chicos, games, wins, data }, [data.buffer]);
}

function evaluate(job: EvalJob) {
  const current = network(job.weights);
  const results: PairResult[] = [];
  for (const pair of job.pairs) {
    const wins: [number, number] = [0, 0];
    let hands = 0;
    const points = [0, 0];
    for (const swap of [false, true]) {
      const { agents, teamA } = agentsFor(job.lineup, job.mode, swap, current);
      const decisions = rng(job.seed ^ (pair * 7919 + (swap ? 104729 : 0)));
      const deals = rng((job.seed * 31 + pair) >>> 0);
      const r = playChico(job.mode, agents, decisions, job.target ?? 40, (pair % seatsOf(job.mode)) as 0, deals);
      wins[swap ? 1 : 0] = r.winner === teamA ? 1 : 0;
      hands += r.hands;
      points[0] += r.score[teamA]; points[1] += r.score[1 - teamA];
    }
    results.push({ pair, wins, hands, points });
  }
  parentPort!.postMessage({ id: job.id, results });
}

parentPort!.on("message", (job: CollectJob | EvalJob) => {
  try {
    if (job.type === "collect") collect(job);
    else evaluate(job);
  } catch (error) {
    parentPort!.postMessage({ id: job.id, error: error instanceof Error ? error.stack : String(error) });
  }
});
