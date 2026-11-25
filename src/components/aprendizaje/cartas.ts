import { cartasPorId } from "@eltruco/cliente/cartas.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";

export function mostrarCarta(base: string, id: CardId, elegir?: () => void): HTMLElement {
  const nombre = cartasPorId.get(id)!.nombre;
  const carta = elegir ? document.createElement("button") : document.createElement("div");
  carta.className = "ap-carta";
  if (elegir) carta.addEventListener("click", elegir);

  const imagen = document.createElement("img");
  imagen.src = base + "img/cartas/tatu/" + id + ".webp";
  imagen.alt = ""; // El nombre visible también etiqueta el botón.
  imagen.width = 384;
  imagen.height = 596;
  const etiqueta = document.createElement("span");
  etiqueta.textContent = nombre;
  carta.append(imagen, etiqueta);
  return carta;
}
