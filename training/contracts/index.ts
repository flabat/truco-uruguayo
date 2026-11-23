import type { CardId } from "../../src/motor/cartas.ts";
import type { AccionOnlineV1, Cobro, TipoAccionOnlineV1, VistaOnlineV1 } from "../../src/motor/mesa-online.ts";
import type { Asiento, AsientoV1, RepartoOnline } from "../../src/motor/reparto.ts";

export const supportedFormats = ["duel", "pairs", "pairs-senas", "pairs-private-senas"] as const;
export type Format = typeof supportedFormats[number];
export const activeFormats = ["duel", "pairs", "pairs-private-senas"] as const;
export const formats: readonly Format[] = activeFormats;
export function requireTrainingFormat(format: unknown): asserts format is typeof activeFormats[number] {
  if (!activeFormats.some(f => f === format)) {
    throw new RangeError("Usá duel, pairs o pairs-private-senas. Las corridas solo admiten señas entre compañeros.");
  }
}
export const seatsFor = (format: Format): 2 | 4 => format === "duel" ? 2 : 4;
export const versions = {
  rules: "online-1", competition: "chico-40-v1", signals: "senas-publicas-v1",
  observation: "seat-v1", actions: "cards-bids-signals-v1", replay: "committed-v1",
  checkpoint: "training-v1", actor: "policy-v1",
} as const;
// Fuera del manifiesto de versiones v1 para poder verificar los torneos archivados.
export const teamSignalsVersion = "senas-equipo-v1";
export const trainingVersions = {...versions, signals: teamSignalsVersion} as const;
export const hasSignals = (format: Format) => format === "pairs-senas" || format === "pairs-private-senas";
export function signalVersionFor(format: Format) {
  if (format === "pairs-private-senas") return teamSignalsVersion;
  return format === "pairs-senas" ? versions.signals : null;
}
export function canSeeSignal(format: Format, sender: Asiento, viewer?: Asiento): boolean {
  return hasSignals(format) && viewer !== undefined && sender % 2 === viewer % 2;
}

export type Score = readonly [number, number];
export type Move = CardId | Exclude<TipoAccionOnlineV1, "carta">;
// IDs follow the rows of the published table in src/data/juego.json.
export const signals = ["cejas", "beso", "nariz", "ojo-derecho", "ojo-izquierdo",
  "labios-derecha", "labios-izquierda", "labio-inferior", "boca", "lengua",
  "ojos-cerrados", "labio-superior", "cachetes"] as const;
export type Signal = typeof signals[number];
// An ordinary move without a prefix means silence in every format.
export type ActionId = Move | `${Signal}/${Move}`;

/** One committed turn. In a seat projection the signal is omitted if that seat cannot see it. */
export interface PublicTurn {
  readonly signal?: Signal;
  readonly action: AccionOnlineV1;
  readonly awards: readonly Cobro[];
}
export interface SeatObservation {
  readonly rivalCounts?: readonly number[];
  readonly schema: typeof versions.observation;
  readonly format: Format;
  readonly seats: 2 | 4;
  /** Absolute seat IDs in order starting with the observing seat. */
  readonly relativeSeats: readonly AsientoV1[];
  readonly view: VistaOnlineV1;
  readonly originalCards: readonly CardId[];
  readonly startScore: Score;
  readonly score: Score;
  readonly target: number;
  readonly history: readonly PublicTurn[];
  /** Base side-bet points before public flor bonuses, and cost for pending truco. */
  readonly stakes: {
    readonly side: { readonly accept: number; readonly decline: number } | null;
    readonly truco: { readonly accept: number; readonly decline: number } | null;
    readonly florByTeam: Score;
  };
  readonly legalActions: readonly ActionId[];
}
export interface Policy {
  readonly id: string;
  /** One finite nonnegative probability per legal action, in order. Empty for a terminal seat. */
  decide(observation: SeatObservation, legalActions: readonly ActionId[]): readonly number[];
}

/** Referee storage only. Never project the deal into the public turn list or actor. */
export interface RefereeHand {
  readonly schema: typeof versions.replay;
  readonly format: Format;
  readonly hand: number;
  readonly deal: RepartoOnline;
  readonly startScore: Score;
  readonly turns: readonly PublicTurn[];
  readonly endScore: Score;
}
