export const palos = ["oros", "copas", "espadas", "bastos"] as const;
export const rangos = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export const rangosPieza = [2, 4, 5, 11, 10] as const;

export type Palo = (typeof palos)[number];
export type Rango = (typeof rangos)[number];
export type RangoPieza = (typeof rangosPieza)[number];
type Codigo<R extends Rango> = R extends 10 | 11 | 12 ? `${R}` : `0${R}`;
export type CardId = `${Palo}-${Codigo<Rango>}`;

export function cartaId(palo: Palo, rango: Rango): CardId {
  return `${palo}-${String(rango).padStart(2, "0")}` as CardId;
}

// El orden es parte del formato de reparto V1.
export const mazo: readonly CardId[] = Object.freeze(
  palos.flatMap((palo) => rangos.map((rango) => cartaId(palo, rango))),
);
const jugables = new Set<string>(mazo);

export function esCardId(valor: unknown): valor is CardId {
  return typeof valor === "string" && jugables.has(valor);
}

export function paloDe(carta: CardId): Palo {
  return carta.slice(0, -3) as Palo;
}

export function rangoDe(carta: CardId): Rango {
  return Number(carta.slice(-2)) as Rango;
}

const piezas = new Set<Rango>(rangosPieza);

function esRangoPieza(rango: Rango): rango is RangoPieza {
  return piezas.has(rango);
}

export function pieza(carta: CardId, muestra: CardId): RangoPieza | null {
  if (carta === muestra || paloDe(carta) !== paloDe(muestra)) return null;
  const rango = rangoDe(carta);
  if (esRangoPieza(rango)) return rango;
  const rangoMuestra = rangoDe(muestra);
  return rango === 12 && esRangoPieza(rangoMuestra) ? rangoMuestra : null;
}
