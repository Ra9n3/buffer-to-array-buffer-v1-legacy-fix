/**
 * ALLOY — the meter display store (Stage 2, Step 2).
 *
 * One store between the engine's live readings (Stage 1's meter bus) and the
 * on-screen instruments: the master VU needles, every strip's LED column and
 * every track's PEAK lamp read ONLY this. It owns no audio, runs no engine,
 * writes nothing into the project store (meter display state is its own state
 * — no history, no autosave, no undo entries) and adds nothing to
 * window.alloy.
 *
 * THE POINTS are the project's current channels — `project.tracks`,
 * `project.buses` and `project.returns` of the shared project store, plus
 * master — read afresh each frame so the store follows the open project. The
 * READINGS come only from `readCurrent` (the meter bus): never the project
 * store, never the engine. The TRANSPORT's `status` decides whether a point's
 * reading is live (status "playing") or must fall to its floor — a stop or a
 * pause does not freeze anything, everything falls smoothly.
 *
 * THE BALLISTICS are the display's own (meter-display.ts): a needle follows a
 * rising reading instantly (the engine's detector already applied the VU's
 * real ballistics) and falls at VU_FALL_TAU_SECONDS; an LED column shows a
 * higher peak immediately and falls at LED_FALL_DB_PER_SECOND; a clip latches
 * until a new attempt from stopped clears it. Pause, resume, seek and loop
 * restarts never clear a latch.
 *
 * WRITES. What the components see is one `$state` view per point — vu L/R,
 * LED dB, clip — written ONLY when the DISPLAYED value changed: needle values
 * rounded to 0.1 dB, LED values rounded to the strip ladder's nearest segment
 * (the component's own scale, strip-meter-scale.ts — no scale invented here),
 * clip only on change. The frame loop allocates nothing: one reusable
 * MeterReading, per-point state objects created once on first sight.
 *
 * THE LOOP. One requestAnimationFrame loop for the whole app, started when
 * playback starts (any transition into "playing" — the transport store's
 * reactive status, watched from a module-owned $effect.root; the app has no
 * event for "playback started", it has this signal) and stopped when the
 * transport is not playing AND every displayed value has reached its floor.
 * In a non-browser host (the Node test suite) there is no rAF; the frame step
 * is exported so tests can drive it, and the loop simply never self-schedules.
 */

import { STRIP_METER_SCALE } from "../../components/hardware/strip-meter-scale";
import { VU_FLOOR_DB, newMeterReading, type MeterReading } from "../engine/metering";
import { transport } from "../playback/store.svelte";
import type { TransportStatus } from "../playback/types";
import { project } from "../project/store.svelte";
import type { BusId, ReturnBusId, TrackId } from "../project/model";
import { LED_FLOOR_DB, stepClip, stepLed, stepNeedle } from "./meter-display";
import { readCurrent, type MeterPointId, type MeterPointKind } from "./meter-bus";

/** What one point's instruments show — the DISPLAYED values, reactive. */
export interface MeterDisplayState {
  /** The left needle, dB VU, rounded to 0.1 (the master pair's left card). */
  vuL: number;
  /** The right needle, dB VU, rounded to 0.1 (the master pair's right card). */
  vuR: number;
  /** The LED column, dB, quantised to the strip ladder's nearest segment. */
  led: number;
  /** The clip latch — the PEAK lamp. */
  clip: boolean;
}

/**
 * A point's display view, for a component that shows it. The view starts at
 * rest (floor values, nothing lit) and is the SAME object the frame loop
 * writes; reading its fields from a template is reactive per field. The point
 * list itself is the project's, so a component may ask for any point it is
 * given — the loop only ever writes points the current project still has.
 */
export function meterView(kind: MeterPointKind, id: MeterPointId): MeterDisplayState {
  const key = `${kind}:${id}`;
  let view = displays[key];
  if (view === undefined) {
    displays[key] = { vuL: VU_FLOOR_DB, vuR: VU_FLOOR_DB, led: LED_FLOOR_DB, clip: false };
    view = displays[key];
  }
  return view;
}

/* --- the state ------------------------------------------------------------------ */

/** One `$state` record keyed `${kind}:${id}` — written only on change. */
const displays = $state<Record<string, MeterDisplayState>>({});

/**
 * One point's raw (unrounded) state, stepped every frame — plain fields, not
 * reactive: only the quantised values above are ever shown. `view` is the
 * point's `$state` proxy, held so the frame loop writes without building a
 * key string per frame.
 */
interface PointSim {
  vuL: number;
  vuR: number;
  led: number;
  clip: boolean;
  readonly view: MeterDisplayState;
}

const trackSims = new Map<TrackId, PointSim>();
const busSims = new Map<BusId, PointSim>();
const returnSims = new Map<ReturnBusId, PointSim>();
let masterSim: PointSim | null = null;

function newSim(kind: MeterPointKind, id: MeterPointId): PointSim {
  return { vuL: VU_FLOOR_DB, vuR: VU_FLOOR_DB, led: LED_FLOOR_DB, clip: false, view: meterView(kind, id) };
}

function ensureTrackSim(id: TrackId): PointSim {
  let sim = trackSims.get(id);
  if (sim === undefined) {
    sim = newSim("track", id);
    trackSims.set(id, sim);
  }
  return sim;
}

function ensureBusSim(id: BusId): PointSim {
  let sim = busSims.get(id);
  if (sim === undefined) {
    sim = newSim("bus", id);
    busSims.set(id, sim);
  }
  return sim;
}

function ensureReturnSim(id: ReturnBusId): PointSim {
  let sim = returnSims.get(id);
  if (sim === undefined) {
    sim = newSim("return", id);
    returnSims.set(id, sim);
  }
  return sim;
}

/* --- the frame ------------------------------------------------------------------ */

/** The one reusable reading — the read loop allocates nothing (Step 2, rule 6). */
const reading: MeterReading = newMeterReading();

/** The largest frame step the ballistics will accept (a background tab's frame). */
const MAX_DT_SECONDS = 0.1;

let lastMs: number | null = null;
let loopRunning = false;
let frameScheduled = false;

/**
 * The LED value rounded to the strip ladder's nearest segment — the
 * component's own scale, so two readings that light the same segments are one
 * displayed value (and one write). Below the ladder's first threshold nothing
 * is lit and the value is the LED floor; ties between neighbouring segments
 * round to the LOWER one (the conservative side — no segment lights early).
 */
function quantizeLed(db: number): number {
  const scale = STRIP_METER_SCALE;
  if (db < scale[0].db) return LED_FLOOR_DB;
  let best = scale[0].db;
  let bestDistance = Math.abs(db - best);
  for (let i = 1; i < scale.length; i++) {
    const distance = Math.abs(db - scale[i].db);
    if (distance < bestDistance) {
      best = scale[i].db;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One point, one frame: read (or fall to floor), step, write only what
 * changed. Returns whether the point's displayed values are ALL at rest.
 */
function stepPoint(sim: PointSim, kind: MeterPointKind, id: MeterPointId, playing: boolean, dt: number): boolean {
  let vuLTarget = VU_FLOOR_DB;
  let vuRTarget = VU_FLOOR_DB;
  let ledTarget = LED_FLOOR_DB;
  let over = false;
  if (playing && readCurrent(kind, id, reading)) {
    vuLTarget = reading.vuL;
    vuRTarget = reading.vuR;
    ledTarget = reading.peakLDb > reading.peakRDb ? reading.peakLDb : reading.peakRDb;
    over = reading.over;
  }
  sim.vuL = stepNeedle(sim.vuL, vuLTarget, dt, VU_FLOOR_DB);
  sim.vuR = stepNeedle(sim.vuR, vuRTarget, dt, VU_FLOOR_DB);
  sim.led = stepLed(sim.led, ledTarget, dt);
  sim.clip = stepClip(sim.clip, over);
  const vuL = Math.round(sim.vuL * 10) / 10;
  const vuR = Math.round(sim.vuR * 10) / 10;
  const led = quantizeLed(sim.led);
  const view = sim.view;
  if (view.vuL !== vuL) view.vuL = vuL;
  if (view.vuR !== vuR) view.vuR = vuR;
  if (view.led !== led) view.led = led;
  if (view.clip !== sim.clip) view.clip = sim.clip;
  return vuL === VU_FLOOR_DB && vuR === VU_FLOOR_DB && led === LED_FLOOR_DB;
}

/**
 * Advance every point one frame. `nowMs` is the frame timestamp (rAF's in the
 * browser, synthetic in the tests); the elapsed time is capped at
 * MAX_DT_SECONDS. When the transport is not playing and every displayed value
 * has reached its floor the loop reports itself stopped — the clip latches
 * are not floor values and do not hold it open.
 */
export function advanceMeterFrame(nowMs: number): void {
  // dt is clamped to [0, MAX_DT_SECONDS]: a repeated or backwards timestamp
  // (possible only through the exported test entry — rAF is monotonic) is no
  // time at all, never a negative step the ballistics do not know how to take.
  const dt = lastMs === null ? 0 : Math.min(MAX_DT_SECONDS, Math.max(0, (nowMs - lastMs) / 1000));
  lastMs = nowMs;
  const playing = transport.status === "playing";
  let settled = true;
  for (const track of project.tracks) {
    const sim = ensureTrackSim(track.id);
    if (!stepPoint(sim, "track", track.id, playing, dt)) settled = false;
  }
  for (const bus of project.buses) {
    const sim = ensureBusSim(bus.id);
    if (!stepPoint(sim, "bus", bus.id, playing, dt)) settled = false;
  }
  for (const ret of project.returns) {
    const sim = ensureReturnSim(ret.id);
    if (!stepPoint(sim, "return", ret.id, playing, dt)) settled = false;
  }
  if (masterSim === null) masterSim = newSim("master", "master");
  if (!stepPoint(masterSim, "master", "master", playing, dt)) settled = false;
  if (!playing && settled) stopLoop();
}

/* --- the loop ------------------------------------------------------------------- */

function scheduleFrame(): void {
  if (frameScheduled) return;
  frameScheduled = true;
  requestAnimationFrame(frame);
}

function frame(nowMs: number): void {
  frameScheduled = false;
  advanceMeterFrame(nowMs);
  if (loopRunning) scheduleFrame();
}

function startLoop(): void {
  if (loopRunning) return;
  loopRunning = true;
  lastMs = null;
  if (typeof requestAnimationFrame === "function") scheduleFrame();
}

function stopLoop(): void {
  loopRunning = false;
  lastMs = null;
}

/** Whether the one rAF loop is running — false once everything is at rest. */
export const meterLoop = {
  get running(): boolean {
    return loopRunning;
  },
} as const;

/* --- the latch clear and the playback watcher ------------------------------------ */

function clearSimClip(sim: PointSim): void {
  sim.clip = false; // the plain assignment the spec names (Step 1)
  if (sim.view.clip) sim.view.clip = false;
}

/** A new attempt from stopped: every latch lets go. */
function clearAllClips(): void {
  for (const sim of trackSims.values()) clearSimClip(sim);
  for (const sim of busSims.values()) clearSimClip(sim);
  for (const sim of returnSims.values()) clearSimClip(sim);
  if (masterSim !== null) clearSimClip(masterSim);
}

/**
 * The playback watcher. The app has no "playback started" event; it has the
 * transport store's reactive `status`, watched here from a module-owned
 * $effect.root (the playhead store's own pattern). Any transition into
 * "playing" starts the loop; a transition from "stopped" or "error" into it
 * is a NEW ATTEMPT and clears every clip latch first. A pause-resume is
 * "paused" → "playing" and clears nothing; a seek or a loop restart does not
 * change the status at all and clears nothing.
 */
let seenStatus: TransportStatus | null = null;
$effect.root(() => {
  $effect(() => {
    const status = transport.status;
    if (status === "playing") {
      if (seenStatus === null || seenStatus === "stopped" || seenStatus === "error") clearAllClips();
      startLoop();
    }
    seenStatus = status;
  });
});
