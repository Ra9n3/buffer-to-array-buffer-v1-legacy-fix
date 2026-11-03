// Task 7.1 — the channel chain, signal-based: the plan's eight-block order, trim/fader dB,
// the constant-power pan law, the expander and dynamic EQ in circuit only when the model asks,
// the compressor characters, post-fader and post-pan sends, wet-only Returns, Return level, the
// bus chain's order, and the master's safety limiter.
import test from "node:test";
import assert from "node:assert/strict";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { panGains, PAN_CENTRE_DB } from "../src/lib/engine/pan.ts";
import { CLEANUP_EXPANDER, DYNAMIC_BAND_GATE } from "../src/lib/engine/constants.ts";
import {
  RATE,
  busFixture,
  dc,
  emptyMaster,
  peak,
  projectFixture,
  returnFixture,
  rms,
  runBlock,
  tapBlock,
  toneBlock,
  trackFixture,
} from "./engine-fixtures.mjs";

const FRAMES = 4096;
const CENTRE = Math.SQRT1_2;

function engineOf(project, maxFrames = FRAMES) {
  return new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: maxFrames });
}

/** A settled DC value: the limiter delays the block, so read after its lookahead. */
function settled(signal, engine, from = engine.latencyFrames + 8) {
  return peak(signal, from, signal.length);
}

test("a flat track at the centre reaches the master once, through the pan law only", () => {
  const track = trackFixture({ id: "track-a", output: "master" });
  const engine = engineOf(projectFixture({ tracks: [track] }));
  const master = runBlock(engine, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  const expected = 0.5 * CENTRE;
  assert.ok(Math.abs(settled(master[0], engine) - expected) < 1e-4, `left is ${settled(master[0], engine)}, expected ${expected}`);
  assert.ok(Math.abs(settled(master[1], engine) - expected) < 1e-4, "right does not match left");
  // Not doubled, not compensated: exactly one path at unity gain and the pan law.
  assert.ok(settled(master[0], engine) < expected * 1.01);
});

test("TRIM and the fader are dB gains, applied before and after the chain", () => {
  const trimmed = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", trim: 6 })] }));
  const outTrim = runBlock(trimmed, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  assert.ok(Math.abs(settled(outTrim[0], trimmed) - 0.5 * 1.9953 * CENTRE) < 2e-4, "trim +6 dB is not ×1.995");

  const faded = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", level: -12 })] }));
  const outFade = runBlock(faded, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  assert.ok(Math.abs(settled(outFade[0], faded) - 0.5 * 0.2512 * CENTRE) < 5e-5, "fader −12 dB is not ×0.251");

  const both = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", trim: 6, level: -6 })] }));
  const outBoth = runBlock(both, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  const expected = 0.5 * 1.9953 * 0.5012 * CENTRE;
  assert.ok(Math.abs(settled(outBoth[0], both) - expected) < 2e-4, "trim and fader do not compose");
});

test("PAN follows the approved constant-power law: −3.01 dB centre, unity hard, equal power throughout", () => {
  assert.ok(Math.abs(PAN_CENTRE_DB - -3.0103) < 0.001, `the documented centre is ${PAN_CENTRE_DB} dB`);
  for (const pan of [-100, -75, -50, 0, 40, 100]) {
    const { left, right } = panGains(pan);
    assert.ok(Math.abs(left * left + right * right - 1) < 1e-12, `pan ${pan}: the law is not constant-power`);
  }
  assert.ok(Math.abs(panGains(0).left - CENTRE) < 1e-12);

  const centre = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a" })] }));
  const centreOut = runBlock(centre, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  const hardLeft = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", pan: -100 })] }));
  const leftOut = runBlock(hardLeft, [["track-a", dc(FRAMES, 0.5)]], FRAMES);
  const hardRight = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", pan: 100 })] }));
  const rightOut = runBlock(hardRight, [["track-a", dc(FRAMES, 0.5)]], FRAMES);

  assert.ok(Math.abs(settled(leftOut[0], hardLeft) - 0.5) < 1e-4, "hard left is not unity on the left");
  assert.equal(peak(leftOut[1]), 0, "hard left leaked into the right channel");
  assert.ok(Math.abs(settled(rightOut[1], hardRight) - 0.5) < 1e-4, "hard right is not unity on the right");
  assert.equal(peak(rightOut[0]), 0, "hard right leaked into the left channel");
  // Power is constant: hard left is exactly √2 above the centre position.
  assert.ok(Math.abs(settled(leftOut[0], hardLeft) / settled(centreOut[0], centre) - Math.SQRT2) < 1e-3);
});

test("the chain runs in the plan's order: the EQ feeds the compressor, not the other way round", () => {
  const flat = engineOf(
    projectFixture({ tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -30, ratio: 8 })] }),
  );
  runBlock(flat, [["track-a", toneBlock(FRAMES, 1000, 0.1)]], FRAMES);
  const flatReduction = flat.trackReductionDb("track-a");

  const boosted = engineOf(
    projectFixture({
      tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -30, ratio: 8, bands: { lf: [100, 0], lmf: [1000, 12], hmf: [3000, 0], hf: [10000, 0] } })],
    }),
  );
  runBlock(boosted, [["track-a", toneBlock(FRAMES, 1000, 0.1)]], FRAMES);
  const boostedReduction = boosted.trackReductionDb("track-a");

  // +12 dB into the detector is +12 dB of extra reduction at 8:1 — impossible if the
  // compressor ran BEFORE the EQ, where it would never see the boost.
  assert.ok(
    boostedReduction > flatReduction + 3,
    `EQ before compressor not shown: ${flatReduction.toFixed(2)} dB flat, ${boostedReduction.toFixed(2)} dB boosted`,
  );
});

test("the expander is in circuit only when the track's cleanup flag is set", () => {
  const quiet = toneBlock(FRAMES, 200, 0.004);
  const plain = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", cleanup: false })] }));
  const plainOut = runBlock(plain, [["track-a", quiet]], FRAMES);
  const cleaned = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", cleanup: true })] }));
  const cleanedOut = runBlock(cleaned, [["track-a", quiet]], FRAMES);
  assert.ok(rms(cleanedOut[0], 400) < rms(plainOut[0], 400) * 0.9, "cleanup did not reduce a signal below the expander's threshold");
  assert.ok(cleaned.trackExpanderReductionDb("track-a") > 0, "the expander reports no reduction");
  assert.equal(plain.trackExpanderReductionDb("track-a"), 0);
  // The fixed gates are the documented ones.
  assert.deepEqual({ ...CLEANUP_EXPANDER }, { thresholdDb: -45, ratio: 2, rangeDb: 20, attackMs: 5, releaseMs: 120 });
});

test("a dynamic band pulls down only when the signal is over the fixed gate", () => {
  const dynamicBand = { dynamic: { hmf: 6 }, bands: { lf: [100, 0], lmf: [500, 0], hmf: [1000, 0], hf: [10000, 0] } };
  const loud = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", ...dynamicBand })] }));
  const loudOut = runBlock(loud, [["track-a", toneBlock(FRAMES, 1000, 0.5)]], FRAMES);
  const loudStatic = engineOf(
    projectFixture({ tracks: [trackFixture({ id: "track-a", bands: dynamicBand.bands })] }),
  );
  const loudStaticOut = runBlock(loudStatic, [["track-a", toneBlock(FRAMES, 1000, 0.5)]], FRAMES);
  assert.ok(
    rms(loudOut[0], 1000) < rms(loudStaticOut[0], 1000) * 0.7,
    "a loud band was not pulled down by its depth",
  );

  const soft = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", ...dynamicBand })] }));
  const softOut = runBlock(soft, [["track-a", toneBlock(FRAMES, 1000, 0.005)]], FRAMES);
  const softStatic = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", bands: dynamicBand.bands })] }));
  const softStaticOut = runBlock(softStatic, [["track-a", toneBlock(FRAMES, 1000, 0.005)]], FRAMES);
  const difference = Math.abs(rms(softOut[0], 1000) - rms(softStaticOut[0], 1000));
  assert.ok(difference < rms(softStaticOut[0], 1000) * 0.05, "a quiet band was pulled down below the gate");
  assert.deepEqual({ ...DYNAMIC_BAND_GATE }, { thresholdDb: -24, attackMs: 5, releaseMs: 120 });
});

test("the compressor characters are mapped from the model, and an unknown one is a named error", () => {
  for (const character of ["vca", "opto", "fet", "varimu"]) {
    const engine = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", character, compBypassed: false })] }));
    assert.ok(engine instanceof MixEngine, `${character} was rejected`);
  }
  assert.throws(
    () => engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", character: "tube" })] })),
    /compressor character/,
  );
  // A reverb Return with a delay label is a named error, not a silent fallback.
  assert.throws(
    () =>
      engineOf(
        projectFixture({
          tracks: [trackFixture({ id: "track-a" })],
          returns: [returnFixture({ id: "return-r", effect: "reverb", character: "tape" })],
        }),
      ),
    /reverb Return's character/,
  );
});

test("sends are post-fader and post-pan (plan §8a)", () => {
  const sendOf = (level, pan) =>
    trackFixture({ id: "track-a", level, pan, sends: [{ to: "return-dly", level: 0 }] });
  const build = (level, pan) =>
    engineOf(
      projectFixture({
        tracks: [sendOf(level, pan)],
        returns: [returnFixture({ id: "return-dly", effect: "delay", time: 20, second: 0, level: 0 })],
      }),
    );

  const measure = (engine) => {
    const tap = tapBlock(FRAMES);
    const master = emptyMaster(FRAMES);
    const taps = { returns: new Map([["return-dly", tap]]) };
    engine.process(new Map([["track-a", dc(FRAMES, 0.5)]]), master, FRAMES, taps);
    return { tap, master };
  };

  const unity = measure(build(0, 0));
  const faded = measure(build(-6, 0));
  const leftOnly = measure(build(0, -100));

  // The Return's input is the post-fader signal: −6 dB on the fader halves it.
  assert.ok(Math.abs(peak(unity.tap[0]) / Math.max(1e-9, peak(faded.tap[0])) - 1.9953) < 0.05, "the send is not post-fader");
  // …and the post-pan signal: a hard-left track feeds nothing into the right side.
  assert.ok(peak(unity.tap[1]) > 0, "the centred track sent nothing to the right");
  assert.equal(peak(leftOnly.tap[1]), 0, "a hard-left send still fed the right channel");
  assert.ok(peak(leftOnly.tap[0]) > 0, "a hard-left send fed nothing to the left");
});

test("a Return is wet only: the send adds the effect, never a second dry copy", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({
        id: "track-a",
        output: "bus-quiet",
        sends: [{ to: "return-dly", level: 0 }],
      }),
    ],
    buses: [busFixture({ id: "bus-quiet", level: -60 })],
    returns: [returnFixture({ id: "return-dly", effect: "delay", time: 20, second: 0, level: 0 })],
  });
  const engine = engineOf(project);
  const tap = tapBlock(FRAMES);
  const master = emptyMaster(FRAMES);
  engine.process(new Map([["track-a", dc(FRAMES, 0.2)]]), master, FRAMES, { returns: new Map([["return-dly", tap]]) });

  const delayFrames = Math.round((20 * RATE) / 1000);
  const onset = engine.latencyFrames + delayFrames;
  const before = peak(master[0], engine.latencyFrames + 32, onset - 32);
  const after = peak(master[0], onset + 64, FRAMES);
  // Before the delay time only the (heavily attenuated) dry bus path is present.
  assert.ok(before < 0.001, `audio appeared before the delay time: ${before}`);
  // After it, the delayed copy at full level — the Return added no dry signal of its own.
  assert.ok(after > 0.1, `the Return added nothing at the delay time: ${after}`);
  assert.ok(peak(tap[0]) > 0.1, "the Return's own output is empty");
});

test("the Return's level scales the Return's contribution and nothing else", () => {
  const build = (level) =>
    engineOf(
      projectFixture({
        tracks: [
          trackFixture({ id: "track-dry" }),
          trackFixture({ id: "track-send", output: "bus-quiet", sends: [{ to: "return-verb", level: 0 }] }),
        ],
        buses: [busFixture({ id: "bus-quiet", level: -60 })],
        returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 2, level })],
      }),
      24000,
    );
  const frames = 24000;
  const inputs = new Map([
    ["track-dry", dc(frames, 0.2)],
    ["track-send", dc(frames, 0.2)],
  ]);
  const measure = (engine, withSend) => {
    const out = emptyMaster(frames);
    const tap = tapBlock(frames);
    engine.process(
      withSend ? inputs : new Map([["track-dry", dc(frames, 0.2)]]),
      out,
      frames,
      { returns: new Map([["return-verb", tap]]) },
    );
    return { out, tap };
  };
  const loud = measure(build(0), true);
  const quiet = measure(build(-6), true);
  const dryOnly = measure(build(0), false);

  // The Return's own output follows its fader exactly (−6 dB = ×0.5012).
  assert.ok(
    Math.abs(peak(loud.tap[0]) / Math.max(1e-12, peak(quiet.tap[0])) - 1.9953) < 0.02,
    `the Return's fader is not 6 dB: ${peak(loud.tap[0])} vs ${peak(quiet.tap[0])}`,
  );
  // And its contribution to the master scales by the same factor, while the dry path
  // (the difference against a dry-only render) is identical in both.
  let worst = 0;
  for (let i = 1200; i < frames; i++) {
    const loudReturn = loud.out[0][i] - dryOnly.out[0][i];
    const quietReturn = quiet.out[0][i] - dryOnly.out[0][i];
    worst = Math.max(worst, Math.abs(quietReturn * 1.9953 - loudReturn));
  }
  assert.ok(worst < 1e-5, `the Return's contribution does not scale linearly with its fader: ${worst}`);
});

test("the bus chain applies trim, balance and fader, with the EQ before the compressor", () => {
  const build = (options) =>
    engineOf(
      projectFixture({
        tracks: [trackFixture({ id: "track-a", output: "bus-B1" })],
        buses: [busFixture({ id: "bus-B1", ...options })],
      }),
    );
  const plain = build({});
  const plainOut = runBlock(plain, [["track-a", dc(FRAMES, 0.25)]], FRAMES);
  assert.ok(Math.abs(settled(plainOut[0], plain) - 0.25 * CENTRE) < 1e-4, "an untouched bus changed the level");

  const trimmed = build({ trim: 6, level: -6 });
  const trimmedOut = runBlock(trimmed, [["track-a", dc(FRAMES, 0.25)]], FRAMES);
  assert.ok(Math.abs(settled(trimmedOut[0], trimmed) - 0.25 * CENTRE * 1.9953 * 0.5012) < 2e-4);

  const balanced = build({ balance: -100 });
  const balancedOut = runBlock(balanced, [["track-a", dc(FRAMES, 0.25)]], FRAMES);
  assert.equal(peak(balancedOut[1]), 0, "a hard-left bus balance leaked right");

  const busEq = (bands) =>
    engineOf(
      projectFixture({
        tracks: [trackFixture({ id: "track-a", output: "bus-B1" })],
        buses: [busFixture({ id: "bus-B1", compBypassed: false, threshold: -30, ratio: 8, bands })],
      }),
    );
  const flatBus = busEq({ lf: [100, 0], lmf: [1000, 0], hmf: [3000, 0], hf: [10000, 0] });
  runBlock(flatBus, [["track-a", toneBlock(FRAMES, 1000, 0.1)]], FRAMES);
  const boostedBus = busEq({ lf: [100, 0], lmf: [1000, 12], hmf: [3000, 0], hf: [10000, 0] });
  runBlock(boostedBus, [["track-a", toneBlock(FRAMES, 1000, 0.1)]], FRAMES);
  assert.ok(
    boostedBus.busReductionDb("bus-B1") > flatBus.busReductionDb("bus-B1") + 3,
    "the bus's EQ does not feed its compressor",
  );
});

test("the master's safety limiter holds its ceiling and leaves a quiet sum untouched", () => {
  const engine = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a" })] }));
  const hot = runBlock(engine, [["track-a", dc(FRAMES, 2.5)]], FRAMES);
  const ceiling = 10 ** (-1 / 20);
  const hotPeak = settled(hot[0], engine);
  assert.ok(hotPeak <= ceiling + 1e-3, `the master peak ${hotPeak} is above ${ceiling}`);
  assert.ok(hotPeak > ceiling * 0.9, `the limiter pulled the sum far below its ceiling: ${hotPeak}`);

  const quiet = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a" })] }));
  const quietOut = runBlock(quiet, [["track-a", dc(FRAMES, 0.1)]], FRAMES);
  assert.ok(Math.abs(settled(quietOut[0], quiet) - 0.1 * CENTRE) < 1e-5, "the limiter touched a signal under its ceiling");
  assert.equal(quiet.masterReductionDb, 0);
});
