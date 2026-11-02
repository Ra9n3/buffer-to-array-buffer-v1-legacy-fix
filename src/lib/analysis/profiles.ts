/**
 * ALLOY analysis — the hardware profiles the engine runs under (Task 5.2).
 *
 * Plan §11: Lite, Standard and Performance are *intents* — smaller chunks
 * and more yielding on a modest machine, longer slices on a strong one —
 * never promises. What a profile changes in this task is the slice length
 * of the chunked pass (the figures are identical under every profile; the
 * tests hold the engine to that). `chooseProfile` turns a measured
 * throughput into a profile; the thresholds are provisional and are the
 * one place to tune them when real devices are measured.
 */
export type ProfileId = "lite" | "standard" | "performance";

export const PROFILE_IDS: readonly ProfileId[] = ["lite", "standard", "performance"];

export interface ProfileSettings {
  readonly id: ProfileId;
  /** Seconds of audio decoded and analysed between yields. */
  readonly sliceSeconds: number;
}

export const PROFILE_SETTINGS: Readonly<Record<ProfileId, ProfileSettings>> = {
  lite: { id: "lite", sliceSeconds: 2 },
  standard: { id: "standard", sliceSeconds: 5 },
  performance: { id: "performance", sliceSeconds: 10 },
};

/** Before any benchmark has run, the engine behaves as Standard (the middle intent) — it does not guess higher. */
export const UNMEASURED_PROFILE: ProfileId = "standard";

/** Throughput thresholds in multiples of real time (audio seconds per wall second), provisional. */
export const PROFILE_THRESHOLDS = {
  /** Below this the machine gets the Lite intent. */
  liteBelow: 25,
  /** From this throughput — and with the cores / memory below where the browser reports them — Performance. */
  performanceFrom: 100,
  performanceCores: 4,
  performanceMemoryGb: 4,
} as const;

export interface DeviceFacts {
  /** `navigator.hardwareConcurrency`, when the browser reports it. */
  readonly cores: number | null;
  /** `navigator.deviceMemory` in GB (Chromium only; coarse, capped at 8), when reported. */
  readonly memoryGb: number | null;
}

export function chooseProfile(throughput: number, device: DeviceFacts): ProfileId {
  if (!Number.isFinite(throughput) || throughput < PROFILE_THRESHOLDS.liteBelow) return "lite";
  if (throughput >= PROFILE_THRESHOLDS.performanceFrom) {
    const coresOk = device.cores === null || device.cores >= PROFILE_THRESHOLDS.performanceCores;
    const memoryOk = device.memoryGb === null || device.memoryGb >= PROFILE_THRESHOLDS.performanceMemoryGb;
    if (coresOk && memoryOk) return "performance";
  }
  return "standard";
}

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === "string" && (PROFILE_IDS as readonly string[]).includes(value);
}
