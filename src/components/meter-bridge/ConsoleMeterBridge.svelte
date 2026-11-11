<script module lang="ts">
  /** Unique per-instance id prefix for the module headings. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY Console meter bridge — Task 2.1 (plan §3 "Console room", §14 2.1;
   * hardware spec §4a / §4b / §6), rebuilt as the owner's reference
   * console's one compact instrument strip (Task 9.5), re-laid for the
   * owner's annotated photographs (Task 9.6, D9.6.3; re-spread to the
   * owner's boxes, Task 9.7, D9.7.3):
   *
   * One long bevelled warm-charcoal deck between two walnut end-cheeks,
   * carrying four instruments on ONE row, left to right in the owner's
   * order — the PHASE box is off the left end, and the strip now opens
   * with the spectrum:
   *
   *   SPECTRUM     a recessed bay of approved LED ladders, one per band —
   *               the crisp segmented language of spec §4b, visibly not a
   *               VU. The row's biggest module, but capped under half the
   *               deck (D9.7.3, the owner's boxes: "it still should be the
   *               biggest, but not that big").
   *   GONIOMETER   the dark recessed scope with a warm trace — the scope
   *               alone since Task 9.7: the correlation strip that shared
   *               its plate read the same fixture the needle meter reads
   *               (D9.7.2, the owner: "remove the phase meter").
   *   CORRELATION  the needle meter (Task 9.5's `CorrelationMeter`): −1 · 0 ·
   *               +1 on a cream card — the reference console's PHASE LEVEL,
   *               moved from the left end to third (D9.6.3). The row's one
   *               correlation reading, and its smallest card (4:3 of the
   *               row's height, D9.7.3 — every VU outsizes it, as the
   *               owner's boxes draw it).
   *   MASTER       the two approved analog VU meters, LEFT and RIGHT, at the
   *               right end — each card wider than the correlation card and
   *               the square scope (D9.7.3, the owner's boxes).
   *
   * The spread is the owner's photograph (D9.7.3): spectrum, goniometer,
   * correlation, master in that order with clear panel between them, edge
   * to edge — the leftover width the capped spectrum no longer eats becomes
   * the space between modules (space-between), not a wider analyzer.
   *
   * No legends print on the row (D9.6.3, the owner: "people will know what
   * they are once they see them") — the module headings stay in the DOM,
   * clipped out of the face, so every instrument keeps its accessible name;
   * the VUs print no LEFT/RIGHT line and the correlation meter runs bare.
   * The space those rows used to take is the instruments' now: every
   * instrument is drawn from ONE height (--b-inst-height), so each fills the
   * row top to bottom with no dead band above or below it — the wasted
   * space the owner marked in red on the photograph.
   *
   * The per-channel VU row of Task 2.1 is gone (D9.5.5): every channel strip
   * carries its own LED meter beside its fader now.
   *
   * Everything on the bridge is fixture data from `bridge-fixtures.ts` —
   * SIMULATED, static, labelled so in the DOM — and nothing is wired to
   * audio, playback, analysis or project state (plan §14: Phases 3, 5 and
   * 8). The modules wrap in prominence order on a narrow deck; on a wide
   * one they spread edge to edge with clear panel between, as the
   * reference's do.
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
      <!-- SPECTRUM — the row opens with it and it stays the biggest module,
           but capped under half the deck (owner, D9.7.3, the boxes on the
           photograph): the analyzer spreads across the width it is allowed,
           no longer across everything the other instruments leave -->
      <section class="module module--spectrum" aria-labelledby={`${uid}-spectrum`} data-bridge-module="spectrum">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-spectrum`} text="Spectrum" size="xs" />
        </div>
        <SpectrumLadder spread />
      </section>

      <!-- GONIOMETER -->
      <section class="module module--stereo" aria-labelledby={`${uid}-stereo`} data-bridge-module="goniometer">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-stereo`} text="Goniometer" size="xs" />
        </div>
        <Goniometer />
      </section>

      <!-- CORRELATION — the needle meter, third from the left (D9.6.3:
           removed from the left end as the "phase box", kept as the
           correlation meter; runs bare, no legend) -->
      <section class="module module--correlation" aria-labelledby={`${uid}-correlation`} data-bridge-module="correlation">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-correlation`} text="Correlation" size="xs" />
        </div>
        <CorrelationMeter value={CORRELATION_FIXTURE} name={`Stereo correlation, ${SIMULATED}`} legend={false} />
      </section>

      <!-- MASTER — the VU pair prints no LEFT/RIGHT line on this row (D9.6.3);
           the meters' own faces and the accessible names carry them -->
      <section class="module module--master" aria-labelledby={`${uid}-master`} data-bridge-module="master">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-master`} text="Master" size="xs" />
        </div>
        <div class="master" data-master-meters>
          <div class="master__pair">
            <VUMeter label={null} level={MASTER_FIXTURE.left} name={`Master left, ${SIMULATED}`} />
            <VUMeter label={null} level={MASTER_FIXTURE.right} name={`Master right, ${SIMULATED}`} />
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
     THE MODULES — one row, the owner's order (D9.6.3): spectrum, goniometer,
     correlation, then the master pair at the right end. No legends print
     (the titles are clipped out of the face, kept for the accessibility
     tree), and every instrument is drawn from ONE height so it fills the
     row top to bottom — no dead band above or below any meter.
     ======================================================================= */
  .bridge__modules {
    /* The row's one height: every instrument's card is this tall (D9.6.3).
       4.5rem = 72 px — the meters keep their Task 9.5 rendered size while
       the row itself gives up the title and label bands, so the bridge is
       shorter AND the instruments bigger, both at once. */
    --b-inst-height: 4.5rem;

    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--al-space-sm) var(--al-space-md);
    min-width: 0;
  }

  .module {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
    max-width: 100%;
    padding: var(--al-space-3xs) var(--al-space-2xs);
    border-radius: 3px;
    /* an engraved outline round the module: a dark line with its lit lower
       wall, the same light as every engraved legend (top-left) */
    box-shadow:
      inset 0 0 0 1px var(--al-bevel-shadow),
      inset 0 1px 0 1px rgba(255, 255, 255, 0.045),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* The owner's order (D9.6.3): the spectrum opens the row, the needle
     meter is third, the master pair closes it. */
  .module--spectrum { order: 1; }
  .module--stereo { order: 2; }
  .module--correlation { order: 3; }
  .module--master { order: 4; }

  /* No legends print on the row (D9.6.3): the module headings are clipped
     out of the face and stay in the accessibility tree, the room's own
     hidden-heading recipe (Task 9.5). */
  .module__title {
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

  /* --- the instruments, each drawn from the row's one height (D9.6.3) ---- */
  .module--spectrum {
    /* the row's biggest module, but capped under half the deck (D9.7.3,
       the owner's boxes): the bay pitches its columns across the width it
       is allowed (SpectrumLadder `spread`), no longer across everything */
    flex: 1 1 auto;
    /* 20 px columns: the bay's ladders + their frequency print land the
       column at the row height (measured; tuned with the fixtures) */
    --ladder-width: 1.25rem;
  }

  .module--stereo {
    --gonio-size: var(--b-inst-height); /* the square scope IS the row's height */
  }

  .module--correlation {
    /* the row's smallest card (D9.7.3, the owner's boxes): 4:3 of the
       height — 96 × 57.6 at 4.5rem — so every VU card (10:7, wider) and
       the cream pair as a whole outsizes it; centered on the row's line */
    --phase-width: calc(var(--b-inst-height) * 4 / 3);
    justify-content: center;
  }

  .module--master {
    /* the VU card is 120 × 84: width = height × 120/84 */
    --vu-width: calc(var(--b-inst-height) * 10 / 7);
  }

  /* --- master: the two VUs, at the right end ------------------------------- */
  .master {
    display: flex;
    align-items: stretch;
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
     uses its whole width, no dead panel at one end — and the spectrum's
     cap holds (D9.7.3): the width it no longer eats becomes the clear
     panel between modules. Below 900 px the modules wrap in prominence
     order, the spectrum taking its whole row uncapped.
     ======================================================================= */
  @container bridge (min-width: 900px) {
    .bridge__modules {
      justify-content: space-between;
    }

    /* the cap lives here, on the spread row only: a wrapped spectrum takes
       its own row's full width (D9.7.3) */
    .module--spectrum {
      max-width: 45%;
    }
  }

  /* Very narrow: the pair keeps its height-driven width and the row
     scrolls inside the module, as every wide module does. */
  @container bridge (max-width: 420px) {
    .master__pair {
      gap: var(--al-space-sm);
    }
  }
</style>
