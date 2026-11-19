import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { playMatch, type Decision } from "../arena/index.ts";
import { versions, type Policy } from "../contracts/index.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import { tantosPropios } from "../../src/motor/cantos-online.ts";
import { incumbent } from "../seat/index.ts";
import { signalRules } from "../signals/index.ts";
import { domainSeed, encode, header, initNetworks, loadPartnerPolicy, mcKeys, mcProbabilities, monteCarloId,
  probabilities, recurrentId, type Actor, type Input, type Network, type Partnership, type Values } from "./policy.ts";

export interface BatchRow extends Input { seat: Asiento; critic: number[]; choice: number; reward: number }
export interface Learner { networks: Network[]; critic: number[]; rate: number; velocity: Record<string, unknown> }
export interface Checkpoint {
  schema: typeof versions.checkpoint; format: Partnership; seed: number; completed: number; goal: number;
  learner: Learner; values: Values[]; examples: number; mcExamples: number; loss: number | null; parity: number;
  device: "cpu" | "mps"; batchMatches: number; opponent?: Actor;
}
export function initialize(format: Partnership, seed: number, goal: number, rate: number, batchMatches: number,
    device: "cpu" | "mps"): Checkpoint {
  return { schema: versions.checkpoint, format, seed, completed: 0, goal, learner: { networks: initNetworks(seed),
    critic: Array(9).fill(0), rate, velocity: {} }, values: [{}, {}, {}, {}], examples: 0, mcExamples: 0,
    loss: null, parity: 0, device, batchMatches };
}
export function exportActor(cp: Checkpoint, mc = false): Actor {
  return mc ? { ...header(cp.format), kind: monteCarloId, seats: structuredClone(cp.values) }
    : { ...header(cp.format), kind: recurrentId, seats: structuredClone(cp.learner.networks) };
}
export const pythonDir = fileURLToPath(new URL("./python/", import.meta.url));
export function optimizer() {
  const child = spawn(process.env.TRUCO_PYTHON ?? pythonDir + ".venv/bin/python", ["-B", pythonDir + "network.py"],
    { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const completion = once(child, "close");
  // La promesa de salida también transporta fallas de arranque.
  completion.catch(() => {});
  return {
    async fit(learner: Learner, rows: BatchRow[], device: string) {
      if (!child.stdin.write(JSON.stringify({ state: learner, rows, device }) + "\n")) {
        await Promise.race([once(child.stdin, "drain"), completion.then(() => { throw Error("Optimizador interrumpido."); })]);
      }
      const line = await lines.next();
      if (line.done) { await completion; throw new Error("El optimizador dejó de responder."); }
      return JSON.parse(line.value) as Learner & { loss: number; reference: number[] };
    },
    async close() { child.stdin.end(); await completion; },
  };
}

function activeSeat(index: number, seat: Asiento) {
  // Contra V1 alternamos ambos equipos. En la mitad de las partidas aprenden los cuatro.
  return index % 4 < 2 || seat % 2 === index % 2;
}
function collect(cp: Checkpoint, index: number, mc: boolean) {
  const frozen = cp.opponent ? seatPolicies(cp.opponent) : undefined;
  const active = [0, 1, 2, 3].map(s => frozen ? s % 2 === index % 2 : activeSeat(index, s as Asiento));
  const policies: Policy[] = active.map((learn, s) => !learn ? frozen?.[s] ?? incumbent : {
    id: mc ? monteCarloId : recurrentId,
    decide(obs, legal) {
      const input = encode(obs, legal);
      return mc ? mcProbabilities(cp.values[s], mcKeys(input), 0.15) : probabilities(cp.learner.networks[s], input);
    },
  });
  const rows: BatchRow[] = [];
  const decisions: { seat: Asiento; key: string }[] = [];
  const record = playMatch({ format: cp.format, seed: domainSeed(cp.seed, "train-deals"), pair: index, leg: 0,
    policies: seat => policies[seat], signalRules: cp.format === "pairs-senas" ? signalRules : undefined,
    onDecision(d: Decision) {
      if (!active[d.seat]) return;
      const input = encode(d.observation, d.observation.legalActions);
      const choice = d.observation.legalActions.indexOf(d.action);
      if (mc) { decisions.push({ seat: d.seat, key: mcKeys(input)[choice] }); return; }
      const { state, observation: obs, seat } = d;
      const team = seat % 2;
      const critic = [1, team, obs.score[team] / 40, obs.score[1 - team] / 40, state.valorTruco / 4,
        ...([0, 1, 2, 3] as const).map(s => tantosPropios(state, s).total / 50)];
      rows.push({ ...input, seat, critic, choice, reward: 0 });
    },
  });
  for (const row of rows) row.reward = row.seat % 2 === record.winner ? 1 : -1;
  for (const { seat, key } of decisions) {
    const pair = cp.values[seat][key] ??= [0, 0];
    pair[0] += seat % 2 === record.winner ? 1 : -1;
    pair[1]++;
  }
  return { rows, mcCount: decisions.length };
}
export function trainingBatch(cp: Checkpoint, size: number) {
  const rows: BatchRow[] = [];
  for (let i = cp.completed; i < cp.completed + size; i++) {
    rows.push(...collect(cp, i, false).rows);
    cp.mcExamples += collect(cp, i, true).mcCount;
  }
  return rows;
}

export async function update(cp: Checkpoint, fit: ReturnType<typeof optimizer>["fit"], matches: number) {
  const rows = trainingBatch(cp, matches);
  const expected = probabilities(cp.learner.networks[rows[0].seat], rows[0]);
  const { loss, reference, ...learner } = await fit(cp.learner, rows, cp.device);
  const error = Math.max(...expected.map((value, i) => Math.abs(value - reference[i])));
  if (!Number.isFinite(loss) || !Number.isFinite(error) || error > 0.0001) {
    throw new Error("Las distribuciones de PyTorch y del actor exportado difieren.");
  }
  cp.learner = learner; cp.completed += matches; cp.examples += rows.length; cp.loss = loss;
  cp.parity = Math.max(cp.parity, error);
}
export const seatPolicies = (actor: Actor) => ([0, 1, 2, 3] as const).map(seat => loadPartnerPolicy(actor, seat));
