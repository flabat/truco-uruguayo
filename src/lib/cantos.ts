import type { TipoAccionOnline } from "@eltruco/motor/cantos-online.ts";

export const canto = {
  truco: "Truco",
  retruco: "Retruco",
  "vale-cuatro": "Vale cuatro",
  envido: "Envido",
  "real-envido": "Real envido",
  "falta-envido": "Falta envido",
  flor: "Flor",
  "con-flor-quiero": "Con flor quiero",
  "con-flor-envido": "Con flor envido",
  "contraflor-al-resto": "Contraflor al resto",
  quiero: "Quiero",
  "no-quiero": "No quiero",
  "paso-flor": "Yo no canto",
  mazo: "Irse al mazo",
} satisfies Record<Exclude<TipoAccionOnline, "carta">, string>;

/** En la mesa se grita el truco, se toca el envido y se canta la flor. */
export function verboDeCanto(tipo: Exclude<TipoAccionOnline, "carta">) {
  if (tipo === "truco" || tipo === "retruco" || tipo === "vale-cuatro") return "gritó";
  if (tipo === "envido" || tipo === "real-envido" || tipo === "falta-envido") return "tocó";
  if (tipo === "flor" || tipo === "con-flor-envido" || tipo === "contraflor-al-resto") return "cantó";
  return "dijo";
}

export const respuestaConFlor = "«Flor» rechaza la apuesta por vos. «Con flor quiero» la acepta por tu equipo.";
