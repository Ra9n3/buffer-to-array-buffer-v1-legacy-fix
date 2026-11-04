<script lang="ts">
  /**
   * ALLOY MIX button — Task 2.3 (plan §3 "large illuminated MIX button";
   * §10 "the main call to action and must be visually dominant"; hardware
   * spec §2 for the well and the press, §6 layered light-and-shadow, never a
   * flat fill). Owner's review change of 2026-11-01 (D2.3.12): the cap is
   * coloured just like the transport keys, with a little lamp beside it.
   *
   * One large push-button wearing the transport keys' cap — the approved
   * tactile switch's cream cap (variant A), value for value: the same convex 135° ramp lit
   * from the top-left, the same edge lights and shades, the same gloss bloom
   * in the upper-left, the same cream wall and foot under it — standing 3 px
   * proud of a dark recessed well, with the legend MIX printed in the keys'
   * ink. It is still unmistakably not a transport key: the keys are small
   * square caps; this is one wide cap the size of three of them. Beside it,
   * where a key's lamp is, sits the approved pilot Lamp (Task 1.6): lit while
   * the mix runs, off otherwise.
   *
   * States (fixture, D2.3.4):
   *   ready       the lamp is off — the session can be mixed.
   *   processing  the lamp is lit while the render runs (it breathes as the
   *               Lamp does, not under reduced motion); the button ignores
   *               presses.
   *   complete    the lamp is off — a rerun is available.
   *
   * Pressing it does nothing in Task 2.3: no render, no automatic mix, no
   * project state (plan §14: Phases 5–8). The cap sinks under the finger
   * because a key does; that is the whole of its behaviour.
   */
  import Lamp from "../hardware/Lamp.svelte";
  import type { MixState } from "./transport-fixtures";

  let {
    state = "ready",
    name = "MIX — start the full mix",
    describedBy = null,
  }: {
    state?: MixState;
    name?: string;
    /** id(s) of the text that explains the state — the status display. */
    describedBy?: string | null;
  } = $props();

  const busy = $derived(state === "processing");
</script>

<div
  class="mix"
  class:is-busy={busy}
  data-mix-button
  data-mix-state={state}
  data-mix-lamp={busy}
>
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
  <!-- The mixing lamp: the approved pilot lamp beside the cap, as beside a
       key. Presentation: the button's description carries the state. -->
  <span class="mix__lamp" data-part="lamp">
    <Lamp lit={busy} color="amber" />
  </span>
</div>

<style>
  .mix {
    /* --- geometry: the cap's size is the host's to set ------------------- */
    --mx-width: var(--mix-width, 8rem);
    --mx-height: var(--mix-height, 4.5rem);
    --mx-radius: 6px;
    --mx-lift: 3px;
    --mx-well: var(--al-space-sm);
    /* --- the cap: the transport keys' cream, the switch's recipe ---------- */
    --mx-cap-hi: var(--al-function-cream-hi);
    --mx-cap-base: var(--al-function-cream-base);
    --mx-cap-lo: var(--al-function-cream-lo);
    --mx-cap-dim: color-mix(in srgb, var(--mx-cap-base) 46%, var(--mx-cap-lo));
    --mx-wall: color-mix(in srgb, var(--mx-cap-lo) 70%, black);
    --mx-wall-foot: color-mix(in srgb, var(--mx-cap-lo) 42%, black);
    --mx-ink: var(--al-text-on-cream);

    position: relative;
    display: inline-grid;
    grid-template-columns: auto auto;
    grid-template-areas: "button lamp";
    align-items: center;
    column-gap: var(--al-space-xs);
    padding-top: var(--mx-lift);
  }

  /* --- the button: the well is its face ------------------------------------ */
  .mix__button {
    grid-area: button;
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

  /* --- the cap: the keys' cap (the switch's variant A), value for value ---- */
  .mix__cap {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--mx-width);
    height: var(--mx-height);
    border-radius: var(--mx-radius);
    overflow: hidden;
    /* the convex top: lit from the top-left, turning away at the bottom-right */
    background: linear-gradient(135deg, var(--mx-cap-hi) 0%, var(--mx-cap-hi) 10%, var(--mx-cap-base) 48%, var(--mx-cap-dim) 100%);
    /* edge light, edge shade, inner turn, side wall, foot, drop shadow */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 1px 0 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.28),
      inset -1px 0 0 rgba(0, 0, 0, 0.14),
      inset -2px -3px 4px rgba(0, 0, 0, 0.16),
      0 var(--mx-lift) 0 0 var(--mx-wall),
      0 calc(var(--mx-lift) + 1px) 0 0 var(--mx-wall-foot),
      0 calc(var(--mx-lift) + 2px) 3px rgba(0, 0, 0, 0.55);
    transform: translateY(calc(-1 * var(--mx-lift)));
    transition:
      transform 70ms ease-out,
      box-shadow 70ms ease-out;
  }

  /* the gloss: the keys' broad specular bloom in the upper-left over a faint
     second sheen, on its own layer so it dims when pressed */
  .mix__cap::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        62% 46% at 30% 20%,
        rgba(255, 255, 255, 0.78) 0%,
        rgba(255, 255, 255, 0.22) 46%,
        rgba(255, 255, 255, 0) 72%
      ),
      radial-gradient(
        50% 30% at 70% 88%,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(255, 255, 255, 0) 70%
      );
    opacity: 1;
    transition: opacity 70ms ease-out;
    pointer-events: none;
  }

  /* the press: the cap sinks to a 1 px wall, the bloom dims, the inner shade
     deepens — the keys' press */
  .mix__button:active:not([aria-disabled="true"]) .mix__cap {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 1px 0 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      inset -1px 0 0 rgba(0, 0, 0, 0.16),
      inset 0 2px 3px rgba(0, 0, 0, 0.22),
      0 1px 0 0 var(--mx-wall),
      0 2px 0 0 var(--mx-wall-foot),
      0 2px 2px rgba(0, 0, 0, 0.45);
  }

  .mix__button:active:not([aria-disabled="true"]) .mix__cap::before {
    opacity: 0.35;
  }

  /* --- the legend: the keys' ink on the cream, flat print ------------------ */
  .mix__legend {
    position: relative;
    color: var(--mx-ink);
    font-family: var(--al-font-label);
    font-size: calc(var(--mx-height) * 0.42);
    font-weight: var(--al-font-weight-black);
    letter-spacing: 0.18em;
    line-height: 1;
    text-indent: 0.18em; /* centre the tracked word optically */
    text-transform: uppercase;
    /* the ink sits a hair below the gloss: a faint lit edge under it */
    text-shadow: 0 0.5px 0 rgba(255, 255, 255, 0.28);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the lamp: level with the resting cap's face, as beside a key -------- */
  .mix__lamp {
    grid-area: lamp;
    position: relative;
    top: calc(-1 * var(--mx-lift));
    display: block;
    line-height: 0;
  }
</style>
