<script lang="ts">
  /**
   * ALLOY Arrange timeline lane — Task 0.4 structure, Task 2.6 skin.
   *
   * One track's stretch of the timeline: a direct grid child of the Arrange
   * grid sharing its grid row with the track's list row (Task 0.4), so the
   * two cannot drift apart; its height is the room's `--arrange-row-height`.
   *
   * What it draws (plan §3 "timeline and raw waveforms"; owner, 2026-11-01):
   *   · the lane: the dark grey-green work surface (`--al-material-surface`)
   *     with a bar grid as faint as a tape machine's counter lines — a hair
   *     line every bar, a slightly firmer one every four;
   *   · each clip as a low raised plate sitting on the surface, positioned
   *     and sized in BAR UNITS from the room's one `--arrange-bar-width`, so
   *     clip edges land on the ruler's bar lines by construction;
   *   · the clip's waveform placeholder in cream (the meter-face cream, no
   *     glow, no LED): the stem's drawn envelope — a brighter inner body and a
   *     dimmer outer peak layer, the overview look of a tape-based editor —
   *     on the midline for a mono stem or as two halves for a stereo source
   *     (Task 0.4 sized the lane for exactly that);
   *   · the track's organisational tab at the clip head: the Console strip's
   *     flat 6 × 16 tab, the same marker treatment wherever the track is
   *     represented (spec §7) — never a tint of the clip or the lane.
   *
   * Everything here is fixture drawing (lib/arrange-timeline.ts). Nothing is
   * read from audio, nothing is selected, moved, trimmed or played: Task 2.6
   * is the skin of the workspace, not the editor.
   */
  import { SIMULATED, orgToken, type OrgSwatch } from "./channel-strip/track-strip-fixtures";
  import type { ArrangeClip } from "../lib/arrange-timeline";

  let {
    laneId,
    code,
    name = "",
    org = "neutral",
    clips = [],
  }: {
    laneId: string;
    code: string;
    /** The track's display name — only for the clip tooltip. */
    name?: string;
    /** The track's organisational colour: the tab at each clip head. */
    org?: OrgSwatch;
    clips?: readonly ArrangeClip[];
  } = $props();

  /** A clip's tooltip: where it sits, in bars — the one place the position is spelled out. */
  function clipTitle(clip: ArrangeClip): string {
    const range = clip.barCount === 1 ? `bar ${clip.startBar}` : `bars ${clip.startBar}–${clip.endBar}`;
    return `${name || `Track ${code}`} · ${range} · ${clip.channels === 2 ? "stereo" : "mono"}`;
  }
</script>

<div
  class="arrange-lane"
  data-arrange-region="timeline-lane"
  data-lane={laneId}
  data-track-code={code}
  data-clip-count={clips.length}
  data-simulated={SIMULATED}
  aria-hidden="true"
>
  {#each clips as clip (clip.clipId)}
    <div
      class="clip"
      class:is-stereo={clip.channels === 2}
      style:--clip-start={clip.startBar - 1}
      style:--clip-bars={clip.barCount}
      style:--org={orgToken(org)}
      data-arrange-clip={clip.clipId}
      data-clip-start={clip.startBar}
      data-clip-bars={clip.barCount}
      data-clip-channels={clip.channels}
      data-clip-kind={clip.kind}
      title={clipTitle(clip)}
    >
      <svg class="clip__wave" viewBox={`0 0 ${clip.peakCount} 100`} preserveAspectRatio="none" focusable="false">
        {#each clip.waves as wave, channel (channel)}
          <path id={`${laneId}-${clip.clipId}-${channel}`} class="clip__peaks" d={wave.d} />
          <!-- the inner body: the same envelope at 60 % height about its own midline, brighter — overview density without a second drawing -->
          <use href={`#${laneId}-${clip.clipId}-${channel}`} class="clip__body" transform={`translate(0 ${wave.centre}) scale(1 0.6) translate(0 ${-wave.centre})`} />
        {/each}
      </svg>
      <span class="clip__tab" data-org-tab={String(org)}></span>
    </div>
  {/each}
</div>

<style>
  .arrange-lane {
    position: relative;
    box-sizing: border-box;
    height: var(--arrange-row-height);
    min-width: 0;
    /* the lane's lower boundary: one dark hair line, nothing lighter — restrained (prompt) */
    border-bottom: 1px solid rgba(0, 0, 0, 0.42);
    background-color: var(--al-material-surface);
    /* the bar grid, from the one bar width: a hair line every bar and a
       firmer line every four bars (the ruler's labelled bars); no beat lines
       in the lanes — the ruler carries those */
    background-image:
      linear-gradient(90deg, rgba(255, 255, 255, 0.075) 0 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px);
    background-size:
      calc(var(--arrange-bar-width) * 4) 100%,
      var(--arrange-bar-width) 100%;
    background-repeat: repeat-x;
  }

  /* --- the clip plate ----------------------------------------------------- */

  /* positioned in bar units: left and width from --arrange-bar-width, so the
     plate's edges are the ruler's bar lines; 1px short so neighbouring clips
     keep a visible seam */
  .clip {
    position: absolute;
    top: 0.25rem;
    bottom: 0.25rem;
    left: calc(var(--clip-start) * var(--arrange-bar-width));
    box-sizing: border-box;
    width: calc(var(--clip-bars) * var(--arrange-bar-width) - 1px);
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.6);
    border-radius: 2px;
    /* a low raised plate on the surface: one step lighter, lit along the top edge */
    background-color: var(--al-material-surface-raised);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.07),
      0 1px 1px rgba(0, 0, 0, 0.35);
  }

  .clip__wave {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* the drawn stem: the meter-face cream, flat — no glow, no outline (D2.3) */
  .clip__peaks {
    fill: var(--al-material-cream);
    fill-opacity: 0.42;
  }

  .clip__body {
    fill: var(--al-material-cream);
    fill-opacity: 0.78;
  }

  /* the organisational tab at the clip head — the Console strip's flat tab,
     value for value (TrackStrip .strip__tab, D2.2.13), stood 3 px in from the
     plate's corner; the colour touches nothing else */
  .clip__tab {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }
</style>
