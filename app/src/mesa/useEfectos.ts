import { useEffect } from "react";
import { despacharEfectos } from "./efectos.ts";
import type { EventosDeMesa } from "./eventos.ts";
import { vibrar } from "./hapticos.ts";
import { sonido } from "./sonido.ts";

/**
 * Hápticos, voces y efectos de la mesa a medida que la cola presenta cada evento. Hasta que se cargan las
 * preferencias (`cargadas`) no vibra: los hápticos podrían estar apagados. El sonido lo prende y apaga la 4e.
 * Al conocer cuántos asientos hay, precarga sus voces.
 */
export function useEfectos(eventos: EventosDeMesa, hapticos: boolean, asientos: number) {
  useEffect(() => eventos.escuchar(e => despacharEfectos(e, hapticos, {
    vibrar, reproducirEfecto: sonido.reproducirEfecto, reproducirVoz: sonido.reproducirVoz,
  })), [eventos, hapticos]);

  useEffect(() => {
    if (asientos > 0) void sonido.precargar(Array.from({ length: asientos }, (_, i) => i));
  }, [asientos]);
}
