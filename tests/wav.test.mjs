// Task 5.1 — the WAV reader and the plan's import rules (§11), over real bytes from `encodeWav` and a
// handful of wrong files. Nothing is decoded by anything but the code under test.
import test from "node:test";
import assert from "node:assert/strict";
import { inspectWav, is24In32, looksLike, readWavHeader, resolve24In32Alignment, sampleReaderFor, encodeWav } from "../src/lib/audio/wav.ts";
import { IMPORT_RATES, SHORT_SECONDS, SILENCE_PEAK_DBFS, describeFormat, isSilentPeak, isVeryShort, judgeFormat, printSeconds } from "../src/lib/audio/import-rules.ts";
import { AIFFISH, FLACISH, MP3ISH, NOT_AUDIO, RATE, adpcmWav, noDataWav, silence, sine, sine24In32, truncated } from "./wav-fixtures.mjs";

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

test("the Task 11.1 acceptances: 32-bit int PCM, 44.1 kHz, and both 24-in-32 alignments — each read whole, each judged the same, each decoded at the right level", () => {
  const r32i = inspectWav(sine(0.25, { bitDepth: 32, encoding: "pcm" }));
  assert.equal(r32i.ok, true);
  assert.equal(r32i.format.bitDepth, 32);
  assert.equal(r32i.format.containerBits, 32);
  assert.equal(judgeFormat(r32i.format).ok, true, "32-bit int PCM is accepted (Task 11.1)");

  const r441 = inspectWav(sine(0.25, { sampleRate: 44100 }));
  assert.equal(r441.ok, true);
  assert.equal(r441.format.sampleRate, 44100);
  assert.equal(judgeFormat(r441.format).ok, true, "44.1 kHz is accepted and converted at import (Task 11.1)");
  assert.deepEqual(IMPORT_RATES, [44100, 48000]);

  for (const alignment of ["left", "right"]) {
    const bytes = sine24In32(0.25, { alignment });
    const r = inspectWav(bytes);
    assert.equal(r.ok, true, `24-in-32 ${alignment}`);
    assert.equal(r.format.encoding, "pcm");
    assert.equal(r.format.bitDepth, 24);
    assert.equal(r.format.containerBits, 32, "the container is 32 bits");
    assert.equal(r.format.blockAlign, 8, "two 4-byte containers");
    assert.equal(r.format.alignment, alignment, `resolved ${alignment}`);
    assert.equal(r.format.alignmentBasis, alignment === "right" ? "detected" : "declared");
    assert.equal(r.format.channelMask, 3, "the extensible header's stereo channel mask is read");
    assert.equal(is24In32(r.format), true);
    assert.equal(judgeFormat(r.format).ok, true, `24-in-32 ${alignment} is accepted`);
    // the samples decode to the same values either way: 0.5 left, a quarter down right —
    // frame 0 of the 220 Hz sine at phase 0 is 0, so read the first non-zero frame instead
    const read = sampleReaderFor(r.format);
    assert.ok(read, `24-in-32 ${alignment} has a reader`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let sawLeft = 0;
    let sawRight = 0;
    for (let f = 0; f < r.format.frames; f++) {
      const l = read(view, r.format.dataOffset + f * 8);
      const rr = read(view, r.format.dataOffset + f * 8 + 4);
      sawLeft = Math.max(sawLeft, Math.abs(l));
      sawRight = Math.max(sawRight, Math.abs(rr));
    }
    assert.ok(Math.abs(sawLeft - 0.5) < 0.01, `24-in-32 ${alignment}: the left peak is ≈0.5 (got ${sawLeft})`);
    assert.ok(Math.abs(sawRight - 0.375) < 0.01, `24-in-32 ${alignment}: the right peak is ≈0.375, a quarter down (got ${sawRight})`);
  }

  // the resolution rule itself: the declared left default, and the one deterministic override
  const left = sine24In32(0.25, { alignment: "left" });
  const view = new DataView(left.buffer, left.byteOffset, left.byteLength);
  const fmt = inspectWav(left).format;
  assert.equal(resolve24In32Alignment(view, fmt.dataOffset, fmt.blockAlign, fmt.channels, fmt.frames).alignment, "left");
  // a left-aligned file with a NOISY pad byte still reads correctly: the shift never trusts the low byte
  const noisy = new Uint8Array(left);
  const nview = new DataView(noisy.buffer);
  for (let at = fmt.dataOffset; at < fmt.dataOffset + fmt.dataBytes; at += 4) {
    if (at % 8 === 0) nview.setUint8(at, 0x5a); // a pad byte that is not zero
  }
  const nfmt = inspectWav(noisy).format;
  assert.equal(nfmt.alignment, "left", "a noisy pad byte does not turn a normal-level file right-aligned");
  const nread = sampleReaderFor(nfmt);
  const first = nread(new DataView(noisy.buffer, noisy.byteOffset, noisy.byteLength), nfmt.dataOffset);
  assert.ok(Math.abs(first - 0) < 1e-9, "the shifted read drops the pad byte entirely");
});

test("the refusals that remain: 16-bit, 8-bit, 96 kHz, more than two channels, compressed WAV — each named, each with the re-export advice (the advice never claims losslessness)", () => {
  const r16 = judgeFormat(inspectWav(sine(0.2, { bitDepth: 16 })).format);
  assert.equal(r16.ok, false);
  assert.equal(r16.reason, "unsupported-depth");
  assert.match(r16.detail, /16-bit PCM/);
  assert.match(r16.detail, /re-export the stem as a 44\.1 or 48 kHz WAV, 24-bit \(packed or 24-in-32\) or 32-bit \(int or float\)/);

  const r8 = judgeFormat(inspectWav(sine(0.2, { bitDepth: 8 })).format);
  assert.equal(r8.ok, false);
  assert.equal(r8.reason, "unsupported-depth");

  const r96 = judgeFormat(inspectWav(sine(0.2, { sampleRate: 96000 })).format);
  assert.equal(r96.ok, false);
  assert.equal(r96.reason, "unsupported-rate");
  assert.match(r96.detail, /96 kHz/);
  assert.match(r96.detail, /44\.1 or 48 kHz/);

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

  // the order of the rules: a 16-bit 96 kHz file is refused for its depth first (one reason per file)
  const both = judgeFormat(inspectWav(sine(0.1, { bitDepth: 16, sampleRate: 96000 })).format);
  assert.equal(both.reason, "unsupported-depth");
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

// --- Task 5.2: reading a header from the head of a stored copy -------------------------------------

test("Task 5.2: readWavHeader / inspectWav over the head of a file with the file's real length judge the data chunk against the file, not the head; a head too short to reach `data` says so; without the length a head is truncated as before", () => {
  const whole = sine(2, { channels: 2 });
  const head = whole.subarray(0, 1024);
  const fromHead = inspectWav(head, whole.length);
  assert.equal(fromHead.ok, true);
  assert.equal(fromHead.format.frames, 96000);
  assert.equal(fromHead.format.dataOffset, 44);
  const asBefore = inspectWav(head);
  assert.equal(asBefore.ok, false);
  assert.match(asBefore.problem.detail, /truncated/);
  const padded = sine(1, { channels: 1, extraChunks: [{ id: "JUNK", bytes: new Uint8Array(4000) }] });
  const short = readWavHeader(padded.subarray(0, 2000), padded.length);
  assert.equal(short.ok, false);
  assert.match(short.problem.detail, /No data chunk/);
  const enough = readWavHeader(padded.subarray(0, 4100), padded.length);
  assert.equal(enough.ok, true);
  assert.equal(enough.dataBytes, 48000 * 3);
  // a head that claims more than the file has is still truncated
  assert.equal(inspectWav(head, 2000).ok, false);
});
