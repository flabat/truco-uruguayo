import { mazo, type CardId } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import type { VistaAsiento } from "./mano.ts";

/** El controlador entrega la carta a jugarCarta igual que una elección del aprendiz. */
export function elegirJugada(vista: VistaAsiento): CardId {
  const { asiento, turno, vueltaActual, muestra, equipoPorAsiento } = vista;
  if (vueltaActual === null || turno !== asiento || vista.cartas.length === 0) {
    throw new RangeError("El asiento necesita un turno activo y cartas para elegir una jugada.");
  }

  const { jugadas } = vueltaActual;
  const esSalida = jugadas.length === 0;
  const cartas = [...vista.cartas].sort((a, b) => {
    const fuerza = compararCartas(a, b, muestra);
    return (esSalida ? -fuerza : fuerza) || mazo.indexOf(a) - mazo.indexOf(b);
  });
  if (esSalida) return cartas[0];

  const menor = cartas[0];
  const equipo = equipoPorAsiento[asiento];
  // Los equipos se alternan: al responder, ya jugó al menos un rival.
  const rivales = jugadas.filter(jugada => equipoPorAsiento[jugada.asiento] !== equipo);
  const mayorRival = rivales.reduce((mayor, otra) =>
    compararCartas(otra.carta, mayor.carta, muestra) > 0 ? otra : mayor);
  const contraRival = (carta: CardId) => compararCartas(carta, mayorRival.carta, muestra);
  const compañeros = jugadas.filter(jugada => equipoPorAsiento[jugada.asiento] === equipo);
  const ventajaDelCompañero = compañeros.reduce((ventaja, jugada) =>
    Math.max(ventaja, contraRival(jugada.carta)), -1);

  if (ventajaDelCompañero > 0) return menor;
  const ganadora = cartas.find(carta => contraRival(carta) > 0);
  if (ganadora) return ganadora;
  if (ventajaDelCompañero === 0) return menor;
  return cartas.find(carta => contraRival(carta) === 0) ?? menor;
}
