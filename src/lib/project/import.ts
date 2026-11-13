/**
 * ALLOY — STEM IMPORT — Task 5.1, rebuilt on the Task 11.1 pipeline.
 *
 * One operation over a batch of files, each judged on its own and reported
 * on its own line (the plan's per-file result); a file that fails never
 * touches the project, a file that passes is copied into the project-owned
 * storage first and becomes a track only after the copy is in. The order
 * for every file (the task's pipeline order):
 *
 *   read        the whole file into memory (a stem is tens of megabytes)
 *   inspect     wav.ts: is it a RIFF/WAVE file, is its structure whole
 *   judge       import-rules.ts: the plan's format rules — refuse, explain
 *   convert     the conversion stage (lib/audio/convert.ts), in the Worker
 *               where the shell wired one: parse → resample to the project
 *               rate → peaks from the converted copy. Non-destructive: the
 *               original bytes and their facts travel beside the conversion.
 *   hash        SHA-256 of the ORIGINAL bytes (the identity the copy and its
 *               peaks are tied to) and of the converted copy (what the peaks
 *               describe)
 *   store       asset-store.ts: original + converted + peaks, atomically; a
 *               storage failure is a failed file, not a half-imported one
 *   track       templates.ts: the imported track, named after the file
 *
 * The caller commits the batch (lib/project/assets.svelte.ts): the tracks
 * are appended to the open project in one structural change and the clips
 * are drawn from the peaks already in hand.
 *
 * Pure with respect to the browser: files arrive as `ImportSource`s, ids
 * and the clock are injected, the store is an `AssetStore`, the conversion
 * stage is injected (in-thread by default; the shell hands the Worker one).
 */

import type { TempoMarker } from "../arrange-timeline";
import { secondsToBars } from "../arrange-audio";
import {
  type AssetFormat,
  type ConvertedAsset,
  type AssetRecord,
  type AssetStore,
  type PeaksRecord,
  sha256Hex,
} from "../audio/asset-store";
import {
  dbfs,
  describeFormat,
  isSilentPeak,
  isVeryShort,
  judgeFormat,
  CONVERSION_NOTICE,
  printSeconds,
  RE_EXPORT_ADVICE,
} from "../audio/import-rules";
import { printRateChange } from "../audio/rates";
import type { PeakData } from "../audio/peaks";
import { inspectWav, type WavEncoding, type WavFormat } from "../audio/wav";
import { convertToProjectRate, type ConversionResult } from "../audio/convert";
import { audioSeconds, type Track, type TrackAudio } from "./model";
import {
  createImportedTrack,
  importedTrackId,
  nextTrackCode,
} from "./templates";

/** A file to import: a browser `File` wrapped, or a test's bytes. */
export interface ImportSource {
  readonly name: string;
  readonly size: number;
  readonly bytes: () => Promise<Uint8Array>;
}

/** The conversion stage, injected (in-thread default; the shell's Worker in the app). */
export type Converter = (
  bytes: Uint8Array,
  projectRate: number,
  onProgress: (fraction: number) => void,
) => Promise<ConversionResult>;

export interface ImportContext {
  readonly projectId: string;
  /** The project's one rate — what every accepted file is converted to. */
  readonly projectRate: number;
  /** The project's tracks as they are (codes are allotted after them; lengths decide padding). */
  readonly tracks: readonly Pick<Track, "id" | "code" | "audio">[];
  readonly tempoMarkers: readonly TempoMarker[];
  readonly store: AssetStore;
  readonly newId: () => string;
  readonly now: () => string;
  /** Awaited between slices of the main-thread fallback (the Worker needs none). */
  readonly yieldBetween?: () => Promise<void>;
  /** The conversion stage (default: in-thread). */
  readonly convert?: Converter;
  /** Progress: which file of how many is being read. */
  readonly onProgress?: (index: number, total: number, name: string) => void;
  /** Per-file stage progress (0..1 through decode, resample, peaks). */
  readonly onFileProgress?: (name: string, fraction: number) => void;
}

export type ImportOutcome = "added" | "unsupported" | "corrupt" | "failed";
export type ImportFlag = "mono" | "silent" | "short" | "padded" | "converted";

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
  /** The file's own facts and whether the rate stage ran — for the final line's wording. */
  readonly sourceFormat: WavFormat;
  readonly resampled: boolean;
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

/** The `TrackAudio` of a stored stem: the original's facts plus the project-rate copy's. */
export function trackAudioOf(
  asset: AssetRecord,
  peaks: PeakData,
  converted: ConvertedAsset,
): TrackAudio {
  const f = asset.format;
  return {
    assetId: asset.assetId,
    fileName: asset.fileName,
    sha256: asset.sha256,
    bytes: asset.size,
    encoding: f.encoding,
    bitDepth: f.bitDepth,
    containerBits: f.containerBits ?? f.bitDepth,
    alignment: f.alignment ?? null,
    sampleRate: f.sampleRate,
    channels: f.channels,
    frames: f.frames,
    peakDbfs: f.frames === 0 ? null : dbfs(peaks.peak),
    silent: isSilentPeak(peaks.peak, f.frames),
    importedAt: asset.importedAt,
    converted: {
      sampleRate: converted.format.sampleRate,
      frames: converted.format.frames,
      peakDbfs: converted.format.frames === 0 ? null : dbfs(peaks.peak),
      silent: isSilentPeak(peaks.peak, converted.format.frames),
    },
  };
}

function secondsOf(audio: TrackAudio | null): number {
  return audio ? audioSeconds(audio) : 0;
}

/** The accepted file's line: what it is, what was done to it, then every flag the plan asks to show. */
function acceptedDetail(
  source: WavFormat,
  projectRate: number,
  flags: readonly ImportFlag[],
  longestSeconds: number,
): string {
  const parts = [printSeconds(source.seconds), describeFormat(source)];
  if (flags.includes("converted"))
    parts.push(
      `${printRateChange(source.sampleRate, projectRate)} — ${CONVERSION_NOTICE}`,
    );
  if (flags.includes("mono")) parts.push("played on both sides");
  if (flags.includes("silent"))
    parts.push("silent — kept, left out of analysis");
  if (flags.includes("short"))
    parts.push("very short — processed as one buffer");
  if (flags.includes("padded"))
    parts.push(
      `shorter than the longest stem — padded to ${printSeconds(longestSeconds)}`,
    );
  return parts.join(" · ");
}

/**
 * Imports a batch, one file after another. Never throws for a file's sake:
 * every outcome is a line.
 */
export async function importFiles(
  sources: readonly ImportSource[],
  ctx: ImportContext,
): Promise<ImportResult> {
  const lines: ImportLine[] = [];
  const stems: ImportedStem[] = [];
  const codesTaken = [...ctx.tracks];
  const total = sources.length;
  const convert: Converter =
    ctx.convert ??
    ((bytes, rate, onProgress) =>
      convertToProjectRate(bytes, rate, {
        onStageProgress: onProgress,
        yieldBetween: ctx.yieldBetween,
      }));

  for (let index = 0; index < total; index++) {
    const source = sources[index];
    ctx.onProgress?.(index, total, source.name);
    const line = await importOne(source, ctx, codesTaken, convert);
    lines.push(line.line);
    if (line.stem) {
      stems.push(line.stem);
      codesTaken.push(line.stem.track);
    }
  }

  // padding is relative to the longest stem the project will have once the batch is in
  const longest = codesTaken.reduce(
    (m, t) => Math.max(m, secondsOf(t.audio)),
    0,
  );
  const finalLines = lines.map((line) => {
    if (line.outcome !== "added") return line;
    const stem = stems.find((s) => s.line === line);
    if (!stem?.track.audio) return line;
    const source: WavFormat = stem.sourceFormat;
    const seconds = secondsOf(stem.track.audio);
    const oneSample = 1 / ctx.projectRate;
    const padded = longest - seconds > oneSample;
    const flags = padded ? [...line.flags, "padded" as const] : line.flags;
    return {
      ...line,
      flags,
      detail: acceptedDetail(source, ctx.projectRate, flags, longest),
    };
  });
  const finalStems = stems.map((s) => ({
    ...s,
    line: finalLines[lines.indexOf(s.line)],
  }));
  ctx.onProgress?.(total, total, "");

  return {
    projectId: ctx.projectId,
    lines: finalLines,
    stems: finalStems,
    added: finalStems.length,
    refused: finalLines.length - finalStems.length,
  };
}

interface StemOutcome {
  readonly line: ImportLine;
  readonly stem?: ImportedStem;
  /** The file's own facts, for the final line's wording. */
  readonly sourceFormat?: WavFormat;
  readonly resampled?: boolean;
}

async function importOne(
  source: ImportSource,
  ctx: ImportContext,
  taken: readonly Pick<Track, "id" | "code" | "audio">[],
  convert: Converter,
): Promise<StemOutcome> {
  const file = source.name;
  let bytes: Uint8Array;
  try {
    bytes = await source.bytes();
  } catch (e) {
    return {
      line: {
        file,
        outcome: "failed",
        detail: `could not be read: ${messageOf(e)}`,
        flags: [],
      },
    };
  }
  if (bytes.byteLength !== source.size && source.size > 0) {
    return {
      line: {
        file,
        outcome: "failed",
        detail: `could not be read whole (${bytes.byteLength} of ${source.size} bytes)`,
        flags: [],
      },
    };
  }

  const inspection = inspectWav(bytes);
  if (!inspection.ok) {
    const p = inspection.problem;
    if (p.kind === "not-wav") {
      return {
        line: {
          file,
          outcome: "unsupported",
          detail: `${p.detail}; ${RE_EXPORT_ADVICE}`,
          flags: [],
        },
      };
    }
    return { line: { file, outcome: "corrupt", detail: p.detail, flags: [] } };
  }
  const format = inspection.format;
  const verdict = judgeFormat(format);
  if (!verdict.ok) {
    return {
      line: { file, outcome: "unsupported", detail: verdict.detail, flags: [] },
    };
  }

  // THE CONVERSION STAGE — parse, resample to the project rate, peaks from the
  // converted copy. Non-destructive: the original's bytes and facts are kept.
  let conversion: ConversionResult;
  try {
    conversion = await convert(bytes, ctx.projectRate, (fraction) =>
      ctx.onFileProgress?.(file, fraction),
    );
  } catch (e) {
    return {
      line: { file, outcome: "corrupt", detail: messageOf(e), flags: [] },
    };
  }
  if (conversion.nonFinite > 0) {
    const n = conversion.nonFinite;
    return {
      line: {
        file,
        outcome: "corrupt",
        detail: `${n} sample${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} not a number — the float data is damaged`,
        flags: [],
      },
    };
  }

  const flags: ImportFlag[] = [];
  if (conversion.resampled) flags.push("converted");
  if (format.channels === 1) flags.push("mono");
  if (isSilentPeak(conversion.peaks.peak, conversion.format.frames))
    flags.push("silent");
  if (isVeryShort(conversion.source.seconds)) flags.push("short");

  // hashes: the original is the identity; the converted copy is what the peaks describe
  let sha256: string;
  let convertedSha256: string;
  try {
    [sha256, convertedSha256] = await Promise.all([
      sha256Hex(bytes),
      sha256Hex(conversion.bytes),
    ]);
  } catch (e) {
    return {
      line: {
        file,
        outcome: "failed",
        detail: `could not be fingerprinted: ${messageOf(e)}`,
        flags,
      },
    };
  }

  const assetId = `asset-${ctx.newId()}`;
  const importedAt = ctx.now();
  const toBlob = (b: Uint8Array): Blob | Uint8Array =>
    typeof Blob === "function"
      ? new Blob([b as BlobPart], { type: "audio/wav" })
      : b;
  const sourceFormat: AssetFormat = {
    // the judge refused "other" before the conversion stage; these are its facts
    encoding: format.encoding as WavEncoding,
    bitDepth: format.bitDepth,
    containerBits: format.containerBits,
    alignment: format.alignment,
    sampleRate: format.sampleRate,
    channels: format.channels,
    frames: format.frames,
  };
  const convertedAsset: ConvertedAsset = {
    bytes: toBlob(conversion.bytes),
    sha256: convertedSha256,
    format: {
      encoding: "float",
      bitDepth: 32,
      containerBits: 32,
      alignment: null,
      sampleRate: conversion.format.sampleRate,
      channels: conversion.format.channels,
      frames: conversion.format.frames,
    },
  };
  const asset: AssetRecord = {
    assetId,
    projectId: ctx.projectId,
    fileName: file,
    mimeType: "audio/wav",
    size: bytes.byteLength,
    sha256,
    // the ORIGINAL's facts — the source metadata, retained non-destructively
    format: sourceFormat,
    importedAt,
    bytes: toBlob(bytes),
    // the project-rate copy in the one internal format, beside the original
    converted: convertedAsset,
  };
  // peaks keyed to the converted asset: they describe the copy, at the copy's rate
  const peaksRecord: PeaksRecord = {
    assetId,
    projectId: ctx.projectId,
    sha256,
    convertedSha256,
    sampleRate: conversion.format.sampleRate,
    peaks: conversion.peaks,
  };
  try {
    await ctx.store.put(asset, peaksRecord);
  } catch (e) {
    return {
      line: {
        file,
        outcome: "failed",
        detail: `could not be stored: ${messageOf(e)}`,
        flags,
      },
    };
  }

  const code = nextTrackCode(taken);
  const track = createImportedTrack({
    id: importedTrackId(code),
    code,
    name: trackNameFor(file),
    org: "neutral",
    audio: trackAudioOf(asset, conversion.peaks, convertedAsset),
  });
  const line: ImportLine = {
    file,
    outcome: "added",
    detail: acceptedDetail(format, ctx.projectRate, flags, 0),
    flags,
    trackId: track.id,
  };
  return {
    line,
    stem: {
      track,
      peaks: conversion.peaks,
      line,
      sourceFormat: format,
      resampled: conversion.resampled,
    },
    sourceFormat: format,
    resampled: conversion.resampled,
  };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** How many bars a stem spans on the project's scale — for callers that print it. */
export function barsOf(
  audio: TrackAudio,
  markers: readonly TempoMarker[],
): number {
  return secondsToBars(audioSeconds(audio), markers);
}
