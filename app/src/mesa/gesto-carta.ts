import type { Carta, Punto, Rect } from "@eltruco/mesa-geometria";

/** Hasta esta distancia, en puntos, el dedo que se soltó cuenta como un toque quieto. */
const toqueQuieto = 10;

function dentro(p: Punto, r: Rect): boolean {
  "worklet";
  return p.x >= r.x && p.x <= r.x + r.ancho && p.y >= r.y && p.y <= r.y + r.alto;
}

/**
 * Qué pasa al soltar una carta de la mano. `carta` es su lugar sin el arrastre, `inicio` y `fin`
 * son los puntos donde el dedo apoyó y se levantó, y `pano` es el paño vigente al soltar.
 */
export function soltarCarta(g: { inicio: Punto; fin: Punto; carta: Carta; pano: Rect; habilitada: boolean }): "jugar" | "volver" {
  "worklet";
  if (!g.habilitada) return "volver";
  const { carta } = g;
  const dx = g.fin.x - g.inicio.x;
  const dy = g.fin.y - g.inicio.y;
  // La caja de la carta rotada, como `cajaDeCarta`, calculada acá porque esto corre en el hilo de la interfaz.
  const rad = (carta.rotacion * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sen = Math.abs(Math.sin(rad));
  const ancho = carta.ancho * cos + carta.alto * sen;
  const alto = carta.ancho * sen + carta.alto * cos;
  const cx = carta.x + carta.ancho / 2;
  const cy = carta.y + carta.alto / 2;
  const caja = { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto };
  if (Math.hypot(dx, dy) < toqueQuieto && dentro(g.fin, caja)) return "jugar";
  return dentro({ x: cx + dx, y: cy + dy }, g.pano) ? "jugar" : "volver";
}
