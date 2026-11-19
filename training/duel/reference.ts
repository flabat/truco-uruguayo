// Duelo reducido de Kuhn: una carta por asiento, tres rangos, una apuesta.
// Los pagos netos son ±1, o ±2 cuando se acepta la apuesta.
import { normalized, uniform, type RandomState } from "./math.ts";

type Seat = 0 | 1;
type Distribution = number[];
export type ReferencePolicy = Record<string, Distribution>;
interface Row { regret: number[]; average: number[] }
export interface ReferenceState {
  rows: Record<string, Row>;
  iteration: number;
  chance: RandomState;
  opponent: RandomState;
}
const decisions = ["", "p", "b", "pb"] as const;
const deals = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const;
const player = (history: string): Seat => history.length % 2 as Seat;
const key = (rank: number, history: string) => rank + "/" + history;
function terminal(history: string, cards: readonly number[]) {
  const showdown = cards[0] > cards[1] ? 1 : -1;
  switch (history) {
    case "pp": return showdown;
    case "bp": return 1;
    case "pbp": return -1;
    case "bb": case "pbb": return 2 * showdown;
    default: return null;
  }
}

export function newReference(seed: number): ReferenceState {
  const rows: Record<string, Row> = {};
  for (let card = 0; card < 3; card++) for (const history of decisions) {
    rows[key(card, history)] = { regret: [0, 0], average: [0, 0] };
  }
  return { rows, iteration: 0, chance: { value: seed >>> 0 }, opponent: { value: (seed ^ 0x1b873593) >>> 0 } };
}

export function referenceStep(state: ReferenceState) {
  const cards = deals[Math.floor(uniform(state.chance) * deals.length)];
  const update = state.iteration % 2 as Seat;
  const strategy: ReferencePolicy = {};
  for (const [k, row] of Object.entries(state.rows)) strategy[k] = normalized(row.regret);
  // Cada conjunto se visita una vez para promediar con el alcance del propio
  // jugador. Sólo pb requiere una decisión previa del mismo jugador (pasar).
  for (let card = 0; card < 3; card++) for (const history of decisions) {
    const k = key(card, history);
    const ownReach = history === "pb" ? strategy[key(card, "")][0] : 1;
    strategy[k].forEach((p, a) => { state.rows[k].average[a] += ownReach * p; });
  }
  function traverse(history: string): number {
    const value = terminal(history, cards);
    if (value !== null) return update === 0 ? value : -value;
    const actor = player(history);
    const k = key(cards[actor], history);
    const sigma = strategy[k];
    if (actor !== update) return traverse(history + (uniform(state.opponent) < sigma[0] ? "p" : "b"));
    const values = [traverse(history + "p"), traverse(history + "b")];
    const mean = values[0] * sigma[0] + values[1] * sigma[1];
    values.forEach((v, i) => { state.rows[k].regret[i] += v - mean; });
    return mean;
  }
  traverse("");
  state.iteration++;
}

export function referenceAverage(state: ReferenceState): ReferencePolicy {
  return Object.fromEntries(Object.entries(state.rows).map(([k, row]) => [k, normalized(row.average)]));
}

// Oráculo independiente: enumera las 64 políticas deterministas de cada asiento
// y todas las seis distribuciones. Cada elección pertenece al conjunto de
// información del que responde, nunca a las dos cartas de una distribución.
function expected(field: readonly ReferencePolicy[]): number {
  function walk(history: string, cards: readonly number[]): number {
    const result = terminal(history, cards);
    if (result !== null) return result;
    const seat = player(history);
    const [p, b] = field[seat][key(cards[seat], history)];
    return p * walk(history + "p", cards) + b * walk(history + "b", cards);
  }
  return deals.reduce((sum, cards) => sum + walk("", cards), 0) / deals.length;
}

export function exactResponses(policy: ReferencePolicy) {
  const best = [-Infinity, -Infinity];
  for (const seat of [0, 1] as const) {
    const keys = Object.keys(policy).filter(k => player(k.split("/")[1]) === seat);
    for (let bits = 0; bits < 2 ** keys.length; bits++) {
      const pure = Object.fromEntries(keys.map((k, i) => [k, (bits >> i) & 1 ? [0, 1] : [1, 0]]));
      const payoff = seat === 0 ? expected([pure, policy]) : -expected([policy, pure]);
      best[seat] = Math.max(best[seat], payoff);
    }
  }
  return { value: expected([policy, policy]), bestResponse: best, exploitability: (best[0] + best[1]) / 2 };
}
