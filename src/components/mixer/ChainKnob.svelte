<script lang="ts">
  import Knob from "../hardware/Knob.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import type { FunctionFamily } from "../../lib/tokens";
  import {
    fromPosition,
    knobRange,
    paramChanged,
    setMode,
    setParamValue,
    sweepFraction,
    toPosition,
    type ChainParam,
  } from "../../lib/mixer-chain";

  /**
   * One chain parameter — Task 2.8.
   *
   *   the approved Knob (placed, never modified), in the family colour the
   *   hardware spec gives the module (§5: amber for EQ, red for dynamics),
   *   at the strips' 2.5 rem;
   *   the GHOST: plan §3 / §10 — "the original/previous setting as a subtle
   *   ghost indicator: … knob pointer". When the value differs from the
   *   value the fixture loaded with, a faint dashed pointer is drawn at the
   *   loaded value's angle, in the knob's own 400-unit plane, over the cap,
   *   in the pointer's ink for that cap tone. It is an overlay: the Knob's
   *   artwork and geometry are untouched;
   *   MODE: the parameter's Auto / Manual (plan §8: "every parameter has
   *   Auto or Manual mode"), the approved panel-labelled switch — function
   *   label above, value below (spec §2 Variant B) — its lamp lit while the
   *   parameter is Manual. The switch changes the MODE ONLY: the value stays
   *   exactly where it is. Turning the knob makes the parameter Manual.
   *
   * Logarithmic and listed tapers turn in positions (see `mixer-chain.ts`);
   * the print is always the real stored value.
   */
  let {
    param,
    family,
    context,
  }: {
    param: ChainParam;
    family: FunctionFamily;
    /** For the spoken names and tooltips: the band or module, e.g. "LF". */
    context: string;
  } = $props();

  /* The knob's sweep: −135° … +135° about 12 o'clock (the approved Knob). */
  const START_ANGLE = -135;
  const SWEEP = 270;
  /* The ghost pointer runs over the outer part of the pointer's path: the
     artwork's pointer spans r = 17.6 … 110 after its 0.88 scale. */
  const GHOST_R_IN = 46;
  const GHOST_R_OUT = 110;

  const range = $derived(knobRange(param.spec));
  const position = $derived(toPosition(param.spec, param.value));
  const changed = $derived(paramChanged(param));
  const manual = $derived(param.mode === "manual");
  const decimals = $derived(param.spec.taper === "linear" && param.spec.step < 1 ? 1 : 0);
  const ghostAngle = $derived(START_ANGLE + SWEEP * sweepFraction(param.spec, param.original));
  const printed = $derived(param.spec.format(param.value));
  const title = $derived(
    `${param.spec.name}, ${context}: ${printed}` +
      (changed ? ` \u2014 loaded as ${param.spec.format(param.original)}` : "") +
      (manual ? " \u00b7 Manual: protected from recalculation" : " \u00b7 Auto: open to recalculation"),
  );

  function turn(next: number): void {
    if (next === position) return;
    setParamValue(param, fromPosition(param.spec, next));
  }
</script>

<div
  class="ck"
  class:ck--light={family === "amber" || family === "cream" || family === "orange"}
  data-chain-param={param.spec.id}
  data-chain-mode={param.mode}
  data-chain-changed={changed}
  data-chain-value={param.value}
  data-chain-original={param.original}
  {title}
>
  <div class="ck__dial">
    <Knob
      label={param.spec.label}
      {family}
      min={range.min}
      max={range.max}
      step={range.step}
      bind:value={() => position, turn}
      {decimals}
      extremes={param.spec.extremes}
      format={() => printed}
    />
    {#if changed}
      <svg class="ck__ghost" viewBox="0 0 400 400" aria-hidden="true" data-chain-ghost>
        <line
          x1="200"
          y1={200 - GHOST_R_IN}
          x2="200"
          y2={200 - GHOST_R_OUT}
          transform={`rotate(${ghostAngle.toFixed(2)} 200 200)`}
        />
      </svg>
    {/if}
  </div>
  <div class="ck__mode">
    <TactileSwitch
      variant="panel"
      label="Mode"
      value={manual ? "Manual" : "Auto"}
      bind:engaged={() => manual, (on) => setMode(param, on ? "manual" : "auto")}
      name={`Mode, ${param.spec.name}, ${context}: ${manual ? "Manual" : "Auto"}`}
    />
  </div>
</div>

<style>
  .ck {
    --knob-size: 2.5rem; /* the strips' 40 px dials */
    --ck-ghost-ink: var(--al-pointer-ink-on-dark);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  .ck--light {
    --ck-ghost-ink: var(--al-pointer-ink-on-light);
  }

  .ck__dial {
    position: relative;
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  /* The ghost sits exactly over the dial: the Knob's dial-wrap pads the dial
     by --al-space-3xs, and the dial is --knob-size square, centred. */
  .ck__ghost {
    position: absolute;
    top: var(--al-space-3xs);
    left: 50%;
    width: var(--knob-size);
    height: var(--knob-size);
    transform: translateX(-50%);
    pointer-events: none;
    overflow: visible;
  }

  .ck__ghost line {
    stroke: var(--ck-ghost-ink);
    stroke-width: 15;
    stroke-linecap: round;
    stroke-dasharray: 16 12;
    opacity: 0.7;
  }

  .ck__mode {
    display: flex;
    justify-content: center;
  }
</style>
