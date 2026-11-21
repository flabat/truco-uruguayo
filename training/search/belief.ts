import { isDeepStrictEqual } from "node:util";
import { mazo, type CardId } from "../../src/motor/cartas.ts";
import { aDecidir, iniciarOnline, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento, RepartoOnline, TresCartas } from "../../src/motor/reparto.ts";
import { sample } from "../arena/index.ts";
import { hasSignals, canSeeSignal, type ActionId, type Format, type Move, type PublicTurn, type SeatObservation } from "../contracts/index.ts";
import { observe } from "../seat/index.ts";
import { commitTurn, signalRules } from "../signals/index.ts";
import type { Field } from "./continuation.ts";

export function seatView(state: EstadoOnline, seat: Asiento, format: Format, history: readonly PublicTurn[]) {
  const obs = observe(state, seat, format, history);
  return hasSignals(format) ? { ...obs, legalActions: signalRules.legalActions(obs.legalActions as readonly Move[]) } : obs;
}

function slots(obs: SeatObservation) {
  const own = obs.view.asiento;
  const hands = Array.from({ length: obs.seats }, (_, s): CardId[] => s === own ? [...obs.originalCards] : []);
  for (const { action } of obs.history) {
    if (action.tipo === "carta" && action.asiento !== own) hands[action.asiento].push(action.carta);
  }
  const seen = new Set([obs.view.muestra, ...hands.flat()]);
  return { hands, remaining: mazo.filter(card => !seen.has(card)) };
}
function deal(obs: SeatObservation, hands: CardId[][]): RepartoOnline {
  return { versionReparto: "online-1", dador: obs.view.dador, mano: obs.view.mano, muestra: obs.view.muestra,
    manos: hands.map(h => {
      if (h.length !== 3) throw new RangeError("Un asiento requiere tres cartas.");
      return [h[0], h[1], h[2]] as TresCartas;
    }) };
}

// Combinaciones de cartas, sin permutar cartas equivalentes de la misma mano.
// Las políticas de estilo exactas deben ser invariantes al orden del reparto.
export function* duelDeals(obs: SeatObservation): Generator<RepartoOnline> {
  if (obs.format !== "duel") throw new Error("Sólo para duelo.");
  const { hands, remaining } = slots(obs);
  const opponent = 1 - obs.view.asiento;
  const n = 3 - hands[opponent].length;
  function* fill(selected: CardId[], start: number): Generator<RepartoOnline> {
    if (selected.length === n) {
      yield deal(obs, hands.map((h, s) => s === opponent ? [...h, ...selected] : h));
      return;
    }
    for (let i = start; i <= remaining.length - (n - selected.length); i++) yield* fill([...selected, remaining[i]], i + 1);
  }
  yield* fill([], 0);
}

export function drawDeal(obs: SeatObservation, random: () => number) {
  const { hands, remaining } = slots(obs);
  let top = 0;
  for (const hand of hands) while (hand.length < 3) {
    const j = top + Math.floor(random() * (remaining.length - top));
    [remaining[top], remaining[j]] = [remaining[j], remaining[top]];
    hand.push(remaining[top++]);
  }
  for (const [seat, hand] of hands.entries()) {
    if (seat === obs.view.asiento) continue;
    for (let i = 0; i < hand.length - 1; i++) {
      const j = i + Math.floor(random() * (hand.length - i));
      [hand[i], hand[j]] = [hand[j], hand[i]];
    }
  }
  return deal(obs, hands);
}
export interface World { state: EstadoOnline; logLikelihood: number }
export function inferWorld(obs: SeatObservation, candidate: RepartoOnline, styles: Field, anyLegalSeat = false): World | null {
  if (candidate.muestra !== obs.view.muestra || candidate.mano !== obs.view.mano || candidate.dador !== obs.view.dador
      || candidate.manos.length !== obs.seats || !isDeepStrictEqual(candidate.manos[obs.view.asiento], obs.originalCards)) return null;
  let state = iniciarOnline(candidate, obs.startScore, obs.target);
  let logLikelihood = 0;
  const prefix: PublicTurn[] = [];
  for (const turn of obs.history) {
    const seat = turn.action.asiento;
    const enabled = aDecidir(state);
    if (anyLegalSeat ? !enabled.includes(seat) : enabled[0] !== seat) return null;
    const view = seatView(state, seat, obs.format, prefix);
    const base = turn.action.tipo === "carta" ? turn.action.carta : turn.action.tipo;
    const id: ActionId = turn.signal ? `${turn.signal}/${base}` : base;
    const idx = view.legalActions.indexOf(id);
    if (idx < 0) return null;
    if (seat !== obs.view.asiento && logLikelihood !== -Infinity) {
      const probabilities = styles(seat).decide(view, view.legalActions);
      sample(probabilities, view.legalActions.length, 0); // Valida toda la distribución de estilo.
      // Ante un rival solo observamos la jugada. Sumamos todas las señas
      // compatibles, incluido el silencio, para calcular su probabilidad.
      const visible = !hasSignals(obs.format) || canSeeSignal(obs.format, seat, obs.view.asiento);
      const likelihood = visible ? probabilities[idx] : view.legalActions.reduce((sum, action, i) =>
        signalRules.decode(action).move === base ? sum + probabilities[i] : sum, 0);
      logLikelihood += Math.log(likelihood);
    }
    const next = commitTurn(state, seat, obs.format, id);
    if (!isDeepStrictEqual(next.turn.awards, turn.awards)) return null;
    prefix.push(next.turn);
    state = next.state;
  }
  return { state, logLikelihood };
}
export function posterior(worlds: readonly World[]) {
  if (!worlds.length) return { probabilities: [], uniformFallback: false };
  const max = worlds.reduce((v, w) => Math.max(v, w.logLikelihood), -Infinity);
  if (max === -Infinity) return { probabilities: worlds.map(() => 1 / worlds.length), uniformFallback: true };
  const weights = worlds.map(w => Math.exp(w.logLikelihood - max));
  const sum = weights.reduce((s, w) => s + w, 0);
  return { probabilities: weights.map(w => w / sum), uniformFallback: false };
}

export function duelRange(obs: SeatObservation, styles: Field) {
  const worlds: World[] = [];
  let enumerated = 0;
  for (const d of duelDeals(obs)) {
    enumerated++;
    const w = inferWorld(obs, d, styles);
    if (w) worlds.push(w);
  }
  return { worlds, enumerated, ...posterior(worlds) };
}
