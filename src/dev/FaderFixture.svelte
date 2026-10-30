<script lang="ts">
  import Fader, { type TaperPoint } from "../components/hardware/Fader.svelte";

  /**
   * Playground fixture for one fader — Task 1.3.
   *
   * Owns its own value so every fader on the page is independent. Dev-only
   * scaffolding, on the same dark panel the knob fixtures use: a cream cap is
   * judged on the surface it will live on, not on the review sheet's grey.
   * Nothing here is project state, and nothing is persisted.
   */

  export interface FaderFixtureConfig {
    readonly id: string;
    readonly label: string;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly value: number;
    readonly unit?: string;
    readonly decimals?: number;
    readonly disabled?: boolean;
    readonly taper?: readonly TaperPoint[] | null;
    readonly travel?: number;
    readonly majorEvery?: number | null;
    readonly demoState?: "dragging" | "focused" | "editing" | null;
    /** Renders the assembly at this multiple of its 1x size. */
    readonly scale?: number;
    /** Shown under the fader: which state or position this instance demonstrates. */
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: FaderFixtureConfig } = $props();

  // Deliberate: the fader takes the fixture's initial value and owns it from
  // there. Re-reading config.value on every change would fight the user's drag.
  // svelte-ignore state_referenced_locally
  let value = $state(config.value);
</script>

<figure class="fixture" data-fader-fixture={config.id}>
  <div class="fixture__panel" style:--fader-width={`${4.5 * (config.scale ?? 1)}rem`}>
    <Fader
      label={config.label}
      min={config.min ?? -60}
      max={config.max ?? 10}
      step={config.step ?? 0.5}
      unit={config.unit ?? "dB"}
      decimals={config.decimals ?? 1}
      disabled={config.disabled ?? false}
      taper={config.taper === undefined ? undefined : config.taper}
      travel={config.travel ?? 160}
      majorEvery={config.majorEvery ?? null}
      demoState={config.demoState ?? null}
      bind:value
    />
  </div>

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" aria-hidden="true"></span>
      cream
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-fader-fixture-value>{value.toFixed(config.decimals ?? 1)}</span>
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

  /* The same warm-charcoal panel face as the knob fixtures: a broad key-light
     falloff from the top-left, a faint brushed grain, and a top bevel. */
  .fixture__panel {
    display: grid;
    place-items: center;
    min-width: 0;
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
    text-transform: capitalize;
  }

  .fixture__chip {
    display: inline-block;
    inline-size: 0.625rem;
    block-size: 0.625rem;
    border: 1px solid rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    background: var(--al-function-cream-base);
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
