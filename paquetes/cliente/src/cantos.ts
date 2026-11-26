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
export function verboDeCanto(tipo: Exclude<TipoAccionOnline, "carta">): "gritó" | "tocó" | "cantó" | "dijo" {
  if (tipo === "truco" || tipo === "retruco" || tipo === "vale-cuatro") return "gritó";
  if (tipo === "envido" || tipo === "real-envido" || tipo === "falta-envido") return "tocó";
  if (tipo === "flor" || tipo === "con-flor-envido" || tipo === "contraflor-al-resto") return "cantó";
  return "dijo";
}

interface AccionCantada {
  readonly tipo: string;
  readonly asiento: number;
  readonly duelo?: number | null;
}

/**
 * Con la regla de flor de las mesas en línea (`inmediata-v2`), «Flor» frente a una subida rival
 * que nadie quiso todavía declara la flor y rechaza la apuesta por quien la canta.
 */
export function florRechazaSubida(acciones: readonly AccionCantada[], indice: number): boolean {
  const flor = acciones[indice];
  if (flor?.tipo !== "flor") return false;
  let subida: { asiento: number; querida: boolean } | null = null;
  for (const accion of acciones.slice(0, indice)) {
    if ((accion.duelo ?? null) !== (flor.duelo ?? null)) continue;
    if (accion.tipo === "con-flor-envido" || accion.tipo === "contraflor-al-resto") subida = { asiento: accion.asiento, querida: false };
    else if (accion.tipo === "con-flor-quiero" && subida) subida.querida = true;
    else if (accion.tipo === "quiero" || accion.tipo === "no-quiero" || accion.tipo === "carta") subida = null;
  }
  return !!subida && !subida.querida && subida.asiento % 2 !== flor.asiento % 2;
}

/** El nombre de un canto en el historial, con la flor que rechaza dicha como en la mesa. */
export function cantoEnHistorial(acciones: readonly AccionCantada[], indice: number): string {
  const tipo = acciones[indice].tipo as keyof typeof canto;
  return florRechazaSubida(acciones, indice) ? "Con flor me achico" : canto[tipo];
}

export const respuestaConFlor = "«Flor» rechaza la apuesta por vos. «Con flor quiero» la acepta por tu equipo.";
