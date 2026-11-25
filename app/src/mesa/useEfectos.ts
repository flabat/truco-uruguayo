import { useEffect } from "react";
import { despacharEfectos } from "./efectos.ts";
import type { EventosDeMesa } from "./eventos.ts";
import { vibrar } from "./hapticos.ts";
import type { Preferencias } from "./preferencias.ts";
import { configurarSonido, sonido } from "./sonido.ts";

/** Hápticos, voces y efectos de la mesa a medida que la cola presenta cada evento. */
export function useEfectos(eventos: EventosDeMesa, { sonido: conSonido, hapticos }: Preferencias) {
  useEffect(() => {
    configurarSonido(conSonido);
  }, [conSonido]);

  useEffect(() => eventos.escuchar(e => despacharEfectos(e, hapticos, {
    vibrar, reproducirEfecto: sonido.reproducirEfecto, reproducirVoz: sonido.reproducirVoz,
  })), [eventos, hapticos]);
}
