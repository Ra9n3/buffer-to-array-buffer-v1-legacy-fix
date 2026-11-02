/**
 * The live settings a Return strip can be BOUND to — Task 2.9, extended in
 * Task 3.1.
 *
 * `ReturnStrip` (Task 2.4, approved) draws its knobs, character window,
 * BYPASS, fader and MUTE / SOLO from fixture data and keeps their
 * interaction local. Task 2.9 let a caller hand it one object that owns the
 * effect settings instead, so the Mixer's Return strip and the Mixer's
 * chain-detail panel turn the SAME decay, pre-delay / feedback, tone,
 * character and bypass (plan §8a: one Return, selected and edited like
 * other channels). Task 3.1 adds the strip's level, MUTE and SOLO to the
 * shape and makes that object a view of the shared project store
 * (`returnLive` in lib/project/store.svelte.ts), bound in BOTH rooms. A
 * caller that passes nothing still gets the strip's approved local
 * behaviour (the component playground).
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
  /** Return output level, dB — the strip's fader (Task 3.1). */
  level: number;
  /** MUTE / SOLO (Task 3.1). */
  mute: boolean;
  solo: boolean;
}
