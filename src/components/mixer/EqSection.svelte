<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import { eqMode, eqParams, type EqState } from "../../lib/mixer-chain";
  import AutoManualControls from "./AutoManualControls.svelte";
  import ChainKnob from "./ChainKnob.svelte";
  import EqGraph from "./EqGraph.svelte";

  /**
   * The EQ bay — Task 2.8 (plan §8 block 3 "static multiband EQ", block 4
   * "dynamic EQ"; §3 "EQ curve", every module bypassable).
   *
   *   HEAD     the engraved title, the module's Auto / Manual (status + ALL
   *            AUTO / ALL MANUAL) and BYPASS — the approved panel switch as
   *            the Return strip places it, its lamp lit while the EQ is out
   *            of circuit. Bypass is a separate state from Auto / Manual.
   *   WINDOW   the response (EqGraph), dimmed while bypassed.
   *   BANDS    LF shelf (FREQ, GAIN), LMF bell (FREQ, GAIN, Q), HMF bell
   *            (FREQ, GAIN, Q), HF shelf (FREQ, GAIN): ten amber knobs (spec
   *            §5), each with its MODE switch. A band that carries block 4
   *            prints a small engraved DYN mark and nothing more: the range
   *            is drawn in the window and has no control of its own.
   *
   * The bands share a ten-column grid (2 · 3 · 3 · 2). When the bay is too
   * narrow for one row the grid folds to five columns — LF + LMF over HMF +
   * HF, two even rows — so no band is ever left alone on a second line and
   * the knobs keep their approved size at every width.
   */
  let {
    eq,
    trackName,
  }: {
    eq: EqState;
    trackName: string;
  } = $props();

  const params = $derived(eqParams(eq));
  const mode = $derived(eqMode(eq));
</script>

<section
  class="eqs"
  data-chain-module="eq"
  data-module-bypassed={eq.bypassed}
  data-module-mode={mode}
  aria-labelledby="mixer-eq-title"
>
  <header class="eqs__head">
    <div class="eqs__title">
      <EngravedLabel text="EQ" size="md" tone="bright" as="h3" id="mixer-eq-title" />
      <EngravedLabel text="Static multiband" size="xs" tone="muted" />
    </div>
    <AutoManualControls {params} module="EQ" {mode} />
    <div class="eqs__bypass" data-module-bypass>
      <TactileSwitch
        variant="panel"
        label="Bypass"
        lamp="amber"
        bind:engaged={() => eq.bypassed, (on) => (eq.bypassed = on)}
        name={`EQ bypass, ${trackName}: ${eq.bypassed ? "bypassed" : "in circuit"}`}
      />
    </div>
  </header>

  <EqGraph {eq} {trackName} />

  <div class="eqs__bands-host">
    <div class="eqs__bands">
      {#each eq.bands as band (band.band.id)}
        <div
          class="eqs__band"
          class:eqs__band--wide={band.q !== null}
          data-eq-band={band.band.id}
          data-eq-dynamic={band.dynamicDepthDb !== null}
        >
          <div class="eqs__band-legend">
            <EngravedLabel text={band.band.label} size="sm" tone="bright" title={band.band.name} />
            {#if band.dynamicDepthDb !== null}
              <span
                class="eqs__dyn"
                data-eq-dyn-mark
                title={`Dynamic EQ on ${band.band.label}: the band may give back up to ${band.dynamicDepthDb} dB \u2014 the range shaded in the window (fixture; no control in this build)`}
              >
                <EngravedLabel text="Dyn" size="xs" tone="muted" />
              </span>
            {/if}
          </div>
          <div class="eqs__knobs">
            <ChainKnob param={band.freq} family="amber" context={band.band.label} />
            <ChainKnob param={band.gain} family="amber" context={band.band.label} />
            {#if band.q}
              <ChainKnob param={band.q} family="amber" context={band.band.label} />
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .eqs {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
  }

  .eqs__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--al-space-xs) var(--al-space-md);
    min-width: 0;
  }

  .eqs__title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .eqs__bypass {
    display: flex;
  }

  .eqs__bands-host {
    container-type: inline-size;
    min-width: 0;
  }

  .eqs__bands {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: var(--al-space-xs) var(--al-space-sm);
    min-width: 0;
  }

  .eqs__band {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-2xs) var(--al-space-2xs) var(--al-space-xs);
    border-radius: 3px;
    /* an engraved outline round the band's group of controls */
    box-shadow:
      inset 0 0 0 1px var(--al-border-subtle),
      inset 0 1px 0 rgba(0, 0, 0, 0.35);
  }

  .eqs__band--wide {
    grid-column: span 3;
  }

  .eqs__band-legend {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--al-space-xs);
  }

  .eqs__knobs {
    display: flex;
    justify-content: space-evenly;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  /* the fold: two even rows of five columns */
  @container (max-width: 39.5rem) {
    .eqs__bands {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
</style>
