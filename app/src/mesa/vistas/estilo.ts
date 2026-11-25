import type { Rect } from "@eltruco/mesa-geometria";

// Los tonos de las maquetas de docs/superpowers/specs/mesa-nueva que no están en el tema.
export const mesaColores = {
  crema: "#fff8e7",
  sombra: "rgba(0, 0, 0, 0.28)",
  tira: "rgba(0, 0, 0, 0.35)",
  brillo: "#ffe884",
  hoja: "#faf8f0",
  asa: "#c9c6b6",
  bordeBoton: "#d9d8c9",
  bordeMazo: "#e3c3b8",
  separador: "#e6e4d6",
  gris: "#636a5e",
} as const;

/** Un rectángulo de la geometría como estilo absoluto. */
export const enRect = (r: Rect) => ({ position: "absolute" as const, left: r.x, top: r.y, width: r.ancho, height: r.alto });
