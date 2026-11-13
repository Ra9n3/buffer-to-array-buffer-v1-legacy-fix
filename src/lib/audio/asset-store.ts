/**
 * ALLOY — PROJECT-OWNED AUDIO STORAGE — Task 5.1 (owner D5.1.2).
 *
 * The plan's project folder "plus copies of imported source audio" (§11), in
 * the browser build: an IndexedDB database `alloy` with two object stores —
 *
 *   assets   the byte-for-byte copy of each imported file (a Blob), keyed by
 *            asset id, indexed by project id, with the file's name, size,
 *            SHA-256 and the header facts the import read;
 *   peaks    the bounded waveform peaks of that copy (peaks.ts), keyed by the
 *            same asset id, carrying the same SHA-256 so a drawing can always
 *            be matched to the bytes it was made from;
 *   analysis (Task 5.2, database version 2) the analysis engine's result for
 *            that copy, keyed by the same asset id, carrying the SHA-256 and
 *            the engine version so a stale result is re-measured, never shown.
 *
 * One `put` writes asset and peaks in one transaction: a stem is in the
 * project's storage whole or not at all. The analysis record is written
 * afterwards by the engine (`putAnalysis`), and `remove` deletes all three.
 * The originals are never referenced again — move or delete them and the
 * project still has its copies.
 *
 * The contract is an interface so the pipeline and the lifecycle are tested
 * in Node against `memoryAssetStore()`; `indexedDbAssetStore(indexedDB)` is
 * the one the shell attaches, exercised in the browser evidence. Nothing in
 * this file reaches `window`: the factory is injected.
 */

import type { AnalysisResult } from "../analysis/analyser";
import type { PeakData } from "./peaks";
import type { WavEncoding } from "./wav";

export const ASSET_DB_NAME = "alloy";
/** 1 = Task 5.1 (assets, peaks); 2 = Task 5.2 adds `analysis` — the upgrade only creates the new store. */
export const ASSET_DB_VERSION = 2;
export const ASSETS_STORE = "assets";
export const PEAKS_STORE = "peaks";
export const ANALYSIS_STORE = "analysis";

/** The header facts kept with the copy and in the project manifest (model.ts `TrackAudio` carries the same). */
export interface AssetFormat {
  readonly encoding: WavEncoding;
  readonly bitDepth: number;
  /** The container size in bits (32 for a 24-in-32 file; Task 11.1). Absent on pre-11.1 records — read as `bitDepth`. */
  readonly containerBits?: number;
  /** 24-in-32 only: which end the valid bits sit at; null otherwise (Task 11.1). Absent on pre-11.1 records — read as null. */
  readonly alignment?: "left" | "right" | null;
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

/** The project-rate copy stored beside the original (Task 11.1): 32-bit float at the project's rate. */
export interface ConvertedAsset {
  /** The converted copy. A Blob in the browser; tests may pass a Uint8Array. */
  readonly bytes: Blob | Uint8Array;
  /** SHA-256 of the converted bytes — what the peaks describe. */
  readonly sha256: string;
  readonly format: AssetFormat;
}

export interface AssetRecord {
  readonly assetId: string;
  readonly projectId: string;
  /** The original file's name — the track's first name and the user's handle on the file. */
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  /** SHA-256 of the ORIGINAL bytes, hex. */
  readonly sha256: string;
  /** The ORIGINAL file's facts (rate, depth, container, alignment, channels) — retained non-destructively. */
  readonly format: AssetFormat;
  readonly importedAt: string;
  /** The original copy. A Blob in the browser; tests may pass a Uint8Array. */
  readonly bytes: Blob | Uint8Array;
  /** The project-rate copy (Task 11.1). Absent on records written before 11.1 — made by the hydrate repair. */
  readonly converted?: ConvertedAsset;
}

export interface PeaksRecord {
  readonly assetId: string;
  readonly projectId: string;
  /** The ORIGINAL's hash — the identity the record is tied to. */
  readonly sha256: string;
  /** The CONVERTED copy's hash (Task 11.1): the peaks describe these bytes. */
  readonly convertedSha256?: string;
  /** The rate the peaks were computed at — the project rate of the moment (Task 11.1); a mismatch invalidates them. */
  readonly sampleRate?: number;
  readonly peaks: PeakData;
}

/** Task 5.2 — the analysis engine's result for a copy (data-model.md §13). */
export interface AnalysisRecord {
  readonly assetId: string;
  readonly projectId: string;
  /** The SHA-256 of the bytes the result was measured from; a mismatch means re-analyse. */
  readonly sha256: string;
  readonly engineVersion: number;
  readonly analysedAt: string;
  /** Wall-clock milliseconds the run took — the measured basis of later estimates, never a promise. */
  readonly elapsedMs: number;
  readonly result: AnalysisResult;
}

export interface AssetSummary {
  readonly assetId: string;
  readonly projectId: string;
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
}

export interface AssetStore {
  readonly name: string;
  /** Both records, atomically. */
  put(asset: AssetRecord, peaks: PeaksRecord): Promise<void>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  getPeaks(assetId: string): Promise<PeaksRecord | null>;
  /** What a project owns, by id (metadata only). */
  list(projectId: string): Promise<AssetSummary[]>;
  /** Removes every record of the asset (used by tests and by a later "forget project"; the app does not delete in 5.1). */
  remove(assetId: string): Promise<void>;
  /** Task 5.2: the analysis result for a copy; overwrites. */
  putAnalysis(record: AnalysisRecord): Promise<void>;
  getAnalysis(assetId: string): Promise<AnalysisRecord | null>;
}

/* =========================================================================
   MEMORY (tests)
   ========================================================================= */

export function memoryAssetStore(options: { readonly failPuts?: () => boolean; readonly failAnalysisPuts?: () => boolean } = {}): AssetStore & {
  readonly assets: Map<string, AssetRecord>;
  readonly peaks: Map<string, PeaksRecord>;
  readonly analysis: Map<string, AnalysisRecord>;
  puts: number;
  analysisPuts: number;
} {
  const assets = new Map<string, AssetRecord>();
  const peaks = new Map<string, PeaksRecord>();
  const analysis = new Map<string, AnalysisRecord>();
  return {
    name: "memory",
    assets,
    peaks,
    analysis,
    puts: 0,
    analysisPuts: 0,
    async put(asset, p) {
      if (options.failPuts?.()) throw new Error("storage refused the write (simulated)");
      if (asset.assetId !== p.assetId) throw new Error("asset and peaks disagree on the id");
      assets.set(asset.assetId, asset);
      peaks.set(p.assetId, p);
      this.puts++;
    },
    async getAsset(id) {
      return assets.get(id) ?? null;
    },
    async getPeaks(id) {
      return peaks.get(id) ?? null;
    },
    async list(projectId) {
      return [...assets.values()].filter((a) => a.projectId === projectId).map(({ assetId, projectId: pid, fileName, size, sha256 }) => ({ assetId, projectId: pid, fileName, size, sha256 }));
    },
    async remove(id) {
      assets.delete(id);
      peaks.delete(id);
      analysis.delete(id);
    },
    async putAnalysis(record) {
      if (options.failAnalysisPuts?.()) throw new Error("storage refused the write (simulated)");
      analysis.set(record.assetId, record);
      this.analysisPuts++;
    },
    async getAnalysis(id) {
      return analysis.get(id) ?? null;
    },
  };
}

/* =========================================================================
   INDEXEDDB (the browser)
   ========================================================================= */

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

/** Opens (and on first use creates) the database; the connection is kept for the session. */
export function indexedDbAssetStore(factory: IDBFactory, options: { readonly name?: string; readonly version?: number } = {}): AssetStore {
  const name = options.name ?? ASSET_DB_NAME;
  const version = options.version ?? ASSET_DB_VERSION;
  let db: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (db) return db;
    db = new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(name, version);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(ASSETS_STORE)) {
          const assets = d.createObjectStore(ASSETS_STORE, { keyPath: "assetId" });
          assets.createIndex("projectId", "projectId", { unique: false });
        }
        if (!d.objectStoreNames.contains(PEAKS_STORE)) {
          const peaks = d.createObjectStore(PEAKS_STORE, { keyPath: "assetId" });
          peaks.createIndex("projectId", "projectId", { unique: false });
        }
        if (!d.objectStoreNames.contains(ANALYSIS_STORE)) {
          // Task 5.2 (version 2): the existing stores and their records are untouched by the upgrade
          const analysis = d.createObjectStore(ANALYSIS_STORE, { keyPath: "assetId" });
          analysis.createIndex("projectId", "projectId", { unique: false });
        }
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => d.close();
        resolve(d);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB could not be opened"));
      req.onblocked = () => reject(new Error("IndexedDB is blocked by another open tab"));
    });
    db.catch(() => {
      db = null; // let the next call retry
    });
    return db;
  };

  return {
    name: "indexeddb",
    async put(asset, peaks) {
      const d = await open();
      const tx = d.transaction([ASSETS_STORE, PEAKS_STORE], "readwrite");
      tx.objectStore(ASSETS_STORE).put(asset);
      tx.objectStore(PEAKS_STORE).put(peaks);
      await done(tx);
    },
    async getAsset(id) {
      const d = await open();
      const tx = d.transaction(ASSETS_STORE, "readonly");
      const value = await request(tx.objectStore(ASSETS_STORE).get(id) as IDBRequest<AssetRecord | undefined>);
      return value ?? null;
    },
    async getPeaks(id) {
      const d = await open();
      const tx = d.transaction(PEAKS_STORE, "readonly");
      const value = await request(tx.objectStore(PEAKS_STORE).get(id) as IDBRequest<PeaksRecord | undefined>);
      return value ?? null;
    },
    async list(projectId) {
      const d = await open();
      const tx = d.transaction(ASSETS_STORE, "readonly");
      const all = await request(tx.objectStore(ASSETS_STORE).index("projectId").getAll(projectId) as IDBRequest<AssetRecord[]>);
      return all.map(({ assetId, projectId: pid, fileName, size, sha256 }) => ({ assetId, projectId: pid, fileName, size, sha256 }));
    },
    async remove(id) {
      const d = await open();
      const tx = d.transaction([ASSETS_STORE, PEAKS_STORE, ANALYSIS_STORE], "readwrite");
      tx.objectStore(ASSETS_STORE).delete(id);
      tx.objectStore(PEAKS_STORE).delete(id);
      tx.objectStore(ANALYSIS_STORE).delete(id);
      await done(tx);
    },
    async putAnalysis(record) {
      const d = await open();
      const tx = d.transaction(ANALYSIS_STORE, "readwrite");
      tx.objectStore(ANALYSIS_STORE).put(record);
      await done(tx);
    },
    async getAnalysis(id) {
      const d = await open();
      const tx = d.transaction(ANALYSIS_STORE, "readonly");
      const value = await request(tx.objectStore(ANALYSIS_STORE).get(id) as IDBRequest<AnalysisRecord | undefined>);
      return value ?? null;
    },
  };
}

/* =========================================================================
   HASHING
   ========================================================================= */

/** SHA-256 of the bytes as lower-case hex (WebCrypto — browsers and Node 20 alike). */
export async function sha256Hex(bytes: Uint8Array, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const copy = new Uint8Array(bytes); // a tight copy: subtle.digest wants an ArrayBuffer-backed view of its own
  const digest = await subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
