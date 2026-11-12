/**
 * ALLOY — the playhead state module (Task 10.1).
 *
 * The spec's §1 reactive list, in one runes module beside the transport
 * facade it reads: the playhead position, the playing/paused/recording flags,
 * the last fresh start (its `lastPlaybackStartPosition`), where the last run
 * stopped, the active loop region, and every panel's FOLLOW state — the
 * mode, the trigger point, and the suspension with its reason.
 *
 * What belongs here and nowhere else:
 *
 *   · the PER-PANEL follow settings (§13): each editor panel keeps its own
 *     choice. A panel that has never chosen reads the Settings defaults, so
 *     the preference is the default every panel starts from, and a choice
 *     made in one panel (the Arrange room's toolbar control) never reaches
 *     another (the Piano Roll and the Automation editor when they exist).
 *   · the auto-resume rule (§5): a restart of playback — a fresh Play from
 *     stopped, or a locate while playing (§8) — resumes every panel's
 *     suspended follow. A pause-resume (§3) and a loop wrap (§7) do not.
 *   · the loop region (§7) in transport frames: set and cleared here, polled
 *     by the controller through the playback shell. No panel owns it and no
 *     UI sets it yet — the region arrives with the editor that will draw it.
 *
 * The engine-free honesty of this build: `isRecording` is FALSE and stays
 * false — ALLOY v1 has no recording path (the plan has none). The flag and
 * the §10 rule it feeds exist so the follow engine and the future recorder
 * meet on this contract; tests cover the rule synthetically.
 *
 * Nothing here renders, measures or plays. Panels draw from
 * `transport.positionFramesNow()`; readouts read the reactive
 * `transport.positionFrames`.
 */

import { settings } from "../settings.svelte";
import { transport } from "./store.svelte";
import type { TransportStatus } from "./types";
import type { FollowMode } from "./follow";

/** Why a panel's follow is standing still while the playhead moves. */
export type FollowSuspensionReason = "manual-scroll" | "edit" | "scrub";

export interface PanelFollowView {
  readonly mode: FollowMode;
  readonly trigger: number;
  readonly suspended: boolean;
  readonly reason: FollowSuspensionReason | null;
}

interface PanelFollowEntry {
  mode: FollowMode;
  trigger: number;
  suspended: boolean;
  reason: FollowSuspensionReason | null;
}

/** Only panels that have CHOSEN; everyone else reads the Settings defaults. */
const panels = $state<Record<string, PanelFollowEntry>>({});

/** The active loop region in transport frames; null when no loop is set. */
let loopRegion = $state<{ startFrame: number; endFrame: number } | null>(null);

function entryOf(panel: string): PanelFollowEntry | null {
  return panels[panel] ?? null;
}

/** A panel's follow view: its own choice if it made one, the defaults otherwise. */
function viewOf(panel: string): PanelFollowView {
  const entry = entryOf(panel);
  if (entry) return { mode: entry.mode, trigger: entry.trigger, suspended: entry.suspended, reason: entry.reason };
  return {
    mode: settings.transport.autoScrollMode,
    trigger: settings.transport.autoScrollTriggerPoint,
    suspended: false,
    reason: null,
  };
}

function ensure(panel: string): PanelFollowEntry {
  const existing = entryOf(panel);
  if (existing) return existing;
  const created: PanelFollowEntry = {
    mode: settings.transport.autoScrollMode,
    trigger: settings.transport.autoScrollTriggerPoint,
    suspended: false,
    reason: null,
  };
  panels[panel] = created;
  return created;
}

function resumeAllPanels(): void {
  for (const key of Object.keys(panels)) {
    const entry = panels[key];
    if (entry && entry.suspended) {
      entry.suspended = false;
      entry.reason = null;
    }
  }
}

/*
 * The auto-resume rule (§5/§8). Watching the facade's reactive state: a
 * transition stopped/error → playing is a restart; `startFrame` moving while
 * playing is a locate that restarted playback from a new position. A
 * pause-resume is paused → playing and deliberately does NOT resume (§3 keeps
 * Pause a non-event for the start memory; §5 lets the user's suspension
 * outlive it). A wrap changes neither, so it never resumes.
 *
 * The watcher lives in an $effect.root — an unmanaged root the module owns
 * for the life of the application, the one sanctioned way a module (not a
 * component) may run an effect.
 */
let seenStatus: TransportStatus | null = null;
let seenStart = 0;
$effect.root(() => {
  $effect(() => {
    const status = transport.status;
    const start = transport.startFrame;
    if (seenStatus !== null) {
      const playing = status === "playing" || status === "rendering";
      const restarted = seenStatus === "stopped" || seenStatus === "error";
      if (playing && (restarted || start !== seenStart)) resumeAllPanels();
    }
    seenStatus = status;
    seenStart = start;
  });
});

export const playhead = {
  /* --- the spec's §1 list ------------------------------------------------ */

  /** The playhead position in transport frames (reactive; readouts read this). */
  get positionFrames(): number { return transport.positionFrames; },
  get isPlaying(): boolean { return transport.status === "playing" || transport.status === "rendering"; },
  get isPaused(): boolean { return transport.status === "paused"; },
  /**
   * FALSE in this build and never otherwise: ALLOY v1 has no recording path.
   * The flag is the contract the §10 rule and the future recorder share.
   */
  get isRecording(): boolean { return false; },
  /** The spec's `lastPlaybackStartPosition` (the transport's `startFrame`). */
  get lastPlaybackStartPosition(): number { return transport.startFrame; },
  /** The spec's `stoppedPosition`; null until a run stops or ends naturally. */
  get stoppedPosition(): number | null { return transport.stoppedPosition; },
  /** The active loop region in transport frames, or null. */
  get activeLoopRegion(): { startFrame: number; endFrame: number } | null { return loopRegion; },

  /** The live position for rendering at the browser's animation rate. */
  positionFramesNow(): number { return transport.positionFramesNow(); },

  /* --- the loop region (§7) ----------------------------------------------- */

  /**
   * Sets the loop region in transport frames. `end` must exceed `start` and
   * both must be finite and non-negative; anything else is a programming
   * error and throws. The controller clamps the wrap point to the playable
   * duration itself, so a region may safely run past the current sources.
   */
  setLoop(startFrame: number, endFrame: number): void {
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || startFrame < 0 || endFrame <= startFrame) {
      throw new Error(`Alloy playhead: an invalid loop region (${startFrame}..${endFrame})`);
    }
    loopRegion = { startFrame: Math.floor(startFrame), endFrame: Math.floor(endFrame) };
  },

  clearLoop(): void {
    loopRegion = null;
  },

  /* --- per-panel follow (§13) ---------------------------------------------- */

  /** A panel's follow view: its own choice, or the Settings defaults. */
  followOf(panel: string): PanelFollowView {
    return viewOf(panel);
  },

  /** Chooses a panel's mode. Choosing is an explicit act on follow: it resumes. */
  setFollowMode(panel: string, mode: FollowMode): void {
    const entry = ensure(panel);
    entry.mode = mode;
    entry.suspended = false;
    entry.reason = null;
  },

  /** Chooses a panel's trigger point (the smooth and stationary lines). */
  setFollowTrigger(panel: string, trigger: number): void {
    const entry = ensure(panel);
    entry.trigger = trigger;
  },

  /**
   * Suspends a panel's follow. The CALLER gates this on the preference
   * (`suspendOnManualScroll`) where the spec ties them (§14); the module
   * suspends unconditionally so future editors (§9) reach the same state.
   */
  suspendFollow(panel: string, reason: FollowSuspensionReason): void {
    const entry = ensure(panel);
    entry.suspended = true;
    entry.reason = reason;
  },

  /** Resumes a panel's follow — the Re-follow key, the shortcut, or a restart. */
  resumeFollow(panel: string): void {
    const entry = ensure(panel);
    entry.suspended = false;
    entry.reason = null;
  },
} as const;
