import type { Carta, Rect } from "@eltruco/mesa-geometria";

/** Duraciones de la tabla «Movimiento, hápticos y sonido» del diseño, en milisegundos. */
export interface Movimiento {
  /** Sin reparto animado, las cartas aparecen en su lugar. */
  reparto: { entreCartas: number } | null;
  vuelo: { duracion: number; rebote: boolean };
  /** Con 0, el brillo de la ganadora y la sombra de las demás quedan fijos. */
  ganadora: { duracion: number };
  globo: { duracion: number };
  contador: { duracion: number };
  /**
   * Al ganar el chico: las cartas tardan `juntar` en ir al centro, el cartel tarda `cartel` en
   * aparecer y las partículas duran `duracion`. Null en liviano: las cartas quedan en su lugar, el
   * cartel aparece de una y no hay partículas.
   */
  festejo: { juntar: number; cartel: number; particulas: number; duracion: number } | null;
}

const normal: Movimiento = {
  reparto: { entreCartas: 80 },
  vuelo: { duracion: 320, rebote: true },
  ganadora: { duracion: 600 },
  globo: { duracion: 220 },
  contador: { duracion: 500 },
  festejo: { juntar: 450, cartel: 250, particulas: 24, duracion: 1500 },
};

const liviano: Movimiento = {
  reparto: null,
  vuelo: { duracion: 0, rebote: false },
  ganadora: { duracion: 0 },
  globo: { duracion: 220 },
  contador: { duracion: 0 },
  festejo: null,
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

/** Las partículas del festejo del chico son pocas (rendimiento del diseño). */
export const maximoDeParticulas = 24;

const coloresDeParticula = [dorado, "#fff8e7", "#a34b34", "#7fc8a9"] as const;

/** Una partícula del festejo: sale de `x`, `y` con velocidad `vx`, `vy` (px/ms) y cae con `gravedad` (px/ms²). */
export interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravedad: number;
  /** Grados por ms. */
  giro: number;
  lado: number;
  color: string;
}

/**
 * Las partículas del festejo para un cartel de `ancho` × `alto`: estallan desde arriba del centro,
 * suben un poco y caen sin salir por arriba. Siempre las mismas para el mismo tamaño.
 */
export function particulasDelFestejo(ancho: number, alto: number, cantidad = maximoDeParticulas,
    duracion = 1500): Particula[] {
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return (semilla - 1) / 2147483646;
  };
  const gravedad = (alto * 1.6) / (duracion * duracion);
  return Array.from({ length: Math.min(cantidad, maximoDeParticulas) }, (_, i) => {
    const lado = i % 2 === 0 ? 1 : -1;
    return {
      x: ancho / 2 + lado * azar() * ancho * 0.08,
      y: alto * 0.3,
      vx: (lado * ancho * (0.1 + 0.35 * azar())) / duracion,
      vy: (-alto * (0.3 + 0.35 * azar())) / duracion,
      gravedad,
      giro: (lado * (0.2 + 0.4 * azar())),
      lado: 5 + 4 * azar(),
      color: coloresDeParticula[i % coloresDeParticula.length]!,
    };
  });
}

/** Dónde está una partícula `t` ms después de salir. Se apaga del todo a los `duracion` ms. */
export function posicionDeParticula(p: Particula, t: number, duracion: number) {
  "worklet";
  const u = Math.min(Math.max(t, 0), duracion);
  const avance = u / duracion;
  return {
    x: p.x + p.vx * u,
    y: p.y + p.vy * u + (p.gravedad * u * u) / 2,
    rotacion: p.giro * u,
    opacidad: t < 0 || t >= duracion ? 0 : 1 - avance * avance * avance,
  };
}

/**
 * Las cartas del paño juntas en una pila al centro de `pano`, cada una con su tamaño, un poco
 * corridas y giradas para que se vea que son varias.
 */
export function alCentroDelPano(cartas: readonly Carta[], pano: Rect): Carta[] {
  const cx = pano.x + pano.ancho / 2;
  const cy = pano.y + pano.alto / 2;
  const medio = (cartas.length - 1) / 2;
  return cartas.map((c, i) => {
    const corrida = (i - medio) * c.ancho * 0.12;
    return { x: cx + corrida - c.ancho / 2, y: cy - c.alto / 2, ancho: c.ancho, alto: c.alto, rotacion: (i - medio) * 6 };
  });
}
