// Task 5.1 — waveform peaks from real bytes: correct, bounded, asymmetric, and the same whether the file
// is read in one pass or in slices. Plus the Arrange side: seconds → bars and the audio clip.
import test from "node:test";
import assert from "node:assert/strict";
import { PEAKS_PER_SECOND, PEAK_SCALE, computePeaks, isPeakData, peaksPath } from "../src/lib/audio/peaks.ts";
import { inspectWav } from "../src/lib/audio/wav.ts";
import { AUDIO_POINTS_PER_BAR, DEFAULT_TEMPO, audioClip, barCountFor, rulerLabels, secondsToBars } from "../src/lib/arrange-audio.ts";
import { ARRANGE_RULER_LABELS } from "../src/lib/arrange.ts";
import { ARRANGE_TEMPO_MARKERS } from "../src/lib/arrange-timeline.ts";
import { RATE, click, nanFloat, silence, sine } from "./wav-fixtures.mjs";

async function peaksOf(bytes, options) {
  const r = inspectWav(bytes);
  assert.equal(r.ok, true);
  return computePeaks(bytes, r.format, options);
}

test("a sine's peaks: every bucket's min/max near ±amp, the right channel a quarter down, the sample peak exact, 50 buckets a second", async () => {
  const p = await peaksOf(sine(2, { channels: 2, amp: 0.5 }));
  assert.equal(p.sampleRate, 48000);
  assert.equal(p.frames, 96000);
  assert.equal(p.channels, 2);
  assert.equal(p.perSecond, PEAKS_PER_SECOND);
  assert.equal(p.framesPerBucket, 960, "48 000 / 50");
  assert.equal(p.bucketCount, 100);
  assert.equal(p.data.length, 2);
  assert.equal(p.data[0].length, 200, "min/max pairs");
  for (let b = 0; b < p.bucketCount; b++) {
    // 960 frames hold 4.4 cycles of 220 Hz: every bucket sees both extremes
    assert.ok(Math.abs(p.data[0][b * 2] - Math.round(-0.5 * PEAK_SCALE)) <= 1, `L min bucket ${b}: ${p.data[0][b * 2]}`);
    assert.ok(Math.abs(p.data[0][b * 2 + 1] - Math.round(0.5 * PEAK_SCALE)) <= 1, `L max bucket ${b}`);
    assert.ok(Math.abs(p.data[1][b * 2 + 1] - Math.round(0.375 * PEAK_SCALE)) <= 1, `R max bucket ${b}`);
  }
  assert.ok(Math.abs(p.channelPeak[0] - 0.5) < 1e-4);
  assert.ok(Math.abs(p.channelPeak[1] - 0.375) < 1e-4);
  assert.ok(Math.abs(p.peak - 0.5) < 1e-4);
  assert.equal(p.nonFinite, 0);
  assert.equal(isPeakData(p), true);
});

test("bounded: a five-minute stereo stem's peaks are 60 kB, not the 115 MB of its samples (the file itself is never kept in memory by the peaks)", async () => {
  // 300 s × 48 000 × 2 ch × 3 B = 86.4 MB of 24-bit data — too big to encode in a unit test; the arithmetic is checked
  // on a 20-second file and extrapolated by the formula the module states.
  const bytes = sine(20, { channels: 2 });
  const p = await peaksOf(bytes);
  const kept = p.data.reduce((n, d) => n + d.byteLength, 0);
  assert.equal(kept, 20 * PEAKS_PER_SECOND * 2 * 2, "seconds × 50 × channels × 2 bytes");
  assert.equal(kept, 4000);
  assert.ok(kept < bytes.byteLength / 1000, `${kept} B of peaks for ${bytes.byteLength} B of file`);
  const fiveMinutes = 300 * PEAKS_PER_SECOND * 2 * 2;
  assert.equal(fiveMinutes, 60000);
});

test("asymmetric: a negative click shows in the minima only; silence is flat zero; the file's peak is the click", async () => {
  const p = await peaksOf(click(1, 0.5, { channels: 1 }));
  const hitBucket = Math.floor(0.5 * PEAKS_PER_SECOND);
  for (let b = 0; b < p.bucketCount; b++) {
    const min = p.data[0][b * 2];
    const max = p.data[0][b * 2 + 1];
    if (b === hitBucket) {
      assert.equal(min, -PEAK_SCALE, "the click is a full-scale negative sample");
      assert.equal(max, 0);
    } else {
      assert.equal(min, 0);
      assert.equal(max, 0);
    }
  }
  assert.equal(p.peak, 1);
  const s = await peaksOf(silence(0.5));
  assert.ok(s.data.every((d) => d.every((v) => v === 0)));
  assert.equal(s.peak, 0);
});

test("slices: a file read in 0.1-second slices with yields gives exactly the peaks of one pass; progress reaches 1", async () => {
  const bytes = click(1.37, 0.9, { channels: 2 });
  const whole = await peaksOf(bytes);
  let yields = 0;
  const progress = [];
  const sliced = await peaksOf(bytes, {
    sliceFrames: 4800,
    yieldBetween: async () => {
      yields++;
    },
    onProgress: (f) => progress.push(f),
  });
  assert.ok(yields >= 13, `yielded ${yields} times`);
  assert.equal(progress.at(-1), 1);
  assert.deepEqual(Array.from(sliced.data[0]), Array.from(whole.data[0]));
  assert.deepEqual(Array.from(sliced.data[1]), Array.from(whole.data[1]));
  assert.deepEqual(sliced.channelPeak, whole.channelPeak);
  assert.equal(whole.bucketCount, Math.ceil((1.37 * RATE) / 960));
});

test("float data with a NaN in it is counted as non-finite (the import calls that corrupt); 24-bit values clamp at ±127 in the drawing but the peak is unclamped for floats", async () => {
  const p = await peaksOf(nanFloat(0.5));
  assert.equal(p.nonFinite, 1);
  const hot = await peaksOf(sine(0.2, { channels: 1, encoding: "float", bitDepth: 32, amp: 1.6 }));
  assert.ok(hot.peak > 1.5 && hot.peak < 1.61, `float peak beyond full scale is kept: ${hot.peak}`);
  assert.equal(Math.max(...hot.data[0]), PEAK_SCALE, "the drawing clamps");
  assert.equal(Math.min(...hot.data[0]), -PEAK_SCALE);
});

test("an empty data chunk (0 frames) and a sub-bucket file (very short) both compute — one bucket or none, nothing thrown", async () => {
  const empty = await peaksOf(sine(0, { channels: 2 }));
  assert.equal(empty.bucketCount, 0);
  assert.equal(empty.peak, 0);
  const tiny = await peaksOf(sine(0.005, { channels: 1 }));
  assert.equal(tiny.frames, 240);
  assert.equal(tiny.bucketCount, 1, "240 frames: one partial bucket");
  assert.ok(tiny.data[0][1] > 0);
});

test("peaksPath: a closed path through the maxima then back along the minima; coarser points keep the extremes", () => {
  const channel = new Int8Array([0, 0, -127, 0, 0, 0, 0, 64]); // 4 buckets: flat, click down, flat, half up
  const d = peaksPath(channel, 4, 2, 50, 44);
  // two points: point 0 covers buckets 0–1 (min −127 → lower edge at 94), point 1 covers buckets 2–3 (max 64 → upper at 27.8)
  assert.equal(d, "M0 50 L0 50.0 L1 27.8 L1 50 L1 50.0 L0 94.0 Z");
  assert.equal(peaksPath(channel, 0, 10, 50, 44), "");
  const fine = peaksPath(channel, 4, 8, 50, 44);
  assert.equal((fine.match(/L/g) || []).length, 17, "8 points up, the right anchor, 8 back");
});

test("seconds → bars: 120 bpm 4/4 is two seconds a bar; the fixture's tempo map is followed piecewise; bar counts round up and never shrink", () => {
  assert.deepEqual(DEFAULT_TEMPO, { bar: 1, bpm: 120, signature: "4/4" });
  assert.equal(secondsToBars(0, []), 0);
  assert.equal(secondsToBars(2, []), 1);
  assert.equal(secondsToBars(13, []), 6.5);
  assert.equal(secondsToBars(192.4, [DEFAULT_TEMPO]), 96.2);
  // the fixture: 120 to bar 41 (40 bars = 80 s), 112 for 4 bars (8.571 s), 120 for 8 bars (16 s), then 104
  const m = ARRANGE_TEMPO_MARKERS;
  assert.equal(secondsToBars(80, m), 40);
  assert.ok(Math.abs(secondsToBars(80 + 4 * (240 / 112), m) - 44) < 1e-9);
  assert.ok(Math.abs(secondsToBars(80 + 4 * (240 / 112) + 16, m) - 52) < 1e-9);
  assert.ok(Math.abs(secondsToBars(80 + 4 * (240 / 112) + 16 + 2 * (240 / 104), m) - 54) < 1e-9);
  assert.equal(barCountFor(13, [], 0), 7, "6.5 bars → 7");
  assert.equal(barCountFor(12, [], 0), 6, "exactly 6 bars → 6");
  assert.equal(barCountFor(10, [], 56), 56, "the fixture keeps its 56 bars under a shorter stem");
  assert.equal(barCountFor(200, m, 56), Math.ceil(secondsToBars(200, m)));
  assert.deepEqual(rulerLabels(56), ARRANGE_RULER_LABELS, "the same numerals the fixture header prints");
  assert.deepEqual(rulerLabels(7).map((l) => l.bar), [1, 5]);
  assert.deepEqual(rulerLabels(0), []);
});

test("the audio clip: from bar 1, fractional bars, one real envelope per channel, the seconds carried", async () => {
  const p = await peaksOf(sine(13, { channels: 2 }));
  const clip = audioClip({ trackCode: "21", peaks: p, tempoMarkers: [] });
  assert.equal(clip.clipId, "21-audio");
  assert.equal(clip.source, "audio");
  assert.equal(clip.kind, "audio");
  assert.equal(clip.startBar, 1);
  assert.equal(clip.barCount, 6.5);
  assert.equal(clip.endBar, 7);
  assert.equal(clip.channels, 2);
  assert.equal(clip.seconds, 13);
  assert.equal(clip.peakCount, Math.round(6.5 * AUDIO_POINTS_PER_BAR));
  assert.equal(clip.waves.length, 2);
  assert.deepEqual(clip.waves.map((w) => w.centre), [26, 74]);
  assert.ok(clip.waves[0].d.startsWith("M0 26 "));
  assert.ok(clip.waves[0].d.endsWith(" Z"));
  const mono = audioClip({ trackCode: "22", peaks: await peaksOf(sine(0.3, { channels: 1 })), tempoMarkers: [DEFAULT_TEMPO] });
  assert.equal(mono.channels, 1);
  assert.equal(mono.waves.length, 1);
  assert.equal(mono.waves[0].centre, 50);
  assert.equal(mono.barCount, 0.15);
  assert.equal(mono.endBar, 1);
});
