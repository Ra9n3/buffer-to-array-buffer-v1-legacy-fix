// Stage 0 — the T6 no-edit-identity fixture, shared by the golden generator
// (scripts/stage0-t6-golden.mjs, run once against the ORIGINAL engine) and by
// tests/engine-live-gains.test.mjs (run against the Stage 0 engine). Everything
// here is deterministic: a fixed project, fixed synthetic sources, a fixed chunk
// size. The golden it produced is bit-compared, so any unintended arithmetic
// change in the chains is a test failure, not a tolerance.
import { RATE, busFixture, projectFixture, returnFixture, trackFixture } from "./engine-fixtures.mjs";

/** A non-default chunk size, so block boundaries do not coincide with defaults. */
export const T6_CHUNK_FRAMES = 3000;
/** Half a second of input; the tail adds the reverb's 1.21 s. */
export const T6_INPUT_FRAMES = 24000;

export function t6Project() {
  return projectFixture({
    tracks: [
      trackFixture({
        id: "track-a",
        output: "bus-B2",
        trim: 2,
        pan: -30,
        level: -4,
        cleanup: true,
        compBypassed: false,
        threshold: -30,
        ratio: 4,
        attack: 8,
        release: 120,
        bands: { lf: [120, 3], lmf: [400, -1.5], hmf: [2500, 2], hf: [9000, -2] },
        dynamic: { lmf: 4 },
        sends: [
          { to: "return-dly", level: -6 },
          { to: "return-verb", level: -12 },
        ],
      }),
      trackFixture({
        id: "track-b",
        trim: 0,
        pan: 40,
        level: -2,
        compBypassed: false,
        threshold: -35,
        ratio: 6,
        bands: { hf: [8000, 1.5] },
        sends: [{ to: "return-verb", level: 0 }],
      }),
    ],
    buses: [
      busFixture({ id: "bus-B1", level: -3, balance: 20, compBypassed: false, threshold: -25, ratio: 3, bands: { hmf: [3000, 2] } }),
      busFixture({ id: "bus-B2", output: "bus-B1", trim: 1, balance: -15, level: -2, bands: { hf: [10000, 1] } }),
    ],
    returns: [
      returnFixture({ id: "return-verb", effect: "reverb", character: "plate", time: 0.8, second: 10, tone: -2, level: -5 }),
      returnFixture({ id: "return-dly", effect: "delay", character: "tape", time: 100, second: 20, tone: 1, level: -3 }),
    ],
    sidechains: [{ source: "track-b", destination: "track-a", processor: "compressor" }],
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

export function t6Sources() {
  return new Map([
    [
      "track-a",
      toneSource(T6_INPUT_FRAMES, (i) =>
        0.32 * Math.sin((2 * Math.PI * 220 * i) / RATE) + 0.08 * Math.sin((2 * Math.PI * 550 * i) / RATE),
      ),
    ],
    ["track-b", toneSource(T6_INPUT_FRAMES, (i) => 0.22 * Math.sin((2 * Math.PI * 660 * i) / RATE))],
  ]);
}
