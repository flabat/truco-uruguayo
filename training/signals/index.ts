import { esCardId, type CardId } from "../../src/motor/cartas.ts";
import { aplicarOnline, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import {
  formats, seatsFor, signals, type ActionId, type Format, type Move, type PublicTurn, type Signal,
} from "../contracts/index.ts";
import { decodeMove } from "../seat/index.ts";

const bids = {
  truco: true, retruco: true, "vale-cuatro": true, envido: true, "real-envido": true,
  "falta-envido": true, flor: true, "paso-flor": true, "con-flor-envido": true,
  "contraflor-al-resto": true, quiero: true, "no-quiero": true,
} satisfies Record<Exclude<Move, CardId>, true>;

function isMove(value: string): value is Move {
  return esCardId(value) || Object.hasOwn(bids, value);
}
function isSignal(value: string): value is Signal {
  return signals.some(signal => signal === value);
}

/** La primera fila es silencio; las siguientes permiten cada seña con cualquier jugada. */
function legalActions(moves: readonly Move[]): readonly ActionId[] {
  const actions: ActionId[] = [...moves];
  for (const signal of signals) {
    for (const move of moves) actions.push(`${signal}/${move}`);
  }
  return actions;
}

function decode(id: ActionId): { move: Move; signal?: Signal } {
  if (typeof id !== "string") throw new TypeError("Acción de campeonato inválida.");
  if (isMove(id)) return { move: id };
  const separator = id.indexOf("/");
  if (separator > 0) {
    const signal = id.slice(0, separator);
    const move = id.slice(separator + 1);
    if (isSignal(signal) && isMove(move)) return { move, signal };
  }
  throw new RangeError("Se esperaba una jugada con una única seña reconocida o en silencio.");
}

export const signalRules = { legalActions, decode };

/** El árbitro confirma la seña y la jugada juntas. Un rechazo no publica ningún evento. */
export function commitTurn(state: EstadoOnline, seat: Asiento, format: Format, id: ActionId):
    { state: EstadoOnline; turn: PublicTurn } {
  if (!formats.includes(format) || seatsFor(format) !== state.mano.reparto.manos.length) {
    throw new RangeError("El formato no coincide con el reparto.");
  }
  const { move, signal } = decode(id);
  if (signal !== undefined && format !== "pairs-senas") throw new RangeError("Este formato no admite señas.");
  const action = decodeMove(move, seat);
  const step = aplicarOnline(state, action);
  if (!step.ok) throw new RangeError("Acción rechazada por el árbitro: " + step.error);
  const awards = step.estado.cobros.slice(state.cobros.length);
  const turn = signal === undefined ? { action, awards } : { signal, action, awards };
  return { state: step.estado, turn };
}
