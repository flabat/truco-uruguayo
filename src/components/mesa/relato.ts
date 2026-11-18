import { cartasPorId } from "../../lib/cartas.ts";
import { pieza, type CardId } from "../../motor/cartas.ts";
import { compararCartas } from "../../motor/jerarquia.ts";
import type { VistaAsiento, VueltaCerrada } from "../../motor/mano.ts";

export const asientos = ["Vos", "Rival de la derecha", "Tu compañero", "Rival de la izquierda"] as const;
export const nombre = (carta: CardId) => cartasPorId.get(carta)!.nombre.toLowerCase();
export const pareja = (equipo: number) => equipo === 0 ? "Tu pareja" : "La pareja rival";

export function resultadoVuelta({ resultado, jugadas }: VueltaCerrada) {
  if (resultado.tipo === "parda") return "Parda. Las dos parejas igualaron la carta más fuerte.";
  const ganadora = jugadas.find((j) => j.asiento === resultado.asiento)!;
  return `${pareja(resultado.equipo)} ganó con ${nombre(ganadora.carta)}.`;
}

export function resultadoMano({ vueltas }: VistaAsiento) {
  const [primera, segunda, tercera] = vueltas.map((v) => v.resultado.tipo);
  if (tercera === "parda") return primera === "parda"
    ? "Las tres vueltas salieron pardas. Decide quién era mano."
    : "Cada pareja ganó una vuelta y la tercera salió parda. Decide la primera.";
  if (primera === "parda") return segunda === "parda"
    ? "Las dos primeras salieron pardas. Decidió la tercera vuelta."
    : "La primera salió parda. La segunda decidió la mano.";
  if (segunda === "parda") return "La segunda salió parda. Alcanzó con ganar la primera.";
  return tercera ? "Cada pareja ganó una de las dos primeras vueltas. Decidió la tercera."
    : "La misma pareja ganó las dos primeras vueltas.";
}

export function situacionDeJuego({ vueltaActual, muestra }: VistaAsiento) {
  const jugadas = vueltaActual!.jugadas;
  if (!jugadas.length) return "Te toca salir. Elegí cualquiera de tus cartas para abrir la vuelta.";
  const mayor = jugadas.reduce((a, b) => compararCartas(a.carta, b.carta, muestra) < 0 ? b : a);
  if (jugadas.some((j) => j.asiento % 2 !== mayor.asiento % 2 && compararCartas(j.carta, mayor.carta, muestra) === 0)) {
    return "Por ahora la vuelta está parda. Elegí qué carta jugar.";
  }
  if (mayor.asiento === 2) return `Tu compañero va ganando con ${nombre(mayor.carta)}. Podés guardar una carta fuerte.`;
  return `La pareja rival va ganando con ${nombre(mayor.carta)}. Elegí qué carta jugar.`;
}

export function ultimaJugada(mesa: VistaAsiento) {
  const ultima = mesa.vueltas.at(-1);
  if (!ultima) return "";
  const propia = ultima.jugadas.find((j) => j.asiento === 0)!;
  let relato = `Jugaste ${nombre(propia.carta)}. ${resultadoVuelta(ultima)}`;
  const reserva = mesa.cartas.find((carta) => pieza(carta, mesa.muestra) !== null);
  if (reserva && mesa.turno !== null) relato += ` Guardaste una pieza, ${nombre(reserva)}.`;
  return relato;
}
