<script module lang="ts">
  /** Unique per-instance id prefix for the module headings. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY Console meter bridge — Task 2.1 (plan §3 "Console room", §14 2.1;
   * hardware spec §4a / §4b / §6), rebuilt as the owner's reference
   * console's one compact instrument strip (Task 9.5).
   *
   * One long bevelled warm-charcoal deck between two walnut end-cheeks,
   * carrying four engraved-outlined instruments on ONE row, left to right
   * in the reference's order:
   *
   *   PHASE       the correlation needle meter (Task 9.5's
   *               `CorrelationMeter`): −1 · 0 · +1 on a cream card — the
   *               reference console's PHASE LEVEL.
   *   GONIOMETER  the dark recessed scope with a warm trace and the −1 · 0 ·
   *               +1 correlation strip (provisional, D2.1.4).
   *   SPECTRUM    a recessed bay of approved LED ladders, one per band —
   *               the crisp segmented language of spec §4b, visibly not a VU.
   *   MASTER      the two approved analog VU meters, LEFT and RIGHT, at the
   *               right end — compact (D9.5.5: the strip is one row tall,
   *               ~130 px, so every instrument on it is the smaller of its
   *               approved sizes).
   *
   * The per-channel VU row of Task 2.1 is gone (D9.5.5): every channel strip
   * carries its own LED meter beside its fader now, and the channel bank
   * needs the room the second row was taking.
   *
   * Everything on the bridge is fixture data from `bridge-fixtures.ts` —
   * SIMULATED, static, labelled — and nothing is wired to audio, playback,
   * analysis or project state (plan §14: Phases 3, 5 and 8). The modules
   * wrap in prominence order on a narrow deck; the free panel between the
   * spectrum and the master pair stays clear, as the reference's does.
   *
   * Materials: tokens only — the panel, bevel, recess, metal, wood and text
   * tokens, with neutral black/white alphas for light and shade (spec §6:
   * layered gradients, never a flat fill).
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import VUMeter from "../hardware/VUMeter.svelte";
  import CorrelationMeter from "./CorrelationMeter.svelte";
  import Goniometer from "./Goniometer.svelte";
  import SpectrumLadder from "./SpectrumLadder.svelte";
  import { CORRELATION_FIXTURE, MASTER_FIXTURE, SIMULATED } from "./bridge-fixtures";

  const uid = `bridge${++nextId}`;
</script>

<div class="bridge" data-meter-bridge data-simulated={SIMULATED}>
  <div class="bridge__cheek bridge__cheek--left" aria-hidden="true"></div>

  <div class="bridge__deck">
    <!-- No screw heads on this deck or anywhere else: the owner's standing
         rule (D2.1.9) — never add them, whatever a later prompt says. -->

    <!-- The zone's heading. ConsoleRoom's meter-bridge <section> is labelled
         by this id. Visually hidden (Task 9.5): the instruments are labelled
         by their own engraved legends; the heading stays in the DOM as the
         zone's accessible name. -->
    <header class="bridge__legend">
      <EngravedLabel as="h2" id="console-meter-title" text="Meter bridge" size="sm" />
    </header>

    <div class="bridge__modules">
      <!-- PHASE -->
      <section class="module module--phase" aria-labelledby={`${uid}-phase`} data-bridge-module="phase">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-phase`} text="Phase" size="xs" />
        </div>
        <CorrelationMeter value={CORRELATION_FIXTURE} name={`Stereo correlation, ${SIMULATED}`} />
      </section>

      <!-- GONIOMETER -->
      <section class="module module--stereo" aria-labelledby={`${uid}-stereo`} data-bridge-module="goniometer">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-stereo`} text="Goniometer" size="xs" />
        </div>
        <Goniometer />
      </section>

      <!-- SPECTRUM -->
      <section class="module module--spectrum" aria-labelledby={`${uid}-spectrum`} data-bridge-module="spectrum">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-spectrum`} text="Spectrum" size="xs" />
        </div>
        <SpectrumLadder />
      </section>

      <!-- MASTER -->
      <section class="module module--master" aria-labelledby={`${uid}-master`} data-bridge-module="master">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-master`} text="Master" size="xs" />
        </div>
        <div class="master" data-master-meters>
          <div class="master__pair">
            <VUMeter label="Left" level={MASTER_FIXTURE.left} name={`Master left, ${SIMULATED}`} />
            <VUMeter label="Right" level={MASTER_FIXTURE.right} name={`Master right, ${SIMULATED}`} />
          </div>
        </div>
      </section>
    </div>
  </div>

  <div class="bridge__cheek bridge__cheek--right" aria-hidden="true"></div>
</div>

<style>
  /* =======================================================================
     THE HOUSING
     ======================================================================= */
  .bridge {
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
    /* the whole bridge sits a little proud of the room, like a box on the console */
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the walnut end-cheeks (plan §4: walnut side trim) ------------------- */
  .bridge__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--b-wood);
    /* a figured grain running top to bottom: fine streaks of lighter and
       darker wood, a broad lift toward the lit top-left, a shadowed foot */
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

  .bridge__cheek--left {
    border-radius: var(--b-radius) 0 0 var(--b-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .bridge__cheek--right {
    border-radius: 0 var(--b-radius) var(--b-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the deck: the approved fixture panel face, as a size container ------ */
  .bridge__deck {
    position: relative;
    container-type: inline-size;
    container-name: bridge;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-2xs) var(--al-space-md) var(--al-space-2xs);
    background-color: var(--al-material-panel);
    background-image:
      /* the thin trim line along the top edge, under the bevel */
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
     the zone's name, hidden from the deck's face (Task 9.5). */
  .bridge__legend {
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
     THE MODULES — one row, the reference's order: phase, goniometer,
     spectrum, then the master pair at the right end with clear panel
     between. Every instrument at its compact size (D9.5.5): the strip is
     one row tall.
     ======================================================================= */
  .bridge__modules {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-sm) var(--al-space-md);
    min-width: 0;
  }

  .module {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    max-width: 100%;
    padding: var(--al-space-2xs) var(--al-space-sm);
    border-radius: 3px;
    /* an engraved outline round the module: a dark line with its lit lower
       wall, the same light as every engraved legend (top-left) */
    box-shadow:
      inset 0 0 0 1px var(--al-bevel-shadow),
      inset 0 1px 0 1px rgba(255, 255, 255, 0.045),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .module--phase { order: 1; }
  .module--stereo { order: 2; }
  .module--spectrum { order: 3; }
  .module--master { order: 4; }

  .module__title {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 0.875rem;
  }

  /* --- the compact instruments (D9.5.5) ----------------------------------- */
  .module--stereo {
    --gonio-size: 4.5rem; /* the scope and its correlation strip, compact */
  }

  .module--spectrum {
    --ladder-width: 1.875rem; /* the ladder columns, compact — wide enough that the three-character band prints never collide */
  }

  /* --- master: the two VUs, compact, at the right end ---------------------- */
  .master {
    --vu-width: 6.75rem;

    display: flex;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 1px;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  /* Auto margins centre the pair and collapse to zero when the pair is wider
     than the module, so the left meter is never scrolled out of reach. */
  .master__pair {
    display: flex;
    flex: 0 0 auto;
    gap: var(--al-space-sm);
    align-items: flex-start;
    margin-inline: auto;
  }

  /* =======================================================================
     RESPONSIVE: the deck is the container. From 900 px up the instruments
     spread edge to edge across the deck — the reference console's strip
     uses its whole width, no dead panel at one end. Below that the modules
     wrap in prominence order.
     ======================================================================= */
  @container bridge (min-width: 900px) {
    .bridge__modules {
      justify-content: space-between;
    }
  }

  /* Very narrow: the masters stay at their 1× so the pair still fits a
     phone-width deck before the row has to scroll. */
  @container bridge (max-width: 420px) {
    .master {
      --vu-width: 7.5rem;
    }

    .master__pair {
      gap: var(--al-space-sm);
    }
  }
</style>
