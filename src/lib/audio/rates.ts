/**
 * ALLOY — PROJECT RATES AND THE INTERNAL FORMAT — Task 11.1.
 *
 * The one home of every sample-rate decision (owner-approved architecture):
 *
 *   ONE internal format    32-bit IEEE float. Everything the project stores
 *                          after an import, plays back and renders is float32;
 *                          depth is decided once, at the export stage.
 *   ONE project rate        44100 | 48000. Chosen when a project is created,
 *                          default 48000, LOCKED afterwards. A file at either
 *                          rate is imported; the conversion stage resamples it
 *                          to the project rate once. Export renders at the
 *                          project rate, then a separate rate stage converts
 *                          once more if the target differs.
 *
 * Rate conversion and depth conversion are separate stages, in that order,
 * on both sides. Resampling is high quality but NOT lossless — no code, UI
 * or document may claim otherwise.
 *
 * The project rate is the single source of truth for audio. What the audio
 * DEVICE runs at is the browser's business: the Web Audio context is created
 * at the project rate where the browser allows it, the device rate may differ,
 * and Web Audio owns that final conversion. There is no custom output path.
 *
 * Nothing here is audio processing, storage or browser code: constants and
 * pure helpers only, so every other module names rates through this one.
 */

/** The two rates a project may be created at (and the two an import may carry). */
export type ProjectRate = 44100 | 48000;

export const PROJECT_RATES: readonly ProjectRate[] = [44100, 48000];

/** The rate a new project takes when nothing chooses otherwise. */
export const DEFAULT_PROJECT_RATE: ProjectRate = 48000;

/** Old saved projects predate the field; they reopen at this rate (decisions-log D11.1.2). */
export const LEGACY_PROJECT_RATE: ProjectRate = DEFAULT_PROJECT_RATE;

export function isProjectRate(value: unknown): value is ProjectRate {
  return value === 44100 || value === 48000;
}

/** A project rate or a refusal naming the two — never a silent clamp. */
export function requireProjectRate(value: unknown): ProjectRate {
  if (!isProjectRate(value)) {
    throw new Error(`Alloy: the sample rate is 44100 or 48000, not ${String(value)}`);
  }
  return value;
}

/** The internal format's depth and encoding, as the WAV facts every stage uses. */
export const INTERNAL_ENCODING = "float" as const;
export const INTERNAL_BIT_DEPTH = 32;

/* =========================================================================
   PRINTS — one shape per surface
   ========================================================================= */

/** "44.1 kHz" / "48 kHz" — the badge, the dialogs, the notices. */
export function printRate(rate: number): string {
  return rate % 1000 === 0 ? `${rate / 1000} kHz` : `${(rate / 1000).toFixed(1)} kHz`;
}

/** "44.1 → 48 kHz" — the conversion notice, both ends named. */
export function printRateChange(from: number, to: number): string {
  return `${printRate(from)} → ${printRate(to)}`;
}

/* =========================================================================
   RESAMPLING DIRECTIONS
   ========================================================================= */

/**
 * The rational ratios of the two rates, reduced: 44100/48000 = 147/160.
 * Upsampling 44.1→48 multiplies by 160/147 (L = 160, M = 147 → 160 phases);
 * downsampling 48→44.1 multiplies by 147/160 (L = 147, M = 160 → 147 phases).
 * The resampler (lib/audio/resample.ts) pins both directions with these
 * exact counts; the pair lives here so every module reads one table.
 */
export function resampleRatio(inRate: number, outRate: number): { readonly up: number; readonly down: number } | null {
  if (!Number.isInteger(inRate) || !Number.isInteger(outRate) || inRate <= 0 || outRate <= 0) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(inRate, outRate);
  return { up: outRate / g, down: inRate / g };
}
