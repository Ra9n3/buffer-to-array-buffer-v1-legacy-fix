/**
 * ALLOY analysis — stereo image over time (Task 5.2).
 *
 * Per 100 ms cell the engine keeps Σ L·R, Σ L² and Σ R²; everything else is
 * derived: the Pearson correlation of the two channels (the correlation meter
 * of D2.1.4), the left/right energy balance in dB, the width as side-to-mid
 * energy in dB and the loss a mono fold-down suffers. Only stereo files have
 * an image; a mono stem (D5.1.3) reports `applicable: false` with every
 * figure null rather than a fictitious correlation of 1.
 */
export const CORRELATION_FLOOR_ENERGY = 1e-20;

export interface StereoSummary {
  readonly correlation: number | null;
  readonly balanceDb: number | null;
  readonly widthDb: number | null;
  readonly monoLossDb: number | null;
  readonly minCorrelation: number | null;
  readonly fractionNegative: number | null;
}

export class StereoAnalyser {
  readonly cellCount: number;
  readonly sumLR: Float64Array;
  readonly sumLL: Float64Array;
  readonly sumRR: Float64Array;

  constructor(cellCount: number) {
    this.cellCount = cellCount;
    this.sumLR = new Float64Array(cellCount);
    this.sumLL = new Float64Array(cellCount);
    this.sumRR = new Float64Array(cellCount);
  }

  /** Accumulates `count` frames of L and R starting at absolute frame `frame`, cells of `cellFrames`. */
  push(left: Float32Array, right: Float32Array, count: number, frame: number, cellFrames: number): void {
    let i = 0;
    while (i < count) {
      const cell = Math.floor((frame + i) / cellFrames);
      const end = Math.min(count, (cell + 1) * cellFrames - frame);
      let lr = 0;
      let ll = 0;
      let rr = 0;
      for (; i < end; i++) {
        const l = left[i];
        const r = right[i];
        lr += l * r;
        ll += l * l;
        rr += r * r;
      }
      this.sumLR[cell] += lr;
      this.sumLL[cell] += ll;
      this.sumRR[cell] += rr;
    }
  }
}

export function correlationOf(lr: number, ll: number, rr: number): number {
  if (ll <= CORRELATION_FLOOR_ENERGY || rr <= CORRELATION_FLOOR_ENERGY) return Number.NaN;
  return Math.max(-1, Math.min(1, lr / Math.sqrt(ll * rr)));
}

export function balanceDbOf(ll: number, rr: number): number {
  if (ll <= CORRELATION_FLOOR_ENERGY || rr <= CORRELATION_FLOOR_ENERGY) return Number.NaN;
  return 10 * Math.log10(ll / rr);
}

/** Side energy over mid energy in dB: 0 dB is as wide as it is centred, −∞ is dual mono. */
export function widthDbOf(lr: number, ll: number, rr: number): number {
  const mid = (ll + rr + 2 * lr) / 4;
  const side = (ll + rr - 2 * lr) / 4;
  if (mid <= CORRELATION_FLOOR_ENERGY) return side > CORRELATION_FLOOR_ENERGY ? Number.POSITIVE_INFINITY : Number.NaN;
  return side <= 0 ? Number.NEGATIVE_INFINITY : 10 * Math.log10(side / mid);
}

/** What the mono sum (L+R)/2 loses against the mean channel energy, in dB (0 for identical channels). */
export function monoLossDbOf(lr: number, ll: number, rr: number): number {
  const mean = (ll + rr) / 2;
  if (mean <= CORRELATION_FLOOR_ENERGY) return Number.NaN;
  const mid = (ll + rr + 2 * lr) / 4;
  return mid <= 0 ? Number.NEGATIVE_INFINITY : 10 * Math.log10(mid / mean);
}

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

/** The stem-wide figures from the totals, plus the worst and the share of negative cells among the active ones. */
export function summariseStereo(s: StereoAnalyser, activeCell: (cell: number) => boolean): StereoSummary {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let min = Number.POSITIVE_INFINITY;
  let active = 0;
  let negative = 0;
  for (let c = 0; c < s.cellCount; c++) {
    lr += s.sumLR[c];
    ll += s.sumLL[c];
    rr += s.sumRR[c];
    if (!activeCell(c)) continue;
    const corr = correlationOf(s.sumLR[c], s.sumLL[c], s.sumRR[c]);
    if (Number.isNaN(corr)) continue;
    active++;
    if (corr < min) min = corr;
    if (corr < 0) negative++;
  }
  return {
    correlation: finiteOrNull(correlationOf(lr, ll, rr)),
    balanceDb: finiteOrNull(balanceDbOf(ll, rr)),
    widthDb: finiteOrNull(widthDbOf(lr, ll, rr)),
    monoLossDb: finiteOrNull(monoLossDbOf(lr, ll, rr)),
    minCorrelation: active === 0 ? null : min,
    fractionNegative: active === 0 ? null : negative / active,
  };
}
