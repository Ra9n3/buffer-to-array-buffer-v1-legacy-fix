// Task 10.1 — the playhead and transport scrolling. Three layers, each tested
// at its own level: the transport controller's §3 semantics (stop, the two
// Stop preferences, lastPlaybackStartPosition, the loop wrap and its restart
// guard), the pure follow engine's §4/§7 geometry, and the playhead module's
// §13 per-panel state with its §5 auto-resume rule. Deterministic synthetic
// sources; the clock is the test's hand. No Web Audio or DOM is required.
import { test } from "node:test";
import assert from "node:assert/strict";

const { PlaybackController } = await import("../src/lib/playback/controller.ts");
const { followTarget, effectiveFollowMode, isReposition, FOLLOW_MODES, FOLLOW_TRIGGER_POINTS } = await import("../src/lib/playback/follow.ts");
const { transport } = await import("../src/lib/playback/store.svelte.ts");
const { playhead } = await import("../src/lib/playback/playhead.svelte.ts");
const { barsToSeconds, secondsToBars } = await import("../src/lib/arrange-audio.ts");
const { createSessionProject } = await import("../src/lib/project/session.ts");

const SR = 48000;

/* --- the shared fixtures ------------------------------------------------------ */

function projectOf() {
  const project = createSessionProject();
  // One audible track is enough: this suite only asks where the playhead is,
  // never what it sounds like, and openSources is replaced per controller.
  project.tracks.length = 1;
  const track = project.tracks[0];
  track.channel.mute = false;
  track.output = "master";
  return project;
}

/** A source of 240 frames of near-silence — the session reads it, never blocks. */
function silentSource() {
  return {
    sampleRate: SR,
    frames: 240,
    read(frameStart, target, count) {
      for (let c = 0; c < 2; c++) for (let i = 0; i < count; i++) target[c][i] = 0.001;
      return count;
    },
    close() {},
  };
}

function sourcesOf(project) {
  return new Map([[project.tracks[0].id, silentSource()]]);
}

/**
 * The clock is the test's hand: `heard(frame)` says how far the audio has
 * actually been heard — exactly what the Web Audio clock reports in the
 * browser. `drain()` holds the attempt open (so "while playing" is a state
 * the test owns) until the test finishes it or a stop releases it.
 */
function handClockOutput() {
  let position = 0;
  let drainDone = null;
  const chunks = [];
  const release = () => { drainDone?.(); drainDone = null; };
  return {
    sampleRate: SR,
    chunks,
    begin(startFrame) { chunks.length = 0; position = startFrame; },
    async write(chunk) { chunks.push({ startFrame: chunk.startFrame, frames: chunk.frames }); },
    positionFrames() { return position; },
    async drain() { await new Promise((resolve) => { drainDone = resolve; }); },
    heard(frame) { position = frame; },
    endDrain: release,
    stop: release,
  };
}

const clock = {
  schedule: () => () => {},
  yieldBetween: async () => {},
  now: () => "14:02",
};

function controllerFor(output, options = {}) {
  return new PlaybackController({
    getProject: () => projectOf(),
    openSources: options.openSources ?? (async () => sourcesOf(projectOf())),
    output,
    clock,
    chunkFrames: 16,
    tailSeconds: 0,
    stopBehaviour: options.stopBehaviour,
    loop: options.loop,
  });
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/* --- §3: stop, pause, and the two Stop preferences ----------------------------- */

test("§3 · the default Stop freezes at the stopped position; Play resumes from there", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  const playing = controller.play();
  await tick();
  assert.equal(controller.getState().status, "playing");
  assert.equal(controller.getState().stoppedPosition, null, "nothing has stopped yet");

  output.heard(50);
  controller.stop();
  await playing;
  const state = controller.getState();
  assert.equal(state.status, "stopped");
  assert.equal(state.positionFrames, 50, "the playhead stays where the audio stopped");
  assert.equal(state.stoppedPosition, 50, "and that is the recorded stopped position");
  assert.equal(state.startFrame, 0, "the fresh start was frame 0 and no Stop rewrites it");

  // Play resumes from the stopped position (§3) — and a resume-from-stopped
  // is itself a fresh start, so it becomes the new lastPlaybackStartPosition.
  const again = controller.play();
  await tick();
  assert.equal(controller.getState().status, "playing");
  assert.equal(output.chunks[0].startFrame, 50, "the new attempt begins at 50");
  assert.equal(controller.getState().startFrame, 50);
  output.endDrain();
  await again;
  controller.dispose();
});

test("§3 · Pause freezes at the clock and never moves lastPlaybackStartPosition", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  controller.seek(30);
  const playing = controller.play();
  await tick();
  assert.equal(controller.getState().startFrame, 30);
  output.heard(70);
  controller.pause();
  await playing;
  assert.equal(controller.getState().status, "paused");
  assert.equal(controller.getState().positionFrames, 70);
  assert.equal(controller.getState().startFrame, 30, "a pause is a non-event for the start memory");

  // Resuming continues from the frozen position; the start memory is untouched.
  const resumed = controller.play();
  await tick();
  assert.equal(controller.getState().status, "playing");
  assert.equal(output.chunks[0].startFrame, 70);
  assert.equal(controller.getState().startFrame, 30, "a resume is not a restart");

  // The resumed run reaches 120 on the clock; another pause freezes there.
  output.heard(120);
  controller.pause();
  await resumed;
  assert.equal(controller.getState().status, "paused");
  assert.equal(controller.getState().positionFrames, 120);

  // Stop while paused: still a stop — the held position is the freeze point.
  controller.stop();
  assert.equal(controller.getState().status, "stopped");
  assert.equal(controller.getState().positionFrames, 120);
  assert.equal(controller.getState().stoppedPosition, 120);
  controller.dispose();
});

test("§3 · Return-to-start-on-stop returns the playhead to the last fresh start", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output, {
    stopBehaviour: () => ({ returnToStartOnStop: true, secondStopReturnsToStart: false }),
  });
  controller.seek(30);
  const playing = controller.play();
  await tick();
  output.heard(110);
  controller.stop();
  await playing;
  const state = controller.getState();
  assert.equal(state.positionFrames, 30, "the playhead returns to the last fresh start");
  assert.equal(state.stoppedPosition, 110, "the stopped position still records where the audio stopped");
  assert.equal(state.startFrame, 30, "and Stop never rewrites the start memory");
  // Play picks up from where the playhead now is — the last fresh start.
  const again = controller.play();
  await tick();
  assert.equal(output.chunks[0].startFrame, 30);
  output.endDrain();
  await again;
  controller.dispose();
});

test("§3 · the second Stop returns to the start only with the preference", async () => {
  const output = handClockOutput();
  const plain = controllerFor(output);
  plain.seek(30);
  const first = plain.play();
  await tick();
  output.heard(110);
  plain.stop();
  await first;
  plain.stop();
  assert.equal(plain.getState().positionFrames, 110, "without the preference, the second Stop is a no-op");
  plain.dispose();

  const secondOutput = handClockOutput();
  const twice = controllerFor(secondOutput, {
    stopBehaviour: () => ({ returnToStartOnStop: false, secondStopReturnsToStart: true }),
  });
  twice.seek(30);
  const second = twice.play();
  await tick();
  secondOutput.heard(110);
  twice.stop();
  await second;
  assert.equal(twice.getState().positionFrames, 110, "the first Stop still freezes");
  assert.equal(twice.getState().stoppedPosition, 110);
  twice.stop();
  assert.equal(twice.getState().positionFrames, 30, "the second Stop returns to the last fresh start");
  assert.equal(twice.getState().stoppedPosition, 110, "the recorded stop is not rewritten by the return");
  twice.dispose();
});

test("§2/§8 · lastPlaybackStartPosition: a fresh start records, a locate while playing re-records", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  controller.seek(30);
  const first = controller.play();
  await tick();
  assert.equal(controller.getState().startFrame, 30);
  controller.stop();
  await first;

  // A seek while stopped moves the playhead only; the memory keeps 30.
  controller.seek(80);
  assert.equal(controller.getState().positionFrames, 80);
  assert.equal(controller.getState().startFrame, 30);
  // A seek while PLAYING is a relocate: playback continues from the new
  // position and the new position becomes the memory (§8).
  const playing = controller.play();
  await tick();
  controller.seek(140);
  await tick();
  assert.equal(controller.getState().status, "playing");
  assert.equal(controller.getState().startFrame, 140);
  assert.equal(output.chunks[0].startFrame, 140, "playback continued from the new position");
  output.endDrain();
  await playing;
  controller.dispose();
});

test("§11 · the natural end stops at the project's end and Play replays from the last fresh start", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  controller.seek(60);
  const playing = controller.play();
  await tick();
  // The source runs out; the drain holds until the test ends it.
  output.endDrain();
  await playing;
  const state = controller.getState();
  assert.equal(state.status, "stopped");
  assert.equal(state.positionFrames, 240, "the playhead is left at the end, visible");
  assert.equal(state.stoppedPosition, 240);
  assert.equal(state.startFrame, 60);
  // Play at the end replays from the last fresh start (§3's restart).
  const again = controller.play();
  await tick();
  assert.equal(output.chunks[0].startFrame, 60, "the replay begins at the last fresh start");
  output.endDrain();
  await again;
  controller.dispose();
});

/* --- §7: loop wrap, and the restart guard -------------------------------------- */

test("§7 · the playhead wraps to the loop start, and the wrap never rewrites the start memory", async () => {
  const output = handClockOutput();
  let region = { startFrame: 40, endFrame: 120 };
  const controller = controllerFor(output, { loop: () => region });
  controller.seek(30);
  const playing = controller.play();
  await tick();
  assert.equal(controller.getState().startFrame, 30);

  // The clock passes the loop end; the 50 ms poll (here, the test's call)
  // wraps the attempt back to the loop start.
  output.heard(130);
  controller.syncPosition();
  const state = controller.getState();
  assert.equal(state.status, "playing");
  assert.equal(state.positionFrames, 40, "the playhead is at the loop start");
  assert.equal(state.startFrame, 30, "a wrap is not a locate: the memory keeps the user's start");
  assert.equal(controller.positionFramesNow(), 40);

  // The region can be cleared and the wrap stops firing — after the wrapped
  // attempt has BEGUN (the wrap's restart is async; the poll holds through
  // the gap, so the position only moves once the new attempt is live).
  await tick();
  region = null;
  output.heard(200);
  controller.syncPosition();
  assert.equal(controller.getState().positionFrames, 200);
  output.endDrain();
  await playing;
  controller.dispose();
});

test("§7 · the wrap's async gap never blips the playhead to the dead clock", async () => {
  const output = handClockOutput();
  let region = { startFrame: 40, endFrame: 120 };
  const project = projectOf();
  // openSources holds the NEW attempt in the gap: the output is already
  // stopped and its clock reads 0 — the exact window the guard exists for.
  // ONE shared deferred promise, so every call (the aborted one included)
  // is released by the same gate and nothing awaits forever.
  let openGate = null;
  const sourcesPromise = new Promise((resolve) => { openGate = resolve; }).then(async () => sourcesOf(project));
  const controller = controllerFor(output, {
    loop: () => region,
    openSources: () => sourcesPromise,
  });
  const playing = controller.play();
  await tick();
  output.heard(130);
  controller.syncPosition();
  assert.equal(controller.getState().positionFrames, 40, "the wrap landed the playhead at the loop start");

  // The poll fires inside the gap. Without the guard, the dead clock (0)
  // would yank the playhead to the project start for the gap's length.
  output.heard(0);
  controller.syncPosition();
  assert.equal(controller.getState().positionFrames, 40, "the poll holds the target through the gap");
  assert.equal(controller.positionFramesNow(), 40, "and so does the live read the panel draws");

  openGate();
  await tick();
  assert.equal(controller.getState().status, "playing");
  assert.equal(output.chunks[0].startFrame, 40, "the wrapped attempt begins at the loop start");
  output.endDrain();
  await playing;
  controller.dispose();
});

test("§7 · setLoop validates; a wrap point past the playable duration is clamped to it", async () => {
  assert.throws(() => playhead.setLoop(120, 120), /invalid loop region/);
  assert.throws(() => playhead.setLoop(130, 120), /invalid loop region/);
  assert.throws(() => playhead.setLoop(-1, 120), /invalid loop region/);
  playhead.setLoop(40, 4000);
  assert.deepEqual(playhead.activeLoopRegion, { startFrame: 40, endFrame: 4000 });
  playhead.clearLoop();
  assert.equal(playhead.activeLoopRegion, null);

  const output = handClockOutput();
  const region = { startFrame: 40, endFrame: 4000 };
  const controller = controllerFor(output, { loop: () => region });
  const playing = controller.play();
  await tick();
  output.heard(300);
  controller.syncPosition();
  // endFrame 4000 is clamped to the duration 240: the wrap fires there.
  assert.equal(controller.getState().positionFrames, 40);
  output.endDrain();
  await playing;
  controller.dispose();
});

/* --- §1: the live position ------------------------------------------------------ */

test("§1 · positionFramesNow reads the engine's clock while playing and the held position otherwise", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  assert.equal(controller.positionFramesNow(), 0);
  const playing = controller.play();
  await tick();
  output.heard(83);
  assert.equal(controller.positionFramesNow(), 83, "the line draws the engine's own clock, never a timer's guess");
  controller.pause();
  await playing;
  assert.equal(controller.positionFramesNow(), 83, "paused: the held position");
  controller.seek(17);
  assert.equal(controller.positionFramesNow(), 17);
  controller.dispose();
});

/* --- the pure follow engine (§4/§7/§12) ------------------------------------------- */

test("§4 · smooth follow holds left of the trigger line and tracks at and past it", () => {
  const win = { scrollLeft: 0, viewW: 1000, maxScroll: 1500 };
  assert.equal(followTarget("smooth", 0.75, 700, win, null), null, "left of 75%: the view stays put");
  assert.equal(followTarget("smooth", 0.75, 749, win, null), null);
  assert.equal(followTarget("smooth", 0.75, 750, win, null), 0, "exactly at the line: the target is the current offset — no jump");
  assert.equal(followTarget("smooth", 0.75, 900, win, null), 150, "past the line: the playhead is held at 75%");
  assert.equal(followTarget("smooth", 0.75, 1300, win, null), 550, "deep past the line, still held at 75%");
  // Off-window left (a wrap landed behind the view): brought back, not lost.
  assert.equal(followTarget("smooth", 0.75, 5, { scrollLeft: 900, viewW: 1000, maxScroll: 1500 }, null), 0, "brought back to the window's left edge, clamped to the scroller's bounds");
  assert.equal(followTarget("smooth", 0.75, 1499, win, null), 749, "a target under maxScroll is exact");
  assert.equal(followTarget("smooth", 0.75, 2400, win, null), 1500, "a target past maxScroll clamps to it");
  assert.equal(followTarget("smooth", 0.75, 100, { scrollLeft: 0, viewW: 0, maxScroll: 0 }, null), null, "no visible timeline: no follow");
});

test("§4 · off never scrolls; page snaps on exit; centered and stationary always track", () => {
  const win = { scrollLeft: 0, viewW: 1000, maxScroll: 1500 };
  assert.equal(followTarget("off", 0.75, 1400, win, null), null);
  assert.equal(followTarget("page", 0.75, 999, win, null), null, "page holds while the playhead is anywhere in the window");
  assert.equal(followTarget("page", 0.75, 1001, win, null), 1001, "on exit it snaps the playhead to the window's left edge — one full view");
  assert.equal(followTarget("centered", 0.5, 400, win, null), 0, "centered at 0.50 by definition, clamped to the scroller's bounds");
  assert.equal(followTarget("centered", 0.75, 400, win, null), 0, "the trigger setting does not move centered off 0.50");
  assert.equal(followTarget("stationary", 0.75, 100, win, null), 0, "stationary: the line stands at the trigger, clamped to the bounds");
  assert.equal(followTarget("stationary", 0.75, 900, { ...win, scrollLeft: 500 }, null), 150, "always tracking: never a hold");
});

test("§7 · a loop that fits on screen holds every mode; a loop longer than the window follows the mode", () => {
  const win = { scrollLeft: 0, viewW: 1000, maxScroll: 4000 };
  const fits = { startT: 500, endT: 900 };
  assert.equal(followTarget("smooth", 0.75, 700, win, fits), null, "no page movement over an on-screen loop");
  assert.equal(followTarget("centered", 0.5, 700, win, fits), null);
  assert.equal(followTarget("stationary", 0.75, 700, win, fits), null);
  assert.equal(followTarget("page", 0.75, 700, win, fits), null);
  const longer = { startT: 200, endT: 2500 };
  assert.equal(followTarget("smooth", 0.75, 700, win, longer), null, "the mode behaves as configured when the loop is wider than the view");
  assert.equal(followTarget("smooth", 0.75, 2600, { ...win, scrollLeft: 1200 }, longer), 1850, "a wrap behind the view is brought back");
});

test("§10/§12 · the recording remap and the reposition threshold", () => {
  assert.equal(effectiveFollowMode("smooth"), "smooth");
  assert.equal(effectiveFollowMode("smooth", { recording: true, stationaryWhileRecording: false }), "smooth");
  assert.equal(effectiveFollowMode("smooth", { recording: true, stationaryWhileRecording: true }), "stationary", "the §10 preference overrides the panel's mode while recording");
  assert.equal(isReposition(400, 1000), false, "a small correction tracks exactly");
  assert.equal(isReposition(600, 1000), true, "a large one eases in");
  assert.equal(isReposition(130, 200), true, "the floor keeps small windows honest");
  assert.deepEqual([...FOLLOW_MODES], ["off", "page", "smooth", "centered", "stationary"]);
  assert.deepEqual([...FOLLOW_TRIGGER_POINTS], [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]);
});

/* --- §13: the per-panel state, and §5's auto-resume ------------------------------ */

test("§13 · each panel keeps its own follow; a panel that never chose reads the defaults", () => {
  assert.deepEqual(playhead.followOf("alpha"), { mode: "smooth", trigger: 0.75, suspended: false, reason: null }, "the Settings defaults (§14)");
  playhead.setFollowMode("alpha", "page");
  playhead.setFollowTrigger("alpha", 0.5);
  assert.deepEqual(playhead.followOf("alpha"), { mode: "page", trigger: 0.5, suspended: false, reason: null });
  assert.deepEqual(playhead.followOf("beta"), { mode: "smooth", trigger: 0.75, suspended: false, reason: null }, "one panel's choice never reaches another");
  playhead.suspendFollow("beta", "manual-scroll");
  assert.deepEqual(playhead.followOf("beta"), { mode: "smooth", trigger: 0.75, suspended: true, reason: "manual-scroll" });
  playhead.suspendFollow("beta", "edit");
  assert.equal(playhead.followOf("beta").reason, "edit");
  playhead.resumeFollow("beta");
  assert.deepEqual(playhead.followOf("beta"), { mode: "smooth", trigger: 0.75, suspended: false, reason: null });
  // Choosing a mode is an explicit act on follow: it resumes (documented rule).
  playhead.suspendFollow("alpha", "manual-scroll");
  playhead.setFollowMode("alpha", "centered");
  assert.equal(playhead.followOf("alpha").suspended, false);
  assert.equal(playhead.followOf("alpha").mode, "centered");
});

test("§5 · a restart of playback resumes every panel; a pause-resume and a wrap do not", async () => {
  playhead.suspendFollow("gamma", "manual-scroll");
  playhead.suspendFollow("delta", "edit");
  const output = handClockOutput();
  const controller = controllerFor(output);
  const detach = transport.attach(controller);

  // A restart (stopped → playing) resumes every suspended panel.
  const playing = controller.play();
  await tick(10);
  assert.equal(transport.status, "playing");
  assert.equal(playhead.followOf("gamma").suspended, false, "a fresh start resumes gamma");
  assert.equal(playhead.followOf("delta").suspended, false, "and delta — the restart is panel-wide");

  // A pause-resume is paused → playing: not a restart; the suspension survives.
  playhead.suspendFollow("gamma", "manual-scroll");
  output.heard(60);
  controller.pause();
  await playing;
  const resumed = controller.play();
  await tick(10);
  assert.equal(transport.status, "playing");
  assert.equal(playhead.followOf("gamma").suspended, true, "a pause-resume is not a restart");

  // A locate while playing (§8) re-records the start and resumes.
  transport.seek(140);
  await tick(10);
  assert.equal(playhead.followOf("gamma").suspended, false, "a locate while playing resumes follow");
  output.endDrain();
  await resumed;
  detach();
  controller.dispose();

  // A wrap changes neither status nor startFrame: the suspension survives.
  const wrapOutput = handClockOutput();
  const region = { startFrame: 40, endFrame: 120 };
  const wrapController = controllerFor(wrapOutput, { loop: () => region });
  const wrapDetach = transport.attach(wrapController);
  const wrapPlaying = wrapController.play();
  await tick(10);
  playhead.suspendFollow("gamma", "manual-scroll");
  wrapOutput.heard(130);
  wrapController.syncPosition();
  await tick(10);
  assert.equal(transport.positionFrames, 40);
  assert.equal(playhead.followOf("gamma").suspended, true, "a wrap never resumes the user's suspension");
  wrapOutput.endDrain();
  await wrapPlaying;
  wrapDetach();
  wrapController.dispose();
});

test("§1 · the module's reactive list over the facade", async () => {
  const output = handClockOutput();
  const controller = controllerFor(output);
  const detach = transport.attach(controller);
  assert.equal(playhead.isPlaying, false);
  assert.equal(playhead.isPaused, false);
  assert.equal(playhead.isRecording, false, "ALLOY v1 has no recording path: the flag is the contract");
  assert.equal(playhead.lastPlaybackStartPosition, 0);
  assert.equal(playhead.stoppedPosition, null);
  assert.equal(playhead.positionFrames, 0);

  transport.seek(48);
  assert.equal(playhead.positionFrames, 48);
  assert.equal(playhead.positionFramesNow(), 48);
  const playing = transport.play();
  await tick();
  assert.equal(playhead.isPlaying, true);
  assert.equal(playhead.lastPlaybackStartPosition, 48);
  output.heard(90);
  assert.equal(playhead.positionFramesNow(), 90);
  transport.stop();
  await playing;
  assert.equal(playhead.isPlaying, false);
  assert.equal(playhead.stoppedPosition, 90);
  assert.equal(playhead.lastPlaybackStartPosition, 48, "Stop never rewrites the start memory");
  detach();
  controller.dispose();
});

/* --- the musical mapping the line and the click share ------------------------------ */

test("the frame ↔ bar mapping is mutual: a click and the line it produces are the same moment", () => {
  const markers = [
    { bar: 1, bpm: 120, signature: "4/4" },
    { bar: 41, bpm: 112 },
    { bar: 45, bpm: 120 },
    { bar: 53, bpm: 104 },
  ];
  for (const bars of [0, 4, 40, 44, 52, 55.5]) {
    const seconds = barsToSeconds(bars, markers);
    const back = secondsToBars(seconds, markers);
    assert.ok(Math.abs(back - bars) < 1e-9, `${bars} bars → ${seconds}s → ${back} bars`);
  }
  // The fixture's landmark: bar 45's start (44 bars in) is 40 bars at 120 plus
  // 4 bars at 112.
  assert.ok(Math.abs(barsToSeconds(44, markers) - (40 * 2 + 4 * (60 / 112) * 4)) < 1e-6);
  assert.equal(barsToSeconds(0, markers), 0);
  assert.equal(secondsToBars(0, markers), 0);
  assert.equal(barsToSeconds(-5, markers), 0);
  assert.equal(secondsToBars(-5, markers), 0);
});
