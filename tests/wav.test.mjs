// Task 5.1 — the WAV reader and the plan's import rules (§11), over real bytes from `encodeWav` and a
// handful of wrong files. Nothing is decoded by anything but the code under test.
import test from "node:test";
import assert from "node:assert/strict";
import { inspectWav, looksLike, readWavHeader, sampleReaderFor, encodeWav } from "../src/lib/audio/wav.ts";
import { ACCEPTED_SAMPLE_RATE, SHORT_SECONDS, SILENCE_PEAK_DBFS, describeFormat, isSilentPeak, isVeryShort, judgeFormat, printSeconds } from "../src/lib/audio/import-rules.ts";
import { AIFFISH, FLACISH, MP3ISH, NOT_AUDIO, RATE, adpcmWav, noDataWav, silence, sine, truncated } from "./wav-fixtures.mjs";

test("a plain 48 kHz 24-bit stereo WAV is read whole: format, frames, data placement", () => {
  const bytes = sine(1.5, { channels: 2, bitDepth: 24 });
  const r = inspectWav(bytes);
  assert.equal(r.ok, true);
  assert.equal(r.format.encoding, "pcm");
  assert.equal(r.format.encodingName, "PCM");
  assert.equal(r.format.channels, 2);
  assert.equal(r.format.sampleRate, 48000);
  assert.equal(r.format.bitDepth, 24);
  assert.equal(r.format.containerBits, 24);
  assert.equal(r.format.blockAlign, 6);
  assert.equal(r.format.frames, 72000);
  assert.equal(r.format.seconds, 1.5);
  assert.equal(r.format.dataOffset, 44, "the classic 44-byte header");
  assert.equal(r.format.dataBytes, 72000 * 6);
  assert.equal(bytes.byteLength, 44 + 72000 * 6);
  assert.equal(judgeFormat(r.format).ok, true);
});

test("WAVE_FORMAT_EXTENSIBLE with extra chunks before data (how 24-bit exporters write): read the same, judged the same", () => {
  const bext = new Uint8Array(602).fill(0x20);
  const list = new TextEncoder().encode("INFOISFT\u0007\u0000\u0000\u0000Lavf58\u0000");
  const bytes = sine(0.5, { channels: 2, bitDepth: 24, extensible: true, extraChunks: [{ id: "bext", bytes: bext }, { id: "LIST", bytes: list }] });
  const r = inspectWav(bytes);
  assert.equal(r.ok, true);
  assert.equal(r.format.encoding, "pcm");
  assert.equal(r.format.bitDepth, 24);
  assert.equal(r.format.frames, 24000);
  assert.ok(r.format.dataOffset > 44 + 602 + list.length, "the data chunk sits after the extra chunks");
  assert.equal(judgeFormat(r.format).ok, true);
  // the odd-sized LIST chunk is padded to an even boundary and the walk still lands on data
  assert.equal(r.format.dataBytes, 24000 * 6);
});

test("32-bit float, mono and stereo, plain and extensible: accepted", () => {
  for (const channels of [1, 2]) {
    for (const extensible of [false, true]) {
      const r = inspectWav(sine(0.25, { channels, encoding: "float", bitDepth: 32, extensible }));
      assert.equal(r.ok, true);
      assert.equal(r.format.encoding, "float");
      assert.equal(r.format.encodingName, "IEEE float");
      assert.equal(r.format.bitDepth, 32);
      assert.equal(r.format.channels, channels);
      assert.equal(judgeFormat(r.format).ok, true, `float ${channels}ch extensible=${extensible}`);
    }
  }
});

test("the plan's refusals: 16-bit, 32-bit integer, 8-bit, 44.1 / 96 kHz, more than two channels, compressed WAV — each named, each with the re-export advice", () => {
  const r16 = judgeFormat(inspectWav(sine(0.2, { bitDepth: 16 })).format);
  assert.equal(r16.ok, false);
  assert.equal(r16.reason, "unsupported-depth");
  assert.match(r16.detail, /16-bit PCM/);
  assert.match(r16.detail, /re-export the stem as a 48 kHz WAV, 24-bit or 32-bit float/);

  const r32i = judgeFormat(inspectWav(sine(0.2, { bitDepth: 32, encoding: "pcm" })).format);
  assert.equal(r32i.ok, false);
  assert.equal(r32i.reason, "unsupported-depth", "32-bit integer PCM is not 32-bit float");
  assert.match(r32i.detail, /32-bit PCM/);

  const r8 = judgeFormat(inspectWav(sine(0.2, { bitDepth: 8 })).format);
  assert.equal(r8.ok, false);
  assert.equal(r8.reason, "unsupported-depth");

  const r441 = judgeFormat(inspectWav(sine(0.2, { sampleRate: 44100 })).format);
  assert.equal(r441.ok, false);
  assert.equal(r441.reason, "unsupported-rate");
  assert.match(r441.detail, /44\.1 kHz/);
  assert.match(r441.detail, /does not resample/);

  const r96 = judgeFormat(inspectWav(sine(0.2, { sampleRate: 96000 })).format);
  assert.equal(r96.ok, false);
  assert.equal(r96.reason, "unsupported-rate");
  assert.match(r96.detail, /96 kHz/);

  const r6 = judgeFormat(inspectWav(sine(0.1, { channels: 6 })).format);
  assert.equal(r6.ok, false);
  assert.equal(r6.reason, "unsupported-channels");
  assert.match(r6.detail, /6 channels/);

  const adpcm = inspectWav(adpcmWav());
  assert.equal(adpcm.ok, true, "a compressed WAV has a readable header");
  assert.equal(adpcm.format.encoding, "other");
  assert.equal(adpcm.format.encodingName, "ADPCM");
  const rad = judgeFormat(adpcm.format);
  assert.equal(rad.ok, false);
  assert.equal(rad.reason, "unsupported-encoding");
  assert.match(rad.detail, /ADPCM/);
  assert.equal(sampleReaderFor(adpcm.format), null, "nothing decodes it");

  // the order of the rules: a 16-bit 44.1 kHz file is refused for its depth first (one reason per file)
  const both = judgeFormat(inspectWav(sine(0.1, { bitDepth: 16, sampleRate: 44100 })).format);
  assert.equal(both.reason, "unsupported-depth");
  assert.equal(ACCEPTED_SAMPLE_RATE, 48000);
});

test("not a WAV at all: text, MP3, FLAC, AIFF, empty — named when the magic is known, never thrown", () => {
  for (const [bytes, like, pattern] of [
    [NOT_AUDIO, null, /Not a WAV file/],
    [MP3ISH, "MP3", /an MP3 file, not a WAV file/],
    [FLACISH, "FLAC", /a FLAC file/],
    [AIFFISH, "AIFF", /an AIFF file/],
    [new Uint8Array(0), null, /The file is empty/],
    [new Uint8Array([0x52, 0x49]), null, /Not a WAV file/],
  ]) {
    assert.equal(looksLike(bytes), like);
    const r = inspectWav(bytes);
    assert.equal(r.ok, false);
    assert.equal(r.problem.kind, "not-wav");
    assert.equal(r.problem.looksLike, like);
    assert.match(r.problem.detail, pattern);
  }
});

test("corrupt WAVs: truncated data, a data chunk cut mid-frame, no data chunk, contradictory block alignment, zero channels — each a named corruption", () => {
  const whole = sine(1, { channels: 2, bitDepth: 24 });
  const cut = inspectWav(truncated(whole, 0.6));
  assert.equal(cut.ok, false);
  assert.equal(cut.problem.kind, "corrupt");
  assert.match(cut.problem.detail, /truncated/);

  // the data chunk's size patched to a non-multiple of the frame size
  const midFrame = new Uint8Array(whole);
  new DataView(midFrame.buffer).setUint32(40, 6 * 100 + 4, true);
  const mf = inspectWav(midFrame);
  assert.equal(mf.ok, false);
  assert.match(mf.problem.detail, /not whole frames/);

  const nd = inspectWav(noDataWav());
  assert.equal(nd.ok, false);
  assert.match(nd.problem.detail, /No data chunk/);

  const badAlign = new Uint8Array(whole);
  new DataView(badAlign.buffer).setUint16(32, 5, true);
  const ba = inspectWav(badAlign);
  assert.equal(ba.ok, false);
  assert.match(ba.problem.detail, /block alignment/);

  const zeroCh = new Uint8Array(whole);
  new DataView(zeroCh.buffer).setUint16(22, 0, true);
  const zc = inspectWav(zeroCh);
  assert.equal(zc.ok, false);
  assert.match(zc.problem.detail, /zero channels/);

  // a streaming writer's 0xFFFFFFFF data size reads to the end of the file instead of failing
  const streamed = new Uint8Array(whole);
  new DataView(streamed.buffer).setUint32(40, 0xffffffff, true);
  const st = inspectWav(streamed);
  assert.equal(st.ok, true);
  assert.equal(st.format.frames, 48000);
});

test("sample readers decode what the writer wrote, at every accepted layout and the refused integer ones", () => {
  const values = [0, 0.5, -0.5, 0.999, -1, 0.123456];
  for (const [encoding, bitDepth, tolerance] of [
    ["pcm", 24, 1 / 8388608],
    ["float", 32, 1e-7],
    ["pcm", 16, 1 / 32768],
    ["pcm", 32, 1e-9],
    ["pcm", 8, 1 / 128],
    ["float", 64, 0],
  ]) {
    const bytes = encodeWav({ sampleRate: RATE, channels: 1, encoding, bitDepth, frames: values.length, sample: (_c, f) => values[f] });
    const head = readWavHeader(bytes);
    assert.equal(head.ok, true);
    const r = inspectWav(bytes);
    const read = sampleReaderFor(r.format);
    assert.ok(read, `${encoding} ${bitDepth}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    values.forEach((v, f) => {
      const got = read(view, r.format.dataOffset + f * r.format.blockAlign);
      assert.ok(Math.abs(got - v) <= tolerance + 1e-12, `${encoding} ${bitDepth}: frame ${f} ${got} vs ${v}`);
    });
  }
});

test("describeFormat, printSeconds and the provisional thresholds", () => {
  assert.equal(describeFormat({ encoding: "pcm", encodingName: "PCM", bitDepth: 24, sampleRate: 48000, channels: 2 }), "48 kHz · 24-bit PCM · stereo");
  assert.equal(describeFormat({ encoding: "float", encodingName: "IEEE float", bitDepth: 32, sampleRate: 44100, channels: 1 }), "44.1 kHz · 32-bit float · mono");
  assert.equal(describeFormat({ encoding: "other", encodingName: "µ-law", bitDepth: 8, sampleRate: 8000, channels: 1 }), "8 kHz · µ-law · mono");
  assert.equal(printSeconds(0), "0:00.0");
  assert.equal(printSeconds(0.46), "0:00.4");
  assert.equal(printSeconds(59.99), "0:59.9");
  assert.equal(printSeconds(192.4), "3:12");
  assert.equal(SILENCE_PEAK_DBFS, -80);
  assert.equal(isSilentPeak(0, 48000), true);
  assert.equal(isSilentPeak(0.00009, 48000), true, "−81 dBFS is silent");
  assert.equal(isSilentPeak(0.00011, 48000), false, "−79 dBFS is not");
  assert.equal(isSilentPeak(1, 0), true, "no frames at all is silent");
  assert.equal(SHORT_SECONDS, 1);
  assert.equal(isVeryShort(0.999), true);
  assert.equal(isVeryShort(1), false);
  assert.equal(inspectWav(silence(0.1)).ok, true);
});
