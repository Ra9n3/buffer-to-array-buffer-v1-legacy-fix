/**
 * ALLOY — the biquad the EQ and the dynamic EQ are made of (Task 6.1).
 *
 * The project's EQ is four bands of three kinds (mixer-chain.ts, D2.8.4):
 * a low shelf, two bells with Q, a high shelf. This file is the one place
 * that turns such a band — kind, frequency, gain, Q — into a second-order
 * section, and the one place a section is run over samples.
 *
 * The maths is the Task 2.8 curve's maths, exactly: the RBJ audio-EQ
 * cookbook prototypes at the session rate, the shelves at slope S = 1.
 * `mixer-chain.ts` draws `EqGraph` from the same formulas, so the curve the
 * user sees and the filter the engine runs cannot disagree — a test holds
 * the drawn curve to this module's measured response.
 *
 * A section is transposed direct form II with carried state: the same
 * arithmetic as the analysis engine's `Biquad` (analysis/filters.ts), so a
 * stem can be processed in blocks of any length (plan §11 chunking) and the
 * result is identical to one pass — bit for bit, because nothing in the
 * loop looks at a block boundary.
 *
 * Allocation: a section owns its five coefficients; nothing allocates in
 * `process` or `step`. `bandCoefficients` and friends write into a caller's
 * array, which is what lets the dynamic EQ redesign a section per sample
 * without a garbage-collector visit.
 */

import { requireFinite } from "./params";

/** The three band kinds the documents name (mixer-chain.ts `BandKind`). */
export type FilterKind = "bell" | "shelf-low" | "shelf-high";

/** The kinds in console order, for validation and the docs. */
export const FILTER_KINDS: readonly FilterKind[] = ["bell", "shelf-low", "shelf-high"];

export function isFilterKind(value: unknown): value is FilterKind {
  return value === "bell" || value === "shelf-low" || value === "shelf-high";
}

/**
 * The shelf slope S = 1 — the fixed shape Task 2.8 draws (`SHELF_Q` below is
 * the Q of that slope, used when a shelf is asked for a Q it does not have).
 */
export const SHELF_SLOPE = 1;
/** A shelf carries no Q; this is the Q of its slope-1 prototype. */
export const SHELF_Q = Math.SQRT1_2;
/** b0, b1, b2, a1, a2 — `a0` is normalised to 1. */
export const COEFFICIENT_COUNT = 5;

/**
 * A frequency the design can use: above 0 and below Nyquist (a band at or
 * past Nyquist has no shape, and `sin(w0)` would be 0 or negative).
 */
export function requireDesignFrequency(freqHz: number, sampleRate: number, what = "the frequency"): number {
  const finite = requireFinite(freqHz, what);
  if (finite <= 0 || finite >= sampleRate / 2) {
    throw new Error(
      `Alloy DSP: ${what} must be above 0 Hz and below Nyquist (${sampleRate / 2} Hz), not ${finite}`,
    );
  }
  return finite;
}

function identity(out: Float64Array): void {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
}

/**
 * The coefficients of a band at `gainDb`, written into `out` as
 * `[b0, b1, b2, a1, a2]` with `a0 = 1`.
 *
 * A 0 dB gain is the identity section, set exactly, so a neutral band
 * passes its input through bit for bit rather than through arithmetic that
 * happens to cancel.
 */
export function bandCoefficients(
  out: Float64Array,
  kind: FilterKind,
  freqHz: number,
  gainDb: number,
  q: number,
  sampleRate: number,
): void {
  requireDesignFrequency(freqHz, sampleRate);
  requireFinite(gainDb, "the gain");
  if (gainDb === 0) {
    identity(out);
    return;
  }
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);

  if (kind === "bell") {
    const alpha = sin / (2 * q);
    const a0 = 1 + alpha / A;
    out[0] = (1 + alpha * A) / a0;
    out[1] = -2 * cos / a0;
    out[2] = (1 - alpha * A) / a0;
    out[3] = -2 * cos / a0;
    out[4] = (1 - alpha / A) / a0;
    return;
  }

  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / SHELF_SLOPE - 1) + 2);
  const sq = 2 * Math.sqrt(A) * alpha;
  if (kind === "shelf-low") {
    const a0 = A + 1 + (A - 1) * cos + sq;
    out[0] = (A * (A + 1 - (A - 1) * cos + sq)) / a0;
    out[1] = (2 * A * (A - 1 - (A + 1) * cos)) / a0;
    out[2] = (A * (A + 1 - (A - 1) * cos - sq)) / a0;
    out[3] = (-2 * (A - 1 + (A + 1) * cos)) / a0;
    out[4] = (A + 1 + (A - 1) * cos - sq) / a0;
    return;
  }
  const a0 = A + 1 - (A - 1) * cos + sq;
  out[0] = (A * (A + 1 + (A - 1) * cos + sq)) / a0;
  out[1] = (-2 * A * (A - 1 + (A + 1) * cos)) / a0;
  out[2] = (A * (A + 1 + (A - 1) * cos - sq)) / a0;
  out[3] = (2 * (A - 1 - (A + 1) * cos)) / a0;
  out[4] = (A + 1 - (A - 1) * cos - sq) / a0;
}

/** A 0 dB-peak band-pass (RBJ), `[b0, b1, b2, a1, a2]`. */
export function bandPassCoefficients(out: Float64Array, freqHz: number, q: number, sampleRate: number): void {
  requireDesignFrequency(freqHz, sampleRate);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  out[0] = alpha / a0;
  out[1] = 0;
  out[2] = -alpha / a0;
  out[3] = (-2 * cos) / a0;
  out[4] = (1 - alpha) / a0;
}

/** A 0 dB-passband low-pass (RBJ), `[b0, b1, b2, a1, a2]`. */
export function lowPassCoefficients(out: Float64Array, freqHz: number, q: number, sampleRate: number): void {
  requireDesignFrequency(freqHz, sampleRate);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  out[0] = ((1 - cos) / 2) / a0;
  out[1] = (1 - cos) / a0;
  out[2] = ((1 - cos) / 2) / a0;
  out[3] = (-2 * cos) / a0;
  out[4] = (1 - alpha) / a0;
}

/** A 0 dB-passband high-pass (RBJ), `[b0, b1, b2, a1, a2]`. */
export function highPassCoefficients(out: Float64Array, freqHz: number, q: number, sampleRate: number): void {
  requireDesignFrequency(freqHz, sampleRate);
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  out[0] = ((1 + cos) / 2) / a0;
  out[1] = -(1 + cos) / a0;
  out[2] = ((1 + cos) / 2) / a0;
  out[3] = (-2 * cos) / a0;
  out[4] = (1 - alpha) / a0;
}

/**
 * The magnitude of a section at a frequency, dB — evaluated on the unit
 * circle, the way `mixer-chain.ts` evaluates the drawn curve. This is the
 * settings drawn as a response, never a measurement of a signal.
 */
export function magnitudeDb(coefficients: ArrayLike<number>, freqHz: number, sampleRate: number): number {
  requireDesignFrequency(freqHz, sampleRate);
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const c1 = Math.cos(w);
  const c2 = Math.cos(2 * w);
  const s1 = Math.sin(w);
  const s2 = Math.sin(2 * w);
  const b0 = coefficients[0];
  const b1 = coefficients[1];
  const b2 = coefficients[2];
  const a1 = coefficients[3];
  const a2 = coefficients[4];
  const num = (b0 + b1 * c1 + b2 * c2) ** 2 + (b1 * s1 + b2 * s2) ** 2;
  const den = (1 + a1 * c1 + a2 * c2) ** 2 + (a1 * s1 + a2 * s2) ** 2;
  return 10 * Math.log10(num / den);
}

/**
 * One second-order section: five coefficients and two state variables.
 *
 * `process` runs a block (the EQ's path); `step` runs one sample (the
 * dynamic EQ's, whose gain changes between samples). Both read the same
 * coefficients and share the same state, so mixing them is safe.
 */
export class BiquadSection {
  /** `[b0, b1, b2, a1, a2]`, `a0 = 1`. Live: a caller may read it, not write it. */
  readonly coefficients = new Float64Array(COEFFICIENT_COUNT);
  private z1 = 0;
  private z2 = 0;

  /** Sets the section to a band (kind, frequency, gain, Q) at the session rate. */
  setBand(kind: FilterKind, freqHz: number, gainDb: number, q: number, sampleRate: number): void {
    bandCoefficients(this.coefficients, kind, freqHz, gainDb, q, sampleRate);
  }

  /** Sets the section to a 0 dB-peak band-pass. */
  setBandPass(freqHz: number, q: number, sampleRate: number): void {
    bandPassCoefficients(this.coefficients, freqHz, q, sampleRate);
  }

  /** Sets the section to a 0 dB-passband low-pass. */
  setLowPass(freqHz: number, q: number, sampleRate: number): void {
    lowPassCoefficients(this.coefficients, freqHz, q, sampleRate);
  }

  /** Sets the section to a 0 dB-passband high-pass. */
  setHighPass(freqHz: number, q: number, sampleRate: number): void {
    highPassCoefficients(this.coefficients, freqHz, q, sampleRate);
  }

  /** Filters `count` samples of `input` into `output` (the same array is allowed); state carries. */
  process(input: Float32Array, output: Float32Array, count = input.length): void {
    const c = this.coefficients;
    const b0 = c[0];
    const b1 = c[1];
    const b2 = c[2];
    const a1 = c[3];
    const a2 = c[4];
    let z1 = this.z1;
    let z2 = this.z2;
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

  /** Filters one sample; the state carries to the next call. */
  step(x: number): number {
    const c = this.coefficients;
    const y = c[0] * x + this.z1;
    this.z1 = c[1] * x - c[3] * y + this.z2;
    this.z2 = c[2] * x - c[4] * y;
    return y;
  }

  /** Clears the state — the next sample starts from silence, as a fresh section does. */
  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }

  /** This section's response at a frequency, dB. */
  magnitudeDbAt(freqHz: number, sampleRate: number): number {
    return magnitudeDb(this.coefficients, freqHz, sampleRate);
  }
}
