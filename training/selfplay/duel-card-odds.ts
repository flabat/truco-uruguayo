import {mazo, type CardId} from "../../src/motor/cartas.ts";
import {compararCartas} from "../../src/motor/jerarquia.ts";
import type {SeatObservation} from "../contracts/index.ts";

interface CardCounts { power: number; higher: number; equal: number }
const tables = new Map<CardId, Map<CardId, CardCounts>>();

function countsByCard(muestra: CardId) {
  let table = tables.get(muestra);
  if (table) return table;
  table = new Map();
  for (const card of mazo) {
    if (card !== muestra) table.set(card, {power:compararCartas(card, muestra, muestra), higher:0, equal:0});
  }
  for (const counts of table.values()) {
    for (const other of table.values()) {
      if (other.power > counts.power) counts.higher++;
      if (other.power === counts.power) counts.equal++;
    }
  }
  tables.set(muestra, table);
  return table;
}

// At most three cards are unknown in the opposing hand.
function combinations(n: number, k: number) {
  if (n < k) return 0;
  let count = 1;
  for (let i = 1; i <= k; i++) count = count * (n - i + 1) / i;
  return count;
}

/** Compare the rival's strongest unplayed card with each of ours under a uniform deal.
 *  Bids and an opponent's choice among legal plays are not modeled here. */
export function duelCardOdds(obs: SeatObservation) {
  if (obs.format !== "duel") throw new Error("Card counting requires a duel");
  const {muestra, asiento, cartas} = obs.view;
  const known = [...obs.originalCards]; // Includes our cards already on the table.
  let rivalCards = 3;
  for (const {action} of obs.history) {
    if (action.tipo === "carta" && action.asiento !== asiento) {
      known.push(action.carta);
      rivalCards--;
    }
  }
  const unseen = mazo.length - 1 - known.length;
  const deals = combinations(unseen, rivalCards);
  const base = countsByCard(muestra);
  const blockers = known.map(card => base.get(card)!.power);
  const odds = new Map<CardId, {higher: number; tiedBest: number}>();
  for (const card of cartas) {
    let {power, higher, equal} = base.get(card)!;
    for (const blocker of blockers) {
      if (blocker > power) higher--;
      if (blocker === power) equal--;
    }
    const noHigher = combinations(unseen - higher, rivalCards);
    const lowerOnly = combinations(unseen - higher - equal, rivalCards);
    odds.set(card, {higher: (deals - noHigher) / deals, tiedBest: (noHigher - lowerOnly) / deals});
  }
  return odds;
}
