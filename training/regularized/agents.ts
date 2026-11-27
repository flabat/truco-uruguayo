import { readFileSync } from "node:fs";
import { featureSize, privilegedSize, slotCount } from "./features.ts";
import { decodeNetwork, type Network, type RegularizedArtifact } from "./network.ts";
import { netAgent, teacherAgent, withPie, type Agent, type ChicoResult, type Mode } from "./env.ts";
import { ceiboAgent, duelBaseline, pieBaseline } from "./opponents.ts";

/** Fila de entrenamiento: rasgos, rasgos del crítico, máscara, objetivo de clonación y seis escalares. */
export const ROW = featureSize() + privilegedSize + slotCount * 2 + 6;
export const scalars = { slot: 0, logp: 1, reward: 2, done: 3, teacher: 4, opponent: 5 } as const;

export const ceiboPath = new URL("../../runs/regularized/champions/ceibo-duel.json", import.meta.url).pathname;

/** Red cruda: float32 en el orden de `shapes` (como la escribe learner.py). */
export function rawNetwork(shapes: [number, number][], data: Float32Array): Network {
  let o = 0;
  return { layers: shapes.map(([rows, cols]) => {
    const w = data.subarray(o, o + rows * cols); o += rows * cols;
    const b = data.subarray(o, o + rows); o += rows;
    return { rows, cols, w, b };
  }) };
}

const netCache = new Map<string, Network>();
export function loadNet(path: string): Network {
  let net = netCache.get(path);
  if (net) return net;
  if (path.endsWith(".json")) net = decodeNetwork(JSON.parse(readFileSync(path, "utf8")) as RegularizedArtifact);
  else {
    const meta = JSON.parse(readFileSync(path + ".json", "utf8")) as { shapes: [number, number][] };
    const bytes = readFileSync(path);
    net = rawNetwork(meta.shapes, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  }
  netCache.set(path, net);
  return net;
}

/**
 * Especificaciones de agente: `net:<ruta>` (red fija), `learner` (red actual, registra), `ceibo`, `v1`, `challenger`,
 * estilos de duelo, `pie-clasico-v1`, `pie-parejas-v2`, `pie-<estilo>`, y `teacher:<otra>` para clonación.
 */
const agentCache = new Map<string, Agent>();
export function makeAgent(spec: string, mode: Mode, current?: Network): Agent {
  if (spec === "learner" || spec === "current" || spec.startsWith("teacher:")) return buildAgent(spec, mode, current);
  const key = (withPie(mode) ? "pie|" : "duel|") + spec;
  let agent = agentCache.get(key);
  if (!agent) { agent = buildAgent(spec, mode, current); agentCache.set(key, agent); }
  return agent;
}
function buildAgent(spec: string, mode: Mode, current?: Network): Agent {
  if (spec.startsWith("teacher:")) return teacherAgent(makeAgent(spec.slice(8), mode, current));
  if (spec === "learner") { if (!current) throw new Error("Falta la red actual."); return netAgent("learner", current, true); }
  if (spec === "current") { if (!current) throw new Error("Falta la red actual."); return netAgent("current", current, false); }
  if (spec.startsWith("net:")) return netAgent(spec, loadNet(spec.slice(4)), false);
  if (withPie(mode)) return pieBaseline(spec);
  if (spec === "ceibo") return ceiboAgent(ceiboPath);
  return duelBaseline(spec);
}

/** Escribe las decisiones registradas de un chico como filas; la última de cada asiento lleva la recompensa. */
export function writeRows(result: ChicoResult, teamOf: (seat: number) => 0 | 1, opponent: number,
    out: Float32Array, offset: number): number {
  const F = featureSize(), P = privilegedSize, S = slotCount;
  let row = offset;
  for (let seat = 0; seat < result.records.length; seat++) {
    const recs = result.records[seat];
    const reward = result.winner === teamOf(seat) ? 1 : -1;
    for (let k = 0; k < recs.length; k++) {
      if ((row + 1) * ROW > out.length) return row;
      const r = recs[k];
      const base = row * ROW;
      out.set(r.x, base);
      out.set(r.priv, base + F);
      for (let i = 0; i < S; i++) out[base + F + P + i] = r.mask[i];
      if (r.target) for (let i = 0; i < S; i++) out[base + F + P + S + i] = r.target[i];
      const t = base + F + P + 2 * S;
      out[t + scalars.slot] = r.slot;
      out[t + scalars.logp] = r.logp;
      const last = k === recs.length - 1;
      out[t + scalars.reward] = result.shaped ? r.reward ?? 0 : last ? reward : 0;
      out[t + scalars.done] = last ? 1 : 0;
      out[t + scalars.teacher] = r.target ? 1 : 0;
      out[t + scalars.opponent] = opponent;
      row++;
    }
  }
  return row;
}
