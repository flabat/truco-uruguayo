import type { CardId } from "../../src/motor/cartas.ts";
import type { AccionOnline, Cobro, TipoAccionOnline, VistaOnline } from "../../src/motor/mesa-online.ts";
import type { Asiento, RepartoOnline } from "../../src/motor/reparto.ts";

export const formats = ["duel", "pairs", "pairs-senas"] as const;
export type Format = typeof formats[number];
export const seatsFor = (format: Format): 2 | 4 => format === "duel" ? 2 : 4;
export const versions = {
  rules: "online-1", competition: "chico-40-v1", signals: "senas-publicas-v1",
  observation: "seat-v1", actions: "cards-bids-signals-v1", replay: "committed-v1",
  checkpoint: "training-v1", actor: "policy-v1",
} as const;

export type Score = readonly [number, number];
export type Move = CardId | Exclude<TipoAccionOnline, "carta">;
// IDs follow the rows of the published table in src/data/juego.json.
export const signals = ["cejas", "beso", "nariz", "ojo-derecho", "ojo-izquierdo",
  "labios-derecha", "labios-izquierda", "labio-inferior", "boca", "lengua",
  "ojos-cerrados", "labio-superior", "cachetes"] as const;
export type Signal = typeof signals[number];
// An ordinary move without a prefix means silence in every format.
export type ActionId = Move | `${Signal}/${Move}`;

/** One committed turn. The public signal occurs before the move, then the referee awards points. */
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
