<script lang="ts">
  /**
   * ALLOY spectrum ladder — Task 2.1, hardware spec §4b.
   *
   * A recessed bay holding one approved `LedLadder` per band: fifteen
   * columns of crisp, individually lit segments, green through amber to
   * red, bottom up — the ladder's own look, unchanged, which is what keeps
   * this display visibly a different instrument from the cream-faced VU
   * meters beside it. The frequency print under the columns is the shared
   * `EngravedLabel`. Nothing is analysed: every column shows the number a
   * fixture hands it (plan §14 schedules analysis for Phase 5).
   *
   * HOW THE COLUMNS ARE PACKED. The ladder is drawn 48 units wide with its
   * well in the left 30 units (lip to lip) and its dB print in the right
   * 18; these columns carry no print (their segment scale has the numeral
   * flags stripped), so each ladder wrapper is `--ladder-width` wide and
   * takes back the empty print area with a negative right margin. The well
   * therefore sits centred over its frequency label and the columns can be
   * pitched close, the way a bargraph analyser's are.
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import LedLadder from "../hardware/LedLadder.svelte";
  import {
    SIMULATED,
    SPECTRUM_FIXTURE,
    SPECTRUM_SEGMENTS,
    type SpectrumBandFixture,
  } from "./bridge-fixtures";
  import type { LedSegment } from "../hardware/LedLadder.svelte";

  let {
    /** The bands, lowest first. Fixture data by default — simulated. */
    bands = SPECTRUM_FIXTURE,
    /** The ladder scale every column uses. Defaults to the approved ladder scale, unprinted. */
    segments = SPECTRUM_SEGMENTS,
  }: {
    bands?: readonly SpectrumBandFixture[];
    segments?: readonly LedSegment[];
  } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="spectrum"
  role="region"
  tabindex="0"
  aria-label={`Spectrum ladder, ${bands.length} bands, ${SIMULATED} readings; scrolls sideways when narrow`}
  data-spectrum
  data-spectrum-bands={bands.length}
  data-simulated={SIMULATED}
>
  <div class="spectrum__bay">
    <ol class="spectrum__columns" aria-label="Bands, lowest to highest">
      {#each bands as band (band.hz)}
        <li class="spectrum__column" data-spectrum-band={band.hz}>
          <div class="spectrum__ladder">
            <LedLadder level={band.level} {segments} name={`${band.hz} hertz band`} />
          </div>
          <div class="spectrum__print">
            <EngravedLabel text={band.label} size="xs" kind="value" />
          </div>
        </li>
      {/each}
      <li class="spectrum__unit" aria-hidden="true">
        <EngravedLabel text="Hz" size="xs" kind="value" tone="muted" />
      </li>
    </ol>
  </div>
</div>

<style>
  .spectrum {
    /* One width scales every column: the approved ladder reads it. 2.25rem
       = 36 px = 0.75× the playground's 1× ladder. */
    --ladder-width: 2.25rem;
    /* The ladder's well, lip to lip, is the left 30 of its 48 units. */
    --spectrum-well: calc(var(--ladder-width) * 30 / 48);
    --spectrum-pitch-gap: var(--al-space-2xs);

    display: block;
    min-width: 0;
    max-width: 100%;
    /* Controlled horizontal scroll inside the display only (plan §14's
       no-page-overflow rule): the columns keep their pitch, the bay scrolls. */
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  /* --- the bay: a shallow recess milled into the panel ---------------------- */
  .spectrum__bay {
    display: inline-block;
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-sm) var(--al-space-3xs);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 72%, var(--al-material-panel));
    background-image: linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0) 38%, rgba(255, 255, 255, 0.015));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .spectrum__columns {
    display: flex;
    align-items: flex-end;
    gap: var(--spectrum-pitch-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spectrum__column {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-3xs);
    width: var(--spectrum-well);
  }

  /* The ladder wrapper is the ladder's full width so the component's own
     centring puts the drawing at x = 0; the empty print area to its right is
     given back with the negative margin, so the next column starts right
     after the well. The overflow is transparent SVG — nothing is drawn there
     because these columns print no numerals. */
  .spectrum__ladder {
    flex: 0 0 auto;
    align-self: flex-start;
    width: var(--ladder-width);
    margin-right: calc(var(--spectrum-well) - var(--ladder-width));
  }

  /* The frequency print is centred under the well. Its box is the well plus
     one pitch gap each side, so a three-character legend ("1k6") never has
     to clip, and the engraved walls are never cut by a tight box. */
  .spectrum__print {
    display: flex;
    flex: 0 0 auto;
    justify-content: center;
    width: calc(var(--spectrum-well) + 2 * var(--spectrum-pitch-gap));
    min-width: 0;
  }

  .spectrum__unit {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-end;
    padding-left: var(--al-space-2xs);
    /* sits on the label row, the ladders are above it */
    padding-bottom: 1px;
  }
</style>
