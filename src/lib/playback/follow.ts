/**
 * ALLOY — the follow engine's decisions (Task 10.1).
 *
 * Pure geometry, no state and no DOM: everything here is a function of the
 * numbers a panel hands it, so Node tests cover every mode without a browser.
 * The reactive side (per-panel settings, suspension) lives in
 * `playhead.svelte.ts`; the applying side (rAF, scrollLeft, catch-up easing)
 * lives in the panel components that own a scroller.
 *
 * Coordinates. Every panel that follows a playhead has ONE scrolling element
 * whose content is [furniture … timeline]: in the Arrange room the furniture
 * is the pinned track-list column, `viewW` wide of timeline is visible beside
 * it. All positions in this file are TIMELINE-LOCAL pixels (`t`): 0 is the
 * first bar line, the same coordinate the clips, the ruler and the lanes are
 * placed in. The caller converts frames → seconds → bars → `t`; this file
 * never knows music, only pixels.
 *
 * The window. `scrollLeft` is the scroller's own scroll offset; with the
 * furniture pinned, the visible timeline range in t-coordinates is
 * `[scrollLeft, scrollLeft + viewW]`, so a playhead at `t` sits at
 * `t − scrollLeft` inside the window. The trigger point (0.75 by default) is
 * a fraction of `viewW` from the window's left edge.
 */

/** The panel's follow vocabulary (the spec's §4 modes, verbatim). */
export type FollowMode = "off" | "page" | "smooth" | "centered" | "stationary";

export const FOLLOW_MODES: readonly FollowMode[] = ["off", "page", "smooth", "centered", "stationary"];

/** Long names for Settings; short caps for the toolbar's window. */
export const FOLLOW_MODE_PRINT: Readonly<Record<FollowMode, { readonly name: string; readonly short: string; readonly intent: string }>> = {
  off: {
    name: "Off",
    short: "Off",
    intent: "The view never follows the playhead; it stays wherever you leave it.",
  },
  page: {
    name: "Page follow",
    short: "Page",
    intent: "Scrolls by one full view only when the playhead exits the visible range.",
  },
  smooth: {
    name: "Smooth continuous follow",
    short: "Smooth",
    intent: "The default. The view holds still until the playhead reaches the trigger point, then scrolls continuously to keep it there.",
  },
  centered: {
    name: "Centered continuous follow",
    short: "Centered",
    intent: "The playhead stays horizontally centered; the trigger point is 0.50 by definition.",
  },
  stationary: {
    name: "Stationary playhead",
    short: "Stationary",
    intent: "The playhead stays fixed at the trigger point; the timeline moves beneath it.",
  },
};

/**
 * The trigger points a control may offer (the spec's default 0.75 among them).
 * Kept as an explicit list, not a range, so a stored document can never
 * smuggle in a value no control offers.
 */
export const FOLLOW_TRIGGER_POINTS: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
export const DEFAULT_FOLLOW_TRIGGER = 0.75;
export const DEFAULT_FOLLOW_MODE: FollowMode = "smooth";

/** The window a panel sees: its scroller's offsets and bounds. */
export interface FollowWindow {
  /** The scroller's current horizontal offset. */
  readonly scrollLeft: number;
  /** The visible timeline width in px (the viewport minus the pinned furniture). */
  readonly viewW: number;
  /** The scroller's greatest horizontal offset (scrollWidth − clientWidth). */
  readonly maxScroll: number;
}

/** A loop region in the panel's timeline-local pixels. */
export interface FollowLoop {
  readonly startT: number;
  readonly endT: number;
}

function clampScroll(value: number, win: FollowWindow): number {
  if (!Number.isFinite(value)) return win.scrollLeft;
  return Math.max(0, Math.min(value, Math.max(0, win.maxScroll)));
}

/**
 * The scroll offset the panel should be at this frame, or `null` when the
 * view should stay exactly where it is.
 *
 *  off         never scrolls.
 *  smooth      holds while the playhead is visible left of the trigger line
 *              (the spec's §4 default: stationary view for the left 75%);
 *              tracks once the playhead is at or past the line, and also when
 *              the playhead is off-window (a wrap or a locate put it outside),
 *              so it is brought back rather than lost.
 *  page        holds while the playhead is anywhere in the window; when it
 *              exits, snaps so the playhead sits at the window's left edge —
 *              one full view, by design a jump.
 *  centered    always tracks with the trigger point 0.50 (the mode's
 *              definition, §4).
 *  stationary  always tracks at the panel's trigger point — the line stands
 *              still and the timeline moves beneath it from the first frame.
 *
 * The loop rule (§7) applies to every mode and only ever suppresses: when the
 * whole loop region lies inside the visible window, the view holds — loop
 * playback over a region that is already on screen causes no page movement.
 * When the loop is longer than the window the mode behaves as configured, and
 * a wrap that lands the playhead off-window is caught by the mode's
 * bring-back path (for smooth, a large backward catch-up at the caller).
 */
export function followTarget(
  mode: FollowMode,
  trigger: number,
  playheadT: number,
  win: FollowWindow,
  loop: FollowLoop | null,
): number | null {
  if (win.viewW <= 0) return null;
  const t = Number.isFinite(playheadT) ? Math.max(0, playheadT) : 0;
  const triggerV = Math.min(0.95, Math.max(0.05, trigger)) * win.viewW;
  const lineV = t - win.scrollLeft;
  const visible = lineV >= 0 && lineV <= win.viewW;
  if (loop && loop.startT >= win.scrollLeft && loop.endT <= win.scrollLeft + win.viewW) return null;
  switch (mode) {
    case "off":
      return null;
    case "page":
      return visible ? null : clampScroll(t, win);
    case "centered":
      return clampScroll(t - 0.5 * win.viewW, win);
    case "stationary":
      return clampScroll(t - triggerV, win);
    case "smooth":
      if (visible && lineV < triggerV) return null;
      return clampScroll(t - triggerV, win);
  }
}

/**
 * §10: recording uses the same modes as playback, but the "stationary
 * playhead while recording" preference overrides whatever mode the panel
 * chose. A pure remap so tests can cover it without a recorder (ALLOY v1 has
 * none — the flag arrives from the playhead module, which reports `false`
 * until one exists).
 */
export function effectiveFollowMode(
  mode: FollowMode,
  opts: { readonly recording?: boolean; readonly stationaryWhileRecording?: boolean } = {},
): FollowMode {
  if (opts.recording && opts.stationaryWhileRecording) return "stationary";
  return mode;
}

/**
 * §12's own sentence, made testable: scrubbing (and any reduced-speed play)
 * follows the smooth logic but must not jitter. The caller reduces its own
 * acceleration; what this file can promise is that the smooth decision never
 * oscillates — hold and track are separated by the trigger line, a single
 * crossing, and there is no dead zone to hunt across. The threshold helper
 * below says when a correction is small enough to apply directly (tracking)
 * and when it is a reposition the caller should ease (a wrap, a re-follow, a
 * locate from far away).
 */
export function isReposition(delta: number, viewW: number): boolean {
  return Math.abs(delta) > Math.max(120, viewW * 0.5);
}
