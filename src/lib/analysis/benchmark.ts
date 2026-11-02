/**
 * ALLOY analysis — the hardware benchmark and the time estimate (Task 5.2).
 *
 * Plan §11: "measured, not promised". The benchmark runs the real engine
 * over a representative synthetic stem — four seconds of deterministic
 * stereo audio with tones, noise and clicks, encoded as 24-bit PCM so the
 * decode is measured too — and reports the throughput as seconds of audio
 * per wall-clock second. The profile follows from that figure (profiles.ts)
 * and the estimate for a queue of stems follows from the same figure with a
 * margin. Without a measurement there is no estimate: `estimateSeconds`
 * returns null rather than a number nobody measured.
 *
 * The record is cached by the shell under `alloy.benchmark` (localStorage,
 * owner decision 2026-11-02) for 30 days; a different engine version or a
 * different core count invalidates it.
 */
import { analyseBytes } from "./analyse";
import { ENGINE_VERSION } from "./analyser";
import { encodeWav } from "../audio/wav";
import { chooseProfile, isProfileId, type DeviceFacts, type ProfileId } from "./profiles";

export const BENCHMARK_SCHEMA = "alloy.benchmark/1";
export const BENCHMARK_KEY = "alloy.benchmark";
export const BENCHMARK_WORKLOAD_SECONDS = 4;
export const BENCHMARK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** The estimate's safety margin over the measured throughput (machines are busier than at the benchmark). */
export const ESTIMATE_MARGIN = 1.25;

export interface BenchmarkRecord {
  readonly schema: typeof BENCHMARK_SCHEMA;
  readonly engineVersion: number;
  readonly measuredAt: string;
  readonly workloadSeconds: number;
  readonly elapsedMs: number;
  /** Seconds of audio analysed per wall-clock second. */
  readonly throughput: number;
  readonly profile: ProfileId;
  readonly cores: number | null;
  readonly memoryGb: number | null;
}

/** The workload: deterministic, so every device measures the same bytes. */
export function benchmarkWorkload(seconds = BENCHMARK_WORKLOAD_SECONDS): Uint8Array {
  const rate = 48000;
  const frames = Math.round(seconds * rate);
  let seed = 0x2545f491;
  const noise = (): number => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000 - 0.5;
  };
  // pre-rolled noise so the sample function is pure in (channel, frame)
  const noiseL = new Float32Array(frames);
  const noiseR = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    noiseL[i] = noise();
    noiseR[i] = noise();
  }
  return encodeWav({
    sampleRate: rate,
    channels: 2,
    encoding: "pcm",
    bitDepth: 24,
    frames,
    sample: (channel, frame) => {
      const t = frame / rate;
      const tone = 0.22 * Math.sin(2 * Math.PI * 110 * t) + 0.1 * Math.sin(2 * Math.PI * 1320 * t + (channel ? 0.7 : 0));
      const hiss = 0.05 * (channel ? noiseR[frame] : noiseL[frame]);
      const beat = (t * 2) % 1; // a 10 ms hit (a 2 kHz burst) every half second
      const click = beat < 0.01 ? 0.6 * Math.sin(2 * Math.PI * 2000 * t) : 0;
      return tone + hiss + click; // peaks under 0.97: never clamped
    },
  });
}

export interface BenchmarkDeps extends DeviceFacts {
  /** Wall clock for the record. */
  readonly now: () => string;
  /** Monotonic milliseconds for the timing (`performance.now`). */
  readonly clock: () => number;
  readonly yieldBetween?: () => Promise<void>;
}

/** Runs the engine over the workload and measures it. */
export async function runBenchmark(deps: BenchmarkDeps): Promise<BenchmarkRecord> {
  const bytes = benchmarkWorkload();
  const start = deps.clock();
  const result = await analyseBytes(bytes, { sliceFrames: 48000, yieldBetween: deps.yieldBetween });
  const elapsedMs = Math.max(0.001, deps.clock() - start);
  const workloadSeconds = result.format.seconds;
  const throughput = workloadSeconds / (elapsedMs / 1000);
  const device: DeviceFacts = { cores: deps.cores, memoryGb: deps.memoryGb };
  return {
    schema: BENCHMARK_SCHEMA,
    engineVersion: ENGINE_VERSION,
    measuredAt: deps.now(),
    workloadSeconds,
    elapsedMs,
    throughput,
    profile: chooseProfile(throughput, device),
    cores: deps.cores,
    memoryGb: deps.memoryGb,
  };
}

export function serializeBenchmark(record: BenchmarkRecord): string {
  return JSON.stringify(record);
}

export interface BenchmarkValidity {
  readonly engineVersion?: number;
  readonly cores: number | null;
  /** Epoch milliseconds of "now". */
  readonly nowMs: number;
}

/** A cached record, if it is well-formed, from this engine, from this core count and younger than 30 days. */
export function parseBenchmark(text: string | null | undefined, validity: BenchmarkValidity): BenchmarkRecord | null {
  if (!text) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const r = doc as Record<string, unknown>;
  if (r.schema !== BENCHMARK_SCHEMA) return null;
  if (r.engineVersion !== (validity.engineVersion ?? ENGINE_VERSION)) return null;
  if (typeof r.measuredAt !== "string" || typeof r.throughput !== "number" || !Number.isFinite(r.throughput) || r.throughput <= 0) return null;
  if (typeof r.elapsedMs !== "number" || typeof r.workloadSeconds !== "number") return null;
  if (!isProfileId(r.profile)) return null;
  const cores = typeof r.cores === "number" ? r.cores : null;
  const memoryGb = typeof r.memoryGb === "number" ? r.memoryGb : null;
  if (cores !== validity.cores) return null;
  const measured = Date.parse(r.measuredAt);
  if (!Number.isFinite(measured) || validity.nowMs - measured > BENCHMARK_MAX_AGE_MS || measured > validity.nowMs + 60_000) return null;
  return {
    schema: BENCHMARK_SCHEMA,
    engineVersion: r.engineVersion,
    measuredAt: r.measuredAt,
    workloadSeconds: r.workloadSeconds,
    elapsedMs: r.elapsedMs,
    throughput: r.throughput,
    profile: r.profile,
    cores,
    memoryGb,
  };
}

/** Seconds the engine should need for `workSeconds` of audio — from the measurement, with the margin; null when nothing was measured. */
export function estimateSeconds(workSeconds: number, record: BenchmarkRecord | null): number | null {
  if (!record || !(record.throughput > 0)) return null;
  if (workSeconds <= 0) return 0;
  return Math.ceil((workSeconds / record.throughput) * ESTIMATE_MARGIN);
}
