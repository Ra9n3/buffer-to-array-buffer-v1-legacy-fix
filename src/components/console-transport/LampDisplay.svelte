<script lang="ts">
  /**
   * ALLOY display window — Task 2.3 (plan §3 "time/status display"; owner's
   * review changes of 2026-11-01, D2.3.10–D2.3.13: a display on the VU
   * meters' lamp-lit cream card).
   *
   * The screen is the approved VU meter's face, value for value: the cream
   * card in shadow with the bulb off, the lit card washed over it at 0.8,
   * the bezel lip's shadow along the top, left and (faintly) right inside
   * edges, the off-centre vignette, and one restrained diagonal sheen of
   * glass over everything — plus a hint of the bulb itself at the lower
   * centre (the lamp token's pool, its hotter core, the faint lift toward the
   * upper right), at a fraction of the meter's strength. The print is set in
   * Orbitron Medium (Matt McInerney, SIL Open Font License; owner's choice,
   * D2.3.13), kept inside the project (src/assets/fonts/orbitron) and used
   * for the numbers and the words alike — in the VU face's own ink (black on
   * cream), a warning in the VU face's red, never with a glow and with
   * nothing drawn behind it: the live print alone on the card. The engraved
   * legend floats above the frame and moves with it. No scan lines, no other
   * decoration.
   *
   * Two kinds, one recipe (D2.3.3):
   *   clock   the big tabular H:MM:SS with the bar · beat beneath it.
   *   status  the state word, an optional progress slot, and the details.
   * Everything printed is a fixture string passed in; the window formats
   * nothing and knows nothing about playback or rendering. The window takes
   * its height from the deck (`--window-height`): the deck writes that number
   * down once.
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";

  let {
    kind,
    legend,
    primary,
    secondary = [],
    progress = null,
    warning = false,
    name,
    id = null,
  }: {
    kind: "clock" | "status";
    /** The engraved legend on the panel above the glass. */
    legend: string;
    /** The big print: the clock, or the state word. */
    primary: string;
    /** The small print beneath it, separated by dots. */
    secondary?: string[];
    /** status: 0–1 fills the progress slot; null hides it. */
    progress?: number | null;
    /** The last detail is a warning: printed in the red family (D1.6). */
    warning?: boolean;
    /** Accessible name of the whole window. */
    name: string;
    id?: string | null;
  } = $props();

  const fill = $derived(progress === null ? 0 : Math.min(1, Math.max(0, progress)));

  /* The separator between details: the owner's middle dot. Orbitron has no
     glyph for it, so the next family in the stack draws it. */
  const SEPARATOR = "\u00B7";
</script>

<div class={`display display--${kind}`} role="group" aria-label={name} {id} data-lamp-display={kind}>
  <div class="display__legend">
    <EngravedLabel text={legend} size="xs" tone="muted" />
  </div>
  <div class="display__frame" data-part="frame">
    <div class="display__glass" data-part="glass">
      <span class="display__primary" data-part="primary">{primary}</span>
      {#if progress !== null}
        <span class="display__slot" data-part="progress" aria-hidden="true">
          <span class="display__fill" style:width={`${fill * 100}%`}></span>
        </span>
      {/if}
      {#if secondary.length > 0}
        <span class="display__secondary" data-part="secondary">
          {#each secondary as part, i (i)}
            {#if i > 0}<span class="display__dot" aria-hidden="true">{SEPARATOR}</span>{/if}
            <span class="display__part" class:is-warning={warning && i === secondary.length - 1}>{part}</span>
          {/each}
        </span>
      {/if}
      <span class="display__reflection" aria-hidden="true"></span>
    </div>
  </div>
</div>

<style>
  /* The display face, from the project's own copy (SIL OFL, see
     src/assets/fonts/orbitron/README.md). Inlined into the single-file build. */
  @font-face {
    font-family: "Orbitron";
    src: url("../../assets/fonts/orbitron/Orbitron-Medium.subset.woff2") format("woff2");
    font-weight: 500;
    font-style: normal;
    font-display: block;
  }

  .display {
    /* --- the VU meter's card and bulb, value for value (VUMeter.svelte) ---- */
    --dp-card-unlit: color-mix(in srgb, var(--al-material-cream) 46%, black);
    --dp-card-lit: color-mix(in srgb, var(--al-material-cream) 80%, var(--al-material-lamp));
    --dp-lamp: var(--al-material-lamp);
    --dp-lamp-core: color-mix(in srgb, var(--al-function-amber-hi) 55%, white);
    /* --- the print: the VU face's ink and its red; never a glow ------------ */
    --dp-ink: var(--al-text-on-cream);
    --dp-warn: color-mix(in srgb, var(--al-function-red-base) 85%, var(--al-function-red-lo));
    /* the progress slot's lamp */
    --dp-core: color-mix(in srgb, var(--al-function-amber-hi) 70%, white);
    --dp-frame: var(--al-material-metal-shadow);

    position: relative;
    display: flex;
    flex: 1 1 auto; /* fills its seat's width */
    flex-direction: column;
    min-width: 0;
  }

  /* the legend floats on the panel above the frame and moves with it */
  .display__legend {
    position: absolute;
    bottom: 100%;
    left: 0;
    display: flex;
    align-items: center;
    min-height: 0.875rem;
    margin-bottom: var(--al-space-2xs);
    padding: 0 var(--al-space-3xs);
  }

  /* --- the frame and the screen ---------------------------------------------- */
  .display__frame {
    box-sizing: border-box;
    height: var(--window-height, auto);
    min-width: 0;
    padding: 1px;
    border-radius: 3.5px;
    background-color: var(--dp-frame);
  }

  .display__glass {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--al-space-3xs);
    height: 100%;
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-md);
    border-radius: 2.5px;
    overflow: hidden;
    /* the card with the bulb off, and over it, top layer first: */
    background-color: var(--dp-card-unlit);
    background-image:
      /* the bezel lip's shadow: 10 px down from the top, 7 px in from the
         left, 4 px in from the right — the meter's stops, lit from the
         top-left, nothing bright at the bottom-right */
      linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0, rgba(0, 0, 0, 0) 10px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0, rgba(0, 0, 0, 0) 7px),
      linear-gradient(270deg, rgba(0, 0, 0, 0.14) 0, rgba(0, 0, 0, 0) 4px),
      /* the vignette, centred low, its focus a little left */
      radial-gradient(78% 78% at 50% 70%, rgba(0, 0, 0, 0) 46%, rgba(0, 0, 0, 0.14) 76%, rgba(0, 0, 0, 0.4) 100%),
      /* a hint of the bulb at the lower centre: its hot core a little left of
         its axis, its pool, the faint lift toward the upper right — the
         meter's three lights at roughly a quarter of their strength */
      radial-gradient(22% 45% at 48% 100%, color-mix(in srgb, var(--dp-lamp-core) 22%, transparent) 0%, rgba(0, 0, 0, 0) 100%),
      radial-gradient(50% 85% at 48% 92%, color-mix(in srgb, var(--dp-lamp) 28%, transparent) 0%, rgba(0, 0, 0, 0) 100%),
      radial-gradient(26% 40% at 73% 42%, color-mix(in srgb, var(--dp-lamp) 10%, transparent) 0%, rgba(0, 0, 0, 0) 100%),
      /* the lit card: the wash at 0.8 over the card in shadow */
      linear-gradient(color-mix(in srgb, var(--dp-card-lit) 80%, transparent), color-mix(in srgb, var(--dp-card-lit) 80%, transparent));
    user-select: none;
    -webkit-user-select: none;
  }

  /* the glass over the card: the meter's one restrained diagonal sheen */
  .display__reflection {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom right, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 28%, rgba(255, 255, 255, 0) 46%);
    pointer-events: none;
  }

  /* --- the print: the live segments alone, no glow on text or numbers, ever -- */
  .display__primary {
    position: relative;
    display: block;
    min-width: 0;
    color: var(--dp-ink);
    font-family: "Orbitron", var(--al-font-mono);
    font-weight: var(--al-font-weight-medium);
    letter-spacing: var(--al-letter-spacing-normal);
    line-height: 1;
    white-space: nowrap;
    text-shadow: none;
  }

  .display--clock .display__primary {
    font-size: 1.75rem;
    font-variant-numeric: tabular-nums;
  }

  .display--status .display__primary {
    font-size: 1.125rem;
    text-transform: uppercase;
  }

  .display__secondary {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--al-space-xs);
    align-items: baseline;
    min-width: 0;
    color: var(--dp-ink);
    font-family: "Orbitron", var(--al-font-label);
    font-size: var(--al-text-size-xs);
    font-weight: var(--al-font-weight-medium);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--al-letter-spacing-normal);
    line-height: var(--al-line-height-tight);
    text-transform: uppercase;
    text-shadow: none;
  }

  .display--clock .display__secondary {
    font-size: var(--al-text-size-sm);
  }

  .display__part {
    white-space: nowrap;
  }

  .display__dot {
    opacity: 0.55;
  }

  .display__part.is-warning {
    color: var(--dp-warn);
  }

  /* --- the progress slot: a groove in the glass with the lamp along it ------- */
  .display__slot {
    position: relative;
    display: block;
    width: 100%;
    height: 4px;
    margin: var(--al-space-3xs) 0;
    border-radius: 2px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.6);
    box-shadow:
      inset 0 1px 1px rgba(0, 0, 0, 0.8),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .display__fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--dp-lamp) 70%, var(--al-function-amber-lo)), var(--dp-core));
    box-shadow:
      0 0 4px var(--dp-lamp),
      0 0 10px color-mix(in srgb, var(--dp-lamp) 45%, transparent);
  }
</style>
