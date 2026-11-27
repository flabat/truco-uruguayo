import { featureSize, featureVersion, slotCount } from "./features.ts";

/** Pesos de un MLP con ReLU: capas ocultas y cabeza de política. Cada matriz va por filas (salida × entrada). */
export interface Layer { rows: number; cols: number; w: Float32Array; b: Float32Array }
export interface Network { layers: Layer[] }

/** Artefacto JSON servible. Los pesos van en float32 little-endian, en base64, en el orden de `shapes`. */
export interface RegularizedArtifact {
  kind: typeof regularizedKind;
  format: "duel" | "pairs-private-senas" | "triples";
  features: typeof featureVersion;
  memory?: "opponent";
  shapes: [number, number][];
  weights: string;
  meta?: Record<string, unknown>;
}
export const regularizedKind = "truco-regularized-v1";

export function decodeNetwork(artifact: RegularizedArtifact): Network {
  if (artifact.kind !== regularizedKind || artifact.features !== featureVersion) throw new TypeError("Actor regularizado incompatible.");
  const bytes = Buffer.from(artifact.weights, "base64");
  const all = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  let offset = 0;
  const layers = artifact.shapes.map(([rows, cols]) => {
    const w = all.subarray(offset, offset + rows * cols); offset += rows * cols;
    const b = all.subarray(offset, offset + rows); offset += rows;
    return { rows, cols, w, b };
  });
  if (offset !== all.length) throw new TypeError("Pesos de tamaño inesperado.");
  if (layers[0].cols !== featureSize() || layers.at(-1)!.rows !== slotCount) throw new TypeError("Forma de red incompatible.");
  for (let i = 1; i < layers.length; i++) if (layers[i].cols !== layers[i - 1].rows) throw new TypeError("Capas incompatibles.");
  if (!all.every(Number.isFinite)) throw new TypeError("Pesos no finitos.");
  return { layers };
}

export function encodeNetwork(net: Network): { shapes: [number, number][]; weights: string } {
  const parts: Float32Array[] = [];
  for (const l of net.layers) parts.push(l.w, l.b);
  const total = parts.reduce((a, p) => a + p.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return { shapes: net.layers.map(l => [l.rows, l.cols]), weights: Buffer.from(all.buffer).toString("base64") };
}

const scratch = new Map<number, Float32Array>();
function buffer(size: number, slot: number) {
  const key = size * 8 + slot;
  let b = scratch.get(key);
  if (!b) { b = new Float32Array(size); scratch.set(key, b); }
  return b;
}

/** Logits de política. Las capas ocultas usan ReLU. */
export function logits(net: Network, x: Float32Array): Float32Array {
  let input = x;
  for (let k = 0; k < net.layers.length; k++) {
    const { rows, cols, w, b } = net.layers[k];
    const out = buffer(rows, k % 2);
    const last = k === net.layers.length - 1;
    for (let r = 0; r < rows; r++) {
      let sum = b[r];
      const base = r * cols;
      for (let c = 0; c < cols; c++) sum += w[base + c] * input[c];
      out[r] = last || sum > 0 ? sum : 0;
    }
    input = out;
  }
  return input;
}

/** Probabilidades sobre las ranuras legales (cero en las demás). */
export function policy(net: Network, x: Float32Array, mask: Uint8Array): Float64Array {
  const z = logits(net, x);
  const p = new Float64Array(slotCount);
  let max = -Infinity;
  for (let i = 0; i < slotCount; i++) if (mask[i] && z[i] > max) max = z[i];
  let sum = 0;
  for (let i = 0; i < slotCount; i++) if (mask[i]) { p[i] = Math.exp(z[i] - max); sum += p[i]; }
  if (!(sum > 0)) throw new Error("Sin acciones legales.");
  for (let i = 0; i < slotCount; i++) p[i] /= sum;
  return p;
}

export function sampleSlot(p: Float64Array, u: number): number {
  let acc = 0, last = -1;
  for (let i = 0; i < p.length; i++) {
    if (p[i] <= 0) continue;
    last = i; acc += p[i];
    if (u < acc) return i;
  }
  return last;
}
