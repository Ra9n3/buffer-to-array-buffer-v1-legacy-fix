/**
 * ALLOY — the live meter bus (Stage 1, Step 5).
 *
 * A plain module (no Svelte runes, no components) that holds the CURRENT
 * playback attempt's meter set and output, so anything that draws meters —
 * the `?debug=meters` table today, the console bridge in a later stage — can
 * read "what is the level right now" without touching the engine or the
 * transport:
 *
 *   · `registerAttempt(meterSet, output)` — createPreviewSession calls this
 *     when a preview attempt starts (a raw session has no engine, so it never
 *     registers; a render never meters).
 *   · `clearAttempt()` — when the attempt ends or a new one replaces it. The
 *     optional argument narrows the clear to one meter set, so an old
 *     session's late `close()` cannot clear a newer attempt's registration
 *     that already replaced it.
 *   · `readCurrent(kind, id, out)` — the reading at `output.playedFrames()`
 *     for one point, filled into the caller's reusable reading; false when no
 *     attempt is active or no reading is available yet.
 *
 * `readCurrent` allocates nothing per call: one module-level attempt slot, map
 * lookups, and a typed-array ring read.
 */

import type { MeterReading, MeterSet } from "../engine/metering";
import type { BusId, ReturnBusId, TrackId } from "../project/model";

/** The kinds of metered point, as the bus addresses them. */
export type MeterPointKind = "track" | "bus" | "return" | "master";

/** One point's id under its kind ("master" has no id of its own). */
export type MeterPointId = TrackId | BusId | ReturnBusId | "master";

/** The least the bus needs from an output: where the audible stream is now. */
export interface MeterClockOutput {
  playedFrames?(): number;
}

interface ActiveAttempt {
  readonly meterSet: MeterSet;
  readonly output: MeterClockOutput;
}

/** The current attempt, or null between attempts. */
let attempt: ActiveAttempt | null = null;

/**
 * The preview attempt that just started. Replaces any registration before it
 * (raw and render attempts never register one — they clear it instead).
 */
export function registerAttempt(meterSet: MeterSet, output: MeterClockOutput): void {
  attempt = { meterSet, output };
}

/**
 * The attempt ended, or a new one replaces it. With `previouslyRegistered`,
 * clears only if that exact meter set is still the registered one — a session
 * closing late must not clear a newer attempt.
 */
export function clearAttempt(previouslyRegistered?: MeterSet): void {
  if (previouslyRegistered === undefined || (attempt !== null && attempt.meterSet === previouslyRegistered)) attempt = null;
}

/** The registered meter set, for enumerating points (the debug table). */
export function currentMeterSet(): MeterSet | null {
  return attempt === null ? null : attempt.meterSet;
}

function pointOf(set: MeterSet, kind: MeterPointKind, id: MeterPointId) {
  if (kind === "track") return set.tracks.get(id as TrackId);
  if (kind === "bus") return set.buses.get(id as BusId);
  if (kind === "return") return set.returns.get(id as ReturnBusId);
  return set.master;
}

/**
 * Fill `out` with the reading at `output.playedFrames()` for one point.
 * False when no attempt is active, the output has no played clock, the point
 * is unknown, or no reading covers the frame yet.
 */
export function readCurrent(kind: MeterPointKind, id: MeterPointId, out: MeterReading): boolean {
  const active = attempt;
  if (active === null) return false;
  const played = active.output.playedFrames;
  if (typeof played !== "function") return false;
  const point = pointOf(active.meterSet, kind, id);
  if (point === undefined) return false;
  return point.ring.readAt(played(), out);
}
