import type { VistaAsiento } from "../../motor/mano";
import { actualizarMuestra } from "../muestra";
import { mostrarCarta } from "../aprendizaje/cartas";
import { asientos, pareja } from "./relato";

export function boton(texto: string, accion: () => void, clase = "button") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = clase;
  el.textContent = texto;
  el.addEventListener("click", accion);
  return el;
}

function abanico(base: string, cantidad: number) {
  const grupo = document.createElement("div");
  grupo.className = "abanico-mesa";
  grupo.setAttribute("role", "img");
  grupo.setAttribute("aria-label", cantidad === 1 ? "Una carta en mano" : cantidad + " cartas en mano");
  for (let i = 0; i < cantidad; i++) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = base + "img/cartas/tatu/reverso.webp";
    grupo.append(img);
  }
  return grupo;
}

interface OpcionesTapete { enReparto?: boolean; finDeVuelta?: boolean; anuncio?: string }

export function pintarTapete(base: string, mesa: VistaAsiento, { enReparto, finDeVuelta, anuncio }: OpcionesTapete) {
  const anterior = mesa.vueltas.at(-1);
  // Al llegar a la cuarta carta, la reproducción deja ver la vuelta antes de mostrar la salida siguiente.
  const cerrada = mesa.vueltaActual === null || (finDeVuelta && !mesa.vueltaActual.jugadas.length && !!anterior);
  const vuelta = cerrada ? anterior! : mesa.vueltaActual!;
  const numero = mesa.vueltas.length + (cerrada ? 0 : 1);
  const titulo = enReparto ? "El reparto" : "Vuelta " + numero;
  document.getElementById("estado-tapete")!.textContent = titulo;
  const turno = mesa.turno;
  let turnoTexto = turno === null ? "Mano cerrada" : ["Tu turno", "Turno del rival de la derecha", "Turno de tu compañero", "Turno del rival de la izquierda"][turno];
  if (enReparto) turnoTexto = ["Sos mano", "Sale el rival de la derecha", "Sale tu compañero", "Sale el rival de la izquierda"][mesa.mano];
  if (cerrada && anterior) turnoTexto = anterior.resultado.tipo === "parda" ? "Parda" : pareja(anterior.resultado.equipo) + " ganó";
  document.getElementById("turno-mesa")!.textContent = anuncio ?? turnoTexto;
  actualizarMuestra(document.getElementById("muestra")!, base, mesa.muestra);
  const jugadas = mesa.vueltas.flatMap((v) => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  asientos.forEach((_, i) => {
    const asiento = document.querySelector<HTMLElement>(".asiento-" + i)!;
    const papeles = [];
    if (i === mesa.mano) papeles.push("Mano");
    if (i === mesa.dador) papeles.push("Dador");
    const ganador = cerrada && anterior?.resultado.tipo === "ganada" && anterior.resultado.asiento === i;
    if (ganador) papeles.push("Ganó la vuelta");
    asiento.classList.toggle("asiento-activo", !cerrada && !anuncio && !enReparto && turno === i);
    asiento.classList.toggle("asiento-ganador", !!ganador);
    asiento.querySelector(".asiento-papel")!.textContent = papeles.join(" · ");
    const cartas = asiento.querySelector(".asiento-cartas")!;
    cartas.replaceChildren();
    const jugada = vuelta.jugadas.find((j) => j.asiento === i);
    if (jugada) cartas.append(mostrarCarta(base, jugada.carta));
    else if (i !== 0) cartas.append(abanico(base, 3 - jugadas.filter((j) => j.asiento === i).length));
  });
}
