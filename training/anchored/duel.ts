import { esCardId } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import type { ActionId, SeatObservation } from "../contracts/index.ts";

interface BettingRules {
  faltaDefense?: number;
  openingValue?: number;
  afterPass?: number;
  priceRaises?: boolean;
  closedTrick?: boolean;
}

// A stored id identifies one fixed set of rules within this actor version.
// The outer learner selects among these alternatives using full-chico returns.
const proposals: ReadonlyMap<string, BettingRules> = new Map<string, BettingRules>([
  ["v1", {}],
  ["falta-defense", { faltaDefense: 35 }],
  ["value-33", { openingValue: 33 }],
  ["after-pass", { afterPass: 28 }],
  ["priced-envido", { priceRaises: true }],
  ["closed-trick", { closedTrick: true }],
  ["balanced", { faltaDefense: 35, openingValue: 33, afterPass: 28, priceRaises: true, closedTrick: true }],
  ["pressure", { faltaDefense: 33, openingValue: 31, afterPass: 26, closedTrick: true }],
]);

export function duelVariants(): readonly { id: string }[] {
  return Array.from(proposals.keys(), id => ({ id }));
}

// At the second seat of a trick, the visible lead plus our own cards can
// establish that this hand is won, including ties under online-1.
function canFinishHand({ view }: SeatObservation) {
  const lead = view.vueltaActual?.jugadas[0];
  if (!lead || lead.asiento === view.asiento || view.vueltas.length === 0) return false;
  const first = view.vueltas[0].resultado;
  const wonFirst = first.tipo === "ganada" && first.equipo === view.equipoPorAsiento[view.asiento];
  const third = view.vueltas.length === 2;
  if (!third && first.tipo === "ganada" && !wonFirst) return false;
  const tieWins = wonFirst || (third && first.tipo === "parda" && view.mano === view.asiento);
  return view.cartas.some(card => compararCartas(card, lead.carta, view.muestra) >= (tieWins ? 0 : 1));
}

export function duelAction(obs: SeatObservation, baseAction: ActionId, variant: { id: string }): ActionId {
  if (obs.format !== "duel") throw new TypeError("El ajuste de apuestas requiere un duelo.");
  const rules = proposals.get(variant.id);
  if (!rules) throw new RangeError("Variante de apuestas de duelo desconocida.");
  if (variant.id === "v1") return baseAction;

  const { view, legalActions, stakes } = obs;
  const ownTotal = view.tantosPropios.total;
  const opponent = 1 - view.equipoPorAsiento[view.asiento];
  if (rules.faltaDefense && view.pendiente?.tipo === "falta-envido" && stakes.side && legalActions.includes("no-quiero")) {
    if (obs.score[opponent] + stakes.side.decline >= obs.target) return "quiero";
    // A cheap late falta and a previously raised large pot are cheaper to call.
    if (stakes.side.accept >= 3 * stakes.side.decline && stakes.side.accept >= 7) {
      return ownTotal >= rules.faltaDefense ? "quiero" : "no-quiero";
    }
  }

  if (rules.priceRaises && stakes.side && (view.pendiente?.tipo === "real-envido" || view.pendiente?.tipo === "envido")
      && legalActions.includes("no-quiero") && stakes.side.decline >= 2 && ownTotal < 33) {
    // Limit marginal reraises once the other seat has raised an earlier offer.
    const call = ownTotal >= 30 || obs.score[opponent] + stakes.side.decline >= obs.target;
    return call ? "quiero" : "no-quiero";
  }

  if ((rules.openingValue || rules.afterPass) && !stakes.side && legalActions.includes("falta-envido")) {
    if (rules.openingValue && ownTotal >= rules.openingValue) return "falta-envido";
    // A card or truco in place of an opening envido is public information.
    const first = view.acciones[0];
    if (rules.afterPass && ownTotal >= rules.afterPass && first && first.asiento !== view.asiento
        && (first.tipo === "carta" || first.tipo === "truco")) return "falta-envido";
  }

  if (rules.closedTrick && (esCardId(baseAction) || (view.trucoPendiente && !stakes.side))
      && legalActions.some(action => action === "truco" || action === "retruco" || action === "vale-cuatro" || action === "quiero")
      && canFinishHand(obs)) {
    for (const bet of ["vale-cuatro", "retruco", "truco", "quiero"] as const) {
      if (legalActions.includes(bet)) return bet;
    }
  }
  return baseAction;
}
