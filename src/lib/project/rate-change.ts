/**
 * ALLOY — THE PROJECT RATE AND ITS CHANGES — Task 11.1.
 *
 * The project's rate is locked at creation. Changing an existing project's
 * rate is an explicit, warned operation that re-resamples every imported
 * clip, with progress — never silent, never per-file. This module is that
 * operation, and the smaller repair the hydrate runs for a single record
 * whose copy is missing or stale.
 *
 * ORDER OF A CHANGE (all-or-nothing at the model, self-healing at the store):
 *
 *   1. Read every imported stem's ORIGINAL from the store and check it is
 *      the copy the manifest names (hash match) — nothing is converted
 *      before every source is known to be present.
 *   2. Convert each original to the new rate (the same conversion stage as
 *      an import: parse → resample → peaks from the converted copy), and
 *      overwrite the store per asset (original + converted + peaks,
 *      atomically). A record overwritten at the new rate while the project
 *      still names the old one is repaired by the next hydrate — the peaks
 *      record carries the rate it was computed at, so a mismatch is never
 *      drawn as truth.
 *   3. Apply the new rate and every track's new audio facts in ONE structural
 *      change (the store's `applyProjectRate`): the project is never seen at
 *      the new rate with the old copies. History, autosave and the transport
 *      follow from that one event — the manifest writes the new rate, and the
 *      shell's playback watcher rebuilds the output at it.
 *
 * Resampling is high quality, not lossless; the UI says so before the change
 * runs and the decision is logged. Analysis results are NOT invalidated: they
 * measure the original's content, which a rate change does not touch.
 */

import {
  type AssetStore,
  type PeaksRecord,
  sha256Hex,
} from "../audio/asset-store";
import { convertToProjectRate, type ConversionResult } from "../audio/convert";
import type { PeakData } from "../audio/peaks";
import { isProjectRate, type ProjectRate } from "../audio/rates";
import { dbfs, isSilentPeak } from "../audio/import-rules";
import { audioClip } from "../arrange-audio";
import type { TrackAudio, TrackId } from "./model";
import {
  applyProjectRate,
  project,
  setTrackAudio,
  setTrackClips,
} from "./store.svelte";

/** Progress of a change: which stem of how many, and where in that stem's conversion. */
export interface RateChangeProgress {
  /** 0-based index of the stem being converted. */
  readonly index: number;
  readonly total: number;
  /** The stem's file name. */
  readonly name: string;
  /** 0..1 through that stem's conversion. */
  readonly fraction: number;
}

export interface RepairDeps {
  readonly store: AssetStore;
  /** The conversion stage (the shell's Worker in the app; in-thread default). */
  readonly convert?: (
    bytes: Uint8Array,
    projectRate: number,
    onProgress: (f: number) => void,
  ) => Promise<ConversionResult>;
  readonly yieldBetween?: () => Promise<void>;
}

export type RepairOutcome =
  | { readonly ok: true; readonly peaks: PeakData }
  | {
      readonly ok: false;
      readonly reason: "no-original" | "hash-mismatch" | "conversion";
      readonly detail: string;
    };

/**
 * The hydrate repair: one track's project-rate copy made good at the OPEN
 * project's rate. The original is read, converted, the store overwritten and
 * the track's audio facts updated (a structural change, like an import).
 */
export async function repairAssetAtProjectRate(
  trackId: TrackId,
  deps: RepairDeps,
): Promise<RepairOutcome> {
  const track = project.tracks.find((t) => t.id === trackId);
  const audio = track?.audio ?? null;
  if (!track || !audio)
    return {
      ok: false,
      reason: "no-original",
      detail: "the track has no imported audio to convert",
    };
  const rate = project.sampleRate;
  let asset;
  try {
    asset = await deps.store.getAsset(audio.assetId);
  } catch {
    asset = null;
  }
  if (!asset)
    return {
      ok: false,
      reason: "no-original",
      detail: "the stored copy is gone — re-import the stem",
    };
  if (asset.sha256 !== audio.sha256)
    return {
      ok: false,
      reason: "hash-mismatch",
      detail: "the stored copy is not the one the project names",
    };
  const bytes =
    asset.bytes instanceof Uint8Array
      ? asset.bytes
      : new Uint8Array(await asset.bytes.arrayBuffer());
  const convert =
    deps.convert ??
    ((b, r, onProgress) =>
      convertToProjectRate(b, r, {
        onStageProgress: onProgress,
        yieldBetween: deps.yieldBetween,
      }));
  let conversion: ConversionResult;
  try {
    conversion = await convert(bytes, rate, () => {});
  } catch (e) {
    return {
      ok: false,
      reason: "conversion",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (conversion.nonFinite > 0)
    return {
      ok: false,
      reason: "conversion",
      detail: "the original's float data is damaged",
    };
  const convertedSha256 = await sha256Hex(conversion.bytes);
  const toBlob = (b: Uint8Array): Blob | Uint8Array =>
    typeof Blob === "function"
      ? new Blob([b as BlobPart], { type: "audio/wav" })
      : b;
  await deps.store.put(
    {
      ...asset,
      converted: {
        bytes: toBlob(conversion.bytes),
        sha256: convertedSha256,
        format: {
          encoding: "float",
          bitDepth: 32,
          containerBits: 32,
          alignment: null,
          sampleRate: rate,
          channels: conversion.format.channels,
          frames: conversion.format.frames,
        },
      },
    },
    {
      assetId: asset.assetId,
      projectId: asset.projectId,
      sha256: asset.sha256,
      convertedSha256,
      sampleRate: rate,
      peaks: conversion.peaks,
    } satisfies PeaksRecord,
  );
  setTrackAudio(trackId, {
    ...audio,
    converted: {
      sampleRate: rate,
      frames: conversion.format.frames,
      peakDbfs:
        conversion.format.frames === 0 ? null : dbfs(conversion.peaks.peak),
      silent: isSilentPeak(conversion.peaks.peak, conversion.format.frames),
    },
  });
  return { ok: true, peaks: conversion.peaks };
}

export interface RateChangeResult {
  readonly ok: boolean;
  /** The rate the project now carries (the old one when ok is false and nothing was applied). */
  readonly rate: ProjectRate;
  /** How many stems were re-resampled (0 when ok is false before the conversions). */
  readonly changed: number;
  /** Why it stopped, when ok is false. */
  readonly detail: string | null;
}

export interface RateChangeDeps extends RepairDeps {
  /** Called per stem with its conversion progress. */
  readonly onProgress?: (progress: RateChangeProgress) => void;
}

/**
 * Changes the open project's rate. The warned, explicit operation: every
 * imported clip is re-resampled with progress; the project's rate flips in
 * one structural change after every copy is made. A same-rate call is an
 * honest no-op, not an error.
 */
export async function changeProjectRate(
  newRate: ProjectRate,
  deps: RateChangeDeps,
): Promise<RateChangeResult> {
  if (!isProjectRate(newRate))
    return {
      ok: false,
      rate: project.sampleRate,
      changed: 0,
      detail: `${String(newRate)} is not one of the two project rates`,
    };
  const from = project.sampleRate;
  if (newRate === from)
    return { ok: true, rate: from, changed: 0, detail: null };
  const stems = project.tracks.filter((t) => t.audio !== null);
  const total = stems.length;

  // 1. every original present and named — before anything is converted
  const originals: {
    trackId: TrackId;
    bytes: Uint8Array;
    asset: NonNullable<Awaited<ReturnType<AssetStore["getAsset"]>>>;
    audio: TrackAudio;
  }[] = [];
  for (const t of stems) {
    const audio = t.audio;
    if (!audio) continue;
    let asset;
    try {
      asset = await deps.store.getAsset(audio.assetId);
    } catch {
      asset = null;
    }
    if (!asset)
      return {
        ok: false,
        rate: from,
        changed: 0,
        detail: `${audio.fileName}: the stored copy is gone — re-import it before changing the rate`,
      };
    if (asset.sha256 !== audio.sha256)
      return {
        ok: false,
        rate: from,
        changed: 0,
        detail: `${audio.fileName}: the stored copy is not the one the project names`,
      };
    const bytes =
      asset.bytes instanceof Uint8Array
        ? asset.bytes
        : new Uint8Array(await asset.bytes.arrayBuffer());
    originals.push({ trackId: t.id, bytes, asset, audio });
  }

  // 2. convert each original to the new rate; overwrite the store per asset
  const convert =
    deps.convert ??
    ((b, r, onProgress) =>
      convertToProjectRate(b, r, {
        onStageProgress: onProgress,
        yieldBetween: deps.yieldBetween,
      }));
  const toBlob = (b: Uint8Array): Blob | Uint8Array =>
    typeof Blob === "function"
      ? new Blob([b as BlobPart], { type: "audio/wav" })
      : b;
  const audios: Map<TrackId, TrackAudio> = new Map();
  const peaksByTrack: Map<TrackId, PeakData> = new Map();
  let index = 0;
  for (const { trackId, bytes, asset, audio } of originals) {
    const name = audio.fileName;
    let conversion: ConversionResult;
    try {
      conversion = await convert(bytes, newRate, (fraction) =>
        deps.onProgress?.({ index, total, name, fraction }),
      );
    } catch (e) {
      return {
        ok: false,
        rate: from,
        changed: index,
        detail: `${name}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (conversion.nonFinite > 0)
      return {
        ok: false,
        rate: from,
        changed: index,
        detail: `${name}: the original's float data is damaged`,
      };
    const convertedSha256 = await sha256Hex(conversion.bytes);
    try {
      await deps.store.put(
        {
          ...asset,
          converted: {
            bytes: toBlob(conversion.bytes),
            sha256: convertedSha256,
            format: {
              encoding: "float",
              bitDepth: 32,
              containerBits: 32,
              alignment: null,
              sampleRate: newRate,
              channels: conversion.format.channels,
              frames: conversion.format.frames,
            },
          },
        },
        {
          assetId: asset.assetId,
          projectId: asset.projectId,
          sha256: asset.sha256,
          convertedSha256,
          sampleRate: newRate,
          peaks: conversion.peaks,
        } satisfies PeaksRecord,
      );
    } catch (e) {
      return {
        ok: false,
        rate: from,
        changed: index,
        detail: `${name}: the store refused the write (${e instanceof Error ? e.message : String(e)})`,
      };
    }
    audios.set(trackId, {
      ...audio,
      converted: {
        sampleRate: newRate,
        frames: conversion.format.frames,
        peakDbfs:
          conversion.format.frames === 0 ? null : dbfs(conversion.peaks.peak),
        silent: isSilentPeak(conversion.peaks.peak, conversion.format.frames),
      },
    });
    peaksByTrack.set(trackId, conversion.peaks);
    index++;
  }

  // 3. the one structural change: the rate and every track's facts together
  applyProjectRate(newRate, audios);
  for (const [trackId, peaks] of peaksByTrack) {
    const track = project.tracks.find((t) => t.id === trackId);
    if (track)
      setTrackClips(trackId, [
        audioClip({
          trackCode: track.code,
          peaks,
          tempoMarkers: project.arrangement.tempoMarkers,
        }),
      ]);
  }
  return { ok: true, rate: newRate, changed: index, detail: null };
}
