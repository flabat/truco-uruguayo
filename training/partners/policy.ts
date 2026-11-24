import { createHash } from "node:crypto";
import { esCardId, type CardId } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { crearAzar, type Asiento } from "@eltruco/motor/reparto.ts";
import { signalVersionFor, versions, signals, type ActionId, type Move, type Policy, type SeatObservation } from "../contracts/index.ts";
import { signalRules } from "../signals/index.ts";

export const partnerships = ["pairs", "pairs-senas", "pairs-private-senas"] as const;
export type Partnership = typeof partnerships[number];
export const dimensions = { event: 9, memory: 6, current: 12, move: 31, signal: 14 } as const;
const bids = ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor",
  "paso-flor", "con-flor-envido", "contraflor-al-resto", "quiero", "no-quiero"] as const;

function bidCategory(bid: Exclude<Move, CardId>) {
  if (bid === "mazo") throw new RangeError("La política de parejas no admite una entrega de duelo.");
  return 19 + bids.indexOf(bid === "con-flor-quiero" ? "quiero" : bid);
}

function power(card: CardId, sample: CardId) {
  // El 4 de un palo distinto a la muestra tiene puesto 18 (el más débil).
  return compararCartas(card, sample.startsWith("copas") ? "bastos-04" : "copas-04", sample);
}

export interface Input {
  history: number[][];
  current: number[];
  actions: [number, number][];
}

export function encode(obs: SeatObservation, legal: readonly ActionId[]): Input {
  const { view } = obs;
  const seat = view.asiento, team = view.equipoPorAsiento[seat];
  const history = obs.history.map(({ action, signal, awards }) => {
    const relative = (action.asiento - seat + 4) % 4;
    const card = action.tipo === "carta";
    const category = card ? power(action.carta, view.muestra) : bidCategory(action.tipo);
    const earned = awards.reduce((sum, award) => sum + (award.equipo === team ? 1 : -1) * award.tantos, 0);
    return [0, 1, 2, 3].map(n => Number(n === relative)).concat([
      Number(card), category / 30, signal ? (signals.indexOf(signal) + 1) / 13 : 0, Number(!!signal), earned / 40,
    ]);
  });
  const cards = view.cartas.map(card => power(card, view.muestra)).sort((a, b) => b - a);
  const current = [1, obs.score[team] / 40, obs.score[1 - team] / 40, Number(seat === view.mano),
    view.tantosPropios.total / 50, view.cartas.length / 3, ...[0, 1, 2].map(i => (cards[i] ?? -1) / 18),
    view.valorTruco / 4, (obs.stakes.side?.accept ?? 0) / 40, (obs.stakes.side?.decline ?? 0) / 40];
  const actions: [number, number][] = legal.map(id => {
    const { move, signal } = signalRules.decode(id);
    return [esCardId(move) ? power(move, view.muestra) : bidCategory(move), signal ? signals.indexOf(signal) + 1 : 0];
  });
  return { history, current, actions };
}

export interface Network {
  event: number[][]; recurrent: number[][]; moves: number[][]; gestures: number[][];
}
export type Values = Record<string, [number, number]>;

export function initNetwork(random: () => number): Network {
  const { event, memory, current, move, signal } = dimensions;
  const matrix = (rows: number, cols: number) => Array.from({ length: rows },
    () => Array.from({ length: cols }, () => Math.fround((random() - 0.5) * 0.25)));
  return { event: matrix(memory, event), recurrent: matrix(memory, memory),
    moves: matrix(move, memory + current), gestures: matrix(signal, memory + current) };
}

export function domainSeed(seed: number, purpose: string) {
  return createHash("sha256").update(JSON.stringify([seed, purpose])).digest().readUInt32BE(0);
}
export function initNetworks(seed: number) {
  return Array.from({ length: 4 }, (_, seat) => initNetwork(crearAzar(domainSeed(seed, "actor-" + seat))));
}
function dot(row: number[], input: number[]) {
  let value = 0;
  for (let i = 0; i < row.length; i++) value += row[i] * input[i];
  return value;
}
export function probabilities(net: Network, input: Input) {
  if (!input.actions.length) return [];
  let hidden: number[] = Array(dimensions.memory).fill(0);
  for (const event of input.history) {
    hidden = net.event.map((row, i) => Math.tanh(dot(row, event) + dot(net.recurrent[i], hidden)));
  }
  const features = input.current.concat(hidden);
  const moves = net.moves.map(row => dot(row, features));
  const gestures = net.gestures.map(row => dot(row, features));
  const logits = input.actions.map(([move, gesture]) => moves[move] + gestures[gesture]);
  const maximum = Math.max(...logits);
  const weights = logits.map(value => Math.exp(value - maximum)), total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

// El comparador no usa red, crítico ni predicciones del actor.
export function mcKeys(input: Input) {
  const f = input.current;
  const last = input.history.at(-1);
  const context = [Math.floor(f[1] * 4), Math.floor(f[2] * 4), f[3], Math.floor(f[4] * 10),
    Math.floor(f[6] * 4), Math.round(f[9] * 4), Math.round((last?.[5] ?? -1) * 30),
    Math.round((last?.[6] ?? 0) * 13)].join(",");
  return input.actions.map(([move, signal]) => context + ":" + move + "," + signal);
}
export function mcProbabilities(values: Values, keys: string[], epsilon: number) {
  if (!keys.length) return [];
  const utility = keys.map(key => { const [sum, count] = values[key] ?? [0, 0]; return sum / (count + 1); });
  const best = Math.max(...utility), ties = utility.filter(x => x === best).length;
  return utility.map(x => epsilon / keys.length + (x === best ? (1 - epsilon) / ties : 0));
}

export const recurrentId = "pairs-recurrent-v1";
export const monteCarloId = "pairs-mc-v1";
interface Header { schema: typeof versions.actor; rules: typeof versions.rules; competition: typeof versions.competition;
  observation: typeof versions.observation; actions: typeof versions.actions; signals: string | null; format: Partnership; }
export type Actor = Header & ({ kind: typeof recurrentId; seats: Network[] } | { kind: typeof monteCarloId; seats: Values[] });
export const header = (format: Partnership): Header => ({ schema: versions.actor, rules: versions.rules,
  competition: versions.competition, observation: versions.observation, actions: versions.actions,
  signals: signalVersionFor(format), format });
export const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

export function loadPartnerPolicy(artifact: Actor, seat: Asiento): Policy {
  if (!artifact || !partnerships.includes(artifact.format) ||
      Object.entries(header(artifact.format)).some(([k, v]) => artifact[k as keyof Header] !== v) ||
      !Array.isArray(artifact.seats) || artifact.seats.length !== 4 || ![0, 1, 2, 3].includes(seat)) {
    throw new TypeError("Artefacto de pareja incompatible.");
  }
  let decide: (input: Input) => number[];
  if (artifact.kind === recurrentId) {
    const network = structuredClone(artifact.seats[seat]);
    const shapes = { event: [6, 9], recurrent: [6, 6], moves: [31, 18], gestures: [14, 18] };
    for (const [key, [rows, cols]] of Object.entries(shapes)) {
      const matrix = network[key as keyof Network];
      if (!Array.isArray(matrix) || matrix.length !== rows || matrix.some(row =>
        !Array.isArray(row) || row.length !== cols || !row.every(Number.isFinite))) throw new TypeError("Pesos inválidos.");
    }
    decide = input => probabilities(network, input);
  } else if (artifact.kind === monteCarloId) {
    const values = structuredClone(artifact.seats[seat]);
    if (!values || Object.values(values).some(entry => !Array.isArray(entry) || entry.length !== 2 ||
        !Number.isFinite(entry[0]) || !Number.isSafeInteger(entry[1]) || entry[1] <= 0 ||
        Math.abs(entry[0]) > entry[1])) throw new TypeError("Valores de acciones inválidos.");
    decide = input => mcProbabilities(values, mcKeys(input), 0);
  } else throw new TypeError("Algoritmo desconocido.");
  return { id: artifact.kind + "-" + digest(artifact).slice(0, 16) + "-s" + seat, decide(obs, legal) {
    if (obs.format !== artifact.format || obs.view.asiento !== seat || obs.schema !== versions.observation) throw new Error("Observación incompatible.");
    return decide(encode(obs, legal));
  } };
}
