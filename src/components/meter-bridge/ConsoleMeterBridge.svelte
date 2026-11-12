<script module lang="ts">
  /** Unique per-instance id prefix for the module headings. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY Console meter bridge — Task 2.1 (plan §3 "Console room", §14 2.1;
   * hardware spec §4a / §4b / §6), rebuilt as the owner's reference
   * console's one compact instrument strip (Task 9.5), re-laid for the
   * owner's annotated photographs (Task 9.6, D9.6.3; Task 9.7, D9.7.3; the
   * owner's correction pass, Task 9.8, D9.8.1–D9.8.4):
   *
   * One long bevelled warm-charcoal deck between two walnut end-cheeks,
   * carrying THREE modules on ONE row, left to right in the owner's order:
   *
   *   SPECTRUM     a recessed bay of approved LED ladders, one per band —
   *               the crisp segmented language of spec §4b, visibly not a
   *               VU. The row's biggest module, but capped at the
   *               reference's 2k5 line — 43% of the deck (D9.7.3; D9.9.1,
   *               the owner's blue column on the photograph: everything
   *               right of that line is the goniometer's and the VUs').
   *   GONIOMETER   the dark recessed scope with a warm trace and, on the
   *               same plate, the CORRELATION STRIP — the owner's
   *               "correlation meter", restored (D9.8.2): the strip is the
   *               row's one correlation reading, and the plate takes its
   *               module's leftover width so the instrument extends
   *               horizontally with the row (D9.8.4). Since 9.9 the strip
   *               rides the plate's vertical middle (D9.9.3, the owner:
   *               "the line must be in the middle, not at the top") and
   *               the plate takes a bigger share of the row (D9.9.4).
   *   MASTER       the two approved analog VU meters, LEFT and RIGHT, at
   *               the right end — their cards EXTENDED HORIZONTALLY WITH
   *               THEIR CONTENT (D9.8.3, the owner: the VU meter's `fill`
   *               mode — the drawing is re-cut to the measured box so the
   *               card, its print and its needle fill the module's share of
   *               the row, the height fixed, the sweep widening, capped).
   *               Since 9.9 the PRINT itself grows with the card (D9.9.2,
   *               the owner: "not just the frame, the content too — the
   *               name, the numbers, the arc"): the numerals, the legend
   *               and the arc enlarge as far as the card's fixed height
   *               allows — the needle kept at its 1× size (the owner: "the
   *               needles need to be smaller").
   *
   * The white needle "Phase" meter that sat between the goniometer and the
   * VUs since Task 9.5 left the row at the owner's direction (D9.8.1: "you
   * should remove the phase meter not the correlation meter" — the 9.7
   * reading had it backwards); its component is deleted with its module.
   *
   * No legends print on the row (D9.6.3, the owner: "people will know what
   * they are once they see them") — the module headings stay in the DOM,
   * clipped out of the face, so every instrument keeps its accessible name;
   * the VUs print no LEFT/RIGHT line and the strip's legend runs hidden.
   * Every instrument is drawn from ONE height (--b-inst-height) and the row's
   * leftover width is carried by the instruments themselves (D9.8.4: the
   * goniometer and master modules flex-grow — the master the bigger share —
   * so no dead panel sits between them; since D9.9.4 the share is 1.4 to
   * the goniometer's plate against the master's 2, the VU pair still the
   * biggest extender, and the one height is a step taller at 5rem).
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
  import Goniometer from "./Goniometer.svelte";
  import SpectrumLadder from "./SpectrumLadder.svelte";
  import { MASTER_FIXTURE, SIMULATED } from "./bridge-fixtures";

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

      <!-- GONIOMETER — the scope and, on the same plate, the CORRELATION
           STRIP: the owner's "correlation meter", restored (D9.8.2). The
           plate takes its module's leftover width, the strip stretching
           with it (D9.8.4) -->
      <section class="module module--stereo" aria-labelledby={`${uid}-stereo`} data-bridge-module="goniometer">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-stereo`} text="Goniometer" size="xs" />
        </div>
        <Goniometer />
      </section>

      <!-- MASTER — the VU pair, no LEFT/RIGHT print on this row (D9.6.3);
           the meters' own faces and the accessible names carry them. The
           cards are EXTENDED with their content (D9.8.3, the owner): each
           meter fills its share of the module's width at the row's one
           height — the VUMeter `fill` mode, the drawing re-cut to the box -->
      <section class="module module--master" aria-labelledby={`${uid}-master`} data-bridge-module="master">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-master`} text="Master" size="xs" />
        </div>
        <div class="master" data-master-meters>
          <div class="master__pair">
            <VUMeter label={null} fill level={MASTER_FIXTURE.left} name={`Master left, ${SIMULATED}`} />
            <VUMeter label={null} fill level={MASTER_FIXTURE.right} name={`Master right, ${SIMULATED}`} />
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
       A step up since Task 9.9 (D9.9.4, the owner's "a little bigger"):
       5rem = 80 px — the square scope, the strip and the VU cards' fill
       height all follow it, and the VUs' print grows with it, so the row
       reads bigger without anything leaving its zone (measured to fit at
       1366×768). */
    --b-inst-height: 5rem;

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

  /* The owner's order (D9.6.3; the needle module left the row in 9.8):
     the spectrum opens the row, the master pair closes it. Since 9.8 the
     goniometer and master modules GROW (D9.8.4) — the leftover width the
     capped spectrum leaves is carried by the instruments (the strip
     stretching, the VU cards filling), never by dead panel. */
  .module--spectrum { order: 1; }
  .module--stereo { order: 2; }
  .module--master { order: 3; }

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
    /* the row's biggest module, but capped at the reference's 2k5 line —
       43% of the deck (D9.7.3, the owner's boxes; D9.9.1, the owner's
       blue column): the bay pitches its columns across the width it is
       allowed (SpectrumLadder `spread`). It grows first (D9.8.4) — the
       larger grow — so it reaches its cap before the others take what is
       left */
    flex: 3 1 auto;
    /* 20 px columns: the bay's ladders + their frequency print land the
       column at the row height (measured; tuned with the fixtures) */
    --ladder-width: 1.25rem;
  }

  .module--stereo {
    /* grows for its share of the row's leftover width (D9.8.4) — the
       scope stays the row's height, the strip stretches. A bigger share
       since Task 9.9 (D9.9.4, the owner: "a little bigger, not as much
       as the VUs"): 1.4 against the master's 2, so the plate gains width
       but the VU pair remains the row's biggest extender */
    flex: 1.4 1 auto;
    --gonio-size: var(--b-inst-height); /* the square scope IS the row's height */
  }

  .module--master {
    /* grows the bigger share after the spectrum's cap (D9.8.4; flex 2
       kept through Task 9.9, D9.9.4 — the VU pair remains the biggest
       extender): the owner's order — spectrum, then the VU pair, then
       the goniometer plate. The meters fill the module's width at the
       row's one height (the `fill` mode, D9.8.3) and their print grows
       with the card (D9.9.2): the host writes the height and the 1×
       card's width as the floor */
    flex: 2 1 auto;
    --vu-fill-height: var(--b-inst-height);
    --vu-fill-min: calc(var(--b-inst-height) * 10 / 7); /* the 1× card, 120/84 */
  }

  /* --- master: the two VUs, filling the module (D9.8.3) -------------------- */
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

  /* The pair fills the module so the two meters share its width (the
     meters flex inside it); the auto margins stand for the day the module
     is wider than the pair's floors, so the left meter is never scrolled
     out of reach. */
  .master__pair {
    display: flex;
    flex: 1 1 auto;
    gap: var(--al-space-sm);
    align-items: flex-start;
    min-width: 0;
    margin-inline: auto;
  }

  /* =======================================================================
     RESPONSIVE: the deck is the container. The modules GROW into the row's
     width (D9.8.4) — the goniometer and master shares flexing, the
     instruments themselves stretching — so the spread needs no justify
     rule: no dead panel collects between them. The spectrum's cap holds on
     the spread row only (a wrapped spectrum takes its own row whole).
     ======================================================================= */
  @container bridge (min-width: 900px) {
    /* the cap lives here, on the spread row only: a wrapped spectrum takes
       its own row's full width (D9.7.3). 43% since Task 9.9 (D9.9.1): the
       owner's blue 2k5 column on the reference photograph — the spectrum's
       right edge lands on that line and everything right of it belongs to
       the goniometer plate and the VU pair */
    .module--spectrum {
      max-width: 43%;
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
