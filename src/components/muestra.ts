import { cartasPorId } from "@eltruco/cliente/cartas.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";

export function actualizarMuestra(elemento: HTMLElement, base: string, carta: CardId) {
  const frente = elemento.querySelector<HTMLImageElement>(".frente")!;
  const src = base + "img/cartas/tatu/" + carta + ".webp";
  if (frente.getAttribute("src") === src) return;
  frente.src = src;
  elemento.querySelector(".nombre")!.textContent = cartasPorId.get(carta)!.nombre;
}
