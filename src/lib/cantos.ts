import type { TipoAccionOnline } from "../motor/cantos-online";

export const canto = {
  truco: "Truco",
  retruco: "Retruco",
  "vale-cuatro": "Vale cuatro",
  envido: "Envido",
  "real-envido": "Real envido",
  "falta-envido": "Falta envido",
  flor: "Flor",
  "con-flor-envido": "Con flor envido",
  "contraflor-al-resto": "Contraflor al resto",
  quiero: "Quiero",
  "no-quiero": "No quiero",
  "paso-flor": "Sin flor",
  mazo: "Irse al mazo",
} satisfies Record<Exclude<TipoAccionOnline, "carta">, string>;
