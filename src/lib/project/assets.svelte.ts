/**
 * ALLOY — THE PROJECT'S AUDIO ASSETS IN THE APP — Task 5.1.
 *
 * The one place the running app meets the asset store (lib/audio/
 * asset-store.ts): the shell attaches the browser's IndexedDB store at
 * start (tests attach the memory store); the Arrange room's import band
 * runs a batch through `importBatch`; the lifecycle calls `hydrate()` after
 * every project switch so the imported tracks of the project that just
 * opened get their waveforms back from their stored peaks — or a MISSING
 * status when the copy is not there or is not the one the manifest names
 * (the SHA-256 disagrees). The project itself opens either way: its tracks
 * and settings are in the manifest; only the drawing needs the asset.
 *
 * `status` is per track of the OPEN project and is cleared at every
 * hydration, so nothing of one project's assets is ever shown under
 * another (the no-leakage rule of Task 4.1).
 */

import { audioClip } from "../arrange-audio";
import type { AssetStore } from "../audio/asset-store";
import { isPeakData } from "../audio/peaks";
import {
  importFiles,
  type Converter,
  type ImportContext,
  type ImportResult,
  type ImportSource,
} from "./import";
import type { TrackId } from "./model";
import { appendTracks, project, setTrackClips } from "./store.svelte";
import { arrangementWithAudio } from "./templates";
import {
  changeProjectRate,
  repairAssetAtProjectRate,
  type RateChangeProgress,
  type RateChangeResult,
} from "./rate-change";

export type AudioStatus = "pending" | "ready" | "missing";

export interface HydrationReport {
  readonly projectId: string;
  readonly ready: number;
  readonly missing: number;
  /** Task 11.1: records whose project-rate copy was missing or stale and was made again here. */
  readonly repaired: number;
  /** The project switched again before this hydration finished; nothing more was written. */
  readonly aborted: boolean;
  readonly because: "no-storage" | null;
}

export interface AssetIds {
  /** A fresh unique id (the shell: `crypto.randomUUID`). */
  readonly newId: () => string;
  /** ISO 8601 timestamp of now. */
  readonly now: () => string;
  /** Awaited between slices of a main-thread stage so the page can paint (the shell: a macrotask); tests omit it. */
  readonly yieldBetween?: () => Promise<void>;
  /** Task 5.2: called with the ids of the tracks an import just appended (the shell queues their analysis). */
  readonly afterImport?: (trackIds: readonly TrackId[]) => void;
  /** Task 11.1: the conversion stage (the shell's Worker in the app; the in-thread default in tests). */
  readonly convert?: Converter;
}

let store: AssetStore | null = null;
let ids: AssetIds | null = null;
const status = $state<Record<string, AudioStatus>>({});

function clearStatus(): void {
  for (const key of Object.keys(status)) delete status[key];
}

export const assets = {
  /** The shell attaches the IndexedDB store with its id source; tests the memory store; `detach()` undoes it. */
  attach(next: AssetStore, source: AssetIds): void {
    store = next;
    ids = source;
  },
  detach(): void {
    store = null;
    ids = null;
    clearStatus();
  },
  get attached(): boolean {
    return store !== null;
  },
  get storeName(): string | null {
    return store?.name ?? null;
  },
  /** Task 11.1: the attached store, for the export dialog's source opening (null while detached). */
  get exportStore(): AssetStore | null {
    return store;
  },
  /** The asset status of a track of the open project; null for a track without audio (every fixture track). */
  statusOf(id: TrackId): AudioStatus | null {
    return status[id] ?? null;
  },

  /**
   * After a project switch: the clips of every imported track from its
   * stored peaks, and — Task 11.1 — the project-rate copy made good. A
   * record is READY when its peaks describe the converted copy at the
   * PROJECT's rate; a legacy record (no copy yet) or a stale one (a rate
   * change interrupted, or a pre-11.1 import) is REPAIRED here: the
   * conversion stage runs on the original, the store is overwritten, the
   * track's audio facts are updated, and the clips are drawn. A record that
   * cannot be repaired (its original is gone, or the conversion refuses it)
   * is MISSING and the track draws nothing.
   *
   * Reads are awaited one at a time; the project id is checked after each,
   * so a switch mid-way stops the writes.
   */
  async hydrate(): Promise<HydrationReport> {
    const projectId = project.id;
    clearStatus();
    const imported = project.tracks.filter((t) => t.audio !== null);
    for (const t of imported) status[t.id] = "pending";
    if (!store || !ids) {
      for (const t of imported) status[t.id] = "missing";
      return {
        projectId,
        ready: 0,
        missing: imported.length,
        repaired: 0,
        aborted: false,
        because: "no-storage",
      };
    }
    const rate = project.sampleRate;
    let ready = 0;
    let missing = 0;
    let repaired = 0;
    for (const t of imported) {
      const audio = t.audio;
      if (!audio) continue;
      let record = null;
      try {
        record = await store.getPeaks(audio.assetId);
      } catch {
        record = null;
      }
      if (project.id !== projectId)
        return {
          projectId,
          ready,
          missing,
          repaired,
          aborted: true,
          because: null,
        };
      const peaksAtProjectRate =
        record !== null &&
        record.sha256 === audio.sha256 &&
        isPeakData(record.peaks) &&
        record.sampleRate === rate &&
        audio.converted !== null &&
        audio.converted.sampleRate === rate;
      if (peaksAtProjectRate && record) {
        setTrackClips(t.id, [
          audioClip({
            trackCode: t.code,
            peaks: record.peaks,
            tempoMarkers: project.arrangement.tempoMarkers,
          }),
        ]);
        status[t.id] = "ready";
        ready++;
        continue;
      }
      // Task 11.1: the hydrate repair — the conversion stage over the original,
      // the store overwritten, the model's facts brought up to date.
      const outcome = await repairAssetAtProjectRate(t.id, {
        store,
        convert: ids.convert,
        yieldBetween: ids.yieldBetween,
      });
      if (project.id !== projectId)
        return {
          projectId,
          ready,
          missing,
          repaired,
          aborted: true,
          because: null,
        };
      if (outcome.ok) {
        setTrackClips(t.id, [
          audioClip({
            trackCode: t.code,
            peaks: outcome.peaks,
            tempoMarkers: project.arrangement.tempoMarkers,
          }),
        ]);
        status[t.id] = "ready";
        ready++;
        repaired++;
      } else {
        status[t.id] = "missing";
        missing++;
      }
    }
    return {
      projectId,
      ready,
      missing,
      repaired,
      aborted: false,
      because: null,
    };
  },

  /**
   * The Arrange room's import: the batch through the pipeline against the
   * open project, then the accepted stems appended in one structural
   * change with their clips drawn from the peaks just computed. Refused
   * when no store is attached — nothing is ever added that is not copied.
   */
  async importBatch(
    sources: readonly ImportSource[],
    onProgress?: ImportContext["onProgress"],
  ): Promise<ImportResult> {
    if (!store || !ids)
      throw new Error("no project storage for audio is attached");
    const projectId = project.id;
    const result = await importFiles(sources, {
      projectId,
      projectRate: project.sampleRate,
      tracks: project.tracks,
      tempoMarkers: project.arrangement.tempoMarkers,
      store,
      newId: ids.newId,
      now: ids.now,
      yieldBetween: ids.yieldBetween,
      convert: ids.convert,
      onProgress,
    });
    if (project.id !== projectId) {
      // the project switched while files were being read: the copies are stored under the old project id, the tracks are not added here
      return {
        ...result,
        stems: [],
        added: 0,
        refused: result.lines.length,
        lines: result.lines.map((l) =>
          l.outcome === "added"
            ? {
                ...l,
                outcome: "failed" as const,
                detail:
                  "the project changed during the import — stored, not added",
              }
            : l,
        ),
      };
    }
    if (result.stems.length > 0) {
      const tracks = result.stems.map((s) => s.track);
      const arrangement = arrangementWithAudio(project.arrangement, [
        ...project.tracks,
        ...tracks,
      ]);
      appendTracks(tracks, arrangement);
      for (const stem of result.stems) {
        setTrackClips(stem.track.id, [
          audioClip({
            trackCode: stem.track.code,
            peaks: stem.peaks,
            tempoMarkers: arrangement.tempoMarkers,
          }),
        ]);
        status[stem.track.id] = "ready";
      }
      ids.afterImport?.(tracks.map((t) => t.id));
    }
    return result;
  },

  /**
   * Task 11.1: the explicit, warned project-rate change. Re-resamples every
   * imported clip with progress (rate-change.ts), through the attached store
   * and the attached conversion stage. Refused while detached.
   */
  async changeRate(newRate: 44100 | 48000, onProgress?: (progress: RateChangeProgress) => void): Promise<RateChangeResult> {
    if (!store || !ids) throw new Error("no project storage for audio is attached");
    return changeProjectRate(newRate, { store, convert: ids.convert, yieldBetween: ids.yieldBetween, onProgress });
  },
} as const;
