import type { CardId } from "@eltruco/motor/cartas.ts";

export type Metodo = "exacto" | "estimado";
export interface Fila {
  carta: CardId;
  victorias: number;
  frecuencia: number;
}
export interface Par {
  a: CardId;
  b: CardId;
  soloA: number;
  soloB: number;
  diferencia: number;
  intervalo95: [number, number];
}

interface Discordantes {
  i: number;
  j: number;
  soloA: number;
  soloB: number;
}
export interface Conteo {
  cartas: readonly CardId[];
  mundos: number;
  victorias: number[];
  pares: Discordantes[];
}

export function crearConteo(cartas: readonly CardId[]): Conteo {
  const pares: Discordantes[] = [];
  for (let i = 0; i < cartas.length; i++) {
    for (let j = i + 1; j < cartas.length; j++) {
      pares.push({ i, j, soloA: 0, soloB: 0 });
    }
  }
  return { cartas: [...cartas], mundos: 0, victorias: cartas.map(() => 0), pares };
}

export function anotarMundo(conteo: Conteo, ganan: readonly boolean[]): void {
  if (ganan.length !== conteo.cartas.length) throw new RangeError("Falta evaluar una alternativa.");
  conteo.mundos++;
  for (const [i, gana] of ganan.entries()) if (gana) conteo.victorias[i]++;
  for (const par of conteo.pares) {
    if (ganan[par.i] && !ganan[par.j]) par.soloA++;
    if (ganan[par.j] && !ganan[par.i]) par.soloB++;
  }
}

/** Sumar estadísticas suficientes de lotes de una misma posición y perfil. */
export function sumarLote(total: Conteo, lote: Conteo): void {
  if (total.cartas.length !== lote.cartas.length || total.cartas.some((c, i) => lote.cartas[i] !== c)) {
    throw new RangeError("Los lotes tienen alternativas distintas.");
  }
  total.mundos += lote.mundos;
  for (const [i, victorias] of lote.victorias.entries()) total.victorias[i] += victorias;
  for (const [i, par] of lote.pares.entries()) {
    total.pares[i].soloA += par.soloA;
    total.pares[i].soloB += par.soloB;
  }
}

/** Hoeffding bilateral para D en [−1, 1]; Bonferroni cubre la familia completa. */
export function intervaloPareado(diferencia: number, mundos: number, cantidadPares: number): [number, number] {
  const margen = Math.sqrt(2 * Math.log(2 * cantidadPares / 0.05) / mundos);
  return [Math.max(-1, diferencia - margen), Math.min(1, diferencia + margen)];
}

export function resumir(conteo: Conteo, metodo: Metodo): { filas: Fila[]; pares: Par[] } {
  if (!conteo.mundos) throw new RangeError("Se necesita al menos un mundo compatible.");
  const { cartas, mundos, victorias } = conteo;
  const filas = cartas.map((carta, i) => ({ carta, victorias: victorias[i], frecuencia: victorias[i] / mundos }));
  const pares = conteo.pares.map(({ i, j, soloA, soloB }): Par => {
    const diferencia = (soloA - soloB) / mundos;
    return { a: cartas[i], b: cartas[j], soloA, soloB, diferencia,
      intervalo95: metodo === "exacto" ? [diferencia, diferencia] : intervaloPareado(diferencia, mundos, conteo.pares.length) };
  });
  return { filas, pares };
}
