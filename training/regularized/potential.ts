import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { playChico, rng, seatsOf, type Mode, type Potential } from "./env.ts";
import { makeAgent } from "./agents.ts";

/**
 * Φ(propios, ajenos) = 2·P(ganar) − 1 al empezar una mano, estimado con autojuego del bot de referencia y suavizado.
 * Cualquier potencial preserva la política óptima; uno más preciso reduce más la varianza.
 */
export interface PotentialTable { target: number; reference: string; chicos: number; table: number[][] }

export const potentialPath = (format: string) =>
  new URL(`../../runs/regularized/potential-${format}.json`, import.meta.url).pathname;

export function estimate(mode: Mode, reference: string, chicos: number, target: number): PotentialTable {
  const n = seatsOf(mode);
  const agent = makeAgent(reference, mode);
  const wins = Array.from({ length: target }, () => new Float64Array(target));
  const count = Array.from({ length: target }, () => new Float64Array(target));
  const random = rng(99);
  for (let c = 0; c < chicos; c++) {
    const result = playChico(mode, Array(n).fill(agent), random, target);
    for (const [a, b] of result.starts) {
      count[a][b]++; wins[a][b] += result.winner === 0 ? 1 : 0;
      count[b][a]++; wins[b][a] += result.winner === 1 ? 1 : 0;
    }
  }
  const table = Array.from({ length: target }, (_, a) => Array.from({ length: target }, (_, b) => {
    // Núcleo gaussiano sobre vecinos, más un previo logístico por los tantos que faltan.
    let w = 0, s = 0;
    for (let da = -3; da <= 3; da++) for (let db = -3; db <= 3; db++) {
      const x = a + da, y = b + db;
      if (x < 0 || y < 0 || x >= target || y >= target || !count[x][y]) continue;
      const k = Math.exp(-(da * da + db * db) / 4) * count[x][y];
      w += k; s += k * wins[x][y] / count[x][y];
    }
    const prior = 1 / (1 + Math.exp(-((target - b) - (target - a)) / (target / 6)));
    const p = (s + 20 * prior) / (w + 20);
    return Number((2 * p - 1).toFixed(4));
  }));
  return { target, reference, chicos, table };
}

export function loadPotential(format: string): Potential | undefined {
  const path = potentialPath(format);
  if (!existsSync(path)) return undefined;
  const { table, target } = JSON.parse(readFileSync(path, "utf8")) as PotentialTable;
  return (own, foe) => table[Math.min(target - 1, own)][Math.min(target - 1, foe)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [format, chicosArg] = process.argv.slice(2);
  const mode: Mode = format === "duel" ? "duel-prod" : format as Mode;
  const reference = format === "duel" ? "v1" : "pie-clasico-v1";
  const target = format === "tercetos" ? 50 : 40;
  const t0 = Date.now();
  const result = estimate(mode, reference, Number(chicosArg ?? 20000), target);
  writeFileSync(potentialPath(format), JSON.stringify(result));
  const t = result.table;
  console.log(format, "segundos", (Date.now() - t0) / 1000, "Φ(0,0)", t[0][0], "Φ(20,10)", t[20][10], "Φ(35,30)", t[35][30],
    "Φ(10,35)", t[10][35]);
}
