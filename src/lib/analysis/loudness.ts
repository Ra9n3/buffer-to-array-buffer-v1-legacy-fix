/**
 * ALLOY analysis — loudness over the common 100 ms grid (Task 5.2).
 *
 * The analyser accumulates, per cell, the K-weighted energy of every channel
 * (`KWeighting` in filters.ts) and the number of frames the cell holds. The
 * functions here turn those sums into the ITU-R BS.1770-4 / EBU R 128
 * measures: momentary (400 ms) and short-term (3 s) loudness series, the
 * gated integrated loudness, and the loudness range of EBU Tech 3342. A
 * window is reported only where it is complete — a 0.3 s click has no
 * momentary loudness, which is the honest answer (its level is in the
 * sample peak and RMS measures). Mono stems are measured as the engine plays
 * them (duplicated left and right, D5.1.3): the channel sum doubles.
 */

export const LUFS_OFFSET = -0.691;
export const ABSOLUTE_GATE_LUFS = -70;
export const RELATIVE_GATE_LU = -10;
export const LRA_RELATIVE_GATE_LU = -20;
export const MOMENTARY_CELLS = 4; // 400 ms
export const SHORT_TERM_CELLS = 30; // 3 s

export function powerToLufs(power: number): number {
  return power > 0 ? LUFS_OFFSET + 10 * Math.log10(power) : Number.NEGATIVE_INFINITY;
}

/**
 * The windowed mean power ending at each cell: `cellEnergy[c]` is the summed
 * K-weighted energy (all channels, already weighted) of cell c, `cellFrames[c]`
 * the frames it holds. Cells before the first complete window are NaN.
 */
export function windowedPower(cellEnergy: Float64Array, cellFrames: Uint32Array, windowCells: number): Float64Array {
  const n = cellEnergy.length;
  const out = new Float64Array(n).fill(Number.NaN);
  let energy = 0;
  let frames = 0;
  for (let c = 0; c < n; c++) {
    energy += cellEnergy[c];
    frames += cellFrames[c];
    if (c >= windowCells) {
      energy -= cellEnergy[c - windowCells];
      frames -= cellFrames[c - windowCells];
    }
    if (c >= windowCells - 1 && frames > 0) out[c] = Math.max(0, energy) / frames;
  }
  return out;
}

/** LUFS series from a power series (NaN stays NaN; zero power is −∞). */
export function lufsSeries(power: Float64Array): Float32Array {
  const out = new Float32Array(power.length);
  for (let i = 0; i < power.length; i++) out[i] = Number.isNaN(power[i]) ? Number.NaN : powerToLufs(power[i]);
  return out;
}

/** The largest finite value of a series, or null when there is none. */
export function maxFinite(series: ArrayLike<number>): number | null {
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max === Number.NEGATIVE_INFINITY ? null : max;
}

/** BS.1770-4 §4: the gated integrated loudness over momentary block powers; null when no block passes the absolute gate. */
export function integratedLoudness(blockPower: Float64Array): number | null {
  const abs: number[] = [];
  for (let i = 0; i < blockPower.length; i++) {
    const p = blockPower[i];
    if (!Number.isNaN(p) && powerToLufs(p) > ABSOLUTE_GATE_LUFS) abs.push(p);
  }
  if (abs.length === 0) return null;
  const meanAbs = abs.reduce((s, p) => s + p, 0) / abs.length;
  const relativeGate = powerToLufs(meanAbs) + RELATIVE_GATE_LU;
  let sum = 0;
  let count = 0;
  for (const p of abs) {
    if (powerToLufs(p) > relativeGate) {
      sum += p;
      count++;
    }
  }
  return count === 0 ? null : powerToLufs(sum / count);
}

/** EBU Tech 3342: loudness range from short-term block powers (−70 absolute, −20 LU relative gate, 10th–95th percentile spread). */
export function loudnessRange(shortTermPower: Float64Array): number | null {
  const abs: number[] = [];
  for (let i = 0; i < shortTermPower.length; i++) {
    const p = shortTermPower[i];
    if (!Number.isNaN(p) && powerToLufs(p) > ABSOLUTE_GATE_LUFS) abs.push(p);
  }
  if (abs.length === 0) return null;
  const meanAbs = abs.reduce((s, p) => s + p, 0) / abs.length;
  const relativeGate = powerToLufs(meanAbs) + LRA_RELATIVE_GATE_LU;
  const kept = abs.filter((p) => powerToLufs(p) > relativeGate).map(powerToLufs).sort((a, b) => a - b);
  if (kept.length === 0) return null;
  return percentile(kept, 0.95) - percentile(kept, 0.1);
}

/** Linear-interpolated percentile of an ascending array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const t = pos - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

export function dbfs(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : Number.NEGATIVE_INFINITY;
}

export function powerDb(power: number): number {
  return power > 0 ? 10 * Math.log10(power) : Number.NEGATIVE_INFINITY;
}
