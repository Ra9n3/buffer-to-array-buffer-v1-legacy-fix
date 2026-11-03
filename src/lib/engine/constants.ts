/**
 * ALLOY — the fixed values the chain needs but the project model does not carry
 * (Task 7.1).
 *
 * The model holds every value a *control* can change. Two of the approved DSP
 * modules need inputs that no control (and therefore no model field) supplies, and
 * the owner fixed them at the 7.1 readiness gate (2026-11-03). Each is one exported
 * constant so a later task can move it in one place:
 *
 *   - the **Dynamic EQ** gates: the model carries a band's depth
 *     (`EqBandState.dynamicDepthDb`) but no threshold, attack or release;
 *   - the **expander** gates: a track's chain carries `cleanup: boolean` and
 *     nothing else, so "cleanup in circuit" means these five values;
 *   - the **master's** safety limiter: the plan's output stage allows "transparent
 *     peak protection only", Task 6.2 built the limiter, and the owner put it in the
 *     7.1 master path at its documented defaults.
 *
 * These are PROVISIONAL app-design numbers, like the 6.x ones: no document fixes
 * them, and none of them is a measurement. Nothing here invents a control.
 */

import { DEFAULT_LIMITER_CEILING_DB, DEFAULT_LIMITER_RELEASE_MS } from "../dsp/limiter";

/**
 * The Dynamic EQ's per-band detector, applied to every band with a depth in the
 * model. Threshold −24 dBFS, attack 5 ms, release 120 ms (owner, 2026-11-03).
 */
export const DYNAMIC_BAND_GATE = {
  thresholdDb: -24,
  attackMs: 5,
  releaseMs: 120,
} as const;

/**
 * "Cleanup / expander in circuit" (plan §8 block 2) — the five gates the model does
 * not carry. Threshold −45 dBFS, ratio 2:1, range 20 dB, attack 5 ms, release
 * 120 ms (owner, 2026-11-03).
 */
export const CLEANUP_EXPANDER = {
  thresholdDb: -45,
  ratio: 2,
  rangeDb: 20,
  attackMs: 5,
  releaseMs: 120,
} as const;

/**
 * The master output stage: the approved safety limiter, always in circuit, at its
 * documented defaults (−1 dBFS ceiling, 50 ms release, 5 ms lookahead). No make-up
 * gain, no loudness target, no mastering (plan §8: "only transparent peak
 * protection if needed"). The engine reports the 5 ms as processing latency.
 */
export const MASTER_LIMITER = {
  ceilingDb: DEFAULT_LIMITER_CEILING_DB,
  releaseMs: DEFAULT_LIMITER_RELEASE_MS,
} as const;

/** Sends below this level are OFF — `SEND_RANGE.min` is the slot's OFF position. */
export const SEND_OFF_DB = -60;
