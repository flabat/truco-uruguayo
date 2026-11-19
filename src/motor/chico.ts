export const metaPorModalidad = { "1v1": 40, "2v2": 40, "3v3": 50 } as const;

// Mayor meta par que cabe en la columna integer del tanteador.
export const metaMaxima = 2_147_483_646;

export function mitadesDelChico(meta: number) {
  const mitad = meta / 2;
  return mitad === 1 ? "1 mala y 1 buena" : `${mitad} malas y ${mitad} buenas`;
}

export function cuentaDelChico(total: number, meta: number) {
  const mitad = meta / 2;
  if (total < mitad) return total + (total === 1 ? " mala" : " malas");
  const buenas = total - mitad;
  return buenas + (buenas === 1 ? " buena" : " buenas");
}

export function esMetaDeChico(meta: unknown): meta is number {
  return typeof meta === "number" && Number.isInteger(meta) && meta >= 2 && meta <= metaMaxima && meta % 2 === 0;
}
