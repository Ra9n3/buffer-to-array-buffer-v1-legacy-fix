<script lang="ts">
  /**
   * ALLOY Arrange playhead — Task 10.1.
   *
   * The moving line and everything it owes the spec, in one layer the room
   * places over the lanes:
   *
   *   · THE LINE — a clear vertical line spanning the lanes' height, amber
   *     over the dark surface, distinct from the cream clips and the faint
   *     bar grid. One element, moved with `transform: translateX()` and
   *     `will-change: transform`; nothing else re-renders while it moves
   *     (§16) — the clip grid is never touched, and the line's X never
   *     enters a reactive statement.
   *   · THE POSITION — drawn from `transport.positionFramesNow()`: the Web
   *     Audio clock itself while playback runs (§1: derived from the
   *     engine, never a JS interval's guess), the held position otherwise.
   *     Frames → seconds → bars → pixels through the project's tempo map,
   *     the same coordinate system the clips, the ruler and the lanes are
   *     placed in, so a tempo change re-maps the line on the very next
   *     frame and a future zoom (§6) only changes the pixels per bar.
   *   · THE FOLLOW — the pure engine (lib/playback/follow.ts) decides the
   *     target each frame; this component applies it to the room's one
   *     scroller. Large corrections (a wrap, a re-follow, a locate from far
   *     away) ease in over 240 ms; steady tracking is exact, so the scroll
   *     rides the playhead's own speed — continuous, never a snap. Page
   *     mode is a snap by design, and reduced motion makes every correction
   *     exact.
   *   · SUSPENSION — the user's own scrolling (wheel with horizontal
   *     intent, a scrollbar drag, anything that moves the scroller off the
   *     engine's last position) immediately suspends follow through the
   *     playhead module, gated by the preference (§14). Playback keeps
   *     running at the true position; the toolbar shows the badge and the
   *     Re-follow key.
   *   · LOCATING — a click in the timeline region (the lanes, the ruler —
   *     never the pinned track list) moves the playhead; while playing it
   *     continues from the new position (§8); while stopped it only sets
   *     the position, starting playback besides when click-to-play is on
   *     (§2).
   *   · SCRUBBING — the cap at the line's head drags: the line follows the
   *     hand, follow stands down for the drag (§12), playback keeps running
   *     at the true position, and ONE locate lands on release — a seek per
   *     pointermove would reopen the sources per event.
   *
   * The layer is a late grid child over the lanes' rows (z-index 1: above
   * the lanes, beneath the pinned rows, the head and the corner), and it
   * never scrolls its own axis and never eats a pointer event except the
   * drag cap.
   */
  import { onMount } from "svelte";
  import { barsToSeconds, secondsToBars } from "../../lib/arrange-audio";
  import { effectiveFollowMode, followTarget, isReposition } from "../../lib/playback/follow";
  import { playhead } from "../../lib/playback/playhead.svelte";
  import { transport } from "../../lib/playback/store.svelte";
  import { settings } from "../../lib/settings.svelte";
  import type { TempoMarker } from "../../lib/arrange-timeline";

  /** The panel id this layer follows as (the Arrange room's). */
  const PANEL = "arrange";

  let {
    markers = [],
    barCount = 1,
  }: {
    /** The project's tempo map — frames and pixels meet through it. */
    markers?: readonly TempoMarker[];
    /** The timeline's bar count (the layer's width is that many bars). */
    barCount?: number;
  } = $props();

  let layerEl: HTMLElement;
  let cursorEl: HTMLElement;
  let handleEl: HTMLButtonElement;
  /** The room's one scroller — resolved at mount (the layer is its grid's
   *  child), never a prop, so the room holds no state of its own. */
  let scroller: HTMLElement | null = null;

  /* --- geometry, measured — never a hard-coded pixel -------------------- */

  let barWidth = 44;
  let listWidth = 192;
  let drawnX = -1;

  /** Timeline-local px of a transport position, through the tempo map. */
  function timelineXOf(frames: number): number {
    const bars = secondsToBars(frames / transport.sampleRate, markers);
    return Math.min(Math.max(0, bars) * barWidth, barCount * barWidth);
  }

  /** One locate: seek, and — for a click, not a drag — click-to-play (§2). */
  function locateAt(t: number, opts: { clickMayPlay: boolean }): void {
    const bars = Math.max(0, t) / barWidth;
    const seconds = barsToSeconds(bars, markers);
    transport.seek(seconds * transport.sampleRate);
    if (opts.clickMayPlay && settings.transport.clickToPlay && !playhead.isPlaying && !playhead.isPaused) {
      void transport.play();
    }
  }

  /* --- the line: one transform, no reactive traffic (§16) ---------------- */

  function renderLine(x: number): void {
    if (!cursorEl || Math.abs(x - drawnX) < 0.25) return;
    drawnX = x;
    cursorEl.style.transform = `translateX(${x.toFixed(2)}px)`;
  }

  /* --- the follow engine -------------------------------------------------- */

  const CATCHUP_MS = 240;
  let catchup: { from: number; t0: number } | null = null;
  let lastEngineScroll = -1;
  let raf = 0;

  function easeOutCubic(p: number): number {
    return 1 - Math.pow(1 - p, 3);
  }

  function reducedMotion(): boolean {
    if (settings.motion === "reduced") return true;
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** The engine's own write — recorded so the scroll handler can tell it from the user's. */
  function engineScroll(value: number): void {
    if (!scroller) return;
    lastEngineScroll = value;
    scroller.scrollLeft = value;
  }

  function cancelCatchup(): void {
    catchup = null;
  }

  function followStep(playheadT: number): void {
    if (dragging || !scroller) return;
    const view = playhead.followOf(PANEL);
    if (!playhead.isPlaying || view.suspended || view.mode === "off") {
      cancelCatchup();
      return;
    }
    const mode = effectiveFollowMode(view.mode, {
      recording: playhead.isRecording,
      stationaryWhileRecording: settings.transport.stationaryWhileRecording,
    });
    const region = playhead.activeLoopRegion;
    const loopT = region ? { startT: timelineXOf(region.startFrame), endT: timelineXOf(region.endFrame) } : null;
    const clientWidth = scroller.clientWidth;
    const target = followTarget(
      mode,
      view.trigger,
      playheadT,
      { scrollLeft: scroller.scrollLeft, viewW: clientWidth - listWidth, maxScroll: scroller.scrollWidth - clientWidth },
      loopT,
    );
    if (target === null) {
      cancelCatchup();
      return;
    }
    const delta = target - scroller.scrollLeft;
    if (mode === "page" || !isReposition(delta, clientWidth - listWidth) || reducedMotion()) {
      cancelCatchup();
      engineScroll(target);
      return;
    }
    if (!catchup) catchup = { from: scroller.scrollLeft, t0: performance.now() };
    const p = easeOutCubic(Math.min(1, (performance.now() - catchup.t0) / CATCHUP_MS));
    engineScroll(catchup.from + (target - catchup.from) * p);
    if (p >= 1) cancelCatchup();
  }

  function step(): void {
    const t = timelineXOf(transport.positionFramesNow());
    renderLine(dragging ? dragT : t);
    followStep(t);
  }

  function loop(): void {
    raf = requestAnimationFrame(loop);
    step();
  }

  /* --- the drag cap: scrubbing (§12) --------------------------------------- */

  let dragging = $state(false);
  let dragT = 0;

  function onHandlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    handleEl.setPointerCapture(event.pointerId);
    dragging = true;
    dragT = timelineXOf(transport.positionFramesNow());
    if (settings.transport.suspendOnManualScroll && playhead.isPlaying) playhead.suspendFollow(PANEL, "scrub");
  }

  function onHandlePointerMove(event: PointerEvent): void {
    if (!dragging || !scroller) return;
    const vx = event.clientX - scroller.getBoundingClientRect().left;
    dragT = Math.max(0, vx - listWidth + scroller.scrollLeft);
  }

  function onHandlePointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try { handleEl.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    locateAt(dragT, { clickMayPlay: false });
  }

  function onHandleKey(event: KeyboardEvent): void {
    const bars = timelineXOf(transport.positionFramesNow()) / barWidth;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = bars - 1;
    else if (event.key === "ArrowRight") next = bars + 1;
    else if (event.key === "Home") next = 0;
    else return;
    event.preventDefault();
    locateAt(Math.max(0, next) * barWidth, { clickMayPlay: false });
  }

  /* --- the user's own scrolling: suspend (§5) ------------------------------ */

  function userScrolled(): void {
    cancelCatchup();
    if (!settings.transport.suspendOnManualScroll) return;
    if (!playhead.isPlaying) return;
    playhead.suspendFollow(PANEL, "manual-scroll");
  }

  function onScrollerScroll(): void {
    if (!scroller) return;
    if (Math.abs(scroller.scrollLeft - lastEngineScroll) <= 1) return; // the engine's own write
    userScrolled();
  }

  function onScrollerWheel(event: WheelEvent): void {
    if (Math.abs(event.deltaX) > 0) userScrolled(); // horizontal intent; vertical browsing never fights the follow
  }

  /* --- clicks in the timeline region locate (§2/§8) ------------------------ */

  function onGridClick(event: MouseEvent): void {
    if (event.button !== 0 || !scroller) return;
    const target = event.target;
    if (!(target instanceof Node) || !layerEl.parentElement?.contains(target)) return;
    if (handleEl.contains(target)) return; // the cap's drag is its own interaction
    const vx = event.clientX - scroller.getBoundingClientRect().left;
    if (vx < listWidth) return; // the pinned track list is the furniture, not the timeline
    locateAt(vx - listWidth + scroller.scrollLeft, { clickMayPlay: true });
  }

  /* --- the rAF loop runs only while something moves ------------------------ */

  $effect(() => {
    if (playhead.isPlaying || dragging) return;
    // Not moving: one draw per position or geometry change; no per-frame work at rest.
    const pos = transport.positionFrames;
    renderLine(timelineXOf(pos));
  });

  $effect(() => {
    if (playhead.isPlaying || dragging) {
      if (!raf) raf = requestAnimationFrame(loop);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      step(); // one last exact draw at rest
    }
  });

  onMount(() => {
    scroller = layerEl.closest<HTMLElement>("[data-arrange-scroll]");
    if (!scroller) return;
    const measure = (): void => {
      if (!layerEl) return;
      barWidth = barCount > 0 ? layerEl.clientWidth / barCount : 44;
      listWidth = Math.max(0, layerEl.getBoundingClientRect().left - (scroller?.getBoundingClientRect().left ?? 0) + (scroller?.scrollLeft ?? 0));
      if (!playhead.isPlaying && !dragging) renderLine(timelineXOf(transport.positionFramesNow()));
    };
    measure();
    const grid = layerEl.parentElement;
    const ro = new ResizeObserver(() => measure());
    ro.observe(layerEl);
    ro.observe(scroller);
    scroller.addEventListener("scroll", onScrollerScroll, { passive: true });
    scroller.addEventListener("wheel", onScrollerWheel, { passive: true });
    grid?.addEventListener("click", onGridClick);
    return () => {
      ro.disconnect();
      scroller?.removeEventListener("scroll", onScrollerScroll);
      scroller?.removeEventListener("wheel", onScrollerWheel);
      grid?.removeEventListener("click", onGridClick);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
  });
</script>

<!--
  The layer: an absolute overlay of the grid's timeline column, spanning the
  lanes' region — from the head's foot to the last lane's floor. Absolute on
  purpose: a spanning grid child would sit IN the lanes' rows, and the grid
  routes every auto-placed lane AROUND it — each lane one row below its track
  row (a real defect the Task 10.1 browser measurement caught). The top is
  the head's own height formula — the same two band vars and tempo var, plus
  the head's 2 px baseline — so the layer rides the head by construction.
  pointer-events: none — the layer must never eat a hover or a clip's
  tooltip; the drag cap is the one exception (pointer-events: auto on it).
-->
<div
  class="arrange-playhead"
  bind:this={layerEl}
  data-arrange-region="playhead"
  data-playhead-panel={PANEL}
>
  <div class="arrange-playhead__cursor" bind:this={cursorEl} aria-hidden="true">
    <span class="arrange-playhead__line" data-playhead-line></span>
  </div>
  <button
    type="button"
    class="arrange-playhead__handle"
    bind:this={handleEl}
    data-playhead-handle
    aria-label="Playhead. Drag to scrub; arrow keys move it by a bar."
    title="Drag to scrub. Arrow keys move by a bar; Home returns to bar 1."
    onpointerdown={onHandlePointerDown}
    onpointermove={onHandlePointerMove}
    onpointerup={onHandlePointerUp}
    onpointercancel={onHandlePointerUp}
    onkeydown={onHandleKey}
  ></button>
</div>

<style>
  /* The layer over the lanes' region: an absolute overlay of the grid's
     timeline column, from the head's foot to the last lane's floor. Above
     the lanes, beneath the pinned rows (2), the head (3) and the corner (4)
     — the line slides under the track list when the view is scrolled past
     it, exactly as a playhead should. It scrolls no axis of its own and eats
     no pointer event. */
  .arrange-playhead {
    /* The head's own height, from the same vars the head is built of: two
       bands, the tempo track, and the head's 2 px baseline. If the head's
       skin ever changes, this is the one place that follows it. */
    --arrange-playhead-top: calc(2 * var(--arrange-band-height) + var(--arrange-tempo-height) + 2px);
    position: absolute;
    top: var(--arrange-playhead-top);
    bottom: 0;
    left: var(--arrange-track-list-width);
    width: var(--arrange-timeline-width);
    z-index: 1;
    min-width: 0;
    pointer-events: none;
  }

  /* One moving element per frame (§16): translateX + will-change. The
     cursor is a zero-width rail at the timeline's left edge; the line hangs
     on it centred (−1px of a 2px line). */
  .arrange-playhead__cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 0;
    will-change: transform;
  }

  /* Clear and distinct from the clips and the grid (§15): the amber family
     the transport keys use for their engaged state, with a faint lamp
     glow — a line you can find from across the room. */
  .arrange-playhead__line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1px;
    display: block;
    width: 2px;
    border-radius: 1px;
    background-color: var(--al-function-amber-hi);
    box-shadow: 0 0 6px color-mix(in srgb, var(--al-function-amber-hi) 55%, transparent);
  }

  /* The drag cap at the line's head — a small pennant on the panel material,
     the one pointer-events: auto element in the layer. Sits at the first
     lane's top edge and rides the line. */
  .arrange-playhead__handle {
    position: absolute;
    top: 2px;
    left: -8px;
    box-sizing: border-box;
    width: 16px;
    height: 14px;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--al-bevel-shadow);
    border-radius: 3px 3px 5px 5px;
    background-color: var(--al-material-panel);
    background-image:
      radial-gradient(120% 100% at 22% 0%, rgba(255, 255, 255, 0.07) 0%, rgba(0, 0, 0, 0.18) 100%),
      linear-gradient(90deg, transparent 0 6px, var(--al-function-amber-hi) 6px 10px, transparent 10px);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      0 1px 2px rgba(0, 0, 0, 0.5);
    cursor: ew-resize;
    pointer-events: auto;
  }
</style>
