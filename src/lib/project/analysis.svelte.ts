/**
 * ALLOY — ANALYSIS OF THE OPEN PROJECT'S STEMS — Task 5.2 (plan §7, §11).
 *
 * The queue that runs the analysis engine (lib/analysis) over the imported
 * tracks of the open project, automatically and in the background (owner
 * decision 2026-11-02): after an import the new tracks are queued; after a
 * project opens, `hydrate()` reads each track's stored result back — valid
 * when its SHA-256 is the track's and its engine version is this one's —
 * and queues what is missing or stale. One stem at a time, slices sized by
 * the hardware profile, yielding between slices; the first run of a session
 * waits for the lazy benchmark (`hardware.ensure()`), so the profile and
 * the estimate are measured before any stem is.
 *
 * Statuses per track:  pending (reading the store) · queued · analysing
 * (with progress) · ready (result in hand, stored when storage allowed) ·
 * missing (no copy, or not the manifest's copy) · failed (the engine or the
 * copy was unreadable). A project switch stops the run in flight and drops
 * its writes. No room reads these yet — the Console's status band and the
 * rules of Phase 6 will; the debug handle (`?debug`) exposes everything.
 */
import { AnalysisAborted, analyseSource } from "../analysis/analyse";
import { ANALYSIS_SCHEMA, ENGINE_VERSION, type AnalysisResult } from "../analysis/analyser";
import { byteSourceOf } from "../analysis/decode";
import type { ProfileId } from "../analysis/profiles";
import type { AnalysisRecord, AssetStore } from "../audio/asset-store";
import { hardware } from "./hardware.svelte";
import type { TrackId } from "./model";
import { project } from "./store.svelte";

export type AnalysisStatus = "pending" | "queued" | "analysing" | "ready" | "missing" | "failed";

export interface AnalysisEntry {
  readonly status: AnalysisStatus;
  /** Fraction of the stem read, while analysing. */
  readonly progress: number;
  readonly result: AnalysisResult | null;
  /** Whether the result in hand is in the project's storage (false: kept for the session only). */
  readonly stored: boolean;
  readonly error: string | null;
  /** Milliseconds the run took, when it ran this session. */
  readonly elapsedMs: number | null;
}

export interface AnalysisDeps {
  /** ISO 8601 timestamp of now. */
  readonly now: () => string;
  /** Monotonic milliseconds (`performance.now`) for the elapsed time of a run. */
  readonly clock: () => number;
  /** Awaited between slices (the shell: a macrotask). */
  readonly yieldBetween?: () => Promise<void>;
}

export interface AnalysisSummary {
  readonly tracks: number;
  readonly ready: number;
  readonly queued: number;
  readonly analysing: number;
  readonly missing: number;
  readonly failed: number;
  readonly pending: number;
}

export interface AnalysisEstimate {
  /** Seconds of audio still to analyse (queued, plus the unread remainder of the stem in progress). */
  readonly workSeconds: number;
  /** Wall-clock seconds that should take, from the benchmark; null when nothing has been measured. */
  readonly seconds: number | null;
  readonly profile: ProfileId;
  readonly basis: "benchmark" | "unmeasured";
}

export interface HydrateReport {
  readonly projectId: string;
  readonly ready: number;
  readonly queued: number;
  readonly aborted: boolean;
  readonly because: "no-storage" | null;
}

const IDLE: AnalysisEntry = { status: "pending", progress: 0, result: null, stored: false, error: null, elapsedMs: null };

let store: AssetStore | null = null;
let deps: AnalysisDeps | null = null;
const entries = $state<Record<string, AnalysisEntry>>({});
let queue = $state<TrackId[]>([]);
let current = $state<TrackId | null>(null);
let generation = 0;
let worker: Promise<void> | null = null;
let signal = { aborted: false };

function clearEntries(): void {
  for (const key of Object.keys(entries)) delete entries[key];
}

function set(id: TrackId, patch: Partial<AnalysisEntry>): void {
  entries[id] = { ...(entries[id] ?? IDLE), ...patch };
}

function secondsOf(id: TrackId): number {
  const t = project.tracks.find((x) => x.id === id);
  return t?.audio ? t.audio.frames / t.audio.sampleRate : 0;
}

/** Stops the run in flight and forgets the queue (a project switch, a detach). */
function abortAll(): void {
  signal.aborted = true;
  signal = { aborted: false };
  generation++;
  queue = [];
  current = null;
}

function recordIsValid(record: AnalysisRecord | null, sha256: string): record is AnalysisRecord {
  return record !== null && record.sha256 === sha256 && record.engineVersion === ENGINE_VERSION && record.result?.schema === ANALYSIS_SCHEMA && record.result.cellCount >= 0;
}

async function runOne(id: TrackId, gen: number, mySignal: { aborted: boolean }): Promise<void> {
  if (!store || !deps) return;
  const track = project.tracks.find((t) => t.id === id);
  const audio = track?.audio;
  if (!audio) {
    delete entries[id];
    return;
  }
  set(id, { status: "analysing", progress: 0, error: null });
  const clock = deps.clock;
  try {
    const asset = await store.getAsset(audio.assetId);
    if (gen !== generation) return;
    if (!asset || asset.sha256 !== audio.sha256) {
      set(id, { status: "missing", progress: 0 });
      return;
    }
    // the lazy benchmark: measured once, before the first stem of the session
    // (after the copy is known to exist, so a missing stem never costs a measurement)
    await hardware.ensure();
    if (gen !== generation) return;
    const profile = hardware.profile;
    const started = clock();
    const result = await analyseSource(byteSourceOf(asset.bytes), {
      sliceFrames: Math.round(profile.settings.sliceSeconds * audio.sampleRate),
      yieldBetween: deps.yieldBetween,
      signal: mySignal,
      onProgress: (fraction) => {
        if (gen === generation) set(id, { progress: fraction });
      },
    });
    const elapsedMs = Math.max(0, clock() - started);
    if (gen !== generation) return;
    const record: AnalysisRecord = {
      assetId: audio.assetId,
      projectId: project.id,
      sha256: audio.sha256,
      engineVersion: ENGINE_VERSION,
      analysedAt: deps.now(),
      elapsedMs,
      result,
    };
    let stored = true;
    let error: string | null = null;
    try {
      await store.putAnalysis(record);
    } catch (e) {
      stored = false;
      error = `measured, but not stored: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (gen !== generation) return;
    set(id, { status: "ready", progress: 1, result, stored, error, elapsedMs });
  } catch (e) {
    if (e instanceof AnalysisAborted || gen !== generation) return;
    set(id, { status: "failed", progress: 0, error: e instanceof Error ? e.message : String(e) });
  }
}

function pump(): void {
  if (worker) return;
  const gen = generation;
  const mySignal = signal;
  worker = (async () => {
    try {
      while (gen === generation && queue.length > 0) {
        const id = queue[0];
        current = id;
        await runOne(id, gen, mySignal);
        if (gen !== generation) return;
        queue = queue.filter((q) => q !== id);
        current = null;
      }
    } finally {
      worker = null;
      if (gen === generation) current = null;
      if (gen === generation && queue.length > 0) pump(); // enqueued while finishing
    }
  })();
}

export const analysis = {
  attach(next: AssetStore, source: AnalysisDeps): void {
    store = next;
    deps = source;
  },
  detach(): void {
    abortAll();
    store = null;
    deps = null;
    clearEntries();
  },
  get attached(): boolean {
    return store !== null;
  },
  /** The analysis status of a track of the open project; null for a track without audio. */
  statusOf(id: TrackId): AnalysisStatus | null {
    return entries[id]?.status ?? null;
  },
  entryOf(id: TrackId): AnalysisEntry | null {
    return entries[id] ?? null;
  },
  /** The result in hand for a track, or null until it is ready. */
  resultOf(id: TrackId): AnalysisResult | null {
    return entries[id]?.result ?? null;
  },
  get current(): TrackId | null {
    return current;
  },
  get queued(): readonly TrackId[] {
    return queue;
  },
  get summary(): AnalysisSummary {
    const s = { tracks: 0, ready: 0, queued: 0, analysing: 0, missing: 0, failed: 0, pending: 0 };
    for (const e of Object.values(entries)) {
      s.tracks++;
      s[e.status]++;
    }
    return s;
  },
  /** What is left to analyse and how long it should take — from the benchmark, or null when unmeasured. */
  get estimate(): AnalysisEstimate {
    let work = 0;
    for (const id of queue) {
      const e = entries[id];
      const seconds = secondsOf(id);
      work += e?.status === "analysing" ? seconds * (1 - e.progress) : seconds;
    }
    const profile = hardware.profile;
    return { workSeconds: work, seconds: hardware.estimateSeconds(work), profile: profile.id, basis: profile.source === "unmeasured" ? "unmeasured" : "benchmark" };
  },

  /**
   * After a project switch: every imported track's stored result read
   * back; what is missing or stale is queued. Reads are awaited one at a
   * time and the project id checked after each, so a switch mid-way stops.
   */
  async hydrate(): Promise<HydrateReport> {
    abortAll();
    clearEntries();
    const projectId = project.id;
    const gen = generation;
    const imported = project.tracks.filter((t) => t.audio !== null);
    for (const t of imported) set(t.id, { status: "pending" });
    if (!store) {
      for (const t of imported) set(t.id, { status: "missing" });
      return { projectId, ready: 0, queued: 0, aborted: false, because: "no-storage" };
    }
    let ready = 0;
    const toQueue: TrackId[] = [];
    for (const t of imported) {
      const audio = t.audio;
      if (!audio) continue;
      let record: AnalysisRecord | null = null;
      try {
        record = await store.getAnalysis(audio.assetId);
      } catch {
        record = null;
      }
      if (gen !== generation || project.id !== projectId) return { projectId, ready, queued: 0, aborted: true, because: null };
      if (recordIsValid(record, audio.sha256)) {
        set(t.id, { status: "ready", progress: 1, result: record.result, stored: true, error: null, elapsedMs: null });
        ready++;
      } else {
        toQueue.push(t.id);
      }
    }
    this.enqueue(toQueue);
    return { projectId, ready, queued: toQueue.length, aborted: false, because: null };
  },

  /** Queues the given imported tracks of the open project (ignoring what is ready, queued or running); starts the worker. */
  enqueue(ids: readonly TrackId[]): number {
    if (!store) return 0;
    let added = 0;
    for (const id of ids) {
      const track = project.tracks.find((t) => t.id === id);
      if (!track?.audio) continue;
      const status = entries[id]?.status;
      if (status === "ready" || status === "queued" || status === "analysing") continue;
      set(id, { status: "queued", progress: 0, error: null });
      queue = [...queue, id];
      added++;
    }
    if (added > 0) pump();
    return added;
  },

  /** Forgets a track's result and queues it again (the debug handle's "measure again"). */
  reanalyse(id: TrackId): boolean {
    if (!store || !project.tracks.some((t) => t.id === id && t.audio)) return false;
    if (current === id) return false;
    set(id, { status: "pending", progress: 0, result: null, stored: false, error: null, elapsedMs: null });
    queue = queue.filter((q) => q !== id);
    return this.enqueue([id]) === 1;
  },
} as const;
