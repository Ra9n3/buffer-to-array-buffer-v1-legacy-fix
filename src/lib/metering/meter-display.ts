/**
 * ALLOY — the meter display's own ballistics (Stage 2, Step 1).
 *
 * Pure TypeScript, no DOM, no Svelte, no state: three small laws the display
 * store steps every point through once per frame. They exist because the
 * ENGINE already owns the rise — a VU reading arrives with the detector's own
 * two-pole ballistics behind it (Stage 1), so the display must not smooth the
 * way UP — while the way DOWN, and the fall of a point whose reading has gone
 * away (a stop, a pause, a muted path), is the display's own to draw:
 *
 *   · NEEDLE  follows a rising target instantly, falls toward a lower one
 *             exponentially at VU_FALL_TAU_SECONDS, and never reads below the
 *             floor it is given.
 *   · LED     shows a higher peak immediately and falls linearly at
 *             LED_FALL_DB_PER_SECOND, never below LED_FLOOR_DB.
 *   · CLIP    latches: once over is seen it stays lit until a new attempt
 *             from stopped clears it (a plain assignment to false — the clear
 *             rule lives in the store, not here).
 *
 * Everything here is allocation-free by construction: numbers in, numbers out.
 */

/** The needle's fall time constant, seconds — a VU at rest falls to its floor. */
export const VU_FALL_TAU_SECONDS = 0.3;

/** The LED column's fall rate, dB per second. */
export const LED_FALL_DB_PER_SECOND = 20;

/** The LED display's floor, dB — below the ladder's first threshold, nothing lit. */
export const LED_FLOOR_DB = -60;

/**
 * One frame of the needle. A target at or above the current value is followed
 * instantly (the engine's detector already applied the VU's real ballistics to
 * the reading; a second smoother on the way up would only lag the audio). A
 * target below falls exponentially toward it, never below `floor`.
 */
export function stepNeedle(current: number, target: number, dtSeconds: number, floor: number): number {
  if (target >= current) return target;
  const next = current + (target - current) * (1 - Math.exp(-dtSeconds / VU_FALL_TAU_SECONDS));
  return next < floor ? floor : next;
}

/**
 * One frame of the LED column. A peak at or above the current value shows
 * immediately; below it the column falls linearly at LED_FALL_DB_PER_SECOND;
 * the result never reads below LED_FLOOR_DB (a target below the floor simply
 * keeps the column falling — it cannot drag it under).
 */
export function stepLed(current: number, targetPeakDb: number, dtSeconds: number): number {
  const falling = current - LED_FALL_DB_PER_SECOND * dtSeconds;
  const next = targetPeakDb > falling ? targetPeakDb : falling;
  return next < LED_FLOOR_DB ? LED_FLOOR_DB : next;
}

/**
 * One frame of the clip latch: once over has been seen the latch stays set.
 * Clearing is not a function — it is a plain assignment to false, owned by
 * the store's new-attempt rule (Stage 2, Step 2).
 */
export function stepClip(latched: boolean, over: boolean): boolean {
  return latched || over;
}
