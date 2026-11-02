/**
 * The live settings a Return strip can be BOUND to — Task 2.9.
 *
 * `ReturnStrip` (Task 2.4, approved) draws its knobs, character window and
 * BYPASS from fixture data and keeps their interaction local. Task 2.9 lets
 * a caller hand it one object that owns those four settings instead, so the
 * Mixer's Return strip and the Mixer's chain-detail panel turn the SAME
 * decay, pre-delay / feedback, tone, character and bypass (plan §8a: one
 * Return, selected and edited like other channels). The Console passes
 * nothing and behaves exactly as before.
 *
 * This file is only the shape — no state, no fixture, no model lives here.
 */
export interface ReturnLive {
  /** Decay (reverb, s) or delay time (delay, ms) — the strip's first knob. */
  time: number;
  /** Pre-delay (reverb, ms) or feedback (delay, %) — the strip's second knob. */
  second: number;
  /** Tone / damping, −10 … +10. */
  tone: number;
  /** The chain is bypassed — the strip's BYPASS switch. */
  bypass: boolean;
  /** Effect character / algorithm, as the window prints it and as it is spoken. */
  readonly character: { readonly print: string; readonly name: string };
}
