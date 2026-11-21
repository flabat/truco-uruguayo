import type { Cobro } from "./cantos-online.ts";

export interface ResumenTantos {
  totales: readonly [number, number];
  cobros: readonly Cobro[];
}

/** Copia pública de los cobros, limitada al aumento real del tanteador. */
export function resumirTantos(cobros: readonly Cobro[], inicio: readonly [number, number] = [0, 0], meta = Infinity): ResumenTantos {
  const puntos: [number, number] = [...inicio];
  const acreditados = cobros.map(c => {
    const tantos = Math.max(0, Math.min(c.tantos, meta - puntos[c.equipo]));
    puntos[c.equipo] += tantos;
    return { ...c, tantos, ...(tantos !== c.tantos && { valor: c.valor ?? c.tantos }) };
  });
  return { totales: [puntos[0] - inicio[0], puntos[1] - inicio[1]], cobros: acreditados };
}
