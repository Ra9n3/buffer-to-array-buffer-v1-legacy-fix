/**
 * SIMULATED fixture data for the Console room's transport deck — Task 2.3
 * (plan §3 "Console room": transport, status and estimated processing time;
 * §6 playback modes; §10 MIX button behaviour; §11 hardware profiles).
 *
 * Nothing here is wired: no playback, no timeline position, no render, no
 * benchmark. The values are a believable snapshot of a session that has been
 * imported and not yet mixed — the owner's chosen default state, READY
 * (D2.3.4) — plus the other states the deck can print, for the playground.
 * The DOM carries `data-simulated` on the deck so the fixture cannot be
 * mistaken for a live readout.
 */

export const SIMULATED = "simulated" as const;

/** The transport's two latching states. PLAY and STOP are exclusive. */
export type TransportState = "stopped" | "playing";

/** Plan §6: the three listening modes. Printed in the status display only
 *  (owner, D2.3.2): no selector exists in Task 2.3. */
export type ListeningSource = "raw" | "preview" | "render";

/** Plan §11: the hardware-adaptive processing profile behind the estimate. */
export type HardwareProfile = "lite" | "balanced" | "performance";

/** Plan §10: the MIX button's states as the status display tells them. */
export type MixState = "ready" | "processing" | "complete";

/** A position on the timeline: seconds, and the bar · beat the tempo track
 *  would give for it. Both are fixture numbers; nothing derives one from the
 *  other here (the tempo track is Task 2.6 / Phase 3). */
export interface TimelinePosition {
  seconds: number;
  bar: number;
  beat: number;
}

export interface MixStatus {
  state: MixState;
  /** processing: the stage under way (index into STAGES) and its progress. */
  stageIndex?: number;
  /** processing: 0–1 of the whole render. */
  progress?: number;
  /** processing: seconds the estimate says remain. */
  remainingSeconds?: number;
  /** ready: the pre-mix estimate for this session on this profile. */
  estimateSeconds?: number;
  /** complete: the wall-clock time the last mix finished (fixture string). */
  completedAt?: string;
  /** complete: Manual edits made since that mix — a rerun would honour them. */
  editsSince?: number;
  /** Warnings the engine raised (plan §10: "any warnings"). */
  warnings: number;
}

export interface TransportFixture {
  transport: TransportState;
  position: TimelinePosition;
  source: ListeningSource;
  profile: HardwareProfile;
  mix: MixStatus;
}

/** Plan §10 / §5 / §7: the stages a full mix goes through, in order. Fixture
 *  wording; the engine's real stage names arrive with Phases 5–7. */
export const STAGES = [
  "Reading stems",
  "Measuring levels",
  "Analysing spectrum",
  "Resolving masking",
  "Applying rules",
  "Rendering buses",
  "Writing mix",
] as const;

export const SOURCE_PRINT: Record<ListeningSource, string> = {
  raw: "RAW",
  preview: "PREVIEW",
  render: "RENDER",
};

export const PROFILE_PRINT: Record<HardwareProfile, string> = {
  lite: "LITE",
  balanced: "BALANCED",
  performance: "PERFORMANCE",
};

/** The Console's default: imported, stopped a little way in, not yet mixed. */
export const TRANSPORT_FIXTURE: TransportFixture = {
  transport: "stopped",
  position: { seconds: 137.48, bar: 12, beat: 3 },
  source: "raw",
  profile: "balanced",
  mix: { state: "ready", estimateSeconds: 100, warnings: 0 },
};

/** The other states, for the playground (and any later review). */
export const TRANSPORT_STATE_FIXTURES: Record<"playing" | "processing" | "complete", TransportFixture> = {
  playing: {
    transport: "playing",
    position: { seconds: 2231.9, bar: 186, beat: 1 },
    source: "preview",
    profile: "balanced",
    mix: { state: "ready", estimateSeconds: 100, warnings: 0 },
  },
  processing: {
    transport: "stopped",
    position: { seconds: 0, bar: 1, beat: 1 },
    source: "raw",
    profile: "lite",
    mix: { state: "processing", stageIndex: 2, progress: 0.42, remainingSeconds: 58, warnings: 1 },
  },
  complete: {
    transport: "stopped",
    position: { seconds: 3599.2, bar: 300, beat: 4 },
    source: "render",
    profile: "performance",
    mix: { state: "complete", completedAt: "14:02", editsSince: 2, warnings: 0 },
  },
};

/** `H:MM:SS` — hours without a leading zero (owner, D2.3.3). Never negative. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** `M:SS` for estimates and time remaining — `1:40`, `0:58`, `12:05`. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Whole percent for the progress print. */
export function formatPercent(fraction: number): string {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

/** The status display's first line: the state word the operator reads first. */
export function stageWord(mix: MixStatus): string {
  switch (mix.state) {
    case "processing":
      return STAGES[mix.stageIndex ?? 0] ?? STAGES[0];
    case "complete":
      return "Mixed";
    default:
      return "Ready";
  }
}

/** The status display's second line: the details behind the state word. */
export function statusDetails(fixture: TransportFixture): string[] {
  const { mix, source, profile } = fixture;
  const parts: string[] = [];
  switch (mix.state) {
    case "processing":
      parts.push(`Stage ${(mix.stageIndex ?? 0) + 1} of ${STAGES.length}`);
      parts.push(`${formatPercent(mix.progress ?? 0)}`);
      if (mix.remainingSeconds !== undefined) parts.push(`${formatDuration(mix.remainingSeconds)} left`);
      parts.push(PROFILE_PRINT[profile]);
      break;
    case "complete":
      if (mix.completedAt) parts.push(`at ${mix.completedAt}`);
      if (mix.editsSince) parts.push(`${mix.editsSince} manual edit${mix.editsSince === 1 ? "" : "s"} since`);
      parts.push("Rerun available");
      parts.push(`Source ${SOURCE_PRINT[source]}`);
      break;
    default:
      parts.push(`Source ${SOURCE_PRINT[source]}`);
      parts.push(PROFILE_PRINT[profile]);
      if (mix.estimateSeconds !== undefined) parts.push(`Est. mix ${formatDuration(mix.estimateSeconds)}`);
  }
  if (mix.warnings > 0) parts.push(`${mix.warnings} warning${mix.warnings === 1 ? "" : "s"}`);
  return parts;
}
