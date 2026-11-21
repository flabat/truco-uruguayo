import { mazo, type CardId } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import type { Asiento, RepartoOnline } from "../../src/motor/reparto.ts";
import { canSeeSignal, type ActionId, type Format, type PublicTurn, type SeatObservation, type Signal } from "../contracts/index.ts";
import { honestCardSignal } from "../selfplay/learner.ts";

export function silentTurn({action,awards}: PublicTurn): PublicTurn {return {action,awards};}
export function visibleTurn(turn: PublicTurn, format: Format, viewer: Asiento) {
  return turn.signal && !canSeeSignal(format,turn.action.asiento,viewer) ? silentTurn(turn) : turn;
}
export function moveView(obs: SeatObservation, listen = true): SeatObservation {
  if (obs.format!=="pairs-private-senas") return obs;
  return {...obs,legalActions:obs.legalActions.filter(action=>!action.includes("/")),
    history:listen?obs.history:obs.history.map(silentTurn)};
}
const rankings = new Map<CardId, Map<Signal,CardId[]>>();
function cardsFor(sample: CardId, signal: Signal) {
  let map = rankings.get(sample);
  if (!map) {
    map = new Map();
    for (const card of mazo) {
      if (card===sample) continue;
      const cue = honestCardSignal(card,sample);
      if (!cue) continue;
      const matches = map.get(cue) ?? [];
      matches.push(card);
      map.set(cue,matches);
    }
    rankings.set(sample,map);
  }
  return map.get(signal) ?? [];
}
export interface RankClue {seat: Asiento; cards: readonly CardId[]}
export function rankClue(obs: SeatObservation): RankClue | undefined {
  if (obs.format!=="pairs-private-senas") return;
  const seat = obs.relativeSeats[2];
  const sample = obs.view.muestra;
  let cue: Signal | undefined;
  const seen = new Set<CardId>(obs.originalCards);
  for (const {action,signal} of obs.history) {
    if (action.tipo==="carta") seen.add(action.carta);
    if (action.asiento!==seat) continue;
    if (cue && action.tipo==="carta" && honestCardSignal(action.carta,sample)===cue) cue=undefined;
    if (signal && cardsFor(sample,signal).length) cue=signal;
  }
  const cards = cue ? cardsFor(sample,cue).filter(card=>!seen.has(card)) : [];
  return cards.length ? {seat,cards} : undefined;
}
export function matchesClue(deal: RepartoOnline, clue: RankClue) {
  return deal.manos[clue.seat].some(card=>clue.cards.includes(card));
}

export function signedRank(obs: SeatObservation, move: ActionId): ActionId {
  if (obs.format!=="pairs-private-senas" || obs.history.some(turn=>turn.action.asiento===obs.view.asiento && turn.signal)) return move;
  const sample = obs.view.muestra;
  const kept = obs.view.cartas.filter(card=>card!==move).sort((a,b)=>compararCartas(b,a,sample));
  const cue = kept.length ? honestCardSignal(kept[0],sample) : undefined;
  return cue ? (`${cue}/${move}` as ActionId) : move;
}

/** One distribution per real move, then associate the conventional rank cue with that move. */
export function liftMoves(actual: SeatObservation, moves: readonly ActionId[], probabilities: readonly number[],
                          send: boolean, silence = 0) {
  if (actual.format!=="pairs-private-senas") return [...probabilities];
  const weights = new Map<ActionId,number>();
  const menu = new Set(actual.legalActions);
  for (const [i,move] of moves.entries()) {
    const signed = send ? signedRank(actual,move) : move;
    if (signed!==move && menu.has(signed)) {
      weights.set(signed,(1-silence)*probabilities[i]);
      weights.set(move,silence*probabilities[i]);
    } else weights.set(move,probabilities[i]);
  }
  return actual.legalActions.map(action=>weights.get(action)??0);
}
