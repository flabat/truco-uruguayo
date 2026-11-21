import { esCardId, mazo } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import { signals, type Move, type SeatObservation, type Signal } from "../contracts/index.ts";
import { selfplayCardFeatures, selfplayContext } from "../selfplay/learner.ts";

const bids = ["flor", "paso-flor", "con-flor-envido", "contraflor-al-resto", "falta-envido", "envido",
  "real-envido", "truco", "retruco", "vale-cuatro", "quiero", "no-quiero", "con-flor-quiero", "mazo"] as const;
export const sizes = { features: 257, moves: 3 + bids.length, gestures: 1 + signals.length,
  eventAction: mazo.length + bids.length, maxHistory: 64 };

const gestureIndex = (signal?: Signal) => signal ? signals.indexOf(signal) + 1 : 0;
function checkedIndex<T>(list: readonly T[], value: T) {
  const index = list.indexOf(value);
  if (index === -1) throw new Error("Unknown Transformer input: " + value);
  return index;
}

export function encode(obs: SeatObservation, withHistory: boolean) {
  const context = selfplayContext(obs);
  const { muestra } = obs.view;
  const team = obs.view.equipoPorAsiento[obs.view.asiento];
  const relativeSeat = (seat: number) => (seat - obs.view.asiento + obs.seats) % obs.seats;
  const actions = obs.legalActions.map(id => {
    const [prefix, body] = id.split("/");
    const move = (body ?? prefix) as Move;
    const gesture = body ? gestureIndex(prefix as Signal) : 0;
    if (esCardId(move)) {
      const slot = checkedIndex(context.cards, move);
      return [slot, gesture, ...selfplayCardFeatures(context, slot, move, muestra).map(feature => feature + 1)];
    }
    return [3 + checkedIndex(bids, move), gesture, 0, 0, 0, 0];
  });
  const history = withHistory ? obs.history.map(({action, signal, awards}) => {
    const card = action.tipo === "carta";
    const actionId = card ? checkedIndex(mazo, action.carta) : mazo.length + checkedIndex(bids, action.tipo);
    const strength = card ? 1 + compararCartas(action.carta, muestra.startsWith("copas") ? "bastos-04" : "copas-04", muestra) : 0;
    const points = (own: boolean) => awards.reduce((sum, award) => sum + (((award.equipo === team) === own) ? award.tantos : 0), 0);
    const revealedTotal = awards.find(award => award.tantoGanador !== undefined)?.tantoGanador;
    return [actionId, relativeSeat(action.asiento), gestureIndex(signal), strength, points(true), points(false), revealedTotal ?? -1];
  }) : [];
  return { summary: context.features.map(feature => feature + 1), actions, history };
}
export type Encoded = ReturnType<typeof encode>;
