/**
 * ALLOY analysis — the filters the measurements share (Task 5.2).
 *
 * - `Biquad`: a second-order section with carried state, so a stem can be
 *   analysed slice by slice (plan §11 chunking) with results identical to a
 *   single pass.
 * - The ITU-R BS.1770-4 K-weighting pair at 48 kHz, the one rate Task 5.1
 *   admits (D5.1.1), so the published coefficients are used as published
 *   rather than re-derived.
 * - `TruePeakDetector`: the 4× oversampling inter-sample peak estimate of
 *   BS.1770-4 Annex 2 in spirit — a polyphase windowed-sinc interpolator,
 *   12 taps per phase, state carried across pushes.
 */

export class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(
    readonly b0: number,
    readonly b1: number,
    readonly b2: number,
    readonly a1: number,
    readonly a2: number,
  ) {}

  /** Filters `input` into `output` (may be the same array); the state carries to the next call. */
  process(input: Float32Array, output: Float32Array, count = input.length): void {
    let z1 = this.z1;
    let z2 = this.z2;
    const { b0, b1, b2, a1, a2 } = this;
    for (let i = 0; i < count; i++) {
      const x = input[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      output[i] = y;
    }
    this.z1 = z1;
    this.z2 = z2;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

/** BS.1770-4 Table 1 — the pre-filter (high-shelf) at 48 kHz. */
export const K_PRE_48K = { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 } as const;
/** BS.1770-4 Table 2 — the RLB weighting (high-pass) at 48 kHz. */
export const K_RLB_48K = { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 } as const;

/** The K-weighting chain for one channel: pre-filter then RLB, state carried. */
export class KWeighting {
  private readonly pre = new Biquad(K_PRE_48K.b0, K_PRE_48K.b1, K_PRE_48K.b2, K_PRE_48K.a1, K_PRE_48K.a2);
  private readonly rlb = new Biquad(K_RLB_48K.b0, K_RLB_48K.b1, K_RLB_48K.b2, K_RLB_48K.a1, K_RLB_48K.a2);

  process(input: Float32Array, output: Float32Array, count = input.length): void {
    this.pre.process(input, output, count);
    this.rlb.process(output, output, count);
  }
}

/** Oversampling factor and taps per phase of the true-peak interpolator. */
export const TRUE_PEAK_OVERSAMPLING = 4;
export const TRUE_PEAK_TAPS = 12;

/**
 * The polyphase taps: a Blackman-windowed sinc low-pass at the original
 * Nyquist, split into 4 phases of 12 taps, each phase normalised to unit DC
 * gain so a constant signal interpolates to itself exactly.
 */
export function truePeakPhases(): Float64Array[] {
  const L = TRUE_PEAK_OVERSAMPLING;
  const T = TRUE_PEAK_TAPS;
  const N = L * T;
  const centre = (N - 1) / 2;
  const h = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i - centre) / L;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
    h[i] = sinc * w;
  }
  const phases: Float64Array[] = [];
  for (let p = 0; p < L; p++) {
    const taps = new Float64Array(T);
    let sum = 0;
    for (let k = 0; k < T; k++) {
      taps[k] = h[L * k + p];
      sum += taps[k];
    }
    for (let k = 0; k < T; k++) taps[k] /= sum;
    phases.push(taps);
  }
  return phases;
}

const PHASES = truePeakPhases();

/** The inter-sample peak of one channel, streamed; `push` returns the peak absolute value within the pushed samples. */
export class TruePeakDetector {
  /** The last T−1 samples of the previous push, oldest first. */
  private readonly tail = new Float64Array(TRUE_PEAK_TAPS - 1);
  private work = new Float64Array(0);
  peak = 0;

  /**
   * Feeds `count` samples; returns the largest absolute value seen in this
   * push over the samples and the interpolated points between them (never
   * below the sample peak).
   */
  push(input: Float32Array, count = input.length): number {
    const T = TRUE_PEAK_TAPS;
    const lead = T - 1;
    if (this.work.length < count + lead) this.work = new Float64Array(count + lead);
    const buf = this.work;
    buf.set(this.tail, 0);
    for (let i = 0; i < count; i++) buf[lead + i] = input[i];
    const p0 = PHASES[0];
    const p1 = PHASES[1];
    const p2 = PHASES[2];
    const p3 = PHASES[3];
    let local = 0;
    for (let n = 0; n < count; n++) {
      // the newest sample sits at buf[n + lead]; tap k reads k samples back
      const base = n + lead;
      let y0 = 0;
      let y1 = 0;
      let y2 = 0;
      let y3 = 0;
      for (let k = 0; k < T; k++) {
        const x = buf[base - k];
        y0 += p0[k] * x;
        y1 += p1[k] * x;
        y2 += p2[k] * x;
        y3 += p3[k] * x;
      }
      if (y0 < 0) y0 = -y0;
      if (y1 < 0) y1 = -y1;
      if (y2 < 0) y2 = -y2;
      if (y3 < 0) y3 = -y3;
      if (y0 > local) local = y0;
      if (y1 > local) local = y1;
      if (y2 > local) local = y2;
      if (y3 > local) local = y3;
      // the sample itself is a point on the waveform: the four phases sit between samples
      // (±1/8, ±3/8), so a lone full-scale sample would otherwise read ≈ −0.23 dB low
      const xa = buf[base] < 0 ? -buf[base] : buf[base];
      if (xa > local) local = xa;
    }
    // carry the last T−1 samples (zero-padded when the push was shorter)
    const total = count + lead;
    for (let k = 0; k < lead; k++) this.tail[k] = buf[total - lead + k];
    if (local > this.peak) this.peak = local;
    return local;
  }
}
