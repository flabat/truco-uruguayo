import type { Carta, Rect } from "./tipos.ts";

const tolerancia = 0.5;

/** La caja alineada a los ejes que ocupa una carta rotada. */
export function cajaDeCarta(c: Carta): Rect {
  if (c.rotacion % 360 === 0) return { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
  const rad = (c.rotacion * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sen = Math.abs(Math.sin(rad));
  const ancho = c.ancho * cos + c.alto * sen;
  const alto = c.ancho * sen + c.alto * cos;
  const cx = c.x + c.ancho / 2;
  const cy = c.y + c.alto / 2;
  return { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto };
}

/** Si comparten área. Tocarse en un borde no cuenta. */
export function seCortan(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x) > 1e-6
    && Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y) > 1e-6;
}

export function unir(rs: readonly Rect[]): Rect {
  if (rs.length === 0) throw new RangeError("No hay rectángulos para unir.");
  const x = Math.min(...rs.map(r => r.x));
  const y = Math.min(...rs.map(r => r.y));
  return {
    x, y,
    ancho: Math.max(...rs.map(r => r.x + r.ancho)) - x,
    alto: Math.max(...rs.map(r => r.y + r.alto)) - y,
  };
}

/** Si `adentro` queda dentro de `afuera`, con medio punto de tolerancia. */
export function contiene(afuera: Rect, adentro: Rect): boolean {
  return adentro.x >= afuera.x - tolerancia && adentro.y >= afuera.y - tolerancia
    && adentro.x + adentro.ancho <= afuera.x + afuera.ancho + tolerancia
    && adentro.y + adentro.alto <= afuera.y + afuera.alto + tolerancia;
}
