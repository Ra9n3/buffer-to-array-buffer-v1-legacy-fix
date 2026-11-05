<script lang="ts">
  /**
   * The listening-source selector — Task 9.1.1, owner decision D9.1.2 option (a).
   *
   * Plan §6 defines three listening modes: the raw stems, the lightweight live preview,
   * and the full rendered mix. Until now the transport implemented all three but the only
   * ways to reach them were the default (RAW) and MIX (which switches to RENDER) — PREVIEW
   * had no control at all, and once MIX had switched the transport to RENDER there was no
   * way back to RAW. That broke plan §10's requirement to keep raw and processed playback
   * available for comparison.
   *
   * This is one small, visible three-position control. It is NOT a keyboard shortcut, NOT a
   * key column, and it touches none of the approved transport keys: PREVIOUS · PLAY · STOP ·
   * NEXT and MIX keep exactly their existing functions (D2.3.2 / D8.1.1). It lives in the
   * persistent mini transport, which is the one strip that is visible in all three rooms, so
   * the source can be read and changed from Console, Arrange and Mixer alike.
   *
   * The active mode is identified three ways, so it is never ambiguous: the pressed button
   * is drawn as engaged, `aria-pressed` carries it to assistive technology, and the transport
   * status readout beside it prints `Stopped — RAW / PREVIEW / RENDER`.
   *
   * Selecting a mode calls the shared facade's `setSource`. The controller keeps the playhead
   * position and the playable length across a switch (Task 9.1, S9.1.2), and restarts at the
   * same position if it was playing.
   */
  import { transport } from "../lib/playback/store.svelte";
  import type { ListeningSource } from "../lib/playback/types";

  /** Plan §6's three modes in the order of the listening journey: raw, preview, render. */
  const SOURCES: readonly ListeningSource[] = ["raw", "preview", "render"];

  /** Printed on the button, and the accessible name: the plan's own words. */
  const SOURCE_NAMES: Record<ListeningSource, string> = {
    raw: "Raw",
    preview: "Preview",
    render: "Render",
  };

  /** What each mode means, for the button's title and its description for screen readers. */
  const SOURCE_HINTS: Record<ListeningSource, string> = {
    raw: "the imported stems as they are",
    preview: "the lightweight live preview of the mix",
    render: "the full rendered mix",
  };

  const active = $derived(transport.source);

  function select(source: ListeningSource): void {
    transport.setSource(source);
  }
</script>

<div
  class="mini-transport__sources"
  role="group"
  aria-label="Listening source"
  aria-describedby="mini-transport-source-note"
  data-transport-sources
>
  <span class="mini-transport__sources-label" aria-hidden="true">Source</span>

  <div class="mini-transport__sources-list">
    {#each SOURCES as source (source)}
      <button
        type="button"
        class="mini-transport__source"
        class:is-active={active === source}
        data-transport-source={source}
        aria-pressed={active === source}
        aria-label={`${SOURCE_NAMES[source]} — ${SOURCE_HINTS[source]}`}
        title={`Listen to ${SOURCE_HINTS[source]}`}
        onclick={() => select(source)}
      >
        {SOURCE_NAMES[source]}
      </button>
    {/each}
  </div>

  <p class="mini-transport__source-note" id="mini-transport-source-note">
    Listening source: raw stems, lightweight preview, or the full rendered mix.
  </p>
</div>

<style>
  /* The strip is a single non-wrapping row whose height is the shared
     --mini-transport-height token. This group is one more item in that row and
     adds no height of its own: the buttons are the same size as the transport's
     controls beside them, so nothing in the bar is re-measured or re-laid-out. */
  .mini-transport__sources {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .mini-transport__sources-label {
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The three positions form one control, so they sit together with no gap and
     share their edges — the way a console's own mode preset reads. The control's
     own border box is the boundary between the transport keys and the readouts,
     so the strip needs no second vertical rule here. */
  .mini-transport__sources-list {
    display: flex;
    align-items: stretch;
    border: 1px solid #8a8a8a;
  }

  .mini-transport__source {
    padding: 0.1875rem 0.5rem;
    border: 0;
    border-left: 1px solid #8a8a8a;
    background: #f3f3f3;
    color: #1b1b1b;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.5;
    cursor: pointer;
    white-space: nowrap;
  }

  .mini-transport__source:first-child {
    border-left: 0;
  }

  .mini-transport__source:hover {
    background: #ffffff;
  }

  /* The engaged position, in the neutral Phase 0 palette the bar already uses
     (the same inversion as the Play key's emphasis). A lit mode is unmistakable
     and needs no new colour. */
  .mini-transport__source.is-active {
    background: #4a4a4a;
    color: #ffffff;
  }

  .mini-transport__source.is-active:hover {
    background: #333333;
  }

  /* Keyboard focus must stay visible on the engaged position too. */
  .mini-transport__source:focus-visible {
    outline: 2px solid #1b1b1b;
    outline-offset: -3px;
  }

  /* The note describes the group for assistive technology; it is not a visible
     label line, so it takes no space in the bar. */
  .mini-transport__source-note {
    margin: 0;
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* The bar gives up its content in a fixed order as it narrows: the honesty
     note first, then the status readout, then the section label. The source
     selector is a control and survives — but its word shrinks to the three
     initials, so three positions never push the transport keys off the row. */
  @media (max-width: 64rem) {
    .mini-transport__sources-label {
      display: none;
    }
  }

  @media (max-width: 52rem) {
    .mini-transport__source {
      padding: 0.1875rem 0.375rem;
      font-size: 0.6875rem;
    }
  }
</style>
