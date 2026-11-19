import { esCardId, pieza, type CardId, type RangoPieza } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import type { ActionId, Move, SeatObservation, Signal } from "../contracts/index.ts";
import type { Partnership } from "../partners/policy.ts";

/** El ajuste elegido por el entrenador se reconstruye por ID en juego y en la arena. */
export interface PartnerVariant {
  id: string;
  cards: "v1" | "support" | "cover";
  stakeAware: boolean;
  signals: boolean;
}

export function partnerVariants(format: Partnership): PartnerVariant[] {
  const variants: PartnerVariant[] = [];
  for (const signals of format === "pairs-private-senas" ? [false, true] : [false]) {
    for (const cards of ["v1", "support", "cover"] as const) {
      for (const stakeAware of [false, true]) {
        const id = [cards, ...(stakeAware ? ["stakes"] : []), ...(signals ? ["signals"] : [])].join("-");
        variants.push({ id, cards, stakeAware, signals });
      }
    }
  }
  return variants;
}

const pieceSignals: Record<RangoPieza, Signal> = {
  2: "cejas", 4: "beso", 5: "nariz", 11: "ojo-derecho", 10: "ojo-izquierdo",
};

// Convención compartida por los compañeros. Los ases y los sietes bravos comparten un
// gesto por pareja; para comparar con una carta tomamos el más débil de los dos.
function cardSignal(card: CardId, sample: CardId): Signal | undefined {
  const effective = pieza(card, sample);
  if (effective !== null) return pieceSignals[effective];
  if (card === "espadas-01" || card === "bastos-01") return "labios-derecha";
  if (card === "espadas-07" || card === "oros-07") return "labios-izquierda";
  return undefined;
}

function beatsClaim(card: CardId, sample: CardId, claim: Signal): boolean {
  // Comparar por pieza efectiva también respeta la sustitución por el rey.
  const strength = pieza(card, sample);
  const pieceOrder: readonly RangoPieza[] = [2, 4, 5, 11, 10];
  const claimedPiece = pieceOrder.findIndex(rank => pieceSignals[rank] === claim);
  if (claimedPiece >= 0) return strength !== null && pieceOrder.indexOf(strength) <= claimedPiece;
  if (claim === "labios-derecha") return compararCartas(card, "bastos-01", sample) >= 0;
  return compararCartas(card, "oros-07", sample) >= 0;
}

function partnerClaim(obs: SeatObservation): Signal | undefined {
  let claim: Signal | undefined;
  for (const { action, signal } of obs.history) {
    if (action.asiento !== obs.relativeSeats[2]) continue;
    if (signal && (Object.values(pieceSignals).includes(signal)
        || signal === "labios-derecha" || signal === "labios-izquierda")) claim = signal;
    if (claim && action.tipo === "carta" && cardSignal(action.carta, obs.view.muestra) === claim) claim = undefined;
  }
  return claim;
}

function chooseCard(obs: SeatObservation, base: CardId, variant: PartnerVariant, claim?: Signal): CardId {
  const { view } = obs;
  const plays = view.vueltaActual!.jugadas;
  if (view.cartas.length < 2) return base;
  const compare = (a: CardId, b: CardId) => compararCartas(a, b, view.muestra);
  const cards = [...view.cartas].sort(compare);
  const lowest = cards[0], top = cards.at(-1)!;
  const partner = obs.relativeSeats[2];

  // El pie aún puede cobrar la vuelta. Una seña vigente permite guardar una
  // carta ganadora cuando el compañero ya anunció cómo superar la salida.
  if (claim && plays.length === 1 && !beatsClaim(plays[0].carta, view.muestra, claim)) return lowest;
  if (claim && plays.length === 0) return lowest;
  if (variant.cards === "v1") return base;

  if (variant.cards === "support") {
    // En la primera salida conservamos la mejor para la segunda si tenemos
    // dos cartas fuertes. Frente a una apertura baja, el compañero cierra.
    if (!view.vueltas.length && plays.length === 0 && cards.length === 3 && compare(cards[1], "oros-03") >= 0) return cards[1];
    if (plays.length === 1 && compare(plays[0].carta, "oros-03") < 0 && cardSignal(base, view.muestra)) return lowest;
  }
  if (variant.cards === "cover" && plays.length === 2 && plays[0].asiento === partner) {
    // Si nuestro compañero gana por poco, V1 descarta. Aquí podemos cubrirlo
    // antes de que juegue el pie contrario, gastando la fuerte más económica.
    const [friend, opponent] = plays;
    if (compare(friend.carta, opponent.carta) >= 0 && compare(friend.carta, "oros-03") < 0) {
      return cards.find(card => compare(card, "oros-03") >= 0 && compare(card, friend.carta) > 0) ?? base;
    }
  }
  // Apurar al equipo contrario cuando la primera fue parda o la ganó su equipo.
  const first = view.vueltas[0]?.resultado;
  if (variant.cards === "cover" && first && plays.length === 1 && compare(top, plays[0].carta) > 0
      && (first.tipo === "parda" || first.equipo !== view.equipoPorAsiento[view.asiento])) return top;
  return base;
}

function chooseBid(obs: SeatObservation, base: Move): Move {
  const { view, score, target, stakes } = obs;
  const team = view.equipoPorAsiento[view.asiento];
  const own = score[team], other = score[1 - team];
  const pending = view.pendiente?.tipo;
  if (pending === "falta-envido" && stakes.side && obs.legalActions.includes("quiero")) {
    if (other + stakes.side.decline >= target) return "quiero";
    // Un compañero que ya cantó real o falta tiene información pública
    // favorable. No tomar una seña o un canto de los rivales por uno propio.
    const partnerRaised = obs.history.some(({ action }) => action.asiento === obs.relativeSeats[2]
      && (action.tipo === "real-envido" || action.tipo === "falta-envido"));
    if (base === "quiero" && stakes.side.accept >= 8 && !partnerRaised && view.tantosPropios.total < 32
        && obs.legalActions.includes("no-quiero")) return "no-quiero";
  }
  if (view.trucoPendiente && !stakes.side && stakes.truco && obs.legalActions.includes("quiero")
      && (other + stakes.truco.decline >= target || own + stakes.truco.accept >= target && base !== "no-quiero")) return "quiero";
  return base;
}

export function partnerAction(obs: SeatObservation, base: ActionId, variant: PartnerVariant, _random?: () => number): ActionId {
  if (variant.id === "v1" || obs.format === "duel") return base;
  const useSignals = variant.signals && obs.format === "pairs-private-senas";
  // V1 elige siempre el ID sin prefijo. Los cambios operan sobre esas jugadas.
  if (base.includes("/")) return base;
  let move = base as Move;
  if (esCardId(move) && (useSignals || variant.cards !== "v1")) {
    move = chooseCard(obs, move, variant, useSignals ? partnerClaim(obs) : undefined);
  } else if (!esCardId(move) && variant.stakeAware) {
    move = chooseBid(obs, move);
  }
  if (!obs.legalActions.includes(move)) return base;
  if (!useSignals || obs.history.some(turn => turn.action.asiento === obs.view.asiento && turn.signal)) return move;
  const remaining = obs.view.cartas.filter(card => card !== move);
  const strongest = remaining.reduce<CardId | undefined>((best, card) =>
    !best || compararCartas(card, best, obs.view.muestra) > 0 ? card : best, undefined);
  const signal = strongest && cardSignal(strongest, obs.view.muestra);
  if (signal) {
    const signaled = `${signal}/${move}` as ActionId;
    if (obs.legalActions.includes(signaled)) return signaled;
  }
  return move;
}
