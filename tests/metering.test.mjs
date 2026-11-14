// Stage 1 — real-time metering: the detector laws (T1–T5), the engine's tap
// points and their isolation (T6–T9), bit-identity with metering on and off
// (T10), and the ring's overwrite behaviour (T11). Everything here is
// deterministic: fixed fixtures, seeded noise, fixed block sizes.
import test from "node:test";
import assert from "node:assert/strict";

const {
  METER_BLOCK_FRAMES,
  PEAK_FLOOR_DB,
  RING_CAPACITY,
  VU_FLOOR_DB,
  MeterRing,
  MeterSet,
  StereoMeter,
  newMeterReading,
} = await import("../src/lib/engine/metering.ts");
const { MixEngine } = await import("../src/lib/engine/mix-engine.ts");
const { RATE, busFixture, dc, emptyMaster, projectFixture, returnFixture, toneBlock, trackFixture } = await import(
  "./engine-fixtures.mjs"
);

const SR = RATE; // 48000

/** A 1 kHz sine block at an exact RMS level, identical on both channels. */
function sineBlock(frames, hz, rms, sampleRate = SR) {
  const amplitude = rms * Math.SQRT2;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const w = (2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < frames; i++) {
    const v = amplitude * Math.sin(w * i);
    left[i] = v;
    right[i] = v;
  }
  return [left, right];
}

/** A seeded LCG so the noise cases are the same numbers on every run. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

function noiseBlock(frames, seed, mode = "same") {
  const a = lcg(seed);
  const b = mode === "independent" ? lcg(seed + 101) : a;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = a();
    const r = mode === "anti" ? -l : mode === "silentRight" ? 0 : mode === "same" ? l : b();
    left[i] = l;
    right[i] = r;
  }
  return [left, right];
}

/** Feed a block signal to a meter in equal chunks; returns the meter. */
function feed(meter, block, totalFrames, chunkFrames) {
  for (let at = 0; at < totalFrames; at += chunkFrames) {
    const take = Math.min(chunkFrames, totalFrames - at);
    meter.process([block[0].subarray(at, at + take), block[1].subarray(at, at + take)], take);
  }
  return meter;
}

/** Reading k (0-based): the one whose interval starts exactly at k * 512. */
function readingAt(ring, k) {
  const out = newMeterReading();
  assert.equal(ring.readAt(k * METER_BLOCK_FRAMES, out), true, `reading ${k} must exist`);
  return out;
}

function newestReading(ring) {
  const out = newMeterReading();
  assert.equal(ring.readAt(Number.MAX_SAFE_INTEGER, out), true, "the ring must hold a reading");
  return out;
}

/* --- T1: VU calibration ------------------------------------------------------- */

test("T1 a 1 kHz sine at RMS -18 dBFS reads 0 VU on both channels within 0.2 dB", () => {
  const seconds = 2;
  const frames = seconds * SR;
  const signal = sineBlock(frames, 1000, 10 ** (-18 / 20));
  const meter = feed(new StereoMeter(SR), signal, frames, 1024);
  const final = newestReading(meter.ring);
  assert.ok(Math.abs(final.vuL) <= 0.2, `vuL was ${final.vuL}`);
  assert.ok(Math.abs(final.vuR) <= 0.2, `vuR was ${final.vuR}`);
});

/* --- T2: VU rise --------------------------------------------------------------- */

test("T2 from silence the linear VU value reaches 99% of its final value in 300 ms +/- 30 ms", () => {
  const seconds = 2;
  const frames = seconds * SR;
  const signal = sineBlock(frames, 1000, 10 ** (-18 / 20));
  const settled = feed(new StereoMeter(SR), signal, frames, 1024);
  const target = 0.99 * settled.vuLinearL;

  const rising = new StereoMeter(SR);
  const one = [new Float32Array(1), new Float32Array(1)];
  let crossedAt = -1;
  for (let i = 0; i < frames; i++) {
    one[0][0] = signal[0][i];
    one[1][0] = signal[1][i];
    rising.process(one, 1);
    if (rising.vuLinearL >= target) {
      crossedAt = i;
      break;
    }
  }
  assert.ok(crossedAt >= 0, "the linear VU value never reached 99% of its final value");
  const ms = (crossedAt / SR) * 1000;
  assert.ok(ms >= 270 && ms <= 330, `the 99% crossing was at ${ms.toFixed(1)} ms`);
});

/* --- T3: peak and over --------------------------------------------------------- */

test("T3 constant 0.5 peaks at -6.02 dB with over = 0; a single 1.0 sample overs only its own sub-block", () => {
  const meter = new StereoMeter(SR);
  const zeros = dc(METER_BLOCK_FRAMES, 0);
  const half = dc(METER_BLOCK_FRAMES, 0.5);
  const impulse = dc(METER_BLOCK_FRAMES, 0);
  impulse[0][0] = 1.0;
  impulse[1][0] = 1.0;

  meter.process(zeros, METER_BLOCK_FRAMES);
  meter.process(half, METER_BLOCK_FRAMES);
  meter.process(impulse, METER_BLOCK_FRAMES);
  meter.process(zeros, METER_BLOCK_FRAMES);

  const steady = readingAt(meter.ring, 1);
  assert.ok(Math.abs(steady.peakLDb - (-6.02)) <= 0.05, `peakL was ${steady.peakLDb}`);
  assert.ok(Math.abs(steady.peakRDb - (-6.02)) <= 0.05, `peakR was ${steady.peakRDb}`);
  assert.equal(steady.over, false);

  const overs = readingAt(meter.ring, 2);
  assert.equal(overs.over, true, "the sub-block holding the 1.0 sample must set over");
  assert.ok(Math.abs(overs.peakLDb) <= 0.05, `the impulse peak was ${overs.peakLDb}`);

  const after = readingAt(meter.ring, 3);
  assert.equal(after.over, false, "the next sub-block must clear over");
  assert.ok(Math.abs(after.peakLDb - PEAK_FLOOR_DB) <= 1e-9, "and show no peak");
});

/* --- T4: correlation ----------------------------------------------------------- */

test("T4 correlation: identical >= 0.999, anti <= -0.999, one silent side null, independent < 0.1, silence null", () => {
  const seconds = 1;
  const frames = seconds * SR;

  const same = feed(new StereoMeter(SR), noiseBlock(frames, 7, "same"), frames, 1024);
  const identical = newestReading(same.ring);
  assert.ok(identical.corr !== null && identical.corr >= 0.999, `corr was ${identical.corr}`);

  const anti = feed(new StereoMeter(SR), noiseBlock(frames, 7, "anti"), frames, 1024);
  const inverted = newestReading(anti.ring);
  assert.ok(inverted.corr !== null && inverted.corr <= -0.999, `corr was ${inverted.corr}`);

  const half = feed(new StereoMeter(SR), noiseBlock(frames, 7, "silentRight"), frames, 1024);
  assert.equal(newestReading(half.ring).corr, null, "R = 0 means no measurable correlation");

  const apart = feed(new StereoMeter(SR), noiseBlock(frames, 7, "independent"), frames, 1024);
  const independent = newestReading(apart.ring);
  assert.ok(independent.corr !== null && Math.abs(independent.corr) < 0.1, `corr was ${independent.corr}`);

  const silent = feed(new StereoMeter(SR), dc(frames, 0), frames, 1024);
  assert.equal(newestReading(silent.ring).corr, null, "silence means no signal");
});

/* --- T5: sub-block carry -------------------------------------------------------- */

test("T5 the same signal in blocks of 512, 1000 and 37 frames gives identical readings", () => {
  const frames = 5000;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = 0.4 * Math.sin((2 * Math.PI * 317 * i) / SR) + 0.2 * Math.sin((2 * Math.PI * 733 * i) / SR);
    right[i] = 0.3 * Math.sin((2 * Math.PI * 211 * i) / SR + 0.7);
  }
  const readings = [512, 1000, 37].map((chunk) => {
    const meter = feed(new StereoMeter(SR), [left, right], frames, chunk);
    const count = Math.floor(frames / METER_BLOCK_FRAMES);
    const out = [];
    for (let k = 0; k < count; k++) out.push(readingAt(meter.ring, k));
    return out;
  });
  const [a, b, c] = readings;
  assert.equal(a.length, b.length);
  assert.equal(a.length, c.length);
  for (let k = 0; k < a.length; k++) {
    assert.equal(a[k].stampEnd, b[k].stampEnd, `reading ${k} stamp, 512 vs 1000`);
    assert.equal(a[k].stampEnd, c[k].stampEnd, `reading ${k} stamp, 512 vs 37`);
    for (const field of ["peakLDb", "peakRDb", "vuL", "vuR"]) {
      assert.equal(a[k][field], b[k][field], `reading ${k} ${field}, 512 vs 1000`);
      assert.equal(a[k][field], c[k][field], `reading ${k} ${field}, 512 vs 37`);
    }
    assert.equal(a[k].over, b[k].over, `reading ${k} over, 512 vs 1000`);
    assert.equal(a[k].over, c[k].over, `reading ${k} over, 512 vs 37`);
    const corrSame = (x, y) => (x === null && y === null) || (x !== null && y !== null && x === y);
    assert.ok(corrSame(a[k].corr, b[k].corr), `reading ${k} corr, 512 vs 1000`);
    assert.ok(corrSame(a[k].corr, c[k].corr), `reading ${k} corr, 512 vs 37`);
  }
});

/* --- T6: the engine's track tap point ------------------------------------------- */

test("T6 a track panned hard left meters -6.02 dB on L and silence on R", () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a", pan: -100, eqBypassed: true })] });
  const meters = new MeterSet(project, SR);
  const engine = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024, meters });
  const source = dc(1024, 0.5);
  const master = emptyMaster(1024);
  for (let block = 0; block < 4; block++) engine.process(new Map([["track-a", source]]), master, 1024);

  const track = newestReading(meters.tracks.get("track-a").ring);
  assert.ok(Math.abs(track.peakLDb - (-6.02)) <= 0.05, `track peakL was ${track.peakLDb}`);
  assert.ok(track.peakRDb <= -100, `track peakR was ${track.peakRDb}, R must be silent`);
});

/* --- T7: tap isolation ----------------------------------------------------------- */

test("T7 a bus fader moves only the bus meter; a track fader moves both", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-B1", eqBypassed: true })],
    buses: [busFixture({ id: "bus-B1", eqBypassed: true })],
  });
  const meters = new MeterSet(project, SR);
  const engine = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024, meters });
  const source = dc(1024, 0.5);
  const master = emptyMaster(1024);
  const run = (blocks) => {
    for (let i = 0; i < blocks; i++) engine.process(new Map([["track-a", source]]), master, 1024);
  };

  run(4);
  const trackBefore = newestReading(meters.tracks.get("track-a").ring).peakLDb;
  const busBefore = newestReading(meters.buses.get("bus-B1").ring).peakLDb;

  // The bus fader down 20 dB: the bus meter follows, the track meter does not.
  project.buses[0].channel.level = -20;
  run(4);
  const trackAfterBus = newestReading(meters.tracks.get("track-a").ring).peakLDb;
  const busAfterBus = newestReading(meters.buses.get("bus-B1").ring).peakLDb;
  assert.ok(Math.abs(trackAfterBus - trackBefore) <= 0.05, `the track meter moved ${trackBefore} -> ${trackAfterBus}`);
  assert.ok(busAfterBus < busBefore - 15, `the bus meter moved ${busBefore} -> ${busAfterBus}`);

  // The track fader down 10 dB: both meters follow.
  project.tracks[0].channel.level = -10;
  run(4);
  const trackAfterTrack = newestReading(meters.tracks.get("track-a").ring).peakLDb;
  const busAfterTrack = newestReading(meters.buses.get("bus-B1").ring).peakLDb;
  assert.ok(trackAfterTrack < trackAfterBus - 5, `the track meter moved ${trackAfterBus} -> ${trackAfterTrack}`);
  assert.ok(busAfterTrack < busAfterBus - 5, `the bus meter moved ${busAfterBus} -> ${busAfterTrack}`);
});

/* --- T8: mute ------------------------------------------------------------------ */

test("T8 a muted track's meter falls to the floors and the master meters only the audible tracks", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", pan: -100, eqBypassed: true }),
      trackFixture({ id: "track-b", pan: -100, eqBypassed: true }),
    ],
  });
  const meters = new MeterSet(project, SR);
  const engine = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024, meters });
  const loud = dc(1024, 0.5);
  const quiet = dc(1024, 0.25);
  const master = emptyMaster(1024);
  const inputs = () => new Map([["track-a", loud], ["track-b", quiet]]);
  for (let block = 0; block < 8; block++) engine.process(inputs(), master, 1024);

  // Mute the loud track: one faded block, then the skipped path meters zeros.
  project.tracks[0].channel.mute = true;
  engine.refreshAudibility();
  for (let block = 0; block < 32; block++) engine.process(inputs(), master, 1024);

  const muted = newestReading(meters.tracks.get("track-a").ring);
  assert.ok(Math.abs(muted.vuL - VU_FLOOR_DB) <= 1e-9, `the muted track's VU was ${muted.vuL}`);
  assert.ok(Math.abs(muted.peakLDb - PEAK_FLOOR_DB) <= 1e-9, `the muted track's peak was ${muted.peakLDb}`);

  const masterReading = newestReading(meters.master.ring);
  assert.ok(Math.abs(masterReading.peakLDb - (-12.04)) <= 0.05, `master peakL was ${masterReading.peakLDb}, expected the 0.25 track alone`);
  assert.ok(masterReading.peakRDb <= -100, "master R stays silent (both tracks hard left)");
});

/* --- T9: track and master alignment ----------------------------------------------- */

test("T9 an impulse at engine frame F shows in the track reading and the master reading whose intervals contain F", () => {
  const F = 2100; // deliberately not on a sub-block boundary
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a", pan: -100, eqBypassed: true })] });
  const meters = new MeterSet(project, SR);
  const engine = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024, meters });
  const source = dc(4096, 0);
  source[0][F] = 1.0;
  source[1][F] = 1.0;
  const master = emptyMaster(1024);
  for (let block = 0; block < 4; block++) {
    const at = block * 1024;
    const window = [source[0].subarray(at, at + 1024), source[1].subarray(at, at + 1024)];
    engine.process(new Map([["track-a", window]]), master, 1024);
  }

  const contains = (reading, frame) => reading.stampEnd - METER_BLOCK_FRAMES < frame && frame <= reading.stampEnd;

  // The track reading AT F: the newest whose interval starts at or before F,
  // which must be the one whose interval contains F.
  const trackOut = newMeterReading();
  assert.equal(meters.tracks.get("track-a").ring.readAt(F, trackOut), true, "a track reading must cover F");
  assert.ok(contains(trackOut, F), "the track reading read at F must be the one whose interval contains F");
  assert.ok(Math.abs(trackOut.peakLDb) <= 0.05, `the track peak was ${trackOut.peakLDb}`);
  assert.equal(trackOut.over, true);

  // The master reading at the SAME delivered frame F (its stamps shifted by the
  // limiter's lookahead) is the one whose interval contains F, and it shows the
  // impulse too — at the master limiter's -1 dB ceiling.
  const masterOut = newMeterReading();
  assert.equal(meters.master.ring.readAt(F, masterOut), true, "a master reading must cover F");
  assert.ok(contains(masterOut, F), "the master reading read at F must be the one whose interval contains F");
  assert.ok(Math.abs(masterOut.peakLDb - (-1.0)) <= 0.1, `the master peak was ${masterOut.peakLDb}, the impulse must be there`);
  assert.ok(masterOut.peakRDb <= -100, "master R stays silent (the track is hard left)");

  // And the sub-block before the impulse shows nothing on either ring.
  const before = F - 600;
  const trackBefore = newMeterReading();
  const masterBefore = newMeterReading();
  assert.equal(meters.tracks.get("track-a").ring.readAt(before, trackBefore), true);
  assert.equal(meters.master.ring.readAt(before, masterBefore), true);
  assert.ok(trackBefore.peakLDb <= -100, `the track reading before F peaked at ${trackBefore.peakLDb}`);
  assert.ok(masterBefore.peakLDb <= -100, `the master reading before F peaked at ${masterBefore.peakLDb}`);
});

/* --- T10: bit-identity ------------------------------------------------------------ */

test("T10 metering on and off produce exactly the same output, transitions included", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", output: "bus-B1", eqBypassed: true, sends: [{ to: "return-room", level: -6 }] }),
      trackFixture({ id: "track-b", eqBypassed: true }),
    ],
    buses: [busFixture({ id: "bus-B1", eqBypassed: true })],
    returns: [returnFixture({ id: "return-room" })],
  });
  const meters = new MeterSet(project, SR);
  const plain = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024 });
  const metered = new MixEngine(project, { sampleRate: SR, maxFramesPerBlock: 1024, meters });
  const a = toneBlock(1024, 220, 0.4);
  const b = toneBlock(1024, 330, 0.3);
  const outPlain = emptyMaster(1024);
  const outMetered = emptyMaster(1024);
  const blocks = 6;

  for (let block = 0; block < blocks; block++) {
    if (block === 2) {
      // A mid-run mute crosses the Stage 0b fade and the zeros-feed path.
      project.tracks[1].channel.mute = true;
      plain.refreshAudibility();
      metered.refreshAudibility();
    }
    const inputs = new Map([["track-a", a], ["track-b", b]]);
    plain.process(inputs, outPlain, 1024);
    metered.process(inputs, outMetered, 1024);
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 1024; i++) {
        assert.equal(outMetered[c][i], outPlain[c][i], `block ${block} channel ${c} frame ${i} differs`);
      }
    }
  }
});

/* --- T11: the ring ---------------------------------------------------------------- */

test("T11 pushing past RING_CAPACITY overwrites the oldest and readAt reports the loss", () => {
  const ring = new MeterRing();
  const total = RING_CAPACITY + 88;
  for (let i = 0; i < total; i++) ring.push((i + 1) * METER_BLOCK_FRAMES, i, i, i, i, 0.25, i % 2 === 0);
  assert.equal(ring.count, RING_CAPACITY, "the ring holds no more than its capacity");

  // Reading 0 covered frames (0, 512]; it is long gone.
  const gone = newMeterReading();
  assert.equal(ring.readAt(100, gone), false, "an overwritten reading must report false");

  // The oldest survivor is reading total - RING_CAPACITY.
  const oldest = newMeterReading();
  const oldestStart = (total - RING_CAPACITY) * METER_BLOCK_FRAMES;
  assert.equal(ring.readAt(oldestStart + 10, oldest), true);
  assert.equal(oldest.stampEnd, (total - RING_CAPACITY + 1) * METER_BLOCK_FRAMES);
  assert.equal(oldest.peakLDb, total - RING_CAPACITY);

  // And the newest is reading total - 1.
  const newest = newMeterReading();
  assert.equal(ring.readAt(Number.MAX_SAFE_INTEGER, newest), true);
  assert.equal(newest.stampEnd, total * METER_BLOCK_FRAMES);
});
