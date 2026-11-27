import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Pool } from "./pool.ts";
import type { Mode } from "./env.ts";
import type { PairResult } from "./worker.ts";

/**
 * Puerta espejo del campeonato, sobre los mismos repartos:
 * - cruce directo candidato contra campeón (límite inferior > 50 %);
 * - por familia, (candidato contra F) − (campeón contra F), límite inferior > −2 pp;
 * con intervalos bootstrap por pares completos y Bonferroni entre todas las comparaciones.
 *
 *   node training/regularized/evaluate.ts --format duel --candidate net:runs/regularized/duel-a/actor.json \
 *     --family independent=net:... --family counter=net:... --pairs 512 --out runs/regularized/gate-duel.json
 */
const { values: args } = parseArgs({ options: {
  format: { type: "string", default: "duel" }, candidate: { type: "string" }, champion: { type: "string" },
  pairs: { type: "string", default: "256" }, seed: { type: "string", default: "20261127" }, workers: { type: "string", default: "8" },
  mode: { type: "string" }, family: { type: "string", multiple: true, default: [] }, out: { type: "string" },
  "no-builtin": { type: "boolean", default: false },
} });

const format = args.format as "duel" | "pie" | "tercetos";
const mode = (args.mode ?? (format === "duel" ? "duel-prod" : format)) as Mode;
const champion = args.champion ?? (format === "duel" ? "ceibo" : format === "pie" ? "pie-parejas-v2" : "pie-clasico-v1");
const builtin = format === "duel"
  ? ["v1", "challenger", "caller", "folder", "frequent-bluff", "rare-bluff", "strong-cards"]
  : format === "tercetos" ? ["pie-caller", "pie-folder", "pie-frequent-bluff", "pie-rare-bluff", "pie-strong-cards"]
  : ["pie-clasico-v1", "pie-caller", "pie-folder", "pie-frequent-bluff", "pie-rare-bluff", "pie-strong-cards"];
const families: [string, string][] = [
  ...(args["no-builtin"] ? [] : builtin.map(b => [b, b] as [string, string])),
  ...args.family!.map(f => f.split("=") as [string, string]),
];
const team = (spec: string) => format === "duel" ? [spec] : format === "pie" ? [spec, spec] : [spec, spec, spec];
const pairs = Number(args.pairs), seed = Number(args.seed);

function bootstrap(stat: (idx: number[]) => number, n: number, alpha: number, draws = 4000) {
  let s = 12345;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const values: number[] = [];
  for (let d = 0; d < draws; d++) {
    const idx = Array.from({ length: n }, () => Math.floor(next() * n));
    values.push(stat(idx));
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor((alpha / 2) * draws)], values[Math.min(draws - 1, Math.floor((1 - alpha / 2) * draws))]];
}
const rate = (r: PairResult[], idx?: number[]) => {
  const use = idx ?? r.map((_, i) => i);
  return use.reduce((a, i) => a + r[i].wins[0] + r[i].wins[1], 0) / (2 * use.length);
};

async function main() {
  const pool = new Pool(Number(args.workers));
  const started = Date.now();
  const comparisons = 1 + families.length;
  const alpha = 0.05 / comparisons;
  const candidate = args.candidate!;
  const direct = await pool.evaluate({ a: team(candidate), b: team(champion) }, mode, pairs, seed);
  const directRate = rate(direct);
  const [lo, hi] = bootstrap(idx => rate(direct, idx), direct.length, alpha);
  const report: Record<string, unknown> = { format, mode, candidate, champion, pairs, seed, alpha,
    direct: { rate: directRate, lower: lo, upper: hi, pass: lo > 0.5 }, families: {} as Record<string, unknown> };
  console.log(`directo contra ${champion}: ${(directRate * 100).toFixed(1)} % [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]`);
  let worst = Infinity;
  for (const [name, spec] of families) {
    const c = await pool.evaluate({ a: team(candidate), b: team(spec) }, mode, pairs, seed + 1);
    const ch = await pool.evaluate({ a: team(champion), b: team(spec) }, mode, pairs, seed + 1);
    const delta = (idx?: number[]) => rate(c, idx) - rate(ch, idx);
    const [dlo, dhi] = bootstrap(idx => delta(idx), c.length, alpha);
    worst = Math.min(worst, dlo);
    (report.families as Record<string, unknown>)[name] = { spec, candidate: rate(c), champion: rate(ch), delta: delta(),
      lower: dlo, upper: dhi, pass: dlo > -0.02 };
    console.log(`${name.padEnd(20)} cand ${(rate(c) * 100).toFixed(1)} %  camp ${(rate(ch) * 100).toFixed(1)} %  Δ ${(delta() * 100).toFixed(1)} pp [${(dlo * 100).toFixed(1)}, ${(dhi * 100).toFixed(1)}]`);
  }
  report.worstFamilyLower = worst;
  report.pass = (report.direct as { pass: boolean }).pass && worst > -0.02;
  report.seconds = (Date.now() - started) / 1000;
  console.log("puerta:", report.pass ? "aprobada" : "fallida", `(${report.seconds} s)`);
  if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
  await pool.close();
}
main().catch(e => { console.error(e); process.exit(1); });
