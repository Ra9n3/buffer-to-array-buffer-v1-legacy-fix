/**
 * ALLOY — the strip meter's scale, pure (Stage 2).
 *
 * The strip meter's compact scale and its lit-count law, moved verbatim out of
 * StripMeter.svelte's module script into one pure module beside it — the
 * vu-geometry.ts pattern: no DOM, importable by the meter display store and
 * the tests (a `.svelte` file cannot be imported from the Node-run store),
 * and re-exported by the component unchanged, so every existing import from
 * StripMeter.svelte keeps working. Nothing about which dB sits where has
 * moved; the values are the approved Task 9.5 scale exactly.
 */

/** One rung of the column: the threshold that lights it and its band colour. */
export interface StripMeterSegment {
  readonly db: number;
  readonly band: "green" | "amber" | "red";
}

/**
 * The strip meter's compact scale, bottom to top: twelve segments, eight
 * green through −6, three amber through −1, one red at 0 — the same band
 * philosophy as the ladder's sixteen (hardware spec §4b), thinned for the
 * narrow column beside a fader. Demonstration scale only — plan §9 defers
 * every numeric audio value to listening tests.
 */
export const STRIP_METER_SCALE: readonly StripMeterSegment[] = [
  { db: -40, band: "green" },
  { db: -34, band: "green" },
  { db: -28, band: "green" },
  { db: -22, band: "green" },
  { db: -17, band: "green" },
  { db: -13, band: "green" },
  { db: -9, band: "green" },
  { db: -6, band: "green" },
  { db: -4, band: "amber" },
  { db: -2, band: "amber" },
  { db: -1, band: "amber" },
  { db: 0, band: "red" },
];

/**
 * How many segments a level lights: every threshold reached, counted from
 * the bottom — the lit run is contiguous, never a lone segment.
 */
export function stripMeterLit(segments: readonly { readonly db: number }[], level: number): number {
  let lit = 0;
  while (lit < segments.length && level >= segments[lit].db) lit += 1;
  return lit;
}
