<script lang="ts">
  import VUMeter, { VU_MAX, VU_MIN, vuAngle } from "../components/hardware/VUMeter.svelte";

  /**
   * Playground fixture for one analog VU meter — Task 1.5.
   *
   * Owns the meter's demonstration level and lamp power, so every meter on
   * the page is independent. Interactive fixtures add a slider, a few
   * preset positions and a lamp switch; static ones hold one position. The
   * values are SIMULATED — typed in here, not measured from anything — and
   * the caption says so. Dev-only scaffolding on the same dark panel the
   * other fixtures use. Nothing here is project state; nothing is persisted.
   */

  export interface VUPreset {
    readonly label: string;
    readonly level: number;
  }

  export interface VUMeterFixtureConfig {
    readonly id: string;
    readonly label?: string;
    /** Initial simulated level, dB VU; the fixture owns it from there. */
    readonly level: number;
    /** Initial bulb power. */
    readonly lamp?: boolean;
    readonly lampDrift?: boolean;
    /** Renders the meter at this multiple of its 1x size. */
    readonly scale?: number;
    /** Adds the slider, the presets and the lamp switch. */
    readonly interactive?: boolean;
    readonly presets?: readonly VUPreset[];
    /** Shown under the meter: which position this instance demonstrates. */
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: VUMeterFixtureConfig } = $props();

  // Deliberate: the fixture takes the initial values and owns them from there.
  // Re-reading config on every change would undo the slider.
  // svelte-ignore state_referenced_locally
  let level = $state(config.level);
  // svelte-ignore state_referenced_locally
  let lamp = $state(config.lamp ?? true);

  const numeral = (db: number): string =>
    `${db < 0 ? "\u2212" : db > 0 ? "+" : ""}${Math.abs(db).toFixed(1)}`;
  const angle = $derived(vuAngle(level));
  const zone = $derived(level >= 0 ? "overload" : "normal");
</script>

<figure class="fixture" data-vu-fixture={config.id}>
  <div
    class="fixture__panel"
    class:fixture__panel--large={(config.scale ?? 1) >= 2}
    style:--vu-width={`${7.5 * (config.scale ?? 1)}rem`}
  >
    <VUMeter
      label={config.label ?? null}
      {level}
      {lamp}
      lampDrift={config.lampDrift ?? true}
    />
  </div>

  {#if config.interactive}
    <div class="fixture__controls" data-vu-fixture-controls>
      <label class="fixture__control">
        <span class="fixture__control-label">Simulated level (demo only)</span>
        <input
          class="fixture__range"
          type="range"
          min={VU_MIN}
          max={VU_MAX}
          step="0.5"
          bind:value={level}
          data-vu-fixture-range
        />
        <output class="fixture__readout" data-vu-fixture-readout>{numeral(level)} VU</output>
      </label>
      {#if config.presets}
        <div class="fixture__presets" role="group" aria-label="Simulated positions">
          {#each config.presets as preset (preset.label)}
            <button
              type="button"
              class="fixture__preset"
              class:is-current={preset.level === level}
              data-vu-fixture-preset={preset.label}
              onclick={() => (level = preset.level)}
            >
              {preset.label}
            </button>
          {/each}
        </div>
      {/if}
      <label class="fixture__toggle">
        <input type="checkbox" bind:checked={lamp} data-vu-fixture-lamp />
        <span>Lamp (simulated power)</span>
      </label>
    </div>
  {/if}

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" aria-hidden="true"></span>
      analog VU
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-vu-fixture-level={level} data-vu-fixture-lamp-state={lamp}>
      simulated {numeral(level)} VU · needle {angle >= 0 ? "+" : "\u2212"}{Math.abs(angle).toFixed(1)}° ·
      {zone} · lamp {lamp ? "on" : "off"}
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

  /* The same warm-charcoal panel face as the knob, fader and switch fixtures:
     a broad key-light falloff from the top-left, a faint brushed grain, a top
     bevel. A lamp is judged on the panel it will live in. */
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

  .fixture__panel--large {
    padding: var(--al-space-xl) var(--al-space-lg);
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

  .fixture__control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--al-space-3xs) var(--al-space-xs);
    align-items: center;
  }

  .fixture__control-label {
    grid-column: 1 / -1;
    font-weight: var(--al-font-weight-semibold);
  }

  .fixture__range {
    min-width: 0;
    width: 100%;
    margin: 0;
  }

  .fixture__readout {
    min-width: 5.5em;
    font-family: var(--al-font-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: #1b1b1b;
  }

  .fixture__presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--al-space-3xs);
  }

  .fixture__preset {
    padding: 1px var(--al-space-xs);
    border: 1px solid #8a8a8a;
    border-radius: 2px;
    background: #f6f6f6;
    font: inherit;
    font-size: var(--al-text-size-2xs);
    color: #1b1b1b;
    cursor: pointer;
  }

  .fixture__preset.is-current {
    border-color: #1b1b1b;
    background: #d9d9d9;
    font-weight: var(--al-font-weight-semibold);
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
    border-radius: 2px;
    background: var(--al-material-lamp);
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
