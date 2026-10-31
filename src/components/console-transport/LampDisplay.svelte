<script lang="ts">
  /**
   * ALLOY lamp-lit display window — Task 2.3 (plan §3 "time/status display";
   * §4 "recessed windows … soft incandescent amber/gold lamp glow", "no LED
   * aesthetic … avoid cold blue/green VFD styling"; hardware spec §4a for the
   * light, §6 for the layering).
   *
   * A dark glass window recessed into the deck behind a thin metal frame —
   * the goniometer's scope recipe (Task 2.1) — with its print lit from behind
   * by a warm lamp: the numerals and words are the amber-hi token with a
   * soft, wide bloom, never a crisp edge, and the glass itself carries a
   * faint warm wash that is brightest low and centre where the bulb would
   * sit, breathing by a few percent like the approved lamps (still under
   * reduced motion). The engraved legend sits on the panel above the frame.
   *
   * Two kinds, one recipe (D2.3.3):
   *   clock   the big tabular H:MM:SS with the bar · beat beneath it.
   *   status  the state word, an optional progress slot, and the details.
   * Everything printed is a fixture string passed in; the window formats
   * nothing and knows nothing about playback or rendering.
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
</script>

<div class={`display display--${kind}`} role="group" aria-label={name} {id} data-lamp-display={kind}>
  <div class="display__legend">
    <EngravedLabel text={legend} size="xs" tone="muted" />
  </div>
  <div class="display__frame" data-part="frame">
    <div class="display__glass" data-part="glass">
      <span class="display__light" aria-hidden="true"></span>
      <span class="display__primary" data-part="primary">{primary}</span>
      {#if progress !== null}
        <span class="display__slot" data-part="progress" aria-hidden="true">
          <span class="display__fill" style:width={`${fill * 100}%`}></span>
        </span>
      {/if}
      {#if secondary.length > 0}
        <span class="display__secondary" data-part="secondary">
          {#each secondary as part, i (i)}
            {#if i > 0}<span class="display__dot" aria-hidden="true">·</span>{/if}
            <span class="display__part" class:is-warning={warning && i === secondary.length - 1}>{part}</span>
          {/each}
        </span>
      {/if}
    </div>
  </div>
</div>

<style>
  .display {
    /* --- the lamp behind the glass, from the tokens ---------------------- */
    --dp-ink: var(--al-function-amber-hi);
    --dp-core: color-mix(in srgb, var(--al-function-amber-hi) 70%, white);
    --dp-lamp: var(--al-material-lamp);
    --dp-dim: color-mix(in srgb, var(--al-material-lamp) 78%, var(--al-text-muted));
    --dp-warn: var(--al-function-red-hi);
    --dp-warn-lamp: var(--al-function-red-base);
    /* the floor of the recess: the goniometer's */
    --dp-floor-centre: color-mix(in srgb, var(--al-material-recess) 84%, var(--al-material-surface));
    --dp-floor-edge: color-mix(in srgb, var(--al-material-recess) 92%, black);
    --dp-frame: var(--al-material-metal-shadow);
    /* the bloom: a near, a mid and a far halo, all the lamp's colour */
    --dp-bloom:
      0 0 1px var(--dp-core),
      0 0 5px var(--dp-lamp),
      0 0 12px color-mix(in srgb, var(--dp-lamp) 55%, transparent),
      0 0 24px color-mix(in srgb, var(--dp-lamp) 28%, transparent);
    --dp-bloom-small:
      0 0 1px color-mix(in srgb, var(--dp-core) 60%, transparent),
      0 0 4px color-mix(in srgb, var(--dp-lamp) 70%, transparent),
      0 0 10px color-mix(in srgb, var(--dp-lamp) 30%, transparent);

    display: flex;
    flex: 1 1 auto; /* fills a flex column, so two windows side by side are level */
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  .display__legend {
    display: flex;
    align-items: center;
    min-height: 0.875rem;
    padding: 0 var(--al-space-3xs);
  }

  /* --- the frame and the glass: the scope recipe ---------------------------- */
  .display__frame {
    flex: 1 1 auto;
    min-width: 0;
    padding: 1px;
    border-radius: 3.5px;
    background: linear-gradient(180deg, var(--al-material-metal) 0%, var(--dp-frame) 50%, var(--al-bevel-shadow) 100%);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.4);
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
    background-image:
      /* the room light across the glass, top-left */
      linear-gradient(100deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 30%, rgba(255, 255, 255, 0) 48%),
      radial-gradient(120% 100% at 50% 50%, var(--dp-floor-centre) 0%, var(--dp-floor-edge) 100%);
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.8),
      inset 0 0 0 1px var(--al-border-strong);
    user-select: none;
    -webkit-user-select: none;
  }

  /* the lamp's wash on the glass: brightest low and centre, uneven, dim */
  .display__light {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(75% 95% at 50% 105%, color-mix(in srgb, var(--dp-lamp) 16%, transparent) 0%, color-mix(in srgb, var(--dp-lamp) 6%, transparent) 45%, rgba(0, 0, 0, 0) 75%),
      radial-gradient(40% 60% at 38% 100%, color-mix(in srgb, var(--dp-lamp) 7%, transparent) 0%, rgba(0, 0, 0, 0) 100%);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    .display__light {
      animation: display-breathe 4s ease-in-out infinite alternate;
    }
  }

  @keyframes display-breathe {
    from {
      opacity: 0.94;
    }
    to {
      opacity: 1;
    }
  }

  /* --- the lit print --------------------------------------------------------- */
  .display__primary {
    position: relative;
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--dp-ink);
    line-height: 1;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-shadow: var(--dp-bloom);
  }

  .display--clock .display__primary {
    font-family: var(--al-font-mono);
    font-size: 1.75rem;
    font-weight: var(--al-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  .display--status .display__primary {
    font-family: var(--al-font-label);
    font-size: 1.125rem;
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-label);
    text-transform: uppercase;
  }

  .display__secondary {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--al-space-xs);
    align-items: baseline;
    min-width: 0;
    color: var(--dp-dim);
    font-family: var(--al-font-label);
    font-size: var(--al-text-size-xs);
    font-weight: var(--al-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--al-letter-spacing-engraved);
    line-height: var(--al-line-height-tight);
    text-transform: uppercase;
    text-shadow: var(--dp-bloom-small);
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
    text-shadow:
      0 0 1px var(--dp-warn),
      0 0 5px color-mix(in srgb, var(--dp-warn-lamp) 75%, transparent),
      0 0 12px color-mix(in srgb, var(--dp-warn-lamp) 35%, transparent);
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
