/**
 * ALLOY — STEM IMPORT — Task 5.1 (plan §3 "Arrange / import", §11 rules).
 *
 * One operation over a batch of files, each judged on its own and reported
 * on its own line (the plan's per-file result); a file that fails never
 * touches the project, a file that passes is copied into the project-owned
 * storage first and becomes a track only after the copy is in. The order
 * for every file:
 *
 *   read        the whole file into memory (a stem is tens of megabytes)
 *   inspect     wav.ts: is it a RIFF/WAVE file, is its structure whole
 *   judge       import-rules.ts: the plan's format rules — refuse, explain
 *   peaks       peaks.ts: the overview and the sample peak, from the bytes
 *   hash        SHA-256 of the bytes: the identity the copy and its peaks
 *               are tied to
 *   store       asset-store.ts: copy + peaks, atomically; a storage failure
 *               is a failed file, not a half-imported one
 *   track       templates.ts: the imported track, named after the file
 *
 * The caller commits the batch (lib/project/assets.svelte.ts): the tracks
 * are appended to the open project in one structural change and the clips
 * are drawn from the peaks already in hand.
 *
 * Pure with respect to the browser: files arrive as `ImportSource`s, ids
 * and the clock are injected, the store is an `AssetStore`. Tests drive it
 * with `encodeWav` fixtures and the memory store.
 */

import type { TempoMarker } from "../arrange-timeline";
import { secondsToBars } from "../arrange-audio";
import { sha256Hex, type AssetRecord, type AssetStore, type PeaksRecord } from "../audio/asset-store";
import { dbfs, describeFormat, isSilentPeak, isVeryShort, judgeFormat, printSeconds, RE_EXPORT_ADVICE } from "../audio/import-rules";
import { computePeaks, type PeakData } from "../audio/peaks";
import { inspectWav, type WavFormat } from "../audio/wav";
import type { Track, TrackAudio } from "./model";
import { createImportedTrack, importedTrackId, nextTrackCode } from "./templates";

/** A file to import: a browser `File` wrapped, or a test's bytes. */
export interface ImportSource {
  readonly name: string;
  readonly size: number;
  readonly bytes: () => Promise<Uint8Array>;
}

export interface ImportContext {
  readonly projectId: string;
  /** The project's tracks as they are (codes are allotted after them; lengths decide padding). */
  readonly tracks: readonly Pick<Track, "id" | "code" | "audio">[];
  readonly tempoMarkers: readonly TempoMarker[];
  readonly store: AssetStore;
  readonly newId: () => string;
  readonly now: () => string;
  /** Awaited between slices of the peak calculation (the browser yields to the page). */
  readonly yieldBetween?: () => Promise<void>;
  /** Progress: which file of how many is being read. */
  readonly onProgress?: (index: number, total: number, name: string) => void;
}

export type ImportOutcome = "added" | "unsupported" | "corrupt" | "failed";
export type ImportFlag = "mono" | "silent" | "short" | "padded";

export interface ImportLine {
  readonly file: string;
  readonly outcome: ImportOutcome;
  /** One compact sentence for the band: what was accepted, or why not. */
  readonly detail: string;
  readonly flags: readonly ImportFlag[];
  /** The track the file became, when it did. */
  readonly trackId?: string;
}

export interface ImportedStem {
  readonly track: Track;
  readonly peaks: PeakData;
  readonly line: ImportLine;
}

export interface ImportResult {
  readonly projectId: string;
  readonly lines: readonly ImportLine[];
  readonly stems: readonly ImportedStem[];
  readonly added: number;
  readonly refused: number;
}

/** The name a track takes from its file: the base name without the extension, trimmed; the file name if that leaves nothing. */
export function trackNameFor(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base.length > 0 ? base : fileName;
}

/** The `TrackAudio` of a stored stem. */
export function trackAudioOf(asset: AssetRecord, peaks: PeakData): TrackAudio {
  return {
    assetId: asset.assetId,
    fileName: asset.fileName,
    sha256: asset.sha256,
    bytes: asset.size,
    encoding: asset.format.encoding,
    bitDepth: asset.format.bitDepth,
    sampleRate: asset.format.sampleRate,
    channels: asset.format.channels,
    frames: asset.format.frames,
    peakDbfs: asset.format.frames === 0 ? null : dbfs(peaks.peak),
    silent: isSilentPeak(peaks.peak, asset.format.frames),
    importedAt: asset.importedAt,
  };
}

function secondsOf(audio: TrackAudio | null): number {
  return audio ? audio.frames / audio.sampleRate : 0;
}

/** The accepted file's line: what it is, then every flag the plan asks to show. */
function acceptedDetail(format: WavFormat, flags: readonly ImportFlag[], longestSeconds: number): string {
  const parts = [printSeconds(format.seconds), describeFormat(format)];
  if (flags.includes("mono")) parts.push("played on both sides");
  if (flags.includes("silent")) parts.push("silent — kept, left out of analysis");
  if (flags.includes("short")) parts.push("very short — processed as one buffer");
  if (flags.includes("padded")) parts.push(`shorter than the longest stem — padded to ${printSeconds(longestSeconds)}`);
  return parts.join(" · ");
}

/**
 * Imports a batch, one file after another (a stem's peaks are computed on
 * the main thread in slices; two at once would only share it). Never
 * throws for a file's sake: every outcome is a line.
 */
export async function importFiles(sources: readonly ImportSource[], ctx: ImportContext): Promise<ImportResult> {
  const lines: ImportLine[] = [];
  const stems: ImportedStem[] = [];
  const codesTaken = [...ctx.tracks];
  const total = sources.length;

  for (let index = 0; index < total; index++) {
    const source = sources[index];
    ctx.onProgress?.(index, total, source.name);
    const line = await importOne(source, ctx, codesTaken);
    lines.push(line.line);
    if (line.stem) {
      stems.push(line.stem);
      codesTaken.push(line.stem.track);
    }
  }

  // padding is relative to the longest stem the project will have once the batch is in
  const longest = codesTaken.reduce((m, t) => Math.max(m, secondsOf(t.audio)), 0);
  const finalLines = lines.map((line) => {
    if (line.outcome !== "added") return line;
    const stem = stems.find((s) => s.line === line);
    if (!stem?.track.audio) return line;
    const seconds = secondsOf(stem.track.audio);
    const padded = longest - seconds > 1 / stem.track.audio.sampleRate;
    const flags = padded ? [...line.flags, "padded" as const] : line.flags;
    const format: WavFormat = {
      encoding: stem.track.audio.encoding,
      encodingName: "",
      channels: stem.track.audio.channels,
      sampleRate: stem.track.audio.sampleRate,
      containerBits: stem.track.audio.bitDepth,
      bitDepth: stem.track.audio.bitDepth,
      blockAlign: 0,
      frames: stem.track.audio.frames,
      seconds,
      dataOffset: 0,
      dataBytes: 0,
    };
    return { ...line, flags, detail: acceptedDetail(format, flags, longest) };
  });
  const finalStems = stems.map((s) => ({ ...s, line: finalLines[lines.indexOf(s.line)] }));
  ctx.onProgress?.(total, total, "");

  return {
    projectId: ctx.projectId,
    lines: finalLines,
    stems: finalStems,
    added: finalStems.length,
    refused: finalLines.length - finalStems.length,
  };
}

async function importOne(source: ImportSource, ctx: ImportContext, taken: readonly Pick<Track, "id" | "code" | "audio">[]): Promise<{ line: ImportLine; stem?: ImportedStem }> {
  const file = source.name;
  let bytes: Uint8Array;
  try {
    bytes = await source.bytes();
  } catch (e) {
    return { line: { file, outcome: "failed", detail: `could not be read: ${messageOf(e)}`, flags: [] } };
  }
  if (bytes.byteLength !== source.size && source.size > 0) {
    return { line: { file, outcome: "failed", detail: `could not be read whole (${bytes.byteLength} of ${source.size} bytes)`, flags: [] } };
  }

  const inspection = inspectWav(bytes);
  if (!inspection.ok) {
    const p = inspection.problem;
    if (p.kind === "not-wav") {
      return { line: { file, outcome: "unsupported", detail: `${p.detail}; ${RE_EXPORT_ADVICE}`, flags: [] } };
    }
    return { line: { file, outcome: "corrupt", detail: p.detail, flags: [] } };
  }
  const format = inspection.format;
  const verdict = judgeFormat(format);
  if (!verdict.ok) {
    return { line: { file, outcome: "unsupported", detail: verdict.detail, flags: [] } };
  }

  let peaks: PeakData;
  try {
    peaks = await computePeaks(bytes, format, { yieldBetween: ctx.yieldBetween });
  } catch (e) {
    return { line: { file, outcome: "corrupt", detail: messageOf(e), flags: [] } };
  }
  if (peaks.nonFinite > 0) {
    return { line: { file, outcome: "corrupt", detail: `${peaks.nonFinite} sample${peaks.nonFinite === 1 ? "" : "s"} ${peaks.nonFinite === 1 ? "is" : "are"} not a number — the float data is damaged`, flags: [] } };
  }

  const flags: ImportFlag[] = [];
  if (format.channels === 1) flags.push("mono");
  if (isSilentPeak(peaks.peak, format.frames)) flags.push("silent");
  if (isVeryShort(format.seconds)) flags.push("short");

  let sha256: string;
  try {
    sha256 = await sha256Hex(bytes);
  } catch (e) {
    return { line: { file, outcome: "failed", detail: `could not be fingerprinted: ${messageOf(e)}`, flags } };
  }

  const assetId = `asset-${ctx.newId()}`;
  const importedAt = ctx.now();
  const asset: AssetRecord = {
    assetId,
    projectId: ctx.projectId,
    fileName: file,
    mimeType: "audio/wav",
    size: bytes.byteLength,
    sha256,
    format: {
      encoding: format.encoding as "pcm" | "float",
      bitDepth: format.bitDepth,
      sampleRate: format.sampleRate,
      channels: format.channels,
      frames: format.frames,
    },
    importedAt,
    bytes: typeof Blob === "function" ? new Blob([bytes as BlobPart], { type: "audio/wav" }) : bytes,
  };
  const peaksRecord: PeaksRecord = { assetId, projectId: ctx.projectId, sha256, peaks };
  try {
    await ctx.store.put(asset, peaksRecord);
  } catch (e) {
    return { line: { file, outcome: "failed", detail: `could not be stored: ${messageOf(e)}`, flags } };
  }

  const code = nextTrackCode(taken);
  const track = createImportedTrack({
    id: importedTrackId(code),
    code,
    name: trackNameFor(file),
    org: "neutral",
    audio: trackAudioOf(asset, peaks),
  });
  const line: ImportLine = { file, outcome: "added", detail: acceptedDetail(format, flags, 0), flags, trackId: track.id };
  return { line, stem: { track, peaks, line } };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** How many bars a stem spans on the project's scale — for callers that print it. */
export function barsOf(audio: TrackAudio, markers: readonly TempoMarker[]): number {
  return secondsToBars(audio.frames / audio.sampleRate, markers);
}
