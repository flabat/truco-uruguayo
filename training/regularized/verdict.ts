import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Veredictos de la puerta sobre el informe de `evaluate.ts`.
 *
 * - Estricta (la del campeonato): cruce directo con cota inferior sobre 50 % y, contra cada familia, cota inferior de la
 *   diferencia con el campeón por encima de −2 puntos.
 * - Relajada: el mismo cruce directo; contra cada familia, diferencia media de al menos −2 puntos y cota inferior de al
 *   menos −5. Los explotadores entrenados contra el candidato (familias `explotador…`) se informan pero no deciden, porque
 *   miden un rival que se le adapta y el campeón no enfrenta uno igual.
 */
export interface GateReport {
  direct: { rate: number; lower: number };
  families: Record<string, { delta: number; lower: number }>;
}
export const isStress = (name: string) => name.startsWith("explotador");

export function judge(report: GateReport) {
  const fams = Object.entries(report.families);
  const directOk = report.direct.lower > 0.5;
  const strictFail = fams.filter(([, f]) => !(f.lower > -0.02)).map(([n]) => n);
  const relaxedFail = fams.filter(([n, f]) => !isStress(n) && !(f.delta >= -0.02 && f.lower >= -0.05)).map(([n]) => n);
  const stress = fams.filter(([n]) => isStress(n));
  return {
    strict: directOk && strictFail.length === 0,
    relaxed: directOk && relaxedFail.length === 0,
    directOk, strictFail, relaxedFail,
    worstStress: stress.length ? Math.min(...stress.map(([, f]) => f.delta)) : null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    const v = judge(JSON.parse(readFileSync(file, "utf8")) as GateReport);
    const pct = (x: number) => (x * 100).toFixed(1);
    console.log(`${file}: estricta ${v.strict ? "pasa" : "no pasa"}, relajada ${v.relaxed ? "pasa" : "no pasa"}` +
      (v.relaxedFail.length ? ` (falla ${v.relaxedFail.join(", ")})` : "") +
      (v.worstStress !== null ? `; peor explotador ${pct(v.worstStress)} puntos` : ""));
  }
}
