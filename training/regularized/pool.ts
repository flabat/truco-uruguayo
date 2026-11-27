import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { Worker } from "node:worker_threads";
import type { Mode } from "./env.ts";
import type { CollectJob, EvalJob, Lineup, PairResult, WeightsMessage } from "./worker.ts";

export interface Collected { rows: number; chicos: number; games: number[]; wins: number[]; data: Float32Array }

export class Pool {
  private workers: Worker[];
  private next = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  readonly size: number;
  constructor(size: number) {
    this.size = size;
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL("./worker.ts", import.meta.url));
      w.on("message", msg => {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg);
      });
      w.on("error", e => { for (const p of this.pending.values()) p.reject(e); this.pending.clear(); });
      return w;
    });
  }
  private run<T>(worker: number, job: Omit<CollectJob, "id"> | Omit<EvalJob, "id">): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.workers[worker].postMessage({ ...job, id });
    });
  }
  async collect(weights: WeightsMessage, mix: Lineup[], modes: Mode[], modeWeights: number[], rows: number, seed: number,
      target = 40): Promise<Collected> {
    const parts = await Promise.all(this.workers.map((_, i) => this.run<Collected>(i, {
      type: "collect", weights, mix, modes, modeWeights, rows: Math.ceil(rows / this.size), seed: (seed * 1009 + i * 7919) >>> 0, target,
    })));
    const total = parts.reduce((a, p) => a + p.data.length, 0);
    const data = new Float32Array(total);
    let o = 0;
    for (const p of parts) { data.set(p.data, o); o += p.data.length; }
    const sum = (k: "games" | "wins") => mix.map((_, j) => parts.reduce((a, p) => a + p[k][j], 0));
    return { rows: parts.reduce((a, p) => a + p.rows, 0), chicos: parts.reduce((a, p) => a + p.chicos, 0),
      games: sum("games"), wins: sum("wins"), data };
  }
  async evaluate(lineup: Lineup, mode: Mode, pairs: number, seed: number, weights?: WeightsMessage, offset = 0,
      target = mode === "tercetos" ? 50 : 40): Promise<PairResult[]> {
    const chunks: number[][] = Array.from({ length: this.size }, () => []);
    for (let p = 0; p < pairs; p++) chunks[p % this.size].push(offset + p);
    const parts = await Promise.all(chunks.map((c, i) => c.length
      ? this.run<{ results: PairResult[] }>(i, { type: "eval", lineup, mode, pairs: c, seed, weights, target })
      : Promise.resolve({ results: [] })));
    return parts.flatMap(p => p.results).sort((a, b) => a.pair - b.pair);
  }
  async close() { await Promise.all(this.workers.map(w => w.terminate())); }
}

export class Python {
  private proc: ChildProcessWithoutNullStreams;
  private lines: AsyncIterableIterator<string>;
  private queue = Promise.resolve();
  constructor(python: string, script: string, log?: (s: string) => void) {
    this.proc = spawn(python, ["-u", script], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr.on("data", d => log?.(String(d)));
    this.lines = createInterface({ input: this.proc.stdout })[Symbol.asyncIterator]();
  }
  send<T = any>(request: Record<string, unknown>): Promise<T> {
    const result = this.queue.then(async () => {
      this.proc.stdin.write(JSON.stringify(request) + "\n");
      const { value, done } = await this.lines.next();
      if (done) throw new Error("El aprendiz de Python terminó.");
      const parsed = JSON.parse(value);
      if (!parsed.ok) throw new Error("Python: " + parsed.error);
      return parsed as T;
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
  close() { this.proc.stdin.end(); }
}

/** Intervalo bootstrap del 95 % de la tasa de victoria por pares, con remuestreo de pares completos. */
export function winRate(results: readonly PairResult[], draws = 2000, seed = 1) {
  const games = results.length * 2;
  const wins = results.reduce((a, r) => a + r.wins[0] + r.wins[1], 0);
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const samples: number[] = [];
  for (let d = 0; d < draws; d++) {
    let w = 0;
    for (let i = 0; i < results.length; i++) { const r = results[Math.floor(next() * results.length)]; w += r.wins[0] + r.wins[1]; }
    samples.push(w / games);
  }
  samples.sort((a, b) => a - b);
  return { wins, games, rate: wins / games, lower: samples[Math.floor(0.025 * draws)], upper: samples[Math.floor(0.975 * draws)] };
}
