// Ayudas puras para animar las escenas al ritmo de la narración.
import { cartaId, paloDe, palos, rangoDe, type CardId, type Rango } from "../../../src/motor/cartas.ts";
import { evaluarTantos } from "../../../src/motor/tantos.ts";
import type { Linea, LineaGuion } from "./linea.ts";
import type { Voz } from "./voz.ts";
import { palabraDeRango } from "./numeros.ts";

/**
 * Cuándo se nombra cada carta en una línea, por su rango y en orden. Un rango repetido toma la
 * siguiente ocurrencia. Si la palabra no aparece (por ejemplo, en una línea reescrita), la carta
 * entra al empezar la línea, escalonada.
 */
export function momentosDeCartas(linea: Linea, id: string, cartas: readonly CardId[]): number[] {
  return cartas.map((carta, i) => {
    const palabra = palabraDeRango(rangoDe(carta));
    const ocurrencia = cartas.slice(0, i).filter((c) => palabraDeRango(rangoDe(c)) === palabra).length;
    return linea.cuando(id, palabra, ocurrencia) ?? linea.inicio(id) + 0.15 * i;
  });
}

/**
 * Las cinco piezas del palo de la muestra con su valor de envido y de flor. Si la muestra es una
 * de ellas, el rey ocupa su lugar. Los valores salen del motor: la pieza junto a dos reyes de
 * otros palos, que valen cero.
 */
export function valoresDePiezas(muestra: CardId): { carta: CardId; envido: number; flor: number }[] {
  const palo = paloDe(muestra);
  const [a, b] = palos.filter((p) => p !== palo).map((p) => cartaId(p, 12));
  return ([2, 4, 5, 11, 10] as Rango[]).map((rango) => {
    const propia = cartaId(palo, rango);
    const carta = propia === muestra ? cartaId(palo, 12) : propia;
    const envido = evaluarTantos([carta, a, b], muestra).total;
    return { carta, envido, flor: envido - 20 };
  });
}

/** Para previsualizar en Studio sin audio: una palabra cada 0,3 s. */
export function vozSilenciosa(lineas: LineaGuion[]): Voz {
  const textos = lineas.flatMap((l) => l.texto.trim().split(/\s+/));
  return { archivo: "", palabras: textos.map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.25 })) };
}
