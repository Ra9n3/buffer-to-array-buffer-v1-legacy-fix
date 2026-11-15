// Stage 2 — the meter display: the pure ballistics (T1–T3), the store's
// write-on-change, idle and latch-clear rules (T4–T6). Everything here is
// deterministic: fixed blocks, synthetic frame timestamps, a hand-driven
// transport status through the real transport store, and manual frames
// through the exported frame step (there is no rAF under Node — the loop
// never self-schedules here, exactly as the store documents).
import test from "node:test";
import assert from "node:assert/strict";

const { LED_FLOOR_DB, LED_FALL_DB_PER_SECOND, VU_FALL_TAU_SECONDS, stepClip, stepLed, stepNeedle } = await import(
  "../src/lib/metering/meter-display.ts"
);
const { VU_FLOOR_DB, MeterSet } = await import("../src/lib/engine/metering.ts");
const { clearAttempt, registerAttempt } = await import("../src/lib/metering/meter-bus.ts");
const { advanceMeterFrame, meterLoop, meterView } = await import("../src/lib/metering/meter-store.svelte.ts");
const { transport } = await import("../src/lib/playback/store.svelte.ts");

const SR = 48000;
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/* --- T1–T3: the pure ballistics ------------------------------------------------- */

test("T1 stepNeedle: a rising target is followed instantly; a fall reaches within 1 dB of the floor in 2 s, monotonically, never below it", () => {
  assert.equal(stepNeedle(-10, -3, 0.016, VU_FLOOR_DB), -3, "a rise is instant — the engine owns the up-ballistics");
  assert.equal(stepNeedle(-3, -3, 0.016, VU_FLOOR_DB), -3, "an equal target is a no-op");
  let value = -3;
  let previous = value;
  let monotonic = true;
  for (let frame = 0; frame < Math.round(2.0 / 0.016); frame++) {
    value = stepNeedle(value, VU_FLOOR_DB, 0.016, VU_FLOOR_DB);
    if (value > previous) monotonic = false;
    previous = value;
    assert.ok(value >= VU_FLOOR_DB, `never below the floor (frame ${frame}: ${value})`);
  }
  assert.ok(monotonic, "the fall is monotonic");
  assert.ok(Math.abs(value - VU_FLOOR_DB) <= 1, `within 1 dB of the floor after 2.0 s (got ${value})`);
  // The law itself: one 45 ms-equivalent... the fall is the exponential the constant names.
  const oneStep = stepNeedle(-3, VU_FLOOR_DB, 0.03, VU_FLOOR_DB);
  const expected = -3 + (VU_FLOOR_DB - -3) * (1 - Math.exp(-0.03 / VU_FALL_TAU_SECONDS));
  assert.ok(Math.abs(oneStep - expected) < 1e-12, "the fall is the exponential at VU_FALL_TAU_SECONDS");
});

test("T2 stepLed: a higher peak shows immediately; a fall from 0 dB at dt 0.5 reads -10 dB; never below the floor", () => {
  assert.equal(stepLed(-10, -3, 0.1), -3, "a higher peak is shown immediately");
  assert.equal(stepLed(0, LED_FLOOR_DB, 0.5), -10, "falling from 0 dB for half a second reads -10 dB");
  assert.equal(stepLed(-10, LED_FLOOR_DB, 0.5), -20, `the fall is ${LED_FALL_DB_PER_SECOND} dB/s`);
  assert.equal(stepLed(LED_FLOOR_DB, LED_FLOOR_DB - 40, 0.5), LED_FLOOR_DB, "never below LED_FLOOR_DB");
});

test("T3 stepClip: the latch stays set after over returns to false, until the plain-assignment clear", () => {
  assert.equal(stepClip(false, false), false, "no over, no latch");
  let latched = stepClip(false, true);
  assert.equal(latched, true, "over latches");
  assert.equal(stepClip(latched, false), true, "the latch survives over going away");
  latched = false; // the separate clear the spec names: a plain assignment to false
  assert.equal(latched, false);
  assert.equal(stepClip(latched, false), false, "and stays clear while over stays false");
});

/* --- the store's world: the fixture session's points, a hand-driven transport ---- */

const { loadFixtureSession } = await import("./fixture-session.mjs");
loadFixtureSession();
const { project } = await import("../src/lib/project/store.svelte.ts");

/** A hand on the transport's status: the facade's own attach path, no playback machinery. */
let pushStatus = null;
const detachTransport = transport.attach({
  subscribe(update) {
    pushStatus = update;
    return () => {};
  },
  play: async () => {},
  pause() {},
  stop() {},
  seek() {},
  setSource() {},
  render: async () => {},
  clearMix() {},
  syncPosition() {},
  refreshDuration: async () => {},
  positionFramesNow() { return 0; },
  togglePlay() {},
  playbackStats() { return null; },
});

/** A registered attempt whose track-01 ring holds one reading of `amplitude`. */
function attemptWithTrackReading(amplitude) {
  const meters = new MeterSet(project, SR);
  const point = meters.tracks.get("track-01");
  const block = [new Float32Array(1024), new Float32Array(1024)];
  for (let c = 0; c < 2; c++) block[c].fill(amplitude);
  point.meter.process(block, 1024);
  registerAttempt(meters, { playedFrames: () => 0 });
  return meters;
}

/** Count how many times each field of a view CHANGED across a driving function. */
function countChanges(view, drive) {
  const before = { vuL: view.vuL, vuR: view.vuR, led: view.led, clip: view.clip };
  const changes = { vuL: 0, vuR: 0, led: 0, clip: 0 };
  drive(() => {
    for (const field of ["vuL", "vuR", "led", "clip"]) {
      if (view[field] !== before[field]) {
        changes[field] += 1;
        before[field] = view[field];
      }
    }
  });
  return changes;
}

test("T4 write-on-change: the same reading fed 100 times writes each field exactly once", async () => {
  const meters = attemptWithTrackReading(0.5); // peak -6.02 dB, no over — one constant first reading
  const view = meterView("track", "track-01");
  pushStatus({ status: "playing" });
  await tick(); // the watcher starts the loop (and clears latches — none yet)
  assert.equal(meterLoop.running, true, "the loop is running while playing");

  let frame = 0;
  const changes = countChanges(view, (observe) => {
    for (let i = 0; i < 100; i++) {
      advanceMeterFrame(frame);
      frame += 100; // 0.1 s steps, at the cap
      observe();
    }
  });
  assert.equal(changes.vuL, 1, `vuL written once (was ${changes.vuL})`);
  assert.equal(changes.vuR, 1, `vuR written once (was ${changes.vuR})`);
  assert.equal(changes.led, 1, `led written once (was ${changes.led})`);
  assert.equal(changes.clip, 0, "clip never written — nothing clipped");
  // And the values are the reading's own: peak -6.02 quantises to the -6 rung.
  assert.equal(view.led, -6, "the LED shows the reading's peak on the ladder's own scale");
  clearAttempt(meters);
  pushStatus({ status: "stopped" });
  await tick();
});

test("T5 idle: after a stop everything falls to its floor and the loop reports itself stopped", async () => {
  // Values are up from T4's attempt; re-register so the fall is measured, then stop.
  const meters = attemptWithTrackReading(0.5);
  pushStatus({ status: "playing" });
  await tick();
  let frame = 0;
  advanceMeterFrame(frame);
  frame += 100;
  const view = meterView("track", "track-01");
  assert.ok(view.vuL > VU_FLOOR_DB, "playing: the needle is up");

  pushStatus({ status: "stopped" });
  await tick();
  assert.equal(transport.status, "stopped");
  for (let i = 0; i < 60 && meterLoop.running; i++) {
    advanceMeterFrame(frame);
    frame += 100;
  }
  assert.equal(meterLoop.running, false, "the loop reports itself stopped once everything is at floor");
  assert.equal(view.vuL, VU_FLOOR_DB, "the needle reached its floor");
  assert.equal(view.led, LED_FLOOR_DB, "the LED reached its floor");
  const frozenAt = { vuL: view.vuL, led: view.led };
  advanceMeterFrame(frame); // a stray frame at rest changes nothing
  assert.equal(view.vuL, frozenAt.vuL);
  assert.equal(view.led, frozenAt.led);
  clearAttempt(meters);
});

test("T6 the clear rule: a new attempt from stopped clears the latches; a pause-resume does not", async () => {
  // A clipping first reading, from stopped: the latch takes.
  const loud = attemptWithTrackReading(1.0);
  pushStatus({ status: "playing" }); // stopped -> playing: a NEW attempt (latches cleared, none yet)
  await tick();
  let frame = 0;
  advanceMeterFrame(frame);
  frame += 100;
  const view = meterView("track", "track-01");
  assert.equal(view.clip, true, "over latched the PEAK lamp");
  assert.equal(view.led, 0, "the LED shows the 0 dB clip on the top rung");

  // Pause and resume: the latch survives — and survives the reading going away too.
  clearAttempt(loud);
  pushStatus({ status: "paused" });
  await tick();
  pushStatus({ status: "playing" }); // paused -> playing: a resume, NOT a clear
  await tick();
  advanceMeterFrame(frame);
  frame += 100;
  assert.equal(view.clip, true, "a pause-resume does not clear the latch");

  // Stop, then play again: a new attempt from stopped — every latch lets go.
  pushStatus({ status: "stopped" });
  await tick();
  pushStatus({ status: "playing" }); // stopped -> playing: the clear
  await tick();
  advanceMeterFrame(frame);
  frame += 100;
  assert.equal(view.clip, false, "a new attempt from stopped cleared the latch");
  pushStatus({ status: "stopped" });
  await tick();
  clearAttempt();
  detachTransport();
});
