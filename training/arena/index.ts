import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mazo } from "../../src/motor/cartas.ts";
import { aDecidir, iniciarOnline, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento, Equipo, RepartoOnline, TresCartas } from "../../src/motor/reparto.ts";
import { requireTrainingFormat, hasSignals, seatsFor, versions, type ActionId, type Format, type Move, type Policy, type PublicTurn,
  type RefereeHand, type Score, type SeatObservation, type Signal } from "../contracts/index.ts";
import { observe } from "../seat/index.ts";
import { commitTurn, signalRules as defaultSignals } from "../signals/index.ts";

import { countPublicHand } from "../contracts/duel-memory.ts";

export const streamVersion = "sha256-counter-u32be-v1";

function natural(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name + " fuera de rango");
}

/** Independent SHA-256 streams, eight big-endian words per block. */
function stream(...keys: (string | number)[]) {
  const domain = JSON.stringify([streamVersion, ...keys]);
  let block = Buffer.alloc(0), offset = 0, counter = 0;
  return () => {
    if (offset === block.length) {
      block = createHash("sha256").update(domain + "#" + counter++).digest();
      offset = 0;
    }
    const value = block.readUInt32BE(offset);
    offset += 4;
    return value;
  };
}

function below(next: () => number, limit: number) {
  // Rejection keeps each of the remaining deck positions equiprobable.
  const cutoff = 0x100000000 - 0x100000000 % limit;
  let word: number;
  do { word = next(); } while (word >= cutoff);
  return word % limit;
}

export function scheduledDeal(format: Format, seed: number, pair: number, hand: number): RepartoOnline {
  natural(seed, "seed"); natural(pair, "pair"); natural(hand, "hand");
  const seats = seatsFor(format);
  const next = stream("deal", format, seed, pair, hand);
  const cards = [...mazo];
  for (let i = 0; i <= seats * 3; i++) {
    const j = i + below(next, cards.length - i);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const mano = ((pair % seats + hand % seats) % seats) as Asiento;
  const dador = ((mano + seats - 1) % seats) as Asiento;
  const manos = Array.from({length: seats}, (_, s): TresCartas => {
    const i = (s - mano + seats) % seats;
    return [cards[i], cards[i + seats], cards[i + 2 * seats]];
  });
  return {versionReparto: "online-1", mano, dador, manos, muestra: cards[seats * 3]};
}

export interface SignalRules {
  legalActions(moves: readonly Move[]): readonly ActionId[];
  decode(id: ActionId): {move: Move; signal?: Signal};
}

export interface Decision {
  readonly hand: number;
  readonly seat: Asiento;
  readonly observation: SeatObservation;
  readonly action: ActionId;
  readonly probabilities: readonly number[];
  /** Referee / offline critic callback. Never supplied to a policy. */
  readonly state: EstadoOnline;
}

export interface MatchOptions {
  format: Format;
  seed: number;
  pair: number;
  leg: 0 | 1;
  policies: (seat: Asiento) => Policy;
  signalRules?: SignalRules;
  onDecision?: (decision: Decision) => void;
}

export interface MatchRecord {
  id: string;
  format: Format;
  pair: number;
  leg: 0 | 1;
  winner: Equipo;
  score: Score;
  hands: RefereeHand[];
}

function matchId(format: Format, pair: number, leg: 0 | 1) {
  return format + "-" + pair + "-" + leg;
}
function checkSignals(format: Format, signals?: SignalRules) {
  if (hasSignals(format) && !signals) throw new Error("Falta el adaptador de señas.");
  if (!hasSignals(format) && signals) throw new Error("El formato no admite señas.");
}
function viewFor(state: EstadoOnline, seat: Asiento, format: Format, history: readonly PublicTurn[], rules?: SignalRules) {
  const view = observe(state, seat, format, history);
  if (!rules) return view;
  return {...view, legalActions: rules.legalActions(view.legalActions as readonly Move[])};
}

export function sample(probabilities: readonly number[], length: number, uniform: number) {
  if (!length || probabilities.length !== length || !(uniform >= 0 && uniform < 1)) {
    throw new RangeError("Distribución o muestra inválida.");
  }
  let sum = 0;
  for (const p of probabilities) {
    if (!Number.isFinite(p) || p < 0) throw new RangeError("Probabilidad inválida.");
    sum += p;
  }
  if (Math.abs(sum - 1) > 1e-9) throw new RangeError("Las probabilidades deben sumar uno.");
  const target = uniform * sum;
  let cumulative = 0, last = -1;
  for (const [i, p] of probabilities.entries()) {
    if (p > 0) last = i;
    cumulative += p;
    if (target < cumulative) return i;
  }
  return last;
}

function scoreOf(state: EstadoOnline): Score {
  const points: [number, number] = [...state.puntosInicio];
  for (const award of state.cobros) points[award.equipo] += award.tantos;
  return [Math.min(points[0], state.meta), Math.min(points[1], state.meta)];
}

type Schedule = Omit<MatchOptions, "policies" | "onDecision">;
type Request = Pick<Decision, "hand" | "seat" | "state" | "observation"> & {uniform: number};

function* matchSteps(options: Schedule): Generator<Request, MatchRecord, ActionId> {
  const {format, seed, pair, leg} = options;
  requireTrainingFormat(format);
  const signalRules = options.signalRules ?? (hasSignals(format) ? defaultSignals : undefined);
  natural(seed, "seed"); natural(pair, "pair");
  if (leg !== 0 && leg !== 1) throw new RangeError("Manga inválida.");
  checkSignals(format, signalRules);
  const seats = seatsFor(format);
  const sampling = Array.from({length: seats}, (_, s) => stream("policy", format, seed, pair, leg, s));
  const hands: RefereeHand[] = [];
  let score: Score = [0, 0];
  const counts = [Array(12).fill(0), Array(12).fill(0)];
  while (Math.max(...score) < 40) {
    const hand = hands.length, startScore = score;
    if (hand >= 79) throw new Error("El chico no avanzó.");
    const deal = scheduledDeal(format, seed, pair, hand);
    let state = iniciarOnline(deal, startScore, 40);
    const turns: PublicTurn[] = [];
    while (!state.resultado) {
      if (turns.length >= 64) throw new Error("La mano no avanzó.");
      const seat = aDecidir(state)[0];
      const view = viewFor(state, seat, format, turns, signalRules);
      const observation = format==="duel" ? {...view,rivalCounts:counts[1-seat].slice()} : view;
      const legal = [...observation.legalActions];
      const id = yield {seat, hand, state, observation, uniform: sampling[seat]() / 0x100000000};
      if (!legal.includes(id)) throw new Error("El actor devolvió una acción ilegal.");
      const step = commitTurn(state, seat, format, id);
      turns.push(step.turn);
      state = step.state;
    }
    if(format==="duel") countPublicHand(counts, turns.map(turn=>turn.action));
    score = scoreOf(state);
    hands.push({schema: versions.replay, format, hand, deal, startScore, turns, endScore: score});
  }
  return {id: matchId(format, pair, leg), format, pair, leg, winner: score[0] === 40 ? 0 : 1, score, hands};
}

export function playMatch(options: MatchOptions): MatchRecord {
  const actors = Array.from({length: seatsFor(options.format)}, (_, s) => options.policies(s as Asiento));
  const steps = matchSteps(options);
  let request = steps.next();
  while (!request.done) {
    const {observation, seat, hand, state, uniform} = request.value;
    const legal = Object.freeze([...observation.legalActions]);
    const probabilities = actors[seat].decide(observation, legal);
    const action = legal[sample(probabilities, legal.length, uniform)];
    options.onDecision?.({seat, hand, state, observation, action, probabilities});
    request = steps.next(action);
  }
  return request.value;
}

export type Responder = (observation: SeatObservation, uniform: number) => ActionId | Promise<ActionId>;
export async function playMatchAsync(options: Schedule & {responders(seat: Asiento): Responder}): Promise<MatchRecord> {
  const responders = Array.from({length: seatsFor(options.format)}, (_, s) => options.responders(s as Asiento));
  const steps = matchSteps(options);
  let request = steps.next();
  while (!request.done) {
    const {seat, observation, uniform} = request.value;
    request = steps.next(await responders[seat](observation, uniform));
  }
  return request.value;
}

/** Re-run committed commands independently of policy decisions. Validate the referee deal when given the seed. */
export function replayMatch(record: MatchRecord, seed?: number, rules?: SignalRules): Score {
  const {format, pair, leg} = record;
  rules ??= hasSignals(format) ? defaultSignals : undefined;
  checkSignals(format, rules);
  natural(pair, "pair");
  assert.ok(leg === 0 || leg === 1);
  assert.equal(record.id, matchId(format, pair, leg));
  assert.ok(record.hands.length >= 1 && record.hands.length <= 79);
  let score: Score = [0, 0];
  for (const [number, hand] of record.hands.entries()) {
    assert.equal(hand.schema, versions.replay);
    assert.equal(hand.format, format);
    assert.equal(hand.hand, number);
    assert.deepEqual(hand.startScore, score);
    if (seed !== undefined) assert.deepEqual(hand.deal, scheduledDeal(format, seed, pair, number));
    let state = iniciarOnline(hand.deal, score, 40);
    const history: PublicTurn[] = [];
    for (const turn of hand.turns) {
      const seat = aDecidir(state)[0];
      assert.equal(turn.action.asiento, seat);
      const base = turn.action.tipo === "carta" ? turn.action.carta : turn.action.tipo;
      const id: ActionId = turn.signal ? `${turn.signal}/${base}` : base;
      if (rules) assert.ok(viewFor(state, seat, format, history, rules).legalActions.includes(id));
      const step = commitTurn(state, seat, format, id);
      assert.deepEqual(step.turn, turn);
      state = step.state;
      history.push(step.turn);
    }
    assert.ok(state.resultado, "Mano incompleta.");
    score = scoreOf(state);
    assert.deepEqual(score, hand.endScore);
  }
  const winner = score.indexOf(40);
  assert.ok(winner >= 0, "Chico incompleto.");
  assert.equal(record.winner, winner);
  assert.deepEqual(record.score, score);
  return score;
}
