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
 * Asientos que traban la mesa, en orden ascendente: los humanos activos que deben decidir cuando
 * ninguno de ellos está conectado; más el pie, que espera una indicación suya.
 * Una computadora o un asiento cedido no responde por el equipo mientras espera un humano que puede
 * decidir. Si entre los que deciden no hay humanos activos, la computadora juega y nadie traba.
 * `posibles` vacío: el «siguiente» lo puede pedir cualquiera.
 */
export function asientosQueTraban(
  posibles: readonly number[],
  esperaPie: number | undefined,
  activos: readonly number[],
  conectados: readonly number[],
): number[] {
  const deciden = posibles.filter((p) => activos.includes(p));
  const traban = new Set<number>();
  if (!deciden.some((p) => conectados.includes(p))) for (const p of deciden) traban.add(p);
  if (esperaPie !== undefined && activos.includes(esperaPie) && !conectados.includes(esperaPie)) {
    traban.add(esperaPie);
  }
  return [...traban].sort((a, b) => a - b);
}
