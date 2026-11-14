// Stage 0b, T7 — the no-transition render fixture, shared by the golden generator
// (scripts/stage0b-t7-golden.mjs, run once against the code BEFORE the Stage 0b
// fade changes) and by tests/engine-live-gains.test.mjs (run against the Stage 0b
// engine). Everything here is deterministic: a fixed project — one muted track and
// one unmuted track, both to Master, centre pan, 0 dB — fixed synthetic sources and
// a fixed chunk size chosen so the input is exactly ten blocks. The golden it
// produced is bit-compared, so a fade that fires without a transition (Rule 3 of
// the stage: no transition, bit-identical output) is a test failure, not a
// tolerance.
import { RATE, projectFixture, trackFixture } from "./engine-fixtures.mjs";

/** Ten blocks of 2400 frames: a size no default shares, so boundaries are its own. */
export const T7_CHUNK_FRAMES = 2400;
/** Ten blocks exactly; no Returns, so the tail adds nothing and the flush drains the limiter. */
export const T7_INPUT_FRAMES = T7_CHUNK_FRAMES * 10;

export function t7Project() {
  return projectFixture({
    tracks: [
      trackFixture({ id: "track-quiet", mute: true }),
      trackFixture({ id: "track-live" }),
    ],
  });
}

/** A deterministic two-partial tone per track, identical on every run. */
function toneSource(frames, fn) {
  return {
    sampleRate: RATE,
    frames,
    read(frameStart, target, count) {
      for (let c = 0; c < 2; c++) {
        const channel = target[c];
        for (let i = 0; i < count; i++) channel[i] = fn(frameStart + i);
      }
      return count;
    },
    close() {},
  };
}

export function t7Sources() {
  return new Map([
    // The muted track's source is read every block and skipped by the engine every
    // block; its shape keeps the render honest about that path.
    ["track-quiet", toneSource(T7_INPUT_FRAMES, (i) => 0.24 * Math.sin((2 * Math.PI * 172 * i) / RATE) + 0.06 * Math.sin((2 * Math.PI * 516 * i) / RATE))],
    ["track-live", toneSource(T7_INPUT_FRAMES, (i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE) + 0.09 * Math.sin((2 * Math.PI * 660 * i) / RATE))],
  ]);
}
