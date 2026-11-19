export function normalized(weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const positive = weights.map(w => Math.max(0, w));
  const total = positive.reduce((sum, w) => sum + w, 0);
  return positive.map(w => total ? w / total : 1 / weights.length);
}

export interface RandomState { value: number }

export function uniform(stream: RandomState) {
  stream.value = (stream.value + 0x9e3779b9) >>> 0;
  let x = Math.imul(stream.value ^ (stream.value >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}
