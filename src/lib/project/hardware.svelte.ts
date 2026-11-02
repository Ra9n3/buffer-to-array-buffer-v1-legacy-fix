/**
 * ALLOY — THE HARDWARE PROFILE IN USE — Task 5.2 (plan §11).
 *
 * Which profile the analysis engine runs under, and what that is based on:
 *
 *   override    the user chose Lite / Standard / Performance in Settings
 *               (`settings.hardwareProfile`, Task 4.1) — honoured as is;
 *   benchmark   Settings says Automatic and a benchmark has been measured on
 *               this device (cached under `alloy.benchmark`, 30 days, this
 *               engine version, this core count);
 *   unmeasured  Settings says Automatic and nothing has been measured yet —
 *               the engine behaves as Standard and promises no time.
 *
 * The benchmark is lazy: `ensure()` runs it once, before the first analysis
 * (owner decision 2026-11-02), and concurrent callers share the one run. A
 * change of the Settings choice takes effect at the next analysis; nothing
 * here touches the Settings panel, which keeps printing the plan's intents.
 */
import { BENCHMARK_KEY, estimateSeconds, parseBenchmark, runBenchmark, serializeBenchmark, type BenchmarkRecord } from "../analysis/benchmark";
import { PROFILE_SETTINGS, UNMEASURED_PROFILE, type ProfileId, type ProfileSettings } from "../analysis/profiles";
import { settings } from "../settings.svelte";
import type { StorageAdapter } from "./persistence";

export type ProfileSource = "override" | "benchmark" | "unmeasured";

export interface ResolvedProfile {
  readonly id: ProfileId;
  readonly source: ProfileSource;
  readonly settings: ProfileSettings;
}

export interface HardwareDeps {
  /** Where the benchmark record is cached (the shell: localStorage); null when storage is unavailable. */
  readonly storage: StorageAdapter | null;
  /** ISO 8601 timestamp of now (the record) and epoch milliseconds (the expiry). */
  readonly now: () => string;
  readonly nowMs: () => number;
  /** Monotonic milliseconds for timing the run (`performance.now`). */
  readonly clock: () => number;
  readonly cores: number | null;
  readonly memoryGb: number | null;
  readonly yieldBetween?: () => Promise<void>;
}

let deps: HardwareDeps | null = null;
let running: Promise<BenchmarkRecord | null> | null = null;
let benchmark = $state.raw<BenchmarkRecord | null>(null); // an immutable record: no deep proxy
let benchmarkError = $state<string | null>(null);
let runs = $state(0);

function readCached(): BenchmarkRecord | null {
  if (!deps?.storage) return null;
  try {
    const value = deps.storage.read(BENCHMARK_KEY);
    const text = value && typeof (value as Promise<unknown>).then === "function" ? null : (value as string | null);
    return parseBenchmark(text, { cores: deps.cores, nowMs: deps.nowMs() });
  } catch {
    return null;
  }
}

function writeCached(record: BenchmarkRecord): void {
  if (!deps?.storage) return;
  try {
    void deps.storage.write(BENCHMARK_KEY, serializeBenchmark(record));
  } catch (e) {
    benchmarkError = e instanceof Error ? e.message : String(e);
  }
}

export const hardware = {
  attach(next: HardwareDeps): void {
    deps = next;
    running = null;
    benchmarkError = null;
    runs = 0;
    benchmark = readCached();
  },
  detach(): void {
    deps = null;
    running = null;
    benchmark = null;
    benchmarkError = null;
    runs = 0;
  },
  get attached(): boolean {
    return deps !== null;
  },
  /** The measurement in hand (cached or just run), or null. */
  get benchmark(): BenchmarkRecord | null {
    return benchmark;
  },
  get benchmarkError(): string | null {
    return benchmarkError;
  },
  /** How many benchmark runs happened since attach (tests, the debug handle). */
  get runs(): number {
    return runs;
  },
  get measuring(): boolean {
    return running !== null;
  },
  /** The profile the engine runs under right now and why. */
  get profile(): ResolvedProfile {
    const chosen = settings.hardwareProfile;
    if (chosen !== "auto") return { id: chosen, source: "override", settings: PROFILE_SETTINGS[chosen] };
    if (benchmark) return { id: benchmark.profile, source: "benchmark", settings: PROFILE_SETTINGS[benchmark.profile] };
    return { id: UNMEASURED_PROFILE, source: "unmeasured", settings: PROFILE_SETTINGS[UNMEASURED_PROFILE] };
  },
  /** Seconds the engine should take for `workSeconds` of audio, from the measurement; null when unmeasured. */
  estimateSeconds(workSeconds: number): number | null {
    return estimateSeconds(workSeconds, benchmark);
  },
  /**
   * The benchmark, measured once: returns the cached record when it is
   * valid, otherwise runs the workload (sharing one run between callers)
   * and caches the result. Null when not attached or when the run failed.
   */
  ensure(): Promise<BenchmarkRecord | null> {
    if (!deps) return Promise.resolve(null);
    if (benchmark) return Promise.resolve(benchmark);
    if (running) return running;
    const d = deps;
    running = (async () => {
      try {
        const record = await runBenchmark({ now: d.now, clock: d.clock, cores: d.cores, memoryGb: d.memoryGb, yieldBetween: d.yieldBetween });
        if (deps !== d) return null; // detached meanwhile
        runs++;
        benchmark = record;
        benchmarkError = null;
        writeCached(record);
        return record;
      } catch (e) {
        if (deps === d) benchmarkError = e instanceof Error ? e.message : String(e);
        return null;
      } finally {
        if (deps === d) running = null;
      }
    })();
    return running;
  },
  /** Forgets the measurement (the next `ensure()` measures again); the debug handle's "measure again". */
  invalidate(): void {
    benchmark = null;
    benchmarkError = null;
  },
} as const;
