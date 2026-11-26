export const plazoEsperaMs = Number(process.env.PLAZO_ESPERA_MS) || 60_000;

export interface Espera {
  asiento: number;
  desde: number;
  disponible: number;
}

/** Lleva en memoria desde cuándo cada asiento traba cada mesa. */
export function crearEsperas(ahora: () => number = Date.now, plazo: number = plazoEsperaMs) {
  const mesas = new Map<string, Map<number, number>>();

  return {
    actualizar(mesa: string, trabando: readonly number[]): Espera[] {
      const previas = mesas.get(mesa);
      const actuales = new Map<number, number>();
      for (const asiento of trabando) {
        actuales.set(asiento, previas?.get(asiento) ?? ahora());
      }
      if (actuales.size === 0) mesas.delete(mesa);
      else mesas.set(mesa, actuales);
      return [...actuales].map(([asiento, desde]) => ({ asiento, desde, disponible: desde + plazo }));
    },
    vencida(mesa: string, asiento: number): boolean {
      const desde = mesas.get(mesa)?.get(asiento);
      return desde !== undefined && ahora() >= desde + plazo;
    },
  };
}
