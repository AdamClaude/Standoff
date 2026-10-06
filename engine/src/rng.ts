// Deterministic, serialisable PRNG (sfc32 seeded via cyrb128).
// The *seed* itself should come from a CSPRNG on the server; everything after
// that is deterministic so seed + action log replays a game exactly.

export function seedToState(seed: string): number[] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const st = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  for (let i = 0; i < 12; i++) next(st); // warm up
  return st;
}

/** Returns a float in [0,1) and advances the state in place. */
export function next(st: number[]): number {
  let [a, b, c, d] = st;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  const r = (t + d) | 0;
  c = (c + r) | 0;
  st[0] = a >>> 0; st[1] = b >>> 0; st[2] = c >>> 0; st[3] = d >>> 0;
  return (r >>> 0) / 4294967296;
}

export function int(st: number[], n: number): number {
  return Math.floor(next(st) * n);
}

export function pick<T>(st: number[], arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[int(st, arr.length)];
}

export function shuffle<T>(st: number[], arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(st, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
