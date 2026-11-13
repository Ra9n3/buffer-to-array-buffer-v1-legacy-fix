/**
 * ALLOY — IMPORT RULES — Task 5.1, widened by Task 11.1.
 *
 * The plan's §11 "Import rules and edge cases", applied as written (locked
 * decision L749; owner D5.1.3), with the Task 11.1 architecture: a file at
 * EITHER project rate is accepted and converted once on import —
 *
 *   accepted      44.1 kHz or 48 kHz · 24-bit PCM (packed, or 24 valid bits
 *                 in a 32-bit container — either alignment) · 32-bit int PCM
 *                 · 32-bit IEEE float · mono or stereo · a RIFF/WAVE file
 *                 (plain or WAVE_FORMAT_EXTENSIBLE)
 *   refused       any other container, encoding, bit depth or sample rate —
 *                 "explain the issue and ask the user to convert or re-export
 *                 rather than silently converting it"; more than two channels
 *                 (a stem is mono or stereo — the plan's locked rule; the
 *                 parser still reads and describes a multichannel header,
 *                 channel mask included, before the rule refuses it)
 *   corrupt       refused with a named reason; the rest of the batch goes on
 *   mono          accepted; flagged (the engine duplicates it to L and R)
 *   silent        accepted; a mild warning; excluded from analysis targets
 *                 later (5.2) — the flag is stored so that it can be
 *   shorter stem  accepted; padded with silence to the longest at render
 *                 time (the engine's job); which tracks are padded is shown
 *   very short    accepted; noted ("processed as one smaller buffer")
 *
 * Nothing here converts, resamples or dithers — the conversion stage
 * (lib/audio/convert.ts) is the only thing that does, once, after these
 * rules have said yes. Thresholds that no document fixes are named below as
 * provisional (decisions-log D5.1.5).
 */

import { is24In32, type WavFormat } from "./wav";
import type { ProjectRate } from "./rates";

/** The two rates an import may carry (Task 11.1); the project's own rate decides what it becomes. */
export const IMPORT_RATES: readonly ProjectRate[] = [44100, 48000];

/** The layouts the conversion stage can decode, as words for a message (Task 11.1's accepted list). */
export const ACCEPTED_FORMATS = [
  "24-bit PCM",
  "24-bit PCM in a 32-bit container (left-aligned)",
  "24-bit PCM in a 32-bit container (right-aligned)",
  "32-bit int PCM",
  "32-bit float",
] as const;

export const MAX_CHANNELS = 2;

/**
 * The one sentence every format refusal ends with — the plan's "convert or
 * re-export", in the Task 11.1 vocabulary. Never a promise of losslessness.
 */
export const RE_EXPORT_ADVICE = "re-export the stem as a 44.1 or 48 kHz WAV, 24-bit (packed or 24-in-32) or 32-bit (int or float)";

/** What the import says when it converted a file — honest, never "lossless". */
export const CONVERSION_NOTICE = "high-quality resampling to the project rate — not lossless";

/**
 * Silence (provisional, D5.1.5): a sample peak at or below −80 dBFS over the
 * whole file — far below anything audible on a stem, above the dither floor
 * of a 24-bit file so a "silent" export with dither still reads as silent.
 * The stored peak lets a later task move the line without re-reading files.
 */
export const SILENCE_PEAK_DBFS = -80;

/**
 * Very short (provisional, D5.1.5): under one second. The plan ties "very
 * short" to the engine's processing chunk, whose length is "an implementation
 * choice to be validated" (5.2 / 7.4); one second is a placeholder for that
 * figure and only produces a note, never a refusal.
 */
export const SHORT_SECONDS = 1;

export type FormatRefusal =
  | { readonly reason: "unsupported-encoding"; readonly detail: string }
  | { readonly reason: "unsupported-depth"; readonly detail: string }
  | { readonly reason: "unsupported-rate"; readonly detail: string }
  | { readonly reason: "unsupported-channels"; readonly detail: string };

export type FormatVerdict = { readonly ok: true } | ({ readonly ok: false } & FormatRefusal);

/** The depth words of a layout: "24-bit PCM", "24-bit PCM (24-in-32, left-aligned)", "32-bit float" … */
export function describeDepth(f: Pick<WavFormat, "encoding" | "encodingName" | "bitDepth" | "containerBits" | "alignment">): string {
  if (f.encoding === "other") return f.encodingName;
  if (f.encoding === "float") return `${f.bitDepth}-bit float`;
  if (is24In32(f)) return `24-bit PCM (24-in-32, ${f.alignment ?? "left"}-aligned)`;
  return `${f.bitDepth}-bit ${f.encoding === "pcm" ? "PCM" : f.encodingName}`;
}

/** "44.1 kHz · 24-bit PCM (24-in-32, left-aligned) · stereo" — the file as it is, for every message. */
export function describeFormat(f: Pick<WavFormat, "encoding" | "encodingName" | "bitDepth" | "containerBits" | "alignment" | "sampleRate" | "channels">): string {
  const rate = f.sampleRate % 1000 === 0 ? `${f.sampleRate / 1000} kHz` : `${(f.sampleRate / 1000).toFixed(1)} kHz`;
  const depth = describeDepth(f);
  const ch = f.channels === 1 ? "mono" : f.channels === 2 ? "stereo" : `${f.channels} channels`;
  return `${rate} · ${depth} · ${ch}`;
}

/** The accepted layouts as one depth test: pcm 24 (packed or 24-in-32, either end), int 32, float 32. */
function depthAccepted(f: Pick<WavFormat, "encoding" | "bitDepth" | "containerBits">): boolean {
  if (f.encoding === "float") return f.bitDepth === 32;
  if (f.encoding === "pcm") return f.bitDepth === 24 || f.bitDepth === 32;
  return false;
}

/** The plan's rules over an inspected format; the first failing rule names the refusal. */
export function judgeFormat(f: WavFormat): FormatVerdict {
  const as = describeFormat(f);
  if (f.encoding === "other") {
    return { ok: false, reason: "unsupported-encoding", detail: `${as} — a compressed WAV; ${RE_EXPORT_ADVICE}` };
  }
  if (!depthAccepted(f)) {
    return { ok: false, reason: "unsupported-depth", detail: `${as} — ALLOY takes 24-bit PCM (packed or 24-in-32) or 32-bit (int or float); ${RE_EXPORT_ADVICE}` };
  }
  if (!IMPORT_RATES.includes(f.sampleRate as ProjectRate)) {
    return { ok: false, reason: "unsupported-rate", detail: `${as} — ALLOY works at 44.1 or 48 kHz; ${RE_EXPORT_ADVICE}` };
  }
  if (f.channels > MAX_CHANNELS) {
    return { ok: false, reason: "unsupported-channels", detail: `${as} — a stem is mono or stereo; re-export it as mono or stereo` };
  }
  return { ok: true };
}

/** dBFS of a linear sample peak; −Infinity for 0. */
export function dbfs(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

export function isSilentPeak(linearPeak: number, frames: number): boolean {
  return frames === 0 || dbfs(linearPeak) <= SILENCE_PEAK_DBFS;
}

export function isVeryShort(seconds: number): boolean {
  return seconds < SHORT_SECONDS;
}

/** "3:12.4" — seconds as a compact print. */
export function printSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  const tenth = Math.floor((seconds - whole) * 10);
  return `${m}:${String(s).padStart(2, "0")}${seconds < 60 ? `.${tenth}` : ""}`;
}
