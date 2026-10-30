<script module lang="ts">
  /** The two indicator colours of hardware spec §5. Nothing else is a lamp colour. */
  export type LampColor = "amber" | "red";
</script>

<script lang="ts">
  /**
   * ALLOY lamp-glow indicator — Task 1.6.
   *
   * A miniature incandescent lamp behind a translucent lens, mounted in a
   * machined bezel: the engaged indicator beside a switch (spec §2), a peak
   * indicator on a strip, anything that is "on" or "not on". The look is the
   * Task 1.4 switch's lamp lifted out as a shared component (decision
   * D1.4.3), scaled from one length and given its own housing; the switch
   * itself is untouched in this task.
   *
   * HOW THE LAMP IS MADE (layered CSS, spec §6; nothing is a flat disc). One
   * light, from the top-left, on every layer (owner's re-shading direction
   * after the Task 1.6 build, D1.6.6; no shadow, glow or highlight other than
   * the four below):
   *
   *   THE BEZEL     `lamp__housing` — a thin dark metal ring, a 135° gradient
   *                 from the metal token lit at the top-left to the metal
   *                 shadow token at the bottom-right. No drop shadow, no seam,
   *                 no hairline.
   *   THE RECESS    `lamp__recess` — the dark gap between the ring and the
   *                 glass, kept at its size; the gap itself is the shading: a
   *                 135° gradient of the recess tone, darkest at the top-left
   *                 (under the bezel's lip), the token in the middle, slightly
   *                 lighter at the bottom-right where the inner wall catches
   *                 the light. No inset shadow.
   *   THE DOME      `lamp__lens` — the glass, with no shadow or line on its
   *                 edge. UNLIT: dark glass, the lamp's own colour as a faint
   *                 trace (22% of the body tone in the recess tone) brightest
   *                 at the top-left, falling to the recess tone. LIT: the
   *                 family's HI tone warmed toward white at the top-left,
   *                 falling through the lamp body to the darker edge tone
   *                 toward the rim.
   *   THE HIGHLIGHT `lamp__lens::after` — one small soft white ellipse on the
   *                 top-left of the dome, tilted along the dome's curve, at
   *                 low opacity: faint when unlit, a little stronger when lit.
   *   THE SPILL     `lamp__spill` — the lit lamp's light on the panel. A
   *                 radial of the glow tone, blurred, larger below and to the
   *                 right than above, at half opacity, painted BEHIND the
   *                 bezel and fading to fully transparent; absent when unlit.
   *
   * AMBER is the incandescent token `--al-material-lamp` with the amber family
   * round it; RED is the red family — a warning lamp, so its spill is a step
   * stronger than amber's. There is no third colour and no cold white
   * anywhere. Lit and unlit differ in luminance and in shape (a bright dome,
   * a spill), never in hue alone; the state is also in the accessible name.
   *
   * Size: `--lamp-size` is the glass diameter (0.625rem = 10 px at 1×, the
   * switch's lamp); the recess, ring, glow and spill follow it.
   */

  let {
    lit = false,
    color = "amber",
    name = null,
  }: {
    /** The lamp is on. */
    lit?: boolean;
    color?: LampColor;
    /**
     * Accessible name of what the lamp indicates ("PHANTOM", "PEAK L"). With
     * a name the lamp is an image whose label carries the state; without one
     * it is presentation (a parent control — a switch's aria-pressed, a
     * meter's value — carries the state).
     */
    name?: string | null;
  } = $props();

  const stateText = $derived(lit ? "lit" : "unlit");
</script>

<span
  class={`lamp lamp--${color}`}
  class:is-lit={lit}
  role={name ? "img" : undefined}
  aria-label={name ? `${name} lamp, ${stateText}` : undefined}
  aria-hidden={name ? undefined : "true"}
  data-lamp
  data-lamp-lit={lit}
  data-lamp-color={color}
>
  <span class="lamp__spill" data-part="spill"></span>
  <span class="lamp__housing" data-part="housing">
    <span class="lamp__recess" data-part="recess">
      <span class="lamp__lens" data-part="lens"></span>
    </span>
  </span>
</span>

<style>
  .lamp {
    /* the glass diameter; everything else is a proportion of it */
    --lp-size: var(--lamp-size, 0.625rem);
    --lp-recess: max(1px, calc(var(--lp-size) * 0.1));
    --lp-ring: max(1px, calc(var(--lp-size) * 0.16));

    /* --- amber: the incandescent token inside the amber family ------------ */
    --lp-core: color-mix(in srgb, var(--al-function-amber-hi) 70%, white);
    --lp-body: var(--al-material-lamp);
    --lp-edge: var(--al-function-amber-lo);
    --lp-glow: var(--al-material-lamp);
    --lp-spill-opacity: 0.5;
    /* the highlight's strength: faint on dark glass, a little more on a lit dome */
    --lp-highlight: 0.22;

    /* the layout box is the housing: glass + recess + ring on every side, so
       the painted lamp is exactly where the box is (centred under a legend) */
    --lp-outer: calc(var(--lp-size) + 2 * (var(--lp-recess) + var(--lp-ring)));

    position: relative;
    display: inline-block;
    box-sizing: border-box;
    width: var(--lp-outer);
    height: var(--lp-outer);
    vertical-align: middle;
    line-height: 0;
  }

  /* --- red: the red family, a step stronger — it is a warning ------------- */

  .lamp--red {
    --lp-core: color-mix(in srgb, var(--al-function-red-hi) 72%, white);
    --lp-body: var(--al-function-red-base);
    --lp-edge: var(--al-function-red-lo);
    --lp-glow: var(--al-function-red-base);
    --lp-spill-opacity: 0.62;
  }

  /* --- the bezel: a thin dark metal ring, lit from the top-left ------------ */

  .lamp__housing {
    position: relative;
    z-index: 1;
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    /* the ring is the housing's padding (a border would be snapped to whole
       device pixels and shift the glass); the recess paints over the rest */
    padding: var(--lp-ring);
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--al-material-metal) 78%, white) 0%,
      var(--al-material-metal) 38%,
      var(--al-material-metal-shadow) 72%,
      color-mix(in srgb, var(--al-material-metal-shadow) 70%, black) 100%
    );
  }

  /* --- the recess: the dark gap round the glass, darkest under the bezel's
         top-left lip, its inner wall catching the light at the bottom-right -- */

  .lamp__recess {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: var(--lp-recess);
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--al-material-recess) 70%, black) 0%,
      var(--al-material-recess) 50%,
      color-mix(in srgb, var(--al-material-recess) 86%, white) 100%
    );
  }

  /* --- the dome, unlit: dark glass, a faint trace of its own colour at the
         top-left; no shadow or line on its edge ------------------------------- */

  .lamp__lens {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 50%;
    background: radial-gradient(
      circle at 34% 30%,
      color-mix(in srgb, var(--lp-body) 22%, var(--al-material-recess)) 0%,
      var(--al-material-recess) 78%
    );
    transition: background 160ms ease-out;
  }

  /* --- the highlight: one small soft white ellipse on the top-left of the
         dome, tilted along its curve; every measure a share of the glass ----- */

  .lamp__lens::after {
    content: "";
    position: absolute;
    top: 9%;
    left: 15%;
    width: 44%;
    height: 26%;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0));
    filter: blur(calc(var(--lp-size) * 0.04));
    transform: rotate(-40deg);
    opacity: var(--lp-highlight);
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* --- the spill: the lamp's light on the panel, behind the housing -------- */

  .lamp__spill {
    position: absolute;
    z-index: 0;
    inset: -70% -80% -90% -60%;
    border-radius: 50%;
    /* the box hangs 10% below and 10% right of the lamp; the radial sits in
       its centre, so the light pools under the housing rather than above it */
    background: radial-gradient(ellipse at 50% 50%, var(--lp-glow) 0%, transparent 68%);
    filter: blur(calc(var(--lp-size) * 0.25));
    opacity: 0;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* --- lit ------------------------------------------------------------------ */

  .lamp.is-lit .lamp__lens {
    --lp-highlight: 0.42;

    background: radial-gradient(circle at 34% 30%, var(--lp-core) 0%, var(--lp-body) 42%, var(--lp-edge) 92%);
    transition: background 90ms ease-out;
  }

  .lamp.is-lit .lamp__lens::after {
    transition: opacity 90ms ease-out;
  }

  .lamp.is-lit .lamp__spill {
    opacity: var(--lp-spill-opacity);
    transition: opacity 90ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .lamp__lens,
    .lamp__lens::after,
    .lamp__spill {
      transition: none;
    }
  }
</style>
