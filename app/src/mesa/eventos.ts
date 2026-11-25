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
      // Un oyente que falla no corta a los demás.
      for (const oyente of [...oyentes]) {
        try {
          oyente(e);
        } catch (error) {
          console.warn("Falló un oyente de la mesa", error);
        }
      }
    },
    escuchar: oyente => {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
  };
}

/**
 * El chico que terminó a la vista. `nuestro`: lo ganó quien mira. El festejo queda `pendiente` hasta
 * que se ve el cartel, corre (`festejando`) y queda `festejado` aunque el cartel se desmonte y vuelva.
 */
export interface ChicoTerminado {
  numero: number;
  nuestro: boolean;
  fase: "pendiente" | "festejando" | "festejado";
}

/** El chico terminado sigue hasta que se reparte otra mano (otro chico en la misma mesa). */
export function chicoTrasEvento(c: ChicoTerminado | null, e: Evento): ChicoTerminado | null {
  if (e.tipo === "reparto") return null;
  if (e.tipo === "chico") return { numero: (c?.numero ?? 0) + 1, nuestro: e.nuestro, fase: "pendiente" };
  return c;
}

/**
 * Empieza el festejo cuando se ve el cartel. Si algo lo tapa en medio (una hoja), da el festejo por
 * hecho: corre una sola vez por chico. Sin movimiento (liviano) no hay festejo que esperar.
 */
export function avanceDelFestejo(c: ChicoTerminado | null, cartelVisible: boolean, conMovimiento: boolean): ChicoTerminado | null {
  if (!c) return c;
  if (c.fase === "pendiente" && cartelVisible) return { ...c, fase: conMovimiento ? "festejando" : "festejado" };
  if (c.fase === "festejando" && !cartelVisible) return { ...c, fase: "festejado" };
  return c;
}

/** El festejo del chico `numero` terminó a su hora. */
export function terminarFestejo(c: ChicoTerminado | null, numero: number): ChicoTerminado | null {
  return c && c.numero === numero && c.fase !== "festejado" ? { ...c, fase: "festejado" } : c;
}

/** Partículas para quien gana el chico y para el espectador (`propio` null); quien pierde no las ve. */
export const hayParticulas = (c: ChicoTerminado, propio: number | null) => c.nuestro || propio === null;
