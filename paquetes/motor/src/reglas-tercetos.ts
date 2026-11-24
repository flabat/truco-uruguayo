// Perfil de la casa del ADR 1 del diseño de tercetos (#173).
export const versionReglasTercetos = 2;
export type TipoLance = "redondilla" | "pico-a-pico";
export type Puntos = readonly [number, number];

export function tipoDeReparto(numero: number, puntos: Puntos, meta: number): TipoLance {
  if (!Number.isSafeInteger(numero) || numero < 1) throw new RangeError("Número de reparto inválido.");
  return numero % 2 === 0 && puntos.every(p => p < meta / 2) ? "pico-a-pico" : "redondilla";
}

/** Cuenta del ganador al abrir el lance, incluso cuando se reviró una apuesta. */
export function faltaDelGanador(puntos: number, meta: number): number {
  return (puntos < meta / 2 ? meta / 2 : meta) - puntos;
}

/** Incluye las flores de ambos lados en un único cobro. */
export function restoQuerido(tipo: TipoLance, puntos: number, meta: number): number {
  return tipo === "pico-a-pico" ? 15 : meta - puntos;
}

export function tantosAcreditados(valor: number, puntos: number, meta: number): number {
  return Math.min(valor, meta - puntos);
}
