<script lang="ts">
  import ChannelStrip from "./ChannelStrip.svelte";
  import TrackStrip from "./channel-strip/TrackStrip.svelte";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import { SIMULATED, TRACK_STRIPS } from "./channel-strip/track-strip-fixtures";

  /**
   * ALLOY Console channel bank — Task 2.2 (Phase 2 skin).
   *
   * The Console's lower section: the 20 regular track channel strips (the
   * skinned `TrackStrip`, Task 2.2) in a horizontally scrolling rail, and
   * the pinned Bus / Returns area fixed at the right (plan §3: pinned and
   * not scrollable). The pinned strips are still the Phase 0 grey
   * `ChannelStrip` placeholders — Task 2.4 skins them; nothing about them
   * changes here.
   *
   * The housing is the meter bridge's: walnut end-cheeks and the charcoal
   * deck with its trim line, so that the two zones of the Console read as
   * one desk (D2.2.5). The CSS values are copied from the approved bridge
   * (Task 2.1); the bridge itself is neither imported nor touched.
   *
   * Geometry (owner's rules, D2.2.1): every track strip is a fixed 10rem
   * module. As many complete strips as fit are visible; the remainder are
   * reached by scrolling the tracks region sideways. The strips never
   * shrink, and the pinned area never scrolls away.
   */
  const pinnedStrips: Array<{
    code: string;
    name: string;
    kind: "bus" | "return";
  }> = [
    { code: "R1", name: "Reverb Return", kind: "return" },
    { code: "R2", name: "Delay Return", kind: "return" },
    { code: "BUS", name: "Bus master", kind: "bus" },
  ];

  const first = TRACK_STRIPS[0]?.id ?? "";
  const last = TRACK_STRIPS[TRACK_STRIPS.length - 1]?.id ?? "";
</script>

<div class="bank" data-channel-bank data-simulated={SIMULATED}>
  <div class="bank__cheek bank__cheek--left" aria-hidden="true"></div>

  <div class="bank__deck">
    <!-- No screw heads here or anywhere else (D2.1.9). -->

    <!-- The zone's heading. ConsoleRoom's channels <section> is labelled by
         this id; the legend is the bank's own engraved print. -->
    <header class="bank__legend">
      <EngravedLabel as="h2" id="console-channels-title" text="Channel bank" size="sm" />
      <EngravedLabel text={`Tracks ${first}\u2013${last}`} size="xs" tone="muted" />
    </header>

    <div class="bank__body">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="bank__tracks"
        data-channel-bank-tracks
        role="region"
        tabindex="0"
        aria-label={`Track channel strips ${first} to ${last}, ${SIMULATED} settings; scrolls sideways`}
      >
        <ol class="bank__rail" aria-label={`Tracks ${first} through ${last}`}>
          {#each TRACK_STRIPS as track (track.id)}
            <TrackStrip {track} />
          {/each}
        </ol>
      </div>

      <aside
        class="bank__pinned"
        data-channel-bank-pinned
        aria-label="Pinned bus and Return channels"
      >
        <div class="bank__pinned-legend">
          <EngravedLabel as="p" text="Bus / Returns" size="xs" />
        </div>
        <ul class="bank__pinned-row">
          {#each pinnedStrips as strip}
            <ChannelStrip
              code={strip.code}
              name={strip.name}
              kind={strip.kind}
              pinned
            />
          {/each}
        </ul>
      </aside>
    </div>
  </div>

  <div class="bank__cheek bank__cheek--right" aria-hidden="true"></div>
</div>

<style>
  /* =======================================================================
     THE HOUSING — the approved meter bridge's recipe (Task 2.1), copied
     value for value so the two zones are one desk.
     ======================================================================= */
  .bank {
    /* --- geometry ------------------------------------------------------- */
    --b-cheek: 0.875rem;
    --b-radius: 4px;
    /* --- materials, from the tokens ------------------------------------- */
    --b-wood-light: color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal));
    --b-wood: var(--al-material-wood);
    --b-wood-dark: color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess));
    --b-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: grid;
    grid-template-columns: var(--b-cheek) minmax(0, 1fr) var(--b-cheek);
    min-width: 0;
    width: 100%;
    border-radius: var(--b-radius);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the walnut end-cheeks ------------------------------------------- */
  .bank__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--b-wood);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.32) 100%),
      repeating-linear-gradient(
        93deg,
        var(--b-wood-light) 0 1px,
        var(--b-wood) 1px 3px,
        var(--b-wood-dark) 3px 4px,
        var(--b-wood) 4px 7px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .bank__cheek--left {
    border-radius: var(--b-radius) 0 0 var(--b-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .bank__cheek--right {
    border-radius: 0 var(--b-radius) var(--b-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the deck -------------------------------------------------------- */
  .bank__deck {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-md) var(--al-space-sm);
    background-color: var(--al-material-panel);
    background-image:
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--b-trim) 1px, var(--b-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
      radial-gradient(
        120% 100% at 18% 0%,
        rgba(255, 255, 255, 0.07) 0%,
        rgba(255, 255, 255, 0.015) 38%,
        rgba(0, 0, 0, 0.22) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8);
  }

  .bank__legend {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-md);
    min-width: 0;
    padding: 0 var(--al-space-md);
  }

  /* =======================================================================
     THE BODY — the scrolling track rail and the pinned area beside it
     ======================================================================= */
  .bank__body {
    display: flex;
    align-items: stretch;
    gap: var(--al-space-md);
    min-width: 0;
  }

  /* The tracks region: the ONLY horizontal scroller. It is the rail the
     modules are bolted to — a recess in the deck, a little darker than the
     panel, with the modules standing proud of it. */
  .bank__tracks {
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-xs) var(--al-space-sm);
    border-radius: 3px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .bank__tracks:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: -2px;
  }

  .bank__rail {
    display: flex;
    align-items: stretch;
    gap: var(--al-space-2xs);
    width: max-content;
    min-width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* --- the pinned area: outside the scroller, fixed at the right ----------- */
  .bank__pinned {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-2xs) var(--al-space-sm) var(--al-space-sm);
    border-radius: 3px;
    /* an engraved outline round the module, as on the bridge */
    box-shadow:
      inset 0 0 0 1px var(--al-bevel-shadow),
      inset 0 1px 0 1px rgba(255, 255, 255, 0.045),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .bank__pinned-legend {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 0.875rem;
  }

  /* The pinned strips are the Phase 0 placeholders, untouched (Task 2.4);
     this row keeps exactly their Phase 0 geometry: a flex row, 0.5rem gap. */
  .bank__pinned-row {
    display: flex;
    flex: 1 1 auto;
    align-items: stretch;
    gap: 0.5rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Narrow widths (Phase 0's own break): the pinned area drops below the
     rail and scrolls on its own. */
  @media (max-width: 40rem) {
    .bank__body {
      flex-direction: column;
    }

    .bank__pinned-row {
      flex: 0 0 auto;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
    }
  }
</style>
