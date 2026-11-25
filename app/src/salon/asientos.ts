import type { Asiento, Mesa } from "@eltruco/cliente/cliente.ts";

export function faltanParaRepartir(faltan: number): string {
  if (faltan === 0) return "La mesa está completa.";
  return faltan === 1 ? "Falta un jugador para repartir." : `Faltan ${faltan} jugadores para repartir.`;
}

export function papelDelAsiento(mesa: Pick<Mesa, "modo" | "miAsiento">, asiento: Asiento): string {
  if (mesa.modo !== "1v1") return "Equipo " + (asiento.equipo + 1);
  return asiento.asiento === mesa.miAsiento ? "Tu asiento" : "Rival";
}
