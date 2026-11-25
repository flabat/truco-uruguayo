import type { CardId } from "@eltruco/motor/cartas.ts";
import type { HojaCantos } from "./hoja-cantos.ts";

export type Atajo =
  | { tipo: "carta"; carta: CardId }
  | { tipo: "abrir-cantos" }
  | { tipo: "canto"; canto: "quiero" | "no-quiero" }
  | { tipo: "cerrar" };

export interface EstadoDeAtajos {
  /** La mano propia de izquierda a derecha. */
  mano: readonly CardId[];
  puedeJugarCarta: boolean;
  /** La hoja de Cantos disponible; null si no hay cantos legales. */
  hoja: HojaCantos | null;
  /** Si hay alguna hoja abierta: la de Cantos o, en la mesa del teléfono, una de la tira. */
  hojaAbierta: boolean;
}

const respuestas: Record<string, "quiero" | "no-quiero"> = { q: "quiero", n: "no-quiero" };

/** 1, 2 y 3 juegan las cartas de izquierda a derecha; C abre Cantos; Q y N responden; Escape cierra. */
export function atajoDeTecla(tecla: string, e: EstadoDeAtajos): Atajo | null {
  if (tecla === "1" || tecla === "2" || tecla === "3") {
    const carta = e.mano[Number(tecla) - 1];
    return carta && e.puedeJugarCarta ? { tipo: "carta", carta } : null;
  }
  if (tecla === "Escape") {
    // Con un canto por responder, la hoja abierta es la de respuesta, que no se cierra.
    return e.hojaAbierta && (e.hoja?.cerrable ?? true) ? { tipo: "cerrar" } : null;
  }
  const letra = tecla.toLowerCase();
  if (letra === "c") return e.hoja && !e.hojaAbierta ? { tipo: "abrir-cantos" } : null;
  const canto = respuestas[letra];
  if (canto) return e.hoja?.respuestas.includes(canto) ? { tipo: "canto", canto } : null;
  return null;
}
