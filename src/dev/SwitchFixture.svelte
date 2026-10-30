<script lang="ts">
  import TactileSwitch, {
    type LampColour,
    type SwitchVariant,
  } from "../components/hardware/TactileSwitch.svelte";

  /**
   * Playground fixture for one tactile switch — Task 1.4.
   *
   * Owns its own engaged flag so every switch on the page is independent and
   * every one of them works: press it, toggle it, Tab to it. Dev-only
   * scaffolding on the same dark panel the knob and fader fixtures use — a
   * cream cap and a lamp are judged on the surface they will live on, not on
   * the review sheet's grey. Nothing here is project state, and nothing is
   * persisted.
   */

  export interface SwitchFixtureConfig {
    readonly id: string;
    readonly variant: SwitchVariant;
    readonly label: string;
    readonly value?: string;
    readonly lamp?: LampColour;
    /** Initial engaged state; the switch owns it from there. */
    readonly engaged?: boolean;
    readonly demoState?: "pressed" | "focused" | null;
    /** Renders the switch at this multiple of its 1x size. */
    readonly scale?: number;
    /** Shown under the switch: which state this instance demonstrates. */
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: SwitchFixtureConfig } = $props();

  // Deliberate: the switch takes the fixture's initial state and owns it from
  // there. Re-reading config.engaged on every change would undo the toggle.
  // svelte-ignore state_referenced_locally
  let engaged = $state(config.engaged ?? false);
</script>

<figure class="fixture" data-switch-fixture={config.id}>
  <div
    class="fixture__panel"
    class:fixture__panel--large={(config.scale ?? 1) > 1}
    style:--switch-size={`${1.75 * (config.scale ?? 1)}rem`}
  >
    <TactileSwitch
      variant={config.variant}
      label={config.label}
      value={config.value ?? null}
      lamp={config.lamp ?? "amber"}
      demoState={config.demoState ?? null}
      bind:engaged
    />
  </div>

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" aria-hidden="true"></span>
      {config.variant === "cap" ? "cap-labelled" : "panel-labelled"}
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-switch-fixture-engaged={engaged}>
      {engaged ? "engaged" : "off"} · {config.lamp ?? "amber"} lamp
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

  /* The same warm-charcoal panel face as the knob and fader fixtures: a broad
     key-light falloff from the top-left, a faint brushed grain, a top bevel. */
  .fixture__panel {
    display: grid;
    place-items: center;
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

  /* Enlarged specimens get a taller panel, so the raised cap and the lamp's
     spill have panel round them to be judged against. */
  .fixture__panel--large {
    min-height: 10rem;
    padding: var(--al-space-xl) var(--al-space-lg);
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
  }

  .fixture__chip {
    display: inline-block;
    inline-size: 0.625rem;
    block-size: 0.625rem;
    border: 1px solid rgba(0, 0, 0, 0.55);
    border-radius: 2px;
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
