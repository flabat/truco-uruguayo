/** Reglas puras de salida de una partida y de qué asientos traban la espera. */

/** `activo`: humano, no cedido y sin salida. */
export interface AsientoActivo {
  asiento: number;
  activo: boolean;
}

export type Efecto = { tipo: "ceder" } | { tipo: "cerrar"; ganador: 0 | 1 };

/**
 * Qué pasa cuando `sale` abandona: en 2v2 y 3v3 cede su asiento si queda otro
 * humano activo; si no, la partida se cierra a favor del otro equipo.
 */
export function efectoDeSalida(
  modo: "1v1" | "2v2" | "3v3",
  asientos: readonly AsientoActivo[],
  sale: number,
): Efecto {
  const quedaOtro = asientos.some((a) => a.activo && a.asiento !== sale);
  if (modo !== "1v1" && quedaOtro) return { tipo: "ceder" };
  return { tipo: "cerrar", ganador: (1 - (sale % 2)) as 0 | 1 };
}

/**
 * Asientos que traban la mesa, en orden ascendente: todos los que deben decidir
 * cuando son humanos activos y ninguno está conectado; más el pie, que espera una indicación suya.
 * `posibles` vacío: el «siguiente» lo puede pedir cualquiera.
 */
export function asientosQueTraban(
  posibles: readonly number[],
  esperaPie: number | undefined,
  activos: readonly number[],
  conectados: readonly number[],
): number[] {
  // Si alguno de los que deciden es computadora o está cedido, la mesa sigue sola;
  // si alguno humano está conectado, puede responder por el equipo.
  const responde = posibles.some((p) => !activos.includes(p) || conectados.includes(p));
  const traban = new Set<number>();
  if (!responde) for (const p of posibles) traban.add(p);
  if (esperaPie !== undefined && activos.includes(esperaPie) && !conectados.includes(esperaPie)) {
    traban.add(esperaPie);
  }
  return [...traban].sort((a, b) => a - b);
}
