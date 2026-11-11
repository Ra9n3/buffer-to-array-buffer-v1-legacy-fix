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
   *             in a horizontally paging rail — as many complete 7.2rem
   *             modules (D9.6.1, the room's 0.8× density) as the window
   *             holds, the rest one page away (D9.7.1: one scroll gesture
   *             moves exactly one channel, landed instantly).
   *   RETURNS   one `ReturnStrip` per Return, in its OWN paging rail,
   *             decoupled from the tracks' scroll (owner, D9.5.4: the
   *             returns scroll on their own, never connected to the
   *             tracks).
   *   BUS       the `BusMasterStrip`, static: outside every scroller, always
   *             in its place at the right end, whatever the window's width
   *             (owner, D9.5.4).
   *
   * The 9.6 mandatory CSS snap is gone (D9.7.1, the owner: "it is too buggy
   * and confusing, it has like two movements now"): the free scroll
   * decelerating and then the snap re-accelerating to a module edge read as
   * two movements. The rails now page whole channels through the
   * `railPager` action below — one wheel gesture, keypress or swipe moves
   * exactly one module, jumped instantly (`behavior: "auto"`), with no
   * animation and no corrective second movement of any kind.
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

  /* Task 9.7 (D9.7.1): the rails page whole channels — one scroll gesture,
     one channel, landed instantly. No CSS snap (the mandatory snap's
     two-movement feel is what the owner asked off), no animation, and no
     timers: a gesture is bounded by the wheel events' own timestamps, so
     nothing here waits or ticks. Applied to both scrolling rails. */
  function railPager(region: HTMLElement): { destroy: () => void } {
    const rail = (): HTMLElement | null => region.querySelector(".bank__rail");

    /* one module's stride: the first strip's width plus the rail's gap */
    function stride(): number {
      const list = rail();
      const firstChild = list?.firstElementChild as HTMLElement | null | undefined;
      if (!list || !firstChild) return 0;
      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      return firstChild.offsetWidth + gap;
    }

    /* page to a whole module: dir +1 / −1, or 0 to re-land the nearest one.
     Every jump is instant — `behavior: "auto"`, never a smooth scroll. */
    function page(dir: 1 | -1 | 0): void {
      const step = stride();
      const list = rail();
      if (step <= 0 || !list || list.children.length === 0) return;
      const furthest = Math.max(0, region.scrollWidth - region.clientWidth);
      if (furthest <= 0) return;
      const lastPage = Math.floor((furthest + 1) / step);
      const current = Math.round(region.scrollLeft / step);
      const next = dir === 0 ? Math.min(current, lastPage) : Math.max(0, Math.min(current + dir, lastPage));
      region.scrollTo({ left: next * step, behavior: "auto" });
    }

    /* WHEEL — one page per gesture. A gesture is a run of wheel events no
       two of which are further apart than GESTURE_MS (a trackpad's momentum
       keeps one gesture alive; a mouse's notches arrive as separate ones).
       The deltas accumulate until they cross the threshold, then the rail
       pages once and holds until the gesture ends. */
    const GESTURE_MS = 160;
    const WHEEL_THRESHOLD = 36;
    let accum = 0;
    let lastEvent = -1;
    let paged = false;

    function onWheel(e: WheelEvent): void {
      e.preventDefault();
      const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (lastEvent < 0 || e.timeStamp - lastEvent > GESTURE_MS) {
        accum = 0;
        paged = false;
      }
      lastEvent = e.timeStamp;
      accum += d;
      if (paged || Math.abs(accum) < WHEEL_THRESHOLD) return;
      page(accum > 0 ? 1 : -1);
      paged = true;
    }

    /* KEYS — the arrows and PageUp / PageDown page; Home / End land on the
       ends. The regions are focusable (role="region", tabindex="0"). */
    function onKey(e: KeyboardEvent): void {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        page(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        page(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        region.scrollTo({ left: 0, behavior: "auto" });
      } else if (e.key === "End") {
        e.preventDefault();
        region.scrollTo({ left: region.scrollWidth, behavior: "auto" });
      }
    }

    /* TOUCH — the finger drags the rail natively; on release the rail lands
       on a whole module: one page in the swipe's direction past a small
       threshold, else back on the page the gesture started from. */
    const SWIPE_PX = 32;
    let touchX = 0;
    function onTouchStart(e: TouchEvent): void {
      touchX = e.touches[0]?.clientX ?? 0;
    }
    function onTouchEnd(e: TouchEvent): void {
      const dx = touchX - (e.changedTouches[0]?.clientX ?? touchX);
      if (Math.abs(dx) > SWIPE_PX) page(dx > 0 ? 1 : -1);
      else page(0);
    }

    region.addEventListener("wheel", onWheel, { passive: false });
    region.addEventListener("keydown", onKey);
    region.addEventListener("touchstart", onTouchStart, { passive: true });
    region.addEventListener("touchend", onTouchEnd, { passive: true });
    return {
      destroy() {
        region.removeEventListener("wheel", onWheel);
        region.removeEventListener("keydown", onKey);
        region.removeEventListener("touchstart", onTouchStart);
        region.removeEventListener("touchend", onTouchEnd);
      },
    };
  }
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

    <!-- TRACKS: the one rail that pages with the session's tracks (D9.7.1) -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="bank__rail-region bank__tracks"
      data-channel-bank-tracks
      role="region"
      tabindex="0"
      aria-label={`Track channel strips ${first} to ${last}, ${SIMULATED} settings; scrolls sideways one channel at a time`}
      use:railPager
    >
      <ol class="bank__rail" aria-label={`Tracks ${first} through ${last}`}>
        {#each tracks as track (track.id)}
          <TrackStrip track={trackStrip(track.id)} />
        {/each}
      </ol>
    </div>

    <!-- THE DIVIDER (D9.6.4): the owner's green line — a thin walnut bar
         between the tracks and the Returns/Bus group -->
    <div class="bank__split" aria-hidden="true"></div>

    <!-- RETURNS: their own rail, their own paging — never connected to the
         tracks' (owner, D9.5.4; the pager, D9.7.1) -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="bank__rail-region bank__returns"
      data-channel-bank-returns
      role="region"
      tabindex="0"
      aria-label={`Return channel strips ${firstReturn} to ${lastReturn}, ${SIMULATED} settings; pages on its own, one channel at a time`}
      use:railPager
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
    --b-cheek: 0.7rem; /* 0.875 × 0.8 — the room's density (D9.6.1) */
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

  /* --- the deck: the legend (hidden) over the three rails and the walnut
     divider between them (D9.6.4). The divider is the owner's green line:
     a thin bar of the cheeks' own walnut standing between the tracks and
     the Returns/Bus group, the full height of the rails. */
  .bank__deck {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 0.4375rem minmax(5.2rem, max-content) max-content;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "tracks split returns bus";
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
         paging sideways through them (the only width-flexible rail).
         Task 9.7, D9.7.1 (the owner: "just scroll a channel must snap, with
         out fancy animation"): no CSS snap of any kind — the 9.6 mandatory
         snap's two-movement feel is gone — and no fade. The `railPager`
         action pages whole modules, instantly; a strip is either fully in
         the rail or fully past its edge, the way a real console's modules
         sit in their frame. */
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

  /* --- RETURNS: their own pager, decoupled from the tracks (D9.5.4).
     Sized by its content when there is room, giving way (and paging on its
     own) when there is not. No CSS snap, no fade (D9.7.1). */
  .bank__returns {
    grid-area: returns;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
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

  /* --- THE DIVIDER (D9.6.4): a thin bar of the cheeks' own walnut between
     the tracks and the Returns — the owner's green line on the annotated
     photograph. The same figured grain as the end-cheeks, running top to
     bottom, standing the full height of the rails. */
  .bank__split {
    grid-area: split;
    align-self: stretch;
    border-radius: 2px;
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
      inset 1px 0 0 rgba(255, 255, 255, 0.14),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      0 1px 2px rgba(0, 0, 0, 0.4);
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
