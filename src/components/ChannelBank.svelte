<script lang="ts">
  import BusMasterStrip from "./channel-strip/BusMasterStrip.svelte";
  import MixPanel from "./channel-strip/MixPanel.svelte";
  import ReturnStrip from "./channel-strip/ReturnStrip.svelte";
  import TrackStrip from "./channel-strip/TrackStrip.svelte";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import { SIMULATED } from "./channel-strip/track-strip-fixtures";
  import { busLive, busStripOf, project, returnLive, returnStripOf, trackStrip } from "../lib/project/store.svelte";

  /**
   * ALLOY Console channel bank — Task 2.2 (Phase 2 skin).
   *
   * The Console's lower section: the 20 regular track channel strips (the
   * skinned `TrackStrip`, Task 2.2) in a horizontally scrolling rail, and
   * the pinned Bus / Returns area fixed at the right (plan §3 / §8a: the
   * Return channels and the bus master pinned at the end of the bank, never
   * scrolling with the tracks). Task 2.4 skinned the pinned strips: one
   * `ReturnStrip` per fixture Return — the same returns the track send
   * slots feed, however many the list holds — then the `BusMasterStrip`
   * farthest right (the Phase 0.3 order), all on the track strip's chassis
   * so that every control lines up across the whole bank.
   *
   * The housing is the meter bridge's: walnut end-cheeks and the charcoal
   * deck with its trim line, so that the two zones of the Console read as
   * one desk (D2.2.5). The CSS values are copied from the approved bridge
   * (Task 2.1); the bridge itself is neither imported nor touched.
   *
   * Geometry (owner's rules, D2.2.1): every strip is a fixed 10rem module,
   * pinned or not. As many complete track strips as fit are visible; the
   * remainder are reached by scrolling the tracks region sideways. The
   * strips never shrink, and the pinned area never scrolls away. Where the
   * window is too narrow to hold the pinned block beside at least two
   * complete track strips, the pinned block moves under the rail as its own
   * row and scrolls sideways on its own only if it must (owner, D2.4.2 —
   * Phase 0's column mode with its threshold raised).
   */
  /* Task 3.1: the bank reads the one project store — the same tracks,
     Returns and bus master the Arrange and Mixer rooms read — and hands each
     strip the store's view of its channel to bind to. The session's order
     is the bank's order. */
  const tracks = $derived(project.tracks);
  const returns = $derived(project.returns);
  const buses = $derived(project.buses);

  const first = $derived(tracks[0]?.code ?? "");
  const last = $derived(tracks[tracks.length - 1]?.code ?? "");
  const firstPinned = $derived(returns[0]?.code ?? buses[0]?.code ?? "");
  const lastPinned = $derived(buses[buses.length - 1]?.code ?? returns[returns.length - 1]?.code ?? "");
  const pinnedCount = $derived(returns.length + buses.length);
</script>

<div class="bank" data-channel-bank data-simulated={SIMULATED}>
  <div class="bank__cheek bank__cheek--left" aria-hidden="true"></div>

  <div class="bank__deck">
    <!-- No screw heads here or anywhere else (D2.1.9). -->

    <!-- The zone's heading. ConsoleRoom's channels <section> is labelled by
         this id; the legend is the bank's own engraved print. -->
    <!-- The deck is a two-column grid: the legend row over the rails row.
         The pinned column is as wide as its rail, so its legend stands
         exactly over its modules; the two rails start on one line, so the
         track modules and the pinned modules line up control for control. -->
    <header class="bank__legend">
      <EngravedLabel as="h2" id="console-channels-title" text="Channel bank" size="sm" />
      <EngravedLabel text={`Tracks ${first}\u2013${last}`} size="xs" tone="muted" />
    </header>

    <div class="bank__pinned-legend">
      <EngravedLabel as="p" text="Bus / Returns" size="xs" />
      <EngravedLabel text={`${firstPinned}\u2013${lastPinned}`} size="xs" tone="muted" />
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="bank__tracks"
      data-channel-bank-tracks
      role="region"
      tabindex="0"
      aria-label={`Track channel strips ${first} to ${last}, ${SIMULATED} settings; scrolls sideways`}
    >
      <ol class="bank__rail" aria-label={`Tracks ${first} through ${last}`}>
        {#each tracks as track (track.id)}
          <TrackStrip track={trackStrip(track.id)} />
        {/each}
      </ol>
    </div>

    <!-- The pinned rail: outside the scroller, fixed at the right (or, in
         column mode, under the track rail). Returns first, in the shared
         return list's order; the bus master farthest right (0.3). -->
    <aside
      class="bank__pinned"
      data-channel-bank-pinned
      data-pinned-count={pinnedCount}
      aria-label="Pinned bus and Return channels"
    >
      <!-- Task 9.4 (owner, D9.4.2): the MIX panel sits directly ABOVE the bus
           master — the mix control belongs to the bus it feeds. It is a
           sibling of the modules' row, in the pinned column, so the bus keeps
           the bank's full height and the panel takes only its own. -->
      <MixPanel live />
      <ul class="bank__pinned-row" aria-label="Return buses, then the bus master">
        {#each returns as ret (ret.id)}
          <ReturnStrip ret={returnStripOf(ret.id)} live={returnLive(ret.id)} />
        {/each}
        {#each buses as bus (bus.id)}
          <BusMasterStrip bus={busStripOf(bus.id)} live={busLive(bus.id)} />
        {/each}
      </ul>
    </aside>
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      "legend pinned-legend"
      "tracks pinned";
    gap: var(--al-space-2xs) var(--al-space-md);
    align-items: end;
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
    grid-area: legend;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-md);
    min-width: 0;
    padding: 0 var(--al-space-md);
  }

  .bank__pinned-legend {
    display: flex;
    grid-area: pinned-legend;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: 0 var(--al-space-sm);
  }

  /* =======================================================================
     THE RAILS — the scrolling track rail and the pinned rail beside it.
     A rail is a recess in the deck, a little darker than the panel, that
     the modules are bolted to and stand proud of. The tracks' rail is the
     ONLY horizontal scroller (the pinned rail scrolls only in column mode,
     below).
     ======================================================================= */
  .bank__tracks,
  .bank__pinned {
    align-self: stretch;
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-xs) var(--al-space-sm);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .bank__tracks {
    grid-area: tracks;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
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

  /* --- the pinned rail: outside the scroller, fixed at the right ----------- */
  .bank__pinned {
    display: flex;
    grid-area: pinned;
    flex-direction: column;
    align-items: flex-start;
    /* Task 9.4: the MIX panel sits above the modules' row, so the column owns
       the leftover height and hands it to the row — the bus keeps the bank's
       full height and the panel takes only what it needs. */
    gap: var(--al-space-2xs);
  }

  /* The pinned modules on their rail: the track rail's row, the same gap.
     The row keeps the modules' own height (it does not stretch to the
     rail), and inside it the modules stretch to one another — the bus
     master's blank panel takes up the difference. */
  .bank__pinned-row {
    display: flex;
    flex: 1 1 auto;
    align-items: stretch;
    gap: var(--al-space-2xs);
    width: max-content;
    min-width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Column mode (owner, D2.4.2): under 68.75rem = 1100 px the deck cannot
     hold the pinned block (four 10rem modules) beside two complete track
     strips, so the pinned column moves under the rail — still pinned, never
     scrolling with the tracks — and its rail scrolls sideways on its own
     only when the modules outgrow the window. The threshold is the sum of
     the parts: pinned rail 668 + gap 12 + two strips and their rail 336 =
     1016 px of deck, plus the deck's and the cheeks' 84 px = 1100. */
  @media (width < 68.75rem) {
    .bank__deck {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto auto;
      grid-template-areas:
        "legend"
        "tracks"
        "pinned-legend"
        "pinned";
    }

    .bank__pinned-legend {
      padding-top: var(--al-space-xs);
    }

    .bank__pinned {
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
    }
  }
</style>
