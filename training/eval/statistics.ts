import { crearAzar } from "@eltruco/motor/reparto.ts";

export interface PairOutcome {
  pair: number;
  // Two seat-swapped legs, 1 for a win by the policy being evaluated.
  candidate: [number, number];
  incumbent: [number, number];
}
export interface FamilyResult { id: string; pairs: PairOutcome[] }

const mean = (xs: readonly number[]) => xs.reduce((a,b) => a + b, 0) / xs.length;

/** Resample whole deal sequences jointly across opponents, preserving seats and arms. */
export function summarize(families: FamilyResult[], direct: string, resamples = 10000, familyError = 0.05) {
  if (!Number.isFinite(familyError) || familyError<=0 || familyError>=1) throw new Error("Probabilidad de error inválida.");
  if (!families.length || !families.some(f => f.id === direct) || new Set(families.map(f => f.id)).size !== families.length)
    throw new Error("El campo requiere familias únicas y un enfrentamiento directo.");
  const n = families[0].pairs.length;
  if (n < 2 || !Number.isInteger(resamples) || resamples < 1000) throw new Error("Muestra o réplicas insuficientes.");
  const arms = families.map(({id, pairs}) => {
    if (pairs.length !== n || pairs.some((p,i) => p.pair !== i || [p.candidate,p.incumbent].some(
      legs => legs.length !== 2 || legs.some(x => x !== 0 && x !== 1)))) throw new Error("Secuencia pareada inválida.");
    return {id, wins:pairs.map(p => mean(p.candidate)), delta:pairs.map(p => mean(p.candidate) - mean(p.incumbent))};
  });
  const headline = Array.from({length:n}, (_,i) => mean(arms.map(a => a.wins[i])));
  const quantities = [headline, arms.find(a => a.id === direct)!.wins, ...arms.map(a => a.delta)];
  const random = crearAzar(18112026);
  const samples = quantities.map(() => [] as number[]);
  // Pair outcomes take five values. Resampling counts once per draw keeps all comparisons paired.
  for (let b = 0; b < resamples; b++) {
    const sums = quantities.map(() => 0);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(random() * n);
      for (const [j, q] of quantities.entries()) sums[j] += q[i];
    }
    sums.forEach((s,j) => samples[j].push(s/n));
  }
  const alpha = familyError / (arms.length + 1);
  const intervals = samples.map((sample, i) => {
    sample.sort((a,b) => a-b);
    const tail = (i === 0 ? familyError : alpha)/2;
    return {estimate:mean(quantities[i]), lower:sample[Math.floor(tail * resamples)],
      upper:sample[Math.ceil((1 - tail) * resamples) - 1]};
  });
  return {pairs:n, resamples, simultaneous:"Bonferroni (direct win rate + each family change)",
    headline:intervals[0], direct:intervals[1],
    families:arms.map((a,i) => ({id:a.id, winRate:mean(a.wins), delta:intervals[i+2]}))};
}
