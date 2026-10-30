<script lang="ts">
  import EngravedLabel, {
    type LabelFinish,
    type LabelKind,
    type LabelSize,
    type LabelTone,
  } from "../components/hardware/EngravedLabel.svelte";

  /**
   * Playground fixture for a set of engraved labels — Task 1.6.
   *
   * One panel of the real material — the warm charcoal panel the other
   * fixtures use, the dark grey-green control surface, or the raised face
   * plate — with a row or column of specimens on it, so the engraving is
   * judged on the surfaces it will be cut into, not on the review sheet's
   * grey. Dev-only scaffolding; nothing here is a product layout.
   */

  export interface LabelSpecimen {
    readonly text: string;
    readonly size?: LabelSize;
    readonly kind?: LabelKind;
    readonly tone?: LabelTone;
    readonly finish?: LabelFinish;
    /** Constrain the specimen to this width (CSS length) to show truncation. */
    readonly width?: string;
    readonly truncate?: boolean;
  }

  export interface LabelFixtureConfig {
    readonly id: string;
    readonly specimens: readonly LabelSpecimen[];
    /** Which material the labels are cut into. */
    readonly surface?: "panel" | "surface" | "raised";
    /** Row (default) or column of specimens. */
    readonly layout?: "row" | "column" | "pairs";
    /** Dev-only magnification of the whole panel for pixel inspection. */
    readonly zoom?: number;
    /** Show a paragraph of ordinary interface text beside the engraving. */
    readonly withBodyText?: boolean;
    readonly stateNote?: string;
    readonly meaning?: string;
  }

  let { config }: { config: LabelFixtureConfig } = $props();

  const surface = $derived(config.surface ?? "panel");
</script>

<figure class="fixture" data-label-fixture={config.id}>
  <div
    class={`fixture__panel fixture__panel--${surface} fixture__panel--${config.layout ?? "row"}`}
    class:fixture__panel--zoomed={(config.zoom ?? 1) > 1}
    style:zoom={config.zoom ?? null}
    style:--pairs={config.layout === "pairs" ? Math.ceil(config.specimens.length / 2) : null}
    data-label-fixture-surface={surface}
  >
    {#each config.specimens as specimen, i (`${specimen.text}-${i}`)}
      <span
        class="fixture__specimen"
        style:width={specimen.width ?? null}
        style:max-width={specimen.width ?? null}
        data-label-specimen={specimen.text}
      >
        <EngravedLabel
          text={specimen.text}
          size={specimen.size ?? "sm"}
          kind={specimen.kind ?? "label"}
          tone={specimen.tone ?? "normal"}
          finish={specimen.finish ?? "filled"}
          truncate={specimen.truncate ?? false}
        />
      </span>
    {/each}
    {#if config.withBodyText}
      <p class="fixture__body" data-label-fixture-body>
        Ordinary interface text keeps the readable treatment — this paragraph is
        the UI face in the primary text tone, no engraving. Menus, filenames,
        explanations and values you have to read in quantity are set like this;
        only the legends machined into the panel use the component above.
      </p>
    {/if}
  </div>

  <figcaption class="fixture__caption">
    <span class="fixture__family">
      <span class="fixture__chip" aria-hidden="true"></span>
      engraved label
    </span>
    {#if config.stateNote}
      <span class="fixture__state">{config.stateNote}</span>
    {/if}
    <span class="fixture__value" data-label-fixture-count={config.specimens.length}>
      {config.specimens.length} specimen{config.specimens.length === 1 ? "" : "s"} ·
      {surface === "panel" ? "charcoal panel" : surface === "surface" ? "grey-green surface" : "raised face plate"}
      {#if (config.zoom ?? 1) > 1}· shown at {config.zoom}× (review magnification){/if}
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
     key-light falloff from the top-left, a faint brushed grain, a top bevel. */
  .fixture__panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--al-space-md) var(--al-space-lg);
    min-width: 0;
    min-height: 5rem;
    padding: var(--al-space-md) var(--al-space-md);
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

  /* The dark grey-green control surface and the raised face plate: the two
     other materials a legend is cut into (plan §4). */
  .fixture__panel--surface {
    background-color: var(--al-material-surface);
  }

  .fixture__panel--raised {
    background-color: var(--al-material-surface-raised);
  }

  .fixture__panel--column {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--al-space-sm);
  }

  /* function-over-value pairs, as on a switch bank */
  .fixture__panel--pairs {
    display: grid;
    grid-template-columns: repeat(var(--pairs, 3), max-content);
    justify-content: center;
    gap: var(--al-space-2xs) var(--al-space-lg);
  }

  /* zoom scales the padding and min-height too: keep the magnified panel compact */
  .fixture__panel--zoomed {
    justify-content: flex-start;
    min-height: 0;
    padding: var(--al-space-sm) var(--al-space-md);
  }

  .fixture__specimen {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    max-width: 100%;
  }

  .fixture__panel--column .fixture__specimen {
    align-items: flex-start;
  }

  /* Ordinary interface text, for the contrast: the UI face, primary tone,
     normal tracking, readable measure. */
  .fixture__body {
    flex: 1 1 14rem;
    min-width: 0;
    max-width: 30rem;
    margin: 0;
    color: var(--al-text-primary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-normal);
    letter-spacing: var(--al-letter-spacing-normal);
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
    background: var(--al-text-secondary);
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
