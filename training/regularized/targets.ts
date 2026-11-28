import { writeFileSync } from "node:fs";
import { Pool, winRate } from "./pool.ts";
import type { Mode } from "./env.ts";

/**
 * Marca de la puerta para la liga: tasa del campeón contra cada rival fijo, con muchos pares y la misma mezcla de reglas
 * que el entrenamiento. `node training/regularized/targets.ts <formato> <salida.json> <pares> <rival>...`
 */
const [format, out, pairsArg, ...specs] = process.argv.slice(2);
const pairs = Number(pairsArg);
const champion = format === "duel" ? "ceibo" : format === "pie" ? "pie-parejas-v2" : "pie-clasico-v1";
const solo = (s: string) => format === "duel" ? [s] : format === "pie" ? [s, s] : [s, s, s];
const modes: [Mode, number][] = format === "duel" ? [["duel-prod", 0.75], ["duel-arena", 0.25]] : [[format as Mode, 1]];
const pool = new Pool(Number(process.env.WORKERS ?? 2));
const result: Record<string, number> = {};
for (const spec of specs) {
  if (spec === champion) { result[spec] = 0.6; continue; }
  let rate = 0;
  for (const [mode, w] of modes) rate += w * winRate(await pool.evaluate({ a: solo(champion), b: solo(spec) }, mode, pairs, 9001)).rate;
  result[spec] = Number(rate.toFixed(4));
  console.log(spec.slice(-40), result[spec]);
}
writeFileSync(out, JSON.stringify(result, null, 2));
await pool.close();
