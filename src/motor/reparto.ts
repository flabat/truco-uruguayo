import { esCardId, mazo, type CardId } from "./cartas.ts";

export const versionReparto = 1;
export type Asiento = 0 | 1 | 2 | 3;
export const equipoPorAsiento = Object.freeze([0, 1, 0, 1] as const);
export type Equipo = (typeof equipoPorAsiento)[Asiento];
const derecha = [1, 2, 3, 0] as const;
const dosALa32 = 2 ** 32;

type TresCartas = readonly [CardId, CardId, CardId];

export interface RepartoV1 {
  readonly versionReparto: typeof versionReparto;
  readonly semilla: number;
  readonly dador: Asiento;
  readonly mano: Asiento;
  /** Una terna por asiento, con las cartas en el orden en que se recibieron. */
  readonly manos: readonly [TresCartas, TresCartas, TresCartas, TresCartas];
  readonly muestra: CardId;
}

export function esAsiento(valor: unknown): valor is Asiento {
  return valor === 0 || valor === 1 || valor === 2 || valor === 3;
}

export function esSemilla(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor < dosALa32;
}

/** Comprueba la forma y la legalidad de las cartas de un reparto recibido. */
export function esRepartoV1(valor: unknown): valor is RepartoV1 {
  if (typeof valor !== "object" || valor === null) return false;
  const { versionReparto: version, semilla, dador, mano, manos, muestra } =
    valor as Partial<Record<keyof RepartoV1, unknown>>;
  if (version !== versionReparto || !esSemilla(semilla) || !esAsiento(dador)) return false;
  if (mano !== derecha[dador] || !Array.isArray(manos) || manos.length !== 4) return false;

  const cartas: unknown[] = [muestra];
  for (const terna of manos) {
    if (!Array.isArray(terna) || terna.length !== 3) return false;
    cartas.push(...terna);
  }
  return cartas.every(esCardId) && new Set(cartas).size === 13;
}

/**
 * Secuencia V1 en [0, 1). Cada llamada avanza el estado local en 0x9e3779b9
 * módulo 2^32, aplica la mezcla final de MurmurHash3 (fmix32) y divide por 2^32.
 */
export function crearAzar(semilla: number): () => number {
  if (!esSemilla(semilla)) throw new RangeError("La semilla debe ser un entero entre 0 y 4294967295.");
  let estado = semilla;
  return () => {
    estado = (estado + 0x9e3779b9) >>> 0;
    let palabra = Math.imul(estado ^ (estado >>> 16), 0x85ebca6b);
    palabra = Math.imul(palabra ^ (palabra >>> 13), 0xc2b2ae35);
    return ((palabra ^ (palabra >>> 16)) >>> 0) / dosALa32;
  };
}

/**
 * V1 mezcla una copia del mazo canónico con Fisher–Yates de adelante hacia atrás.
 * En la posición i se elige i + piso(azar() × (40 − i)). El tope queda en 0.
 * Los asientos crecen en sentido antihorario. Recibe primero el de la derecha del dador.
 */
export function repartir(semilla: number, dador: number): RepartoV1 {
  if (!esAsiento(dador)) throw new RangeError("El dador debe ser un asiento entre 0 y 3.");
  const azar = crearAzar(semilla);
  const cartas = [...mazo];
  for (let i = 0; i < cartas.length - 1; i++) {
    const elegida = i + Math.floor(azar() * (cartas.length - i));
    [cartas[i], cartas[elegida]] = [cartas[elegida], cartas[i]];
  }

  const mano = derecha[dador];
  function cartasDelAsiento(asiento: Asiento): TresCartas {
    const primera = (asiento - mano + 4) % 4;
    return [cartas[primera], cartas[primera + 4], cartas[primera + 8]];
  }
  return {
    versionReparto,
    semilla,
    dador,
    mano,
    manos: [cartasDelAsiento(0), cartasDelAsiento(1), cartasDelAsiento(2), cartasDelAsiento(3)],
    muestra: cartas[12],
  };
}
