/**
 * ALLOY — DSP parameter ranges and validation (Tasks 6.1 and 6.2).
 *
 * The numbers the Task 6.1 modules accept are the documents', not this
 * file's invention:
 *
 *   FREQ 20 Hz – 20 kHz · GAIN ±15 dB / 0.5 · Q 0.3 – 10 (bells)
 *       the Task 2.8 chain's EQ specs (decisions-log D2.8.3, D2.8.4);
 *   THRESH −40 … 0 dB / 1 · ATTACK 0.1 – 100 ms · RELEASE 10 – 1000 ms
 *       the same chain's dynamics specs (D2.8.3). No document fixes a
 *       separate threshold or timing for the dynamic band, so the dynamic
 *       EQ's detector uses these — the project has exactly one set of
 *       dynamics ranges and two consciences would be worse than one;
 *   DEPTH 0 … 15 dB, downward only
 *       `dynamicDepthDb` is "how far (dB) the band's gain may be pulled
 *       down" (mixer-chain.ts, D2.8.4) and the only scale the project has
 *       for a band's gain is its ±15 dB range.
 *
 * Task 6.2's dynamics ranges are split the same way, and the split is the
 * point:
 *   COMPRESSOR  THRESH −40 … 0 dB · RATIO 1 … 20 · MAKEUP 0 … +20 dB, with
 *               ATTACK 0.1 – 100 ms and RELEASE 10 – 1000 ms shared with the
 *               expander — all D2.8.3's chain specs, exactly;
 *   EXPANDER    THRESHOLD −60 … 0 dBFS · RATIO 1 … 4 · RANGE 0 … 40 dB, and
 *   LIMITER     CEILING −12 … 0 dBFS · RELEASE 10 – 1000 ms
 *               — no document fixes these. The plan names the expander only
 *               as "Cleanup / expander where justified by the track and
 *               rules" (§8 block 2) and defers "exact headroom and
 *               peak-safety defaults" (§17), so these are PROVISIONAL
 *               app-design choices (D6.2.x, `task-reports/6.2-report.md`).
 *
 * Where the plan is silent these are PROVISIONAL and live here, one number
 * each, so a later tuning task moves them in one place (the D5.2.5 / D5.2.8
 * convention).
 *
 * Conventions, the project's (D5.1.1, D5.1.3, Task 5.2):
 *   - the session rate is 48 kHz, the one rate Task 5.1 admits, no resampling;
 *   - a sample is a 32-bit float; the modules neither clip, scale nor dither,
 *     and they assume the samples are finite (the import path counts
 *     non-finite samples as integrity findings). Sanitising belongs where the
 *     bytes are read, not in every filter;
 *   - a value that is not a finite number is a caller bug and THROWS; a
 *     finite value outside a documented range is CLAMPED, as the console's
 *     controls already do (`fromPosition` / `setParamValue`, mixer-chain.ts);
 *   - nothing here reads the browser, allocates per sample, or keeps state.
 */

/** The session rate — the one rate Task 5.1 admits (`ACCEPTED_SAMPLE_RATE`). */
export const DSP_SAMPLE_RATE = 48000;

/** A closed interval, both ends included. */
export interface DspRange {
  readonly min: number;
  readonly max: number;
}

/** What a module needs to be built: how many channels, at what rate. */
export interface DspOptions {
  /** A stem is mono or stereo; stereo is the mix bus's default. */
  readonly channels?: 1 | 2;
  /** Defaults to the session rate, 48 kHz. */
  readonly sampleRate?: number;
}

/** EQ frequency, Hz (log taper on the console). */
export const EQ_FREQUENCY_HZ: DspRange = { min: 20, max: 20000 };
/** EQ gain, dB. The dynamic band's depth is measured on the same scale. */
export const EQ_GAIN_DB: DspRange = { min: -15, max: 15 };
/** Bell Q. A shelf has no Q (its shape is the fixed slope-1 prototype). */
export const EQ_Q: DspRange = { min: 0.3, max: 10 };
/** How far a dynamic band may be pulled down, dB — downward only. */
export const DYNAMIC_DEPTH_DB: DspRange = { min: 0, max: 15 };
/** The dynamic detector's threshold, dBFS of the band-limited key. */
export const DYNAMIC_THRESHOLD_DB: DspRange = { min: -40, max: 0 };
/** The dynamic detector's attack, ms. */
export const DYNAMIC_ATTACK_MS: DspRange = { min: 0.1, max: 100 };
/** The dynamic detector's release, ms. */
export const DYNAMIC_RELEASE_MS: DspRange = { min: 10, max: 1000 };
/** The documented EQ is four bands (LF · LMF · HMF · HF, D2.8.4). */
export const EQ_MAX_BANDS = 4;

/**
 * A value that is not a finite number is a bug in the caller — a control
 * that was never set, a NaN that travelled from a file. It throws rather
 * than becoming a filter that poisons its state for ever.
 */
export function requireFinite(value: number, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Alloy DSP: ${what} must be a finite number, not ${String(value)}`);
  }
  return value;
}

/** A finite value outside its documented range is clamped to the range. */
export function requireInRange(value: number, range: DspRange, what: string): number {
  const finite = requireFinite(value, what);
  return Math.min(range.max, Math.max(range.min, finite));
}

/** The session rate, or a rate a test or a later native port asks for. */
export function requireSampleRate(sampleRate: number): number {
  const finite = requireFinite(sampleRate, "the sample rate");
  if (finite <= 0) throw new Error(`Alloy DSP: the sample rate must be positive, not ${finite}`);
  return finite;
}

/** A stem is mono or stereo (Task 5.1's format contract). */
export function requireChannels(channels: number): 1 | 2 {
  if (channels !== 1 && channels !== 2) {
    throw new Error(`Alloy DSP: the channel count is 1 or 2, not ${String(channels)}`);
  }
  return channels;
}

/* =========================================================================
   TASK 6.2 — THE DYNAMICS MODULES
   ========================================================================= */

/** The compressor's threshold, dB (D2.8.3: THRESH −40 … 0). */
export const COMPRESSOR_THRESHOLD_DB: DspRange = { min: -40, max: 0 };
/** The compressor's ratio (D2.8.3: the console's list runs 1 … 20). */
export const COMPRESSOR_RATIO: DspRange = { min: 1, max: 20 };
/** Make-up gain, dB (D2.8.3: MAKEUP 0 … +20, half-dB steps on the knob). */
export const COMPRESSOR_MAKEUP_DB: DspRange = { min: 0, max: 20 };
/** Attack, ms — the chain's ATTACK spec, shared by the compressor and the expander. */
export const DYNAMICS_ATTACK_MS: DspRange = { min: 0.1, max: 100 };
/** Release, ms — the chain's RELEASE spec, shared by the compressor, the expander and the limiter. */
export const DYNAMICS_RELEASE_MS: DspRange = { min: 10, max: 1000 };
/** The expander's threshold, dBFS — PROVISIONAL (no document fixes it). */
export const EXPANDER_THRESHOLD_DB: DspRange = { min: -60, max: 0 };
/** The expander's downward ratio — PROVISIONAL; it prints as 1:1 … 4:1. */
export const EXPANDER_RATIO: DspRange = { min: 1, max: 4 };
/** How far the expander may pull a signal down, dB — PROVISIONAL. */
export const EXPANDER_RANGE_DB: DspRange = { min: 0, max: 40 };
/** The safety limiter's sample-peak ceiling, dBFS — PROVISIONAL (plan §17 defers it). */
export const LIMITER_CEILING_DB: DspRange = { min: -12, max: 0 };

/** The highest ratio a progressive character may reach, so no band of audio can be flattened. */
export const MAX_COMPRESSION_RATIO = 20;

/**
 * A switch — `autoRelease`, `bypassed`. Not a number, so not clamped: a
 * non-boolean is a caller bug, like a NaN.
 */
export function requireBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Alloy DSP: ${what} is a boolean, not ${String(value)}`);
  }
  return value;
}
