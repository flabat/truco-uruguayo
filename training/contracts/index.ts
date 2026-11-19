import type { CardId } from "../../src/motor/cartas.ts";
import type { AccionOnline, Cobro, TipoAccionOnline, VistaOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento, RepartoOnline } from "../../src/motor/reparto.ts";

export const supportedFormats = ["duel", "pairs", "pairs-senas", "pairs-private-senas"] as const;
export type Format = typeof supportedFormats[number];
/** Calendario congelado de la liga v1; los nuevos ciclos usan activeFormats. */
export const formats: readonly Format[] = ["duel", "pairs", "pairs-senas"];
export const activeFormats = ["duel", "pairs", "pairs-private-senas"] as const;
export const seatsFor = (format: Format): 2 | 4 => format === "duel" ? 2 : 4;
export const versions = {
  rules: "online-1", competition: "chico-40-v1", signals: "senas-publicas-v1",
  observation: "seat-v1", actions: "cards-bids-signals-v1", replay: "committed-v1",
  checkpoint: "training-v1", actor: "policy-v1",
} as const;
// Fuera del manifiesto de versiones v1 para poder verificar los torneos archivados.
export const teamSignalsVersion = "senas-equipo-v1";
export const hasSignals = (format: Format) => format === "pairs-senas" || format === "pairs-private-senas";
export function signalVersionFor(format: Format) {
  if (format === "pairs-private-senas") return teamSignalsVersion;
  return format === "pairs-senas" ? versions.signals : null;
}
export function canSeeSignal(format: Format, sender: Asiento, viewer?: Asiento): boolean {
  return format === "pairs-senas" || format === "pairs-private-senas" && viewer !== undefined && sender % 2 === viewer % 2;
}

export type Score = readonly [number, number];
export type Move = CardId | Exclude<TipoAccionOnline, "carta">;
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
  readonly action: AccionOnline;
  readonly awards: readonly Cobro[];
}
export interface SeatObservation {
  readonly schema: typeof versions.observation;
  readonly format: Format;
  readonly seats: 2 | 4;
  /** Absolute seat IDs in order starting with the observing seat. */
  readonly relativeSeats: readonly Asiento[];
  readonly view: VistaOnline;
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
