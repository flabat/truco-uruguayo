/** Duraciones de la tabla «Movimiento, hápticos y sonido» del diseño, en milisegundos. */
export interface Movimiento {
  /** Sin reparto animado, las cartas aparecen en su lugar. */
  reparto: { entreCartas: number } | null;
  vuelo: { duracion: number; rebote: boolean };
  /** Con 0, el brillo de la ganadora y la sombra de las demás quedan fijos. */
  ganadora: { duracion: number };
  globo: { duracion: number };
  contador: { duracion: number };
}

const normal: Movimiento = {
  reparto: { entreCartas: 80 },
  vuelo: { duracion: 320, rebote: true },
  ganadora: { duracion: 600 },
  globo: { duracion: 220 },
  contador: { duracion: 500 },
};

const liviano: Movimiento = {
  reparto: null,
  vuelo: { duracion: 0, rebote: false },
  ganadora: { duracion: 0 },
  globo: { duracion: 220 },
  contador: { duracion: 0 },
};

export function movimiento(esLiviano: boolean): Movimiento {
  return esLiviano ? liviano : normal;
}

// Las curvas de movimiento.html, como puntos de control de `cubic-bezier`.
/** Las cartas que vuelan al paño o a la mano. */
export const curvaDeVuelo = [0.2, 0.8, 0.2, 1] as const;
/** El globo que salta: se pasa un poco y vuelve. */
export const curvaDeGlobo = [0.2, 0.8, 0.2, 1.4] as const;
/** El rebote de la carta propia al apoyarse (`cubic-bezier(.2, .8, .2, 1.15)` del prototipo). */
export const rebote = { dampingRatio: 0.72 } as const;

/** La escala a la que salta el número del tanteador al cobrar. */
export const saltoDelTanteador = 1.5;
/** El color del brillo de la carta ganadora. */
export const dorado = "#ffe884";

/**
 * A quién va cada carta del reparto: empieza por el asiento siguiente al dador (los asientos crecen
 * en sentido antihorario, así que es la mano) y da tres vueltas a la mesa.
 */
export function ordenDeReparto(dador: number, asientos: number): number[] {
  return Array.from({ length: 3 * asientos }, (_, i) => (dador + 1 + i) % asientos);
}

export interface VueloDeReparto {
  asiento: number;
  /** Qué carta de ese asiento: 0, 1 o 2. */
  ronda: number;
  /** Cuándo sale del mazo, en ms desde el reparto. */
  sale: number;
  /** Cuándo empieza a darse vuelta; null en las ajenas, que quedan de dorso. */
  gira: number | null;
}

export interface PlanDeReparto {
  vuelos: VueloDeReparto[];
  /** Lo que tarda cada carta en llegar y en darse vuelta. */
  duracion: number;
  /** Cuándo termina todo. */
  fin: number;
}

/**
 * El reparto en el orden real. `cartas[asiento]` dice cuántas tiene ahora cada asiento: si alguna
 * ya se jugó, su vuelo no está y las demás no esperan por ella. Cuando llega la última, las propias
 * se dan vuelta de a una.
 */
export function planDeReparto(dador: number, cartas: readonly number[], propio: number | null,
    t: { entreCartas: number; vuelo: number }): PlanDeReparto {
  const vuelos: VueloDeReparto[] = [];
  ordenDeReparto(dador, cartas.length).forEach((asiento, i) => {
    const ronda = Math.floor(i / cartas.length);
    if (ronda < cartas[asiento]!) vuelos.push({ asiento, ronda, sale: vuelos.length * t.entreCartas, gira: null });
  });
  if (vuelos.length === 0) return { vuelos, duracion: t.vuelo, fin: 0 };
  const llegaLaUltima = vuelos.at(-1)!.sale + t.vuelo;
  let fin = llegaLaUltima;
  for (const v of vuelos) {
    if (v.asiento !== propio) continue;
    v.gira = llegaLaUltima + v.ronda * t.entreCartas;
    fin = Math.max(fin, v.gira + t.vuelo);
  }
  return { vuelos, duracion: t.vuelo, fin };
}

/** Lo que dura un reparto completo de tres cartas por asiento, con las propias dándose vuelta. 0 en liviano. */
export function duracionDelReparto(esLiviano: boolean, asientos: number): number {
  const { reparto, vuelo } = movimiento(esLiviano);
  if (!reparto || asientos === 0) return 0;
  return planDeReparto(0, Array<number>(asientos).fill(3), 0, { entreCartas: reparto.entreCartas, vuelo: vuelo.duracion }).fin;
}
