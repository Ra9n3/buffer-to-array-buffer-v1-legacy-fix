<script lang="ts">
  /**
   * ALLOY MIX button — Task 2.3 (plan §3 "large illuminated MIX button";
   * §10 "the main call to action and must be visually dominant"; hardware
   * spec §2 for the well and the press, §4a for the lamp light, §6 layered
   * light-and-shadow, never a flat fill).
   *
   * One large illuminated push-button: a translucent amber cap lit from
   * behind by a lamp — brightest low and centre where the bulb sits, fading
   * towards the rim, a gloss along the top edge — standing 3 px proud of a
   * dark recessed well, its light spilling softly onto the panel round it.
   * The legend MIX is printed dark on the lit cap, as the legends of
   * illuminated keys are. It is unmistakably not a transport key: the keys
   * are small cream caps with a lamp beside them; this is one big lit cap.
   *
   * States (fixture, D2.3.4):
   *   ready       lit steady — the session can be mixed.
   *   processing  lit, the lamp slowly pulsing while the render runs
   *               (still under reduced motion); the button ignores presses.
   *   complete    lit steady — a rerun is available.
   * `lit={false}` shows the dead cap for the playground only.
   *
   * Pressing it does nothing in Task 2.3: no render, no automatic mix, no
   * project state (plan §14: Phases 5–8). The cap sinks under the finger
   * because a key does; that is the whole of its behaviour.
   */
  import type { MixState } from "./transport-fixtures";

  let {
    state = "ready",
    lit = true,
    name = "MIX — start the full mix",
    describedBy = null,
  }: {
    state?: MixState;
    /** Playground only: the unlit cap. The Console never shows it. */
    lit?: boolean;
    name?: string;
    /** id(s) of the text that explains the state — the status display. */
    describedBy?: string | null;
  } = $props();

  const busy = $derived(state === "processing");
</script>

<div
  class="mix"
  class:is-lit={lit}
  class:is-busy={busy}
  data-mix-button
  data-mix-state={state}
  data-mix-lit={lit}
>
  <span class="mix__spill" aria-hidden="true"></span>
  <button
    type="button"
    class="mix__button"
    aria-label={name}
    aria-describedby={describedBy ?? undefined}
    aria-disabled={busy ? "true" : undefined}
    data-mix-key
  >
    <span class="mix__well" data-part="well">
      <span class="mix__cap" data-part="cap">
        <span class="mix__legend" data-part="legend">MIX</span>
      </span>
    </span>
  </button>
</div>

<style>
  .mix {
    /* --- geometry: the cap's size is the host's to set ------------------- */
    --mx-width: var(--mix-width, 8rem);
    --mx-height: var(--mix-height, 4.5rem);
    --mx-radius: 6px;
    --mx-lift: 3px;
    --mx-well: var(--al-space-sm);
    /* --- the lamp and the glass, from the tokens ------------------------- */
    --mx-core: color-mix(in srgb, var(--al-function-amber-hi) 72%, white);
    --mx-body: var(--al-material-lamp);
    --mx-rim: var(--al-function-amber-base);
    --mx-edge: var(--al-function-amber-lo);
    --mx-ink: var(--al-function-amber-ink);
    --mx-spill: var(--al-material-lamp);
    /* dead glass: the body sunk into the recess tone */
    --mx-off-hi: color-mix(in srgb, var(--mx-body) 34%, var(--al-material-recess));
    --mx-off-lo: color-mix(in srgb, var(--mx-body) 14%, var(--al-material-recess));

    position: relative;
    display: inline-grid;
    place-items: center;
    padding-top: var(--mx-lift);
  }

  /* --- the light on the panel ---------------------------------------------- */
  .mix__spill {
    position: absolute;
    inset: var(--mx-lift) 0 0 0;
    border-radius: calc(var(--mx-radius) + var(--mx-well));
    opacity: 0;
    pointer-events: none;
    box-shadow:
      0 0 18px 5px color-mix(in srgb, var(--mx-spill) 30%, transparent),
      0 0 44px 14px color-mix(in srgb, var(--mx-spill) 13%, transparent);
    transition: opacity 120ms ease-out;
  }

  .mix.is-lit .mix__spill {
    opacity: 1;
  }

  /* --- the button: the well is its face ------------------------------------ */
  .mix__button {
    position: relative;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: calc(var(--mx-radius) + var(--mx-well));
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .mix__button:focus-visible {
    outline: 2px solid var(--al-function-amber-hi);
    outline-offset: 3px;
  }

  .mix__button[aria-disabled="true"] {
    cursor: default;
  }

  .mix__well {
    display: block;
    padding: var(--mx-well);
    border-radius: calc(var(--mx-radius) + var(--mx-well));
    background-color: var(--al-material-recess);
    background-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0) 40%);
    /* the well's lip: dark above, a lit lower edge; the floor shadowed */
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.8),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }

  /* --- the cap ------------------------------------------------------------- */
  .mix__cap {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--mx-width);
    height: var(--mx-height);
    border-radius: var(--mx-radius);
    overflow: hidden;
    background-color: var(--mx-off-hi);
    background-image:
      /* the gloss along the top edge of the glass */
      linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.08) 22%, rgba(255, 255, 255, 0) 45%),
      /* the rim falling off into the dead tone */
      radial-gradient(120% 110% at 50% 60%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.38) 100%),
      linear-gradient(180deg, var(--mx-off-hi), var(--mx-off-lo));
    /* the wall: the cap stands proud of the well floor */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.25),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      0 var(--mx-lift) 0 0 color-mix(in srgb, var(--mx-edge) 60%, black),
      0 calc(var(--mx-lift) + 1px) 0 0 rgba(0, 0, 0, 0.6),
      0 calc(var(--mx-lift) + 2px) 4px rgba(0, 0, 0, 0.6);
    transform: translateY(calc(-1 * var(--mx-lift)));
    transition:
      transform 70ms ease-out,
      box-shadow 70ms ease-out,
      filter 120ms ease-out;
  }

  /* lit: the lamp behind the glass — brightest low and centre, uneven */
  .mix.is-lit .mix__cap {
    background-color: var(--mx-body);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.1) 22%, rgba(255, 255, 255, 0) 45%),
      radial-gradient(70% 85% at 50% 72%, var(--mx-core) 0%, color-mix(in srgb, var(--mx-core) 40%, var(--mx-body)) 34%, rgba(0, 0, 0, 0) 72%),
      radial-gradient(130% 120% at 50% 55%, rgba(0, 0, 0, 0) 58%, color-mix(in srgb, var(--mx-edge) 55%, transparent) 100%),
      linear-gradient(180deg, var(--mx-rim), var(--mx-body) 45%, var(--mx-rim));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      inset 0 -1px 0 rgba(0, 0, 0, 0.25),
      0 var(--mx-lift) 0 0 var(--mx-edge),
      0 calc(var(--mx-lift) + 1px) 0 0 rgba(0, 0, 0, 0.6),
      0 calc(var(--mx-lift) + 2px) 4px rgba(0, 0, 0, 0.6);
  }

  /* the press: the cap sinks to a 1 px wall and the spill dims a little */
  .mix__button:active:not([aria-disabled="true"]) .mix__cap {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      inset 0 2px 4px rgba(0, 0, 0, 0.25),
      0 1px 0 0 var(--mx-edge),
      0 2px 0 0 rgba(0, 0, 0, 0.6),
      0 2px 2px rgba(0, 0, 0, 0.5);
  }

  .mix:has(.mix__button:active:not([aria-disabled="true"])) .mix__spill {
    opacity: 0.82;
  }

  /* --- the legend: printed dark on the glass ------------------------------- */
  .mix__legend {
    position: relative;
    color: color-mix(in srgb, var(--mx-ink) 55%, var(--al-text-muted));
    font-family: var(--al-font-label);
    font-size: calc(var(--mx-height) * 0.42);
    font-weight: var(--al-font-weight-black);
    letter-spacing: 0.18em;
    line-height: 1;
    text-indent: 0.18em; /* centre the tracked word optically */
    text-transform: uppercase;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.12);
    user-select: none;
    -webkit-user-select: none;
  }

  .mix.is-lit .mix__legend {
    color: var(--mx-ink);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  /* --- processing: a slow pulse of the lamp, not a spinner ------------------ */
  @media (prefers-reduced-motion: no-preference) {
    .mix.is-lit.is-busy .mix__cap {
      animation: mix-pulse 1.8s ease-in-out infinite alternate;
    }

    .mix.is-lit.is-busy .mix__spill {
      animation: mix-spill-pulse 1.8s ease-in-out infinite alternate;
    }
  }

  @keyframes mix-pulse {
    from {
      filter: brightness(0.86);
    }
    to {
      filter: brightness(1.08);
    }
  }

  @keyframes mix-spill-pulse {
    from {
      opacity: 0.55;
    }
    to {
      opacity: 1;
    }
  }
</style>
