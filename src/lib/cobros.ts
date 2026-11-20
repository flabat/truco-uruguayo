import type { AccionOnline, Cobro, EstadoOnline } from "../motor/cantos-online.ts";

/** La apuesta y el motivo del cierre son hechos distintos. */
export function motivoDelCobro(cobro: Cobro, acciones: readonly AccionOnline[], resultado: EstadoOnline["resultado"]) {
  if (cobro.motivo !== "truco") return cobro.motivo;
  const nombres = ["truco sin cantar", "truco querido", "retruco querido", "vale cuatro querido"];
  if (resultado?.motivo === "rechazo") {
    const oferta = acciones.findLast(a => ["truco", "retruco", "vale-cuatro"].includes(a.tipo));
    return (oferta?.tipo.replace("vale-cuatro", "vale cuatro") ?? "truco") + " no querido";
  }
  const apuesta = nombres[(cobro.valor ?? cobro.tantos) - 1] ?? "truco";
  return apuesta + (resultado?.motivo === "mazo" ? " · retiro al mazo" : "");
}
