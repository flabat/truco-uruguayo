import { isDeepStrictEqual } from "node:util";
import { esCardId } from "../../src/motor/cartas.ts";
import {
  elegirAccionOnline, vistaOnline, type AccionOnline, type EstadoOnline, type VistaOnline,
} from "../../src/motor/mesa-online.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import {
  canSeeSignal, hasSignals, supportedFormats, seatsFor, signals, versions, type ActionId, type Format, type Move,
  type Policy, type PublicTurn, type SeatObservation,
} from "../contracts/index.ts";

export function decodeMove(move: Move, seat: Asiento): AccionOnline {
  return esCardId(move) ? { tipo: "carta", carta: move, asiento: seat } : { tipo: move, asiento: seat };
}

// El árbitro conserva en qué turno se agregaron los cobros. Solo cruzan el límite
// hacia el actor los datos de la vista pública y la seña reconocida de ese turno.
function publicHistory(state: EstadoOnline, view: VistaOnline, history: readonly PublicTurn[], format: Format): PublicTurn[] {
  if (history.length !== state.acciones.length) throw new Error("El historial no cubre las acciones de la mano.");
  let awardIndex = 0;
  const turns = history.map((turn, i) => {
    if (!isDeepStrictEqual(turn.action, state.acciones[i])) throw new Error("El turno no coincide con la acción confirmada.");
    const start = awardIndex;
    for (const award of turn.awards) {
      if (!isDeepStrictEqual(award, state.cobros[awardIndex++])) throw new Error("El turno contiene un cobro desconocido.");
    }
    const entry = { action: view.acciones[i], awards: view.cobros.slice(start, awardIndex) };
    if (turn.signal === undefined) return entry;
    if (!hasSignals(format) || !signals.includes(turn.signal)) throw new Error("Seña inválida en el historial.");
    if (!canSeeSignal(format, turn.action.asiento, view.asiento)) return entry;
    return { signal: turn.signal, ...entry };
  });
  if (awardIndex !== state.cobros.length) throw new Error("Faltan cobros en el historial.");
  return turns;
}

export function observe(state: EstadoOnline, seat: Asiento, format: Format, history: readonly PublicTurn[]): SeatObservation {
  const seats = seatsFor(format);
  if (!supportedFormats.includes(format) || state.mano.reparto.manos.length !== seats) {
    throw new RangeError("El formato no coincide con el número de asientos.");
  }
  const view = vistaOnline(state, seat);
  const legalActions: Move[] = [];
  for (const type of view.legales) {
    if (type === "carta") legalActions.push(...view.cartas);
    else legalActions.push(type);
  }
  const score: [number, number] = [...state.puntosInicio];
  for (const { equipo, tantos } of view.cobros) score[equipo] = Math.min(state.meta, score[equipo] + tantos);
  const florByTeam: [number, number] = [0, 0];
  for (const singer of state.flores) florByTeam[view.equipoPorAsiento[singer]] += 3;
  const side = state.resultado ? null : state.lateral;
  return {
    schema: versions.observation, format, seats,
    relativeSeats: Array.from({ length: seats }, (_, i) => ((seat + i) % seats) as Asiento),
    view, originalCards: [...state.mano.reparto.manos[seat]], startScore: [...state.puntosInicio], score, target: state.meta,
    history: publicHistory(state, view, history, format), legalActions,
    stakes: {
      side: side && { accept: side.valor, decline: side.anterior },
      truco: view.trucoPendiente && { accept: view.valorTruco + 1, decline: view.valorTruco },
      florByTeam,
    },
  };
}

function oneHot(move: Move, legalActions: readonly ActionId[]): number[] {
  const index = legalActions.indexOf(move);
  if (index < 0) throw new Error("La decisión de la política no pertenece a las acciones legales.");
  return legalActions.map((_, i) => Number(i === index));
}

export const incumbent: Policy = {
  id: "incumbent-online-v1",
  decide({ view }, legalActions) {
    const action = elegirAccionOnline(view);
    if (action === null) {
      if (legalActions.length) throw new Error("Un asiento sin turno recibió acciones legales.");
      return [];
    }
    return oneHot(action.tipo === "carta" ? action.carta : action.tipo, legalActions);
  },
};

export const challenger: Policy = {
  id: "duel-direct-falta-35-v1",
  decide(observation, legalActions) {
    const { format, view } = observation;
    if (format === "duel" && view.acciones.length === 1 && view.acciones[0].tipo === "falta-envido"
        && view.tantosPropios.total < 35 && view.legales.includes("no-quiero")) {
      return oneHot("no-quiero", legalActions);
    }
    return incumbent.decide(observation, legalActions);
  },
};
