<script lang="ts">
  import Lamp, { type LampColor } from "../components/hardware/Lamp.svelte";
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import TactileSwitch from "../components/hardware/TactileSwitch.svelte";

  /**
   * Playground fixture for the lamp-glow indicator — Task 1.6.
   *
   * One lamp on the family's dark panel, lit or unlit, amber or red, at a
   * chosen size; optionally with an engraved function label above it and a
   * value below it (the switch-bank cluster the two components will form in
   * the rooms), a local toggle, and — for the consistency check — the
   * approved Task 1.4 switch beside it, its own built-in lamp driven by the
   * same local flag. Nothing here is project state, audio or a real switch
   * function; the toggle is a review-sheet control.
   */

  export interface LampFixtureConfig {
    readonly id: string;
    readonly color?: LampColor;
    /** Initial state; the fixture owns it from there. */
    readonly lit?: boolean;
    /** Glass diameter as a multiple of 1× (10 px). */
    readonly scale?: number;
    /** Dev-only CSS zoom of the whole panel, so that the approved switch and the
     *  shared components magnify together at the same ratio. */
    readonly zoom?: number;
    /** Accessible name of what the lamp indicates. */
    readonly name?: string;
    /** Engraved function label above the lamp (the cluster). */
    readonly label?: string;
    /** Engraved value below the lamp (the cluster). */
    readonly value?: string;
    /** A review-sheet toggle for the state. */
    readonly interactive?: boolean;
    /** Render the approved switch beside the cluster, engaged with the lamp. */
    readonly withSwitch?: boolean;
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: LampFixtureConfig } = $props();

  // Deliberate: the fixture takes the initial state and owns it from there.
  // svelte-ignore state_referenced_locally
  let lit = $state(config.lit ?? false);

  const color = $derived(config.color ?? "amber");
  const scale = $derived(config.scale ?? 1);
  const cluster = $derived(Boolean(config.label || config.value));
</script>

<figure class="fixture" data-lamp-fixture={config.id}>
  <div
    class="fixture__panel"
    class:fixture__panel--large={scale > 1.5 || Boolean(config.withSwitch)}
    class:fixture__panel--zoomed={(config.zoom ?? 1) > 1}
    style:zoom={config.zoom ?? null}
    style:--lamp-size={`${0.625 * scale}rem`}
    style:--switch-size={`${1.75 * scale}rem`}
  >
    {#if config.withSwitch}
      <span class="fixture__switch" data-lamp-fixture-switch>
        <TactileSwitch variant="panel" label={config.label ?? "PAD"} value={config.value ?? null} lamp={color} bind:engaged={lit} />
      </span>
    {/if}
    <span class="fixture__cluster" class:fixture__cluster--bare={!cluster} data-lamp-fixture-cluster>
      {#if config.label}
        <EngravedLabel text={config.label} size="sm" />
      {/if}
      <Lamp {lit} {color} name={config.name ?? config.label ?? null} />
      {#if config.value}
        <EngravedLabel text={config.value} size="xs" kind="value" tone="muted" />
      {/if}
    </span>
  </div>

  {#if config.interactive}
    <div class="fixture__controls" data-lamp-fixture-controls>
      <label class="fixture__toggle">
        <input type="checkbox" bind:checked={lit} data-lamp-fixture-toggle />
        <span>Lamp {lit ? "on" : "off"} (simulated state, demo only)</span>
      </label>
    </div>
  {/if}

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" class:fixture__chip--red={color === "red"} aria-hidden="true"></span>
      lamp
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-lamp-fixture-lit={lit} data-lamp-fixture-color={color}>
      {color} · {lit ? "lit" : "unlit"} · glass {Math.round(10 * scale)} px{#if (config.zoom ?? 1) > 1} · shown at {config.zoom}× (review magnification){/if}
      {#if config.withSwitch}· switch {lit ? "engaged" : "off"}{/if}
    </span>
    {#if config.meaning}
      <span class="fixture__meaning">{config.meaning}</span>
    {/if}
  </figcaption>
</figure>

<style>
  .fixture {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    margin: 0;
  }

  /* The same warm-charcoal panel face as the other fixtures: a broad
     key-light falloff from the top-left, a faint brushed grain, a top bevel.
     A lamp's spill is judged on the panel it lights. */
  .fixture__panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--al-space-xl);
    min-width: 0;
    min-height: 6.5rem;
    padding: var(--al-space-md) var(--al-space-sm);
    border: 1px solid var(--al-border-strong);
    border-radius: var(--al-space-3xs);
    background-color: var(--al-material-panel);
    background-image:
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
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8),
      0 1px 2px rgba(0, 0, 0, 0.35);
  }

  .fixture__panel--large {
    min-height: 10rem;
    padding: var(--al-space-xl) var(--al-space-lg);
  }

  /* zoom scales padding and min-height too: keep the magnified panel compact */
  .fixture__panel--zoomed {
    min-height: 0;
    padding: var(--al-space-md) var(--al-space-lg);
  }

  /* The cluster: function above, lamp, value below — the panel-switch print's
     spacing (label-to-control gap), centred on the lamp. */
  .fixture__cluster {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .fixture__cluster--bare {
    gap: 0;
  }

  .fixture__switch {
    display: inline-flex;
    min-width: 0;
  }

  /* --- the demonstration controls: plain review-sheet widgets ------------- */

  .fixture__controls {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-xs);
    border: 1px dashed #9a9a9a;
    background: #ececec;
    font-size: var(--al-text-size-2xs);
    color: #3f3f3f;
  }

  .fixture__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--al-space-2xs);
  }

  .fixture__toggle input {
    margin: 0;
  }

  /* --- caption — the other fixtures' conventions -------------------------- */

  .fixture__caption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--al-space-3xs) var(--al-space-2xs);
    min-width: 0;
    font-size: var(--al-text-size-2xs);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .fixture__family {
    display: inline-flex;
    align-items: center;
    gap: var(--al-space-3xs);
    font-family: var(--al-font-mono);
    font-weight: var(--al-font-weight-semibold);
    color: #1b1b1b;
  }

  .fixture__chip {
    display: inline-block;
    inline-size: 0.625rem;
    block-size: 0.625rem;
    border: 1px solid rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    background: var(--al-material-lamp);
  }

  .fixture__chip--red {
    background: var(--al-function-red-base);
  }

  .fixture__state {
    padding: 0 var(--al-space-3xs);
    border: 1px solid #8a8a8a;
    background: #e4e4e4;
    font-weight: var(--al-font-weight-semibold);
  }

  .fixture__value {
    font-family: var(--al-font-mono);
    color: #555;
  }

  .fixture__meaning {
    flex: 1 1 100%;
    min-width: 0;
  }
</style>
