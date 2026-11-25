import type { Evento } from "./cola.ts";

/**
 * Lo que la cola de presentación anuncia (`alEvento`), repartido a quien lo escuche: el lienzo
 * (reparto), el tanteador (cobros) y, desde la tarea 17, los hápticos y el sonido.
 */
export interface EventosDeMesa {
  emitir: (e: Evento) => void;
  /** Devuelve la función que deja de escuchar. */
  escuchar: (oyente: (e: Evento) => void) => () => void;
}

export function crearEventos(): EventosDeMesa {
  const oyentes = new Set<(e: Evento) => void>();
  return {
    emitir: e => {
      for (const oyente of [...oyentes]) oyente(e);
    },
    escuchar: oyente => {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
  };
}
