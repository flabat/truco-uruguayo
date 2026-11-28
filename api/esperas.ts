export const plazoEsperaMs = Number(process.env.PLAZO_ESPERA_MS) || 60_000;

export interface Espera {
  asiento: number;
  desde: number;
  disponible: number;
  /** Lo que falta para `disponible` al responder: la app cuenta desde ahí con su propio reloj. */
  restante: number;
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
      const t = ahora();
      return [...actuales].map(([asiento, desde]) =>
        ({ asiento, desde, disponible: desde + plazo, restante: Math.max(0, desde + plazo - t) }));
    },
    vencida(mesa: string, asiento: number): boolean {
      const desde = mesas.get(mesa)?.get(asiento);
      return desde !== undefined && ahora() >= desde + plazo;
    },
  };
}
