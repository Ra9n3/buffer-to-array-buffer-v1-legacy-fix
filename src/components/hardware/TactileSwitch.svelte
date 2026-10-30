<script module lang="ts">
  /** Unique per-instance id prefix, so the panel print can label its button. */
  let nextId = 0;

  /** The two labelling conventions of hardware spec §2. */
  export type SwitchVariant = "cap" | "panel";

  /** Engaged-lamp colours. Spec §5: red or amber, whatever the switch does. */
  export type LampColour = "amber" | "red";
</script>
<script lang="ts">
  import { functionToken } from "../../lib/tokens";

  /**
   * ALLOY tactile square switch — Task 1.4.
   *
   * One component, two variants of hardware spec §2, built from layered CSS
   * gradients and shadows on a real `<button>` (spec §6 allows SVG or layered
   * CSS; a push-button wants to BE a button, so its label is real text and
   * Space, Enter, focus and the toggle semantics come from the platform):
   *
   *   VARIANT A  "cap"    the label is printed on the cap. The cap is glossy
   *                       and raised: a convex diagonal gradient lit from the
   *                       top-left, a broad specular bloom over it, a bright
   *                       top edge, a shaded bottom-right edge, and a visible
   *                       side wall standing the cap 3 px off its seat.
   *   VARIANT B  "panel"  the labels are printed on the panel — the function
   *                       above, the value below — and the cap sits inside a
   *                       recessed square well with a dark inset border. The
   *                       cap is the same shape and material, matte: a
   *                       restrained gradient, a faint top highlight, no bloom,
   *                       a 2 px wall.
   *
   * States, which are independent of each other:
   *
   *   pressed   the finger is on it. The cap sinks 2 px, its wall shrinks to
   *             1 px, the bloom dims, the seat's shadow closes over its top
   *             edge, and the drop shadow tightens. Transient: pointer or key
   *             down, released on up. Also `demoState="pressed"` for the
   *             playground.
   *   engaged   the function is on. The adjacent lamp lights (amber or red);
   *             the cap does not change colour (spec §2). This is the button's
   *             `aria-pressed` and is toggled by activation — click, Space,
   *             Enter. A switch can be engaged and at rest, or engaged and
   *             pressed; neither state implies the other.
   *
   * The lamp is drawn here as part of the switch (two radial gradients on a
   * lens in a dark bezel, a near glow and a soft off-centre spill on the
   * panel) because the architecture has no lamp component yet; Task 1.6 can
   * lift `switch__lamp` out as-is. It is never a flat coloured disc.
   *
   * Colour: the cap is the cream family (the owner's choice for this task)
   * through the Task 1.1 tokens; the well, seat and bezel are the material
   * tokens; the print is the text tokens; the lamp is the lamp/amber or red
   * tokens. Nothing here carries a colour of its own; neutral black/white
   * alphas model light.
   */

  /** Playground-only visual demonstration. Never set in product code. */
  type DemoState = "pressed" | "focused" | null;

  let {
    variant,
    label,
    value = null,
    lamp = "amber",
    engaged = $bindable(false),
    name = null,
    demoState = null,
    onToggle = null,
  }: {
    /** "cap": label on the cap. "panel": labels on the panel, cap in a well. */
    variant: SwitchVariant;
    /** Cap variant: printed on the cap. Panel variant: the function, printed above. */
    label: string;
    /** Panel variant only: the value, printed below (e.g. "26dB"). */
    value?: string | null;
    lamp?: LampColour;
    /** The function is on: the lamp is lit. Toggled by activation. */
    engaged?: boolean;
    /** Accessible name override. Defaults to the printed label(s). */
    name?: string | null;
    /** Playground demonstration of a state that needs a finger or focus. */
    demoState?: DemoState;
    onToggle?: ((engaged: boolean) => void) | null;
  } = $props();

  const uid = `sw${++nextId}`;

  /** Transient: the cap is being held down. Independent of `engaged`. */
  let pressed = $state(false);

  const isPressed = $derived(pressed || demoState === "pressed");
  const showValue = $derived(variant === "panel" && value !== null && value !== "");

  function toggle() {
    engaged = !engaged;
    onToggle?.(engaged);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    pressed = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function release() {
    pressed = false;
  }

  /* Space activates on key-up and Enter on key-down — the platform's own
     button rules, left alone. What is added is the look of the key being
     held between the two. */
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Enter") pressed = true;
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Enter") pressed = false;
  }
</script>

<div
  class={`switch switch--${variant} switch--lamp-${lamp}`}
  class:is-pressed={isPressed}
  class:is-engaged={engaged}
  class:is-demo-focus={demoState === "focused"}
  style:--cap-hi={functionToken("cream", "hi")}
  style:--cap-base={functionToken("cream", "base")}
  style:--cap-lo={functionToken("cream", "lo")}
  data-switch
  data-switch-variant={variant}
  data-switch-pressed={isPressed}
  data-switch-engaged={engaged}
>
  {#if variant === "panel"}
    <span class="switch__print switch__print--function" id={`${uid}-function`} data-part="print-function">
      {label}
    </span>
  {/if}

  <button
    type="button"
    class="switch__button"
    aria-pressed={engaged}
    aria-label={name ?? undefined}
    aria-labelledby={name === null && variant === "panel"
      ? `${uid}-function${showValue ? ` ${uid}-value` : ""}`
      : undefined}
    data-switch-button
    data-part={variant === "panel" ? "well" : "seat"}
    onpointerdown={onPointerDown}
    onpointerup={release}
    onpointercancel={release}
    onlostpointercapture={release}
    onkeydown={onKeyDown}
    onkeyup={onKeyUp}
    onblur={release}
    onclick={toggle}
  >
    <span class="switch__cap" data-part="cap">
      {#if variant === "cap"}
        <span class="switch__cap-label" data-part="cap-label">{label}</span>
      {/if}
    </span>
  </button>

  <!-- The engaged lamp: a lens in a bezel beside the cap. State is carried by
       the button's aria-pressed; the lamp is presentation. -->
  <span class="switch__lamp" data-part="lamp" aria-hidden="true">
    <span class="switch__lens" data-part="lamp-lens"></span>
  </span>

  {#if showValue}
    <span class="switch__print switch__print--value" id={`${uid}-value`} data-part="print-value">
      {value}
    </span>
  {/if}
</div>

<style>
  .switch {
    /* The whole switch scales from one length, `--switch-size`, the cap's
       edge: 1.75rem = 28px = 1x. Read, not declared, so a strip or the
       playground can size it from outside. */
    --sw-size: var(--switch-size, 1.75rem);
    /* Spec §2: corner radius 15–20% of the width. 17.5%. */
    --sw-radius: calc(var(--sw-size) * 0.175);
    /* Panel variant: the well's clearance round the cap. */
    --sw-gap: calc(var(--sw-size) * 0.125);
    /* Cap variant: the seat's clearance — a dark gap, not a well. */
    --sw-seat: calc(var(--sw-size) * 0.055);
    /* How far the cap stands off its base, at rest. */
    --sw-lift: 3px;
    --sw-lamp: calc(var(--sw-size) * 0.36);
    --sw-lamp-gap: var(--al-space-xs);
    /* The print is physical — ink on the cap, engraving on the panel — so it
       scales with the switch: 10 / 11 / 10 px at 1x, the 2xs / xs type steps. */
    --sw-type-cap: calc(var(--sw-size) * 0.357);
    --sw-type-function: calc(var(--sw-size) * 0.393);
    --sw-type-value: calc(var(--sw-size) * 0.357);

    /* --- the cap's light model, from the cream tokens -------------------- */
    --f-cap-dim: color-mix(in srgb, var(--cap-base) 46%, var(--cap-lo));
    --f-cap-matte-hi: color-mix(in srgb, var(--cap-base) 72%, var(--cap-hi));
    --f-cap-matte-lo: color-mix(in srgb, var(--cap-base) 84%, var(--cap-lo));
    --f-wall: color-mix(in srgb, var(--cap-lo) 70%, black);
    --f-wall-foot: color-mix(in srgb, var(--cap-lo) 42%, black);

    /* --- the lamp, from the lamp / function tokens ------------------------ */
    --f-lamp-core: color-mix(in srgb, var(--al-function-amber-hi) 70%, white);
    --f-lamp-body: var(--al-material-lamp);
    --f-lamp-edge: var(--al-function-amber-lo);
    --f-lamp-glow: var(--al-material-lamp);

    display: grid;
    grid-template-columns: auto auto;
    grid-template-areas:
      "function ."
      "button lamp"
      "value .";
    align-items: center;
    justify-items: center;
    column-gap: var(--sw-lamp-gap);
    row-gap: var(--al-space-2xs);
    width: max-content;
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Variant A has no panel print: one row, so no empty rows add height. The
     raised cap stands `--sw-lift` above its seat, so the box includes it. */
  .switch--cap {
    grid-template-areas: "button lamp";
    row-gap: 0;
    padding-top: var(--sw-lift);
  }

  /* Variant B: room between the well and the print for the focus ring. */
  .switch--panel {
    row-gap: var(--al-space-xs);
  }

  .switch--lamp-red {
    --f-lamp-core: color-mix(in srgb, var(--al-function-red-hi) 72%, white);
    --f-lamp-body: var(--al-function-red-base);
    --f-lamp-edge: var(--al-function-red-lo);
    --f-lamp-glow: var(--al-function-red-base);
  }

  /* --- the base: seat (cap variant) or well (panel variant) --------------- */

  .switch__button {
    grid-area: button;
    display: grid;
    place-items: center;
    box-sizing: content-box;
    width: var(--sw-size);
    height: var(--sw-size);
    margin: 0;
    padding: var(--sw-seat);
    border: 0;
    appearance: none;
    border-radius: calc(var(--sw-radius) + var(--sw-seat));
    background: var(--al-material-recess);
    /* a dark gap round the cap's foot, and the seat's own edge */
    box-shadow:
      inset 0 1px 1px rgba(0, 0, 0, 0.85),
      0 0 0 1px rgba(0, 0, 0, 0.45);
    color: inherit;
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* Spec §2, variant B: "a recessed square well in the panel — a thin dark
     inset shadow/border around the switch base so it sits below the panel
     surface". The well floor is the recess token; the top-left lip casts
     into it, the bottom-right lip catches the room, and a hairline of the
     strong border holds the edge. */
  .switch--panel .switch__button {
    padding: var(--sw-gap);
    border-radius: calc(var(--sw-radius) + var(--sw-gap));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.9),
      inset 1px 0 2px rgba(0, 0, 0, 0.55),
      inset 0 -1px 0 rgba(255, 255, 255, 0.06),
      0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.05);
  }

  /* --- the cap -------------------------------------------------------------- */

  .switch__cap {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: var(--sw-size);
    height: var(--sw-size);
    border-radius: var(--sw-radius);
    /* The convex top: lit from the top-left, turning away at the bottom-right. */
    background: linear-gradient(135deg, var(--cap-hi) 0%, var(--cap-hi) 10%, var(--cap-base) 48%, var(--f-cap-dim) 100%);
    /* edge light, edge shade, inner turn, side wall, foot, drop shadow */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 1px 0 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.28),
      inset -1px 0 0 rgba(0, 0, 0, 0.14),
      inset -2px -3px 4px rgba(0, 0, 0, 0.16),
      0 var(--sw-lift) 0 0 var(--f-wall),
      0 calc(var(--sw-lift) + 1px) 0 0 var(--f-wall-foot),
      0 calc(var(--sw-lift) + 2px) 3px rgba(0, 0, 0, 0.55);
    transform: translateY(calc(-1 * var(--sw-lift)));
    transition:
      transform 60ms ease-out,
      box-shadow 60ms ease-out;
  }

  /* The gloss: a broad specular bloom in the upper-left, where a convex
     chrome-like surface faces the light, over a faint second sheen. On its
     own layer so it can dim when pressed. */
  .switch__cap::before {
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
    transition: opacity 60ms ease-out;
    pointer-events: none;
  }

  /* Variant B: same shape, matte. A restrained gradient, a faint top edge,
     a weak sheen, and a lower wall — the cap sits in the well, its top
     near the panel plane. */
  .switch--panel {
    --sw-lift: 2px;
  }

  .switch--panel .switch__cap {
    background: linear-gradient(135deg, var(--f-cap-matte-hi) 0%, var(--cap-base) 52%, var(--f-cap-matte-lo) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      inset 1px 0 0 rgba(255, 255, 255, 0.18),
      inset 0 -1px 0 rgba(0, 0, 0, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.1),
      0 var(--sw-lift) 0 0 var(--f-wall),
      0 calc(var(--sw-lift) + 1px) 0 0 var(--f-wall-foot),
      0 calc(var(--sw-lift) + 2px) 3px rgba(0, 0, 0, 0.6);
  }

  .switch--panel .switch__cap::before {
    background: radial-gradient(
      70% 50% at 32% 22%,
      rgba(255, 255, 255, 0.2) 0%,
      rgba(255, 255, 255, 0) 70%
    );
  }

  /* The label printed on the cap (variant A): ink on cream, flat print. */
  .switch__cap-label {
    position: relative;
    max-width: calc(100% - 2px);
    overflow: hidden;
    color: var(--al-text-on-cream);
    font-family: var(--al-font-label);
    font-size: var(--sw-type-cap);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.04em;
    line-height: 1;
    text-align: center;
    text-overflow: clip;
    text-transform: uppercase;
    white-space: nowrap;
    /* the ink sits a hair below the gloss: a faint lit edge under it */
    text-shadow: 0 0.5px 0 rgba(255, 255, 255, 0.28);
  }

  /* --- pressed: the cap sinks -------------------------------------------- */

  /* Spec §2: "reduce highlight-gradient intensity, shift shadow inward,
     optionally reduce apparent size by 1–2px". The cap moves down to 1 px
     off its base, the wall shrinks with it, the bloom dims, the inner shade
     deepens, the drop shadow tightens, and the seat's inner shadow is now
     over the cap's top edge. Scale takes 1 px off the width. */
  .switch.is-pressed .switch__cap {
    transform: translateY(-1px) scale(0.965);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 1px 0 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      inset -1px 0 0 rgba(0, 0, 0, 0.16),
      inset 0 2px 3px rgba(0, 0, 0, 0.22),
      0 1px 0 0 var(--f-wall),
      0 2px 0 0 var(--f-wall-foot),
      0 2px 2px rgba(0, 0, 0, 0.45);
  }

  .switch.is-pressed .switch__cap::before {
    opacity: 0.35;
  }

  .switch--panel.is-pressed .switch__cap {
    transform: translateY(-0.5px) scale(0.965);
  }

  /* --- the lamp ------------------------------------------------------------ */

  /* A small lens in a dark bezel beside the cap, lit from the top-left on
     every layer (owner's re-shading direction after Task 1.6, D1.6.6). The
     box is as it was — the lens plus a 1px gap — and the lamp itself paints
     nothing: its ::before is the bezel and the gap, its ::after the spill, so
     the spill can lie under the bezel. */
  .switch__lamp {
    grid-area: lamp;
    position: relative;
    display: block;
    box-sizing: content-box;
    width: var(--sw-lamp);
    height: var(--sw-lamp);
    padding: 1px;
    border-radius: 50%;
    /* level with the resting cap's face; it does not move when the cap does */
    transform: translateY(calc(-1 * var(--sw-lift)));
  }

  /* The bezel and the recess. A 1px transparent border round the padding box
     — the pixel the old ring shadow occupied — carries a thin dark metal ring,
     a 135° gradient lit at the top-left and dark at the bottom-right; inside
     it the 1px gap is a 135° gradient of the recess tone, darkest under the
     bezel's top-left lip and slightly lighter where its inner wall catches
     the light at the bottom-right. No drop shadow, no hairline. */
  .switch__lamp::before {
    content: "";
    position: absolute;
    z-index: 0;
    inset: -1px;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: 50%;
    background:
      linear-gradient(
          135deg,
          color-mix(in srgb, var(--al-material-recess) 70%, black) 0%,
          var(--al-material-recess) 50%,
          color-mix(in srgb, var(--al-material-recess) 86%, white) 100%
        )
        padding-box,
      linear-gradient(
          135deg,
          color-mix(in srgb, var(--al-material-metal) 78%, white) 0%,
          var(--al-material-metal) 38%,
          var(--al-material-metal-shadow) 72%,
          color-mix(in srgb, var(--al-material-metal-shadow) 70%, black) 100%
        )
        border-box;
    pointer-events: none;
  }

  /* The dome, off: dark glass with a faint trace of its own colour at the
     top-left; no shadow or line on its edge. */
  .switch__lens {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 50%;
    background: radial-gradient(
      circle at 34% 30%,
      color-mix(in srgb, var(--f-lamp-body) 22%, var(--al-material-recess)) 0%,
      var(--al-material-recess) 78%
    );
    transition: background 160ms ease-out;
  }

  /* The highlight: one small soft white ellipse on the top-left of the dome,
     tilted along its curve; every measure a share of the lens. */
  .switch__lens::after {
    content: "";
    position: absolute;
    top: 9%;
    left: 15%;
    width: 44%;
    height: 26%;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0));
    filter: blur(calc(var(--sw-lamp) * 0.04));
    transform: rotate(-40deg);
    opacity: 0.22;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* The spill: the lamp's light on the panel round the bezel. Blurred, a
     little larger below and to the right than above — an incandescent
     source behind a lens, not an LED dot. Off by default; painted under the
     bezel and the glass. */
  .switch__lamp::after {
    content: "";
    position: absolute;
    z-index: -1;
    inset: -70% -80% -90% -60%;
    border-radius: 50%;
    background: radial-gradient(
      ellipse at 44% 40%,
      var(--f-lamp-glow) 0%,
      transparent 68%
    );
    filter: blur(2.5px);
    opacity: 0;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* On: the dome brightest at the top-left — the family's HI tone warmed to
     white — falling through the lamp body to the darker edge tone at the
     rim; the highlight a little stronger; the spill behind. */
  .switch.is-engaged .switch__lens {
    background: radial-gradient(
      circle at 34% 30%,
      var(--f-lamp-core) 0%,
      var(--f-lamp-body) 42%,
      var(--f-lamp-edge) 92%
    );
    transition: background 90ms ease-out;
  }

  .switch.is-engaged .switch__lens::after {
    opacity: 0.42;
    transition: opacity 90ms ease-out;
  }

  .switch.is-engaged .switch__lamp::after {
    opacity: 0.5;
    transition: opacity 90ms ease-out;
  }

  /* --- the panel print (variant B) ---------------------------------------- */

  /* The print is centred on the well and may be wider than it, as print on a
     panel is; it must not push the lamp away from the cap. Zero width with
     a 100% minimum contributes nothing to the column, and the centred text
     overflows it evenly. */
  .switch__print {
    display: flex;
    justify-content: center;
    width: 0;
    min-width: 100%;
    overflow: visible;
    color: var(--al-text-secondary);
    font-family: var(--al-font-label);
    line-height: var(--al-line-height-tight);
    text-align: center;
    white-space: nowrap;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.9),
      0 -0.5px 0 rgba(255, 255, 255, 0.06);
  }

  .switch__print--function {
    grid-area: function;
    font-size: var(--sw-type-function);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-engraved);
    text-transform: uppercase;
  }

  .switch__print--value {
    grid-area: value;
    color: var(--al-text-muted);
    font-size: var(--sw-type-value);
    font-weight: var(--al-font-weight-semibold);
    letter-spacing: var(--al-letter-spacing-label);
  }

  /* --- focus ---------------------------------------------------------------- */

  /* A ring on the panel round the base, clear of the print and the lamp. */
  .switch__button:focus-visible,
  .switch.is-demo-focus .switch__button {
    outline: 2px solid var(--al-text-primary);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .switch__cap,
    .switch__cap::before,
    .switch__lens,
    .switch__lens::after,
    .switch__lamp::after {
      transition: none;
    }
  }
</style>
