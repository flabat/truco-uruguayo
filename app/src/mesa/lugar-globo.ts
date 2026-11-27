import type { Geometria, GeometriaAsiento, Rect } from "@eltruco/mesa-geometria";

export const separacion = 6;
export const punta = 7;

export type Punta = "arriba" | "abajo" | "izquierda" | "derecha";

/** Dónde se dibuja un globo. Sin punta cuando quedó lejos del asiento y no tiene a quién señalar. */
export type Lugar = { left: number; top: number; punta: Punta | null; puntaEn: number };

export interface Limites {
  columna: Rect;
  arriba: number;
  estado: Rect;
  /** Lo que el globo no debe tapar: el mazo, la muestra y su rótulo. */
  evitar?: readonly Rect[];
  /** Lo que conviene no tapar si hay lugar: los otros asientos. Pesa menos que `evitar`. */
  respetar?: readonly Rect[];
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

const seCortan = (a: Rect, b: Rect) =>
  a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

const areaComun = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y));

/** La caja de un asiento: rótulo, carta jugada y dorsos. */
export function cajaDeAsiento(a: GeometriaAsiento): Rect {
  const partes = [a.rotulo, a.jugada, ...a.dorsos].filter((r): r is Rect => r != null);
  if (partes.length === 0) return { x: a.ancla.x, y: a.ancla.y, ancho: 0, alto: 0 };
  const x = Math.min(...partes.map(p => p.x));
  const y = Math.min(...partes.map(p => p.y));
  return {
    x, y,
    ancho: Math.max(...partes.map(p => p.x + p.ancho)) - x,
    alto: Math.max(...partes.map(p => p.y + p.alto)) - y,
  };
}

/** El rótulo de la muestra entra en una línea: se ensancha alrededor del mazo, dentro de la columna. */
export function rotuloDeMuestra({ mazo, columna }: Geometria): Rect {
  const ancho = Math.max(mazo.rotulo.ancho, 136);
  const centro = mazo.rotulo.x + mazo.rotulo.ancho / 2;
  const x = Math.max(columna.x + 2, Math.min(centro - ancho / 2, columna.x + columna.ancho - ancho - 2));
  return { ...mazo.rotulo, x, ancho };
}

/** La caja que se ve del mazo cruzado, la muestra y su rótulo (el mazo está girado 90°). */
export function cajasDelMazo(geometria: Geometria): Rect[] {
  const m = geometria.mazo.mazo;
  const girado = Math.abs(m.rotacion % 180) === 90;
  const cx = m.x + m.ancho / 2;
  const cy = m.y + m.alto / 2;
  const [ancho, alto] = girado ? [m.alto, m.ancho] : [m.ancho, m.alto];
  return [geometria.mazo.muestra, { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto }, rotuloDeMuestra(geometria)];
}

/** Los límites de los globos de la mesa. Con `emisor`, los demás asientos también cuentan como obstáculos. */
export function limitesDeGlobo(geometria: Geometria, emisor?: number): Limites {
  return {
    columna: geometria.columna,
    arriba: geometria.barra.y + geometria.barra.alto,
    estado: geometria.estado,
    evitar: cajasDelMazo(geometria),
    respetar: emisor == null ? [] : geometria.asientos
      .filter(a => a && a.asiento !== emisor && a.lugar !== "abajo")
      .map(cajaDeAsiento),
  };
}

/**
 * Dónde va un globo de `ancho` × `alto` para el asiento `a`. «costado» (cantos) se abre hacia el
 * centro del paño; «debajo» (señas del pie) cuelga del asiento. Si el preferido tapa el mazo o la
 * muestra, prueba los otros y, después, debajo del mazo. Si ninguno queda libre, elige el que menos
 * tapa la muestra. El de abajo, el propio, siempre va encima del estado.
 */
export function lugarDelGlobo(
  a: GeometriaAsiento, posicion: "costado" | "debajo", tamano: { ancho: number; alto: number }, limites: Limites,
): Lugar {
  const { columna, arriba, estado, evitar = [], respetar = [] } = limites;
  const caja = cajaDeAsiento(a);
  const minX = columna.x + 4;
  const maxX = columna.x + columna.ancho - tamano.ancho - 4;
  const centrado = (x: number) => limitar(x - tamano.ancho / 2, minX, maxX);
  if (a.lugar === "abajo") {
    const left = centrado(a.ancla.x);
    return { left, top: estado.y - tamano.alto - separacion, punta: "abajo", puntaEn: a.ancla.x - left };
  }
  const leftDebajo = centrado(a.ancla.x);
  const debajo: Lugar = { left: leftDebajo, top: caja.y + caja.alto + separacion, punta: "arriba", puntaEn: a.ancla.x - leftDebajo };
  const top = limitar(caja.y + (a.rotulo?.alto ?? 0) / 2 - punta - 6, arriba, estado.y - tamano.alto);
  const derecha: Lugar = { left: caja.x + caja.ancho + separacion, top, punta: "izquierda", puntaEn: 14 };
  const izquierda: Lugar = { left: caja.x - separacion - tamano.ancho, top, punta: "derecha", puntaEn: 14 };
  const haciaLaDerecha = a.lugar.includes("izquierda") || (!a.lugar.includes("derecha") && derecha.left <= maxX);
  const costados = haciaLaDerecha ? [derecha, izquierda] : [izquierda, derecha];
  // Debajo del asiento pero corrido para dejar ver el mazo, o directamente debajo del mazo.
  const corridos: Lugar[] = evitar.length === 0 ? [] : (() => {
    const mazo = { x: Math.min(...evitar.map(r => r.x)), y: Math.min(...evitar.map(r => r.y)) };
    const finMazo = { x: Math.max(...evitar.map(r => r.x + r.ancho)), y: Math.max(...evitar.map(r => r.y + r.alto)) };
    const alCostado = [mazo.x - separacion - tamano.ancho, finMazo.x + separacion]
      .map(left => ({ left, top: debajo.top, punta: "arriba" as const, puntaEn: a.ancla.x - left }));
    return [...alCostado, { left: leftDebajo, top: finMazo.y + separacion, punta: null, puntaEn: 0 }];
  })();
  const candidatos = posicion === "debajo" ? [debajo, ...costados, ...corridos] : [...costados, debajo, ...corridos];
  const entra = (l: Lugar) => l.left >= minX - 4 && l.left <= maxX + 4 && l.top >= arriba && l.top + tamano.alto <= estado.y;
  const cajaDe = (l: Lugar) => ({ x: l.left, y: l.top, ...tamano });
  const tapa = (l: Lugar, rs: readonly Rect[]) => rs.reduce((s, r) => s + areaComun(r, cajaDe(l)), 0);
  const libre = (l: Lugar) => !evitar.some(r => seCortan(r, cajaDe(l))) && !respetar.some(r => seCortan(r, cajaDe(l)));
  const libreDelMazo = (l: Lugar) => !evitar.some(r => seCortan(r, cajaDe(l)));
  const posibles = candidatos.filter(entra);
  const elegido = posibles.find(libre) ?? posibles.find(libreDelMazo)
    ?? [...posibles].sort((x, y) => tapa(x, evitar) - tapa(y, evitar))[0] ?? debajo;
  // Una punta que no toca el asiento señalaría al vacío.
  if (elegido.punta === "arriba" && (elegido.puntaEn < 10 || elegido.puntaEn > tamano.ancho - 10)) return { ...elegido, punta: null };
  return elegido;
}
