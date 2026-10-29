<script lang="ts">
  import Knob from "../components/hardware/Knob.svelte";
  import { functionToken, type FunctionFamily } from "../lib/tokens";

  /**
   * Playground fixture for one knob — Task 1.2.
   *
   * Owns its own value so every knob on the page is independent. This is
   * dev-only scaffolding: the point of the fixture is that the showcased Knob
   * holds no shared state of its own. Nothing here is project state, and
   * nothing is persisted.
   */

  export interface KnobFixtureConfig {
    readonly id: string;
    readonly label: string;
    readonly family: FunctionFamily;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly value: number;
    readonly unit?: string;
    readonly decimals?: number;
    readonly disabled?: boolean;
    readonly demoState?: "dragging" | "focused" | "editing" | null;
    /** Shown under the knob: why this control is the colour it is. */
    readonly meaning?: string;
    /** Shown under the knob: which state this instance demonstrates. */
    readonly stateNote?: string;
  }

  let { config }: { config: KnobFixtureConfig } = $props();

  // Deliberate: the knob takes the fixture's initial value and owns it from
  // there. Re-reading config.value on every change would fight the user's drag.
  // svelte-ignore state_referenced_locally
  let value = $state(config.value);
</script>

<figure class="fixture" data-knob-fixture={config.id}>
  <!-- The knob sits on the material it was designed for: the dark panel.
       Judging a cream cap or an engraved label against the page's light grey
       would be judging it against a surface it never appears on. -->
  <div class="fixture__panel">
    <Knob
      label={config.label}
      family={config.family}
      min={config.min}
      max={config.max}
      step={config.step}
      unit={config.unit ?? ""}
      decimals={config.decimals ?? 1}
      disabled={config.disabled ?? false}
      demoState={config.demoState ?? null}
      bind:value
    />
  </div>

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span
        class="fixture__chip"
        style:background={functionToken(config.family, "base")}
        aria-hidden="true"
      ></span>
      {config.family}
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
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

  /* A warm-charcoal panel face: a broad key-light falloff from the top-left,
     a faint brushed grain, and a top bevel that catches the room light.
     Restrained — no scratches, no screws, no wear. */
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
      /* very fine grain, 1px period, barely there */
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
  }

  .fixture__state {
    padding: 0 var(--al-space-3xs);
    border: 1px solid #8a8a8a;
    background: #e4e4e4;
    font-weight: var(--al-font-weight-semibold);
  }

  .fixture__meaning {
    flex: 1 1 100%;
    min-width: 0;
  }
</style>
