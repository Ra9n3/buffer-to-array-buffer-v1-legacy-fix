<script lang="ts">
  import BusMasterStrip from "./channel-strip/BusMasterStrip.svelte";
  import ReturnStrip from "./channel-strip/ReturnStrip.svelte";
  import TrackStrip from "./channel-strip/TrackStrip.svelte";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import { SIMULATED } from "./channel-strip/track-strip-fixtures";
  import { busLive, busStripOf, project, returnLive, returnStripOf, trackStrip } from "../lib/project/store.svelte";

  /**
   * ALLOY Console channel bank — Task 2.2 (Phase 2 skin), rebuilt as three
   * independent rails for the one-window Console (Task 9.5).
   *
   * The Console's lower section, one recessed rail row of three regions:
   *
   *   TRACKS    the regular track channel strips (the skinned `TrackStrip`)
   *             in a horizontally scrolling rail — as many complete 8rem
   *             modules as the window holds, the rest one scroll away.
   *   RETURNS   one `ReturnStrip` per Return, in its OWN horizontally
   *             scrolling rail, decoupled from the tracks' scroll (owner,
   *             D9.5.4: the returns scroll on their own, never connected to
   *             the tracks).
   *   BUS       the `BusMasterStrip`, static: outside every scroller, always
   *             in its place at the right end, whatever the window's width
   *             (owner, D9.5.4).
   *
   * All three rails are one recess recipe and one strip geometry, so every
   * module — track, Return or bus — lines up control for control across the
   * bank. This three-rail arrangement replaces Task 2.4's single pinned
   * column (and its column mode, D2.4.2): with two independent scrollers
   * there is no width at which anything needs to move under anything else.
   *
   * The housing is the meter bridge's: walnut end-cheeks and the charcoal
   * deck with its trim line, so the zones of the Console read as one desk
   * (D2.2.5). The zone's engraved legend is the deck's own print, visually
   * hidden (Task 9.5): the strips' heads name every channel, and the desk
   * keeps its hardware face — the heading stays in the DOM as the zone's
   * accessible name.
   *
   * Since Task 3.1 the bank reads the one project store — the same tracks,
   * Returns and bus master the Arrange and Mixer rooms read — and hands each
   * strip the store's view of its channel to bind to. The session's order
   * is the bank's order.
   */
  /* Task 9.5: the bank reads the one project store — the same tracks,
     Returns and bus master the Arrange and Mixer rooms read — and hands each
     strip the store's view of its channel to bind to. The session's order
     is the bank's order. */
  const tracks = $derived(project.tracks);
  const returns = $derived(project.returns);
  const buses = $derived(project.buses);

  const first = $derived(tracks[0]?.code ?? "");
  const last = $derived(tracks[tracks.length - 1]?.code ?? "");
  const firstReturn = $derived(returns[0]?.code ?? "");
  const lastReturn = $derived(returns[returns.length - 1]?.code ?? "");
</script>

<div class="bank" data-channel-bank data-simulated={SIMULATED}>
  <div class="bank__cheek bank__cheek--left" aria-hidden="true"></div>

  <div class="bank__deck">
    <!-- No screw heads here or anywhere else (D2.1.9). -->

    <!-- The zone's heading. ConsoleRoom's channels <section> is labelled by
         this id. Visually hidden (Task 9.5): the strips' heads name every
         channel; the heading stays in the DOM as the zone's accessible
         name, and the ranges keep it honest for screen readers. -->
    <header class="bank__legend">
      <EngravedLabel as="h2" id="console-channels-title" text="Channel bank" size="sm" />
      <EngravedLabel text={`Tracks ${first}\u2013${last}`} size="xs" tone="muted" />
    </header>

    <!-- TRACKS: the one rail that scrolls with the session's tracks -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="bank__rail-region bank__tracks"
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

    <!-- RETURNS: their own rail, their own scroll — never connected to the
         tracks' (owner, D9.5.4) -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="bank__rail-region bank__returns"
      data-channel-bank-returns
      role="region"
      tabindex="0"
      aria-label={`Return channel strips ${firstReturn} to ${lastReturn}, ${SIMULATED} settings; scrolls on its own`}
    >
      <ol class="bank__rail" aria-label={`Returns ${firstReturn} through ${lastReturn}`}>
        {#each returns as ret (ret.id)}
          <ReturnStrip ret={returnStripOf(ret.id)} live={returnLive(ret.id)} />
        {/each}
      </ol>
    </div>

    <!-- BUS: the bus master, static — outside every scroller, always in its
         place at the right end (owner, D9.5.4) -->
    <aside
      class="bank__rail-region bank__bus"
      data-channel-bank-bus
      aria-label="Bus master, always in place"
    >
      <ol class="bank__rail" aria-label="Bus master">
        {#each buses as bus (bus.id)}
          <BusMasterStrip bus={busStripOf(bus.id)} live={busLive(bus.id)} />
        {/each}
      </ol>
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

  /* --- the deck: the legend (hidden) over the three rails ----------------- */
  .bank__deck {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(6.5rem, max-content) max-content;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "tracks returns bus";
    gap: var(--al-space-2xs);
    align-items: stretch;
    min-width: 0;
    padding: var(--al-space-3xs) var(--al-space-xs) var(--al-space-3xs);
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

  /* The legend row: the zone's heading, kept for the accessibility tree and
     the zone's name, hidden from the desk's face (Task 9.5). */
  .bank__legend {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-md);
    min-width: 0;
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* =======================================================================
     THE RAILS — three regions of one recess recipe. A rail is a recess in
     the deck, a little darker than the panel, that the modules are bolted
     to and stand proud of.
     ======================================================================= */
  .bank__rail-region {
    display: flex;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    padding: var(--al-space-2xs);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* --- TRACKS: the session's tracks, the rail that takes the free width,
         scrolling sideways through them (the only width-flexible rail).
         Snap: the rail lands on whole modules, so the strip at the edge is
         never left half-seen after a scroll (Task 9.5). The edge fade says
         "the rail continues" — a partial strip at the fold reads as a
         scroller's edge, never as a broken module. */
  .bank__tracks {
    grid-area: tracks;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
    mask-image: linear-gradient(to right, rgb(0 0 0) 0, rgb(0 0 0) calc(100% - 2.5rem), transparent 100%);
  }

  .bank__tracks:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: -2px;
  }

  /* --- RETURNS: their own scroller, decoupled from the tracks (D9.5.4).
     Sized by its content when there is room, giving way (and scrolling on
     its own) when there is not. */
  .bank__returns {
    grid-area: returns;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
    mask-image: linear-gradient(to right, rgb(0 0 0) 0, rgb(0 0 0) calc(100% - 2.5rem), transparent 100%);
  }

  .bank__returns:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: -2px;
  }

  /* --- BUS: static. No scroller, no shrink: whatever the window's width,
     the bus master stands in its place (owner, D9.5.4). */
  .bank__bus {
    grid-area: bus;
    overflow: hidden;
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
</style>
