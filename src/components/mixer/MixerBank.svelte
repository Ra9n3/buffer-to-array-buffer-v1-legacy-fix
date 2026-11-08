<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import { SIMULATED } from "../channel-strip/track-strip-fixtures";
  import { project } from "../../lib/project/store.svelte";
  import MixerBusStrip from "./MixerBusStrip.svelte";
  import MixerReturnStrip from "./MixerReturnStrip.svelte";
  import MixerTrackStrip from "./MixerTrackStrip.svelte";

  /**
   * ALLOY Mixer channel bank — Task 2.7.
   *
   * The Mixer's strip bank: the twenty regular track channels (the approved
   * `TrackStrip` with the Mixer's identity extension, `MixerTrackStrip`) in
   * a horizontally scrolling rail, and the pinned Bus / Returns block fixed
   * at the right — one `MixerReturnStrip` per fixture Return, then the
   * `MixerBusStrip` farthest right (plan §8a: the Returns pinned alongside
   * the bus master; the Console bank's order). The same session as the
   * Console: since Task 3.1 the channels are the entities of the one project
   * store (`lib/project/store.svelte`), read in the session's order.
   *
   * The housing is the Console bank's — walnut end-cheeks, the charcoal deck
   * with its trim line, the recessed rails (D2.2.5) — copied value for
   * value, so the Mixer reads as a dedicated desk of the same make, not a
   * redesigned Console. What is different is what the strips carry: the
   * identity section with SEL, the instrument identity and the tier.
   *
   * Geometry (owner's rules, D2.2.1 / D2.4.2, unchanged): every strip is a
   * fixed 10rem module, never compressed; the tracks' rail is the only
   * horizontal scroller; the pinned block never scrolls away and moves
   * under the rail as its own row below 68.75rem (1100 px).
   *
   * Selection: `selectedId` is the room's (radio across the bank); the
   * bank only passes it down and reports a SEL press up.
   */
  let {
    selectedId,
    onselect,
  }: {
    selectedId: string;
    onselect: (id: string) => void;
  } = $props();

  /* Task 3.1: the bank reads the one project store — the same tracks,
     Returns and bus master the Console bank and the Arrange list read — in
     the session's order. */
  const tracks = $derived(project.tracks);
  const returns = $derived(project.returns);
  const buses = $derived(project.buses);

  const first = $derived(tracks[0]?.code ?? "");
  const last = $derived(tracks[tracks.length - 1]?.code ?? "");
  const firstPinned = $derived(returns[0]?.code ?? buses[0]?.code ?? "");
  const lastPinned = $derived(buses[buses.length - 1]?.code ?? returns[returns.length - 1]?.code ?? "");
  const pinnedCount = $derived(returns.length + buses.length);
</script>

<div class="mbank" data-mixer-bank data-simulated={SIMULATED}>
  <div class="mbank__cheek mbank__cheek--left" aria-hidden="true"></div>

  <div class="mbank__deck">
    <!-- No screw heads here or anywhere else (D2.1.9). -->

    <!-- The zone's heading. MixerRoom's channels <section> is labelled by
         this id; the legend is the bank's own engraved print. The deck is a
         two-column grid: the legend row over the rails row (the Console
         bank's layout, D2.4.1). -->
    <header class="mbank__legend">
      <EngravedLabel as="h2" id="mixer-channels-title" text="Channels" size="sm" />
      <EngravedLabel text={`Tracks ${first}\u2013${last}`} size="xs" tone="muted" />
    </header>

    <div class="mbank__pinned-legend">
      <EngravedLabel as="p" text="Bus / Returns" size="xs" />
      <EngravedLabel text={`${firstPinned}\u2013${lastPinned}`} size="xs" tone="muted" />
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="mbank__tracks"
      data-mixer-bank-tracks
      role="region"
      tabindex="0"
      aria-label={`Track channels ${first} to ${last}, ${SIMULATED} settings; scrolls sideways`}
    >
      <ol class="mbank__rail" aria-label={`Tracks ${first} through ${last}`}>
        {#each tracks as channel (channel.id)}
          <MixerTrackStrip {channel} selected={channel.id === selectedId} {onselect} />
        {/each}
      </ol>
    </div>

    <!-- The pinned rail: outside the scroller, fixed at the right (or, in
         column mode, under the track rail). Returns first, in the shared
         return list's order; the bus master farthest right. -->
    <aside
      class="mbank__pinned"
      data-mixer-bank-pinned
      data-pinned-count={pinnedCount}
      aria-label="Pinned bus and Return channels"
    >
      <ul class="mbank__pinned-row" aria-label="Return buses, then the bus master">
        {#each returns as channel (channel.id)}
          <MixerReturnStrip {channel} selected={channel.id === selectedId} {onselect} />
        {/each}
        {#each buses as channel (channel.id)}
          <MixerBusStrip {channel} selected={channel.id === selectedId} {onselect} />
        {/each}
      </ul>
    </aside>
  </div>

  <div class="mbank__cheek mbank__cheek--right" aria-hidden="true"></div>
</div>

<style>
  /* =======================================================================
     THE HOUSING — the Console bank's (Task 2.2 / 2.4; itself the approved
     meter bridge's recipe), copied value for value so the Mixer's bank is
     the same desk furniture; only the class names differ (the Console's
     ChannelBank is neither imported nor touched).
     ======================================================================= */
  .mbank {
    /* --- geometry ------------------------------------------------------- */
    --mb-cheek: 0.875rem;
    --mb-radius: 4px;
    /* --- materials, from the tokens ------------------------------------- */
    --mb-wood-light: color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal));
    --mb-wood: var(--al-material-wood);
    --mb-wood-dark: color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess));
    --mb-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: grid;
    grid-template-columns: var(--mb-cheek) minmax(0, 1fr) var(--mb-cheek);
    min-width: 0;
    width: 100%;
    border-radius: var(--mb-radius);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the walnut end-cheeks ------------------------------------------- */
  .mbank__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--mb-wood);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.32) 100%),
      repeating-linear-gradient(
        93deg,
        var(--mb-wood-light) 0 1px,
        var(--mb-wood) 1px 3px,
        var(--mb-wood-dark) 3px 4px,
        var(--mb-wood) 4px 7px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .mbank__cheek--left {
    border-radius: var(--mb-radius) 0 0 var(--mb-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .mbank__cheek--right {
    border-radius: 0 var(--mb-radius) var(--mb-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the deck -------------------------------------------------------- */
  .mbank__deck {
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
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--mb-trim) 1px, var(--mb-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
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

  .mbank__legend {
    display: flex;
    grid-area: legend;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-md);
    min-width: 0;
    padding: 0 var(--al-space-md);
  }

  .mbank__pinned-legend {
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
  .mbank__tracks,
  .mbank__pinned {
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

  .mbank__tracks {
    grid-area: tracks;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .mbank__tracks:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: -2px;
  }

  .mbank__rail {
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
  .mbank__pinned {
    display: flex;
    grid-area: pinned;
    flex-direction: column;
    align-items: flex-start;
  }

  /* The pinned modules on their rail: the track rail's row, the same gap.
     The row keeps the modules' own height (it does not stretch to the
     rail), and inside it the modules stretch to one another — the bus
     master's blank panel takes up the difference. */
  .mbank__pinned-row {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    gap: var(--al-space-2xs);
    width: max-content;
    min-width: 100%;
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
    .mbank__deck {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto auto;
      grid-template-areas:
        "legend"
        "tracks"
        "pinned-legend"
        "pinned";
    }

    .mbank__pinned-legend {
      padding-top: var(--al-space-xs);
    }

    .mbank__pinned {
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
    }
  }
</style>
