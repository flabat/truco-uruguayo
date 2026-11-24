import type { AccionOnlineV1, Cobro } from "./mesa-online.ts";

// Tipos del contrato de entrenamiento que también usa el motor. training/contracts los reexporta.
export const supportedFormats = ["duel", "pairs", "pairs-senas", "pairs-private-senas"] as const;
export type Format = typeof supportedFormats[number];

// IDs follow the rows of the published table in src/data/juego.json.
export const signals = ["cejas", "beso", "nariz", "ojo-derecho", "ojo-izquierdo",
  "labios-derecha", "labios-izquierda", "labio-inferior", "boca", "lengua",
  "ojos-cerrados", "labio-superior", "cachetes"] as const;
export type Signal = typeof signals[number];

/** One committed turn. In a seat projection the signal is omitted if that seat cannot see it. */
export interface PublicTurn {
  readonly signal?: Signal;
  readonly action: AccionOnlineV1;
  readonly awards: readonly Cobro[];
}
