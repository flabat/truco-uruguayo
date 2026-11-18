import { pieza, rangoDe, rangosPieza, type CardId, type Rango } from "./cartas.ts";

// De mayor a menor, como las cinco piezas en rangosPieza.
const matas: readonly CardId[] = ["espadas-01", "bastos-01", "espadas-07", "oros-07"];
const rangosComunes: readonly Rango[] = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];

function puesto(carta: CardId, muestra: CardId): number {
  const efectiva = pieza(carta, muestra);
  if (efectiva !== null) return rangosPieza.indexOf(efectiva);

  const mata = matas.indexOf(carta);
  if (mata !== -1) return rangosPieza.length + mata;

  return rangosPieza.length + matas.length + rangosComunes.indexOf(rangoDe(carta));
}

/** Positivo si gana la primera carta, negativo si gana la segunda y cero si empatan. */
export function compararCartas(a: CardId, b: CardId, muestra: CardId): number {
  return puesto(b, muestra) - puesto(a, muestra);
}
