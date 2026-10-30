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
   * HOW THE LAMP IS MADE (layered CSS, spec §6; nothing is a flat disc):
   *
   *   THE HOUSING   `lamp__housing` — a machined metal ring, a 135° gradient
   *                 from the metal token lit at the top-left to the metal
   *                 shadow token at the bottom-right (the family's bevel
   *                 light), standing on a drop shadow into the panel with the
   *                 family's hairline of light under it. It is mounted, not
   *                 drawn on.
   *   THE RECESS    `lamp__recess` — the dark gap between the ring and the
   *                 glass: recess-token floor, an inset shadow from the top.
   *   THE LENS      `lamp__lens` — the glass. UNLIT: a dark dome with a trace
   *                 of the lamp's own colour low in it (22% of the body tone
   *                 in the recess tone) and a pin of reflected room light at
   *                 the upper left: a physical lens that is clearly not lit.
   *                 LIT: a hot core a little above centre — the family's HI
   *                 tone warmed toward white — falling through the lamp body
   *                 to a darker edge at the rim (a bulb seen through glass is
   *                 brightest where the filament is and darker where the
   *                 glass curves away), the specular over it, and a near glow
   *                 round the rim.
   *   THE SPILL     `lamp__spill` — the light on the panel. A radial of the
   *                 glow tone, blurred, larger below and to the right than
   *                 above (an incandescent source is not centred in its
   *                 bezel and the panel round it is not flat), at half
   *                 opacity. Painted behind the housing: the panel is lit,
   *                 the bezel is not.
   *
   * AMBER is the incandescent token `--al-material-lamp` with the amber family
   * round it; RED is the red family — a warning lamp, so its spill and near
   * glow are a step stronger than amber's. There is no third colour and no
   * cold white anywhere. Lit and unlit differ in luminance and in shape (a
   * bright core, a glow, a spill), never in hue alone; the state is also in
   * the accessible name.
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
    --lp-near: 1;

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
    --lp-near: 1.3;
  }

  /* --- the housing: a machined ring, lit from the top-left, mounted -------- */

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
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.55),
      0 var(--lp-recess) calc(var(--lp-recess) * 1.5) rgba(0, 0, 0, 0.6),
      0 calc(var(--lp-recess) + 1px) 0 rgba(255, 255, 255, 0.07);
  }

  /* --- the recess: the dark gap round the glass ---------------------------- */

  .lamp__recess {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: var(--lp-recess);
    border-radius: 50%;
    background: var(--al-material-recess);
    box-shadow: inset 0 var(--lp-recess) calc(var(--lp-recess) * 1.2) rgba(0, 0, 0, 0.9);
  }

  /* --- the lens, unlit: dark glass with a trace of its colour and a pin of
         room light; a physical lens that is clearly not on --------------------- */

  .lamp__lens {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background:
      radial-gradient(circle at 36% 30%, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 38%),
      radial-gradient(
        circle at 50% 58%,
        color-mix(in srgb, var(--lp-body) 22%, var(--al-material-recess)) 0%,
        var(--al-material-recess) 78%
      );
    box-shadow: inset 0 var(--lp-recess) calc(var(--lp-recess) * 2) rgba(0, 0, 0, 0.85);
    transition:
      background 160ms ease-out,
      box-shadow 160ms ease-out;
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
    background:
      radial-gradient(circle at 36% 30%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 34%),
      radial-gradient(circle at 48% 44%, var(--lp-core) 0%, var(--lp-body) 42%, var(--lp-edge) 92%);
    box-shadow:
      inset 0 0 1px rgba(0, 0, 0, 0.3),
      0 0 calc(var(--lp-size) * 0.2 * var(--lp-near)) calc(var(--lp-size) * 0.1 * var(--lp-near))
        color-mix(in srgb, var(--lp-glow) 70%, transparent),
      0 0 calc(var(--lp-size) * 0.6 * var(--lp-near)) calc(var(--lp-size) * 0.2 * var(--lp-near))
        color-mix(in srgb, var(--lp-glow) 32%, transparent);
    transition:
      background 90ms ease-out,
      box-shadow 90ms ease-out;
  }

  .lamp.is-lit .lamp__spill {
    opacity: var(--lp-spill-opacity);
    transition: opacity 90ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .lamp__lens,
    .lamp__spill {
      transition: none;
    }
  }
</style>
