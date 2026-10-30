<script lang="ts">
  import LedLadder, { LED_LADDER_SCALE, ledLitCount } from "../components/hardware/LedLadder.svelte";

  /**
   * Playground fixture for one LED segment ladder — Task 1.5.
   *
   * Owns the ladder's demonstration level, so every ladder on the page is
   * independent. Interactive fixtures add a slider and preset levels; static
   * ones hold one level. The values are SIMULATED — typed in here, not
   * measured from anything — and the caption says so, and prints the lit
   * count so the relation between level and segments is checkable. Dev-only
   * scaffolding on the same dark panel the other fixtures use.
   */

  export interface LedPreset {
    readonly label: string;
    readonly level: number;
  }

  export interface LedLadderFixtureConfig {
    readonly id: string;
    readonly label?: string;
    /** Initial simulated level, dB; the fixture owns it from there. */
    readonly level: number;
    /** Renders the ladder at this multiple of its 1x size. */
    readonly scale?: number;
    /** Adds the slider and the presets. */
    readonly interactive?: boolean;
    readonly presets?: readonly LedPreset[];
    /** Shown under the ladder: which level this instance demonstrates. */
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: LedLadderFixtureConfig } = $props();

  /** The slider's range: from silence to past the top segment. */
  const RANGE_MIN = -60;
  const RANGE_MAX = 6;

  // Deliberate: the fixture takes the initial level and owns it from there.
  // svelte-ignore state_referenced_locally
  let level = $state(config.level);

  const numeral = (db: number): string => `${db < 0 ? "\u2212" : db > 0 ? "+" : ""}${Math.abs(db)}`;
  const lit = $derived(ledLitCount(LED_LADDER_SCALE, level));
  const count = LED_LADDER_SCALE.length;
  const litBands = $derived({
    green: LED_LADDER_SCALE.slice(0, lit).filter((s) => s.band === "green").length,
    amber: LED_LADDER_SCALE.slice(0, lit).filter((s) => s.band === "amber").length,
    red: LED_LADDER_SCALE.slice(0, lit).filter((s) => s.band === "red").length,
  });
</script>

<figure class="fixture" data-led-fixture={config.id}>
  <div
    class="fixture__panel"
    class:fixture__panel--large={(config.scale ?? 1) >= 2}
    style:--ladder-width={`${3 * (config.scale ?? 1)}rem`}
  >
    <LedLadder label={config.label ?? null} {level} />
  </div>

  {#if config.interactive}
    <div class="fixture__controls" data-led-fixture-controls>
      <label class="fixture__control">
        <span class="fixture__control-label">Simulated level (demo only)</span>
        <input
          class="fixture__range"
          type="range"
          min={RANGE_MIN}
          max={RANGE_MAX}
          step="1"
          bind:value={level}
          data-led-fixture-range
        />
        <output class="fixture__readout" data-led-fixture-readout>{numeral(level)} dB</output>
      </label>
      {#if config.presets}
        <div class="fixture__presets" role="group" aria-label="Simulated levels">
          {#each config.presets as preset (preset.label)}
            <button
              type="button"
              class="fixture__preset"
              class:is-current={preset.level === level}
              data-led-fixture-preset={preset.label}
              onclick={() => (level = preset.level)}
            >
              {preset.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" aria-hidden="true"></span>
      LED ladder
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-led-fixture-level={level} data-led-fixture-lit={lit}>
      simulated {numeral(level)} dB → {lit} of {count} lit ({litBands.green} green · {litBands.amber} amber ·
      {litBands.red} red)
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

  /* The same warm-charcoal panel face as the other fixtures. */
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
    min-width: 4.5em;
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
    background: var(--al-function-green-base);
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
