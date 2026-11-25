import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Geometria } from "@eltruco/mesa-geometria";
import type { EventosDeMesa } from "./eventos.ts";
import type { MesaVisible } from "./modelo.ts";
import { sonido } from "./sonido.ts";
import { movimiento, planDeReparto, type PlanDeReparto } from "./movimiento.ts";

export interface RepartoEnCurso {
  numero: number;
  plan: PlanDeReparto;
}

/**
 * El reparto que se está animando, o null. Se planea al oír el evento `reparto`, con las cartas que
 * hay en ese momento; el evento llega antes de pintar la mano nueva (ver `useColaDePresentacion`),
 * así nunca se ven las cartas quietas antes de volar. Dura hasta que se dan vuelta las propias.
 */
export function useReparto(eventos: EventosDeMesa | undefined, geometria: Geometria | null, mesa: MesaVisible,
    liviano: boolean): RepartoEnCurso | null {
  const [reparto, cambiarReparto] = useState<RepartoEnCurso | null>(null);
  const vigentes = useRef({ geometria, mesa, liviano });
  useLayoutEffect(() => {
    vigentes.current = { geometria, mesa, liviano };
  });
  useLayoutEffect(() => {
    if (!eventos) return;
    return eventos.escuchar(e => {
      if (e.tipo !== "reparto") return;
      const { geometria: g, mesa: m, liviano: l } = vigentes.current;
      const { reparto: tiempos, vuelo } = movimiento(l);
      if (!tiempos || !g) return;
      const cartas = g.asientos.map((a, i) => (i === m.propio ? m.manoPropia.length : a.dorsos.length));
      const plan = planDeReparto(e.dador, cartas, m.propio, { entreCartas: tiempos.entreCartas, vuelo: vuelo.duracion });
      cambiarReparto(r => (plan.vuelos.length ? { numero: (r?.numero ?? 0) + 1, plan } : null));
    });
  }, [eventos]);
  // Si el modo liviano se activa en medio, el reparto se corta: las cartas aparecen en su lugar y la mano se habilita.
  useEffect(() => {
    if (liviano) cambiarReparto(null);
  }, [liviano]);
  // Un roce de naipe por carta, a la hora en que sale del mazo.
  useEffect(() => {
    if (!reparto) return;
    const roces = reparto.plan.vuelos.map(v => setTimeout(() => {
      try {
        sonido.reproducirEfecto("roce");
      } catch (error) {
        console.warn("Falló el roce del reparto", error);
      }
    }, v.sale));
    return () => roces.forEach(clearTimeout);
  }, [reparto]);
  useEffect(() => {
    if (!reparto) return;
    const listo = setTimeout(() => cambiarReparto(r => (r === reparto ? null : r)), reparto.plan.fin);
    return () => clearTimeout(listo);
  }, [reparto]);
  return reparto;
}
