<script module lang="ts">
  /** The two indicator colours of hardware spec §5. Nothing else is a lamp colour. */
  export type LampColor = "amber" | "red";
</script>

<script lang="ts">
  /**
   * ALLOY lamp-glow indicator — Task 1.6.
   *
   * A vintage pilot lamp: a hot object behind glass, not an LED dot. Used
   * for anything that is "on" or "not on" — the engaged indicator beside a
   * switch (spec §2), a peak indicator on a strip. The look is the Task 1.4
   * switch's lamp lifted out as a shared component (decision D1.4.3) and
   * restyled as a jewel lamp on the owner's brief (D1.6.7); the switch's own
   * lamp is restyled in place with the same layers.
   *
   * HOW THE LAMP IS MADE — seven layers, bottom to top, one light from the
   * top-left on all of them (the knobs' and faders' light; spec §6; nothing
   * is a flat disc, nothing is pure white, nothing is a flat saturated fill):
   *
   *   1 THE BLOOM     `lamp__bloom` — lit only. A radial halo of the lamp's own
   *                   colour, 2.5× the bezel's radius, screen-blended onto the
   *                   panel so the lit lamp stains its surroundings; fades to
   *                   fully transparent, no edge. It breathes by 3.5% opacity
   *                   over 4 s (old filament), not under reduced motion.
   *   2 THE BEZEL     `lamp__housing` — a nickel ring, the knob's five nickel
   *                   values repeated here (owner's instruction; there is no
   *                   shared nickel token), a 135° ramp lit at the top-left
   *                   and dark at the bottom-right. No drop shadow.
   *   3 THE RECESS    `lamp__recess` — a 1px dark wall inside the bezel, so the
   *                   glass sits below the panel surface; darkest under the
   *                   bezel's top-left lip.
   *   4 THE GLASS     `lamp__lens` — a radial dome. LIT: the family's HI tone
   *                   warmed toward white at the top-left, through the
   *                   saturated body to a dark glass rim. OFF: dull dark glass
   *                   tinted with the lamp's own colour (amber: warm brown;
   *                   red: maroon) — coloured dead glass, never grey or black.
   *   5 THE FILAMENT  `lamp__lens::before` — a tiny zigzag wire in the middle
   *                   of the glass, a dull tinted metal at half opacity, seen
   *                   only when the lamp is off; lit, it is swallowed by the
   *                   hot core.
   *   6 THE HOT CORE  the lit lens's top background layer — a small white-warm
   *                   radial blob offset to the top-left, over the glass.
   *   7 THE SPECULAR  `lamp__lens::after` — one small soft white ellipse at the
   *                   top-left: the room light on the glass, there whether the
   *                   bulb is on or off, dimmer when off.
   *
   * AMBER is the incandescent token `--al-material-lamp` with the amber family
   * round it; RED is the red family — a warning lamp, so its bloom is a step
   * stronger than amber's. There is no third colour and no cold white
   * anywhere. Lit and unlit differ in luminance and in shape (a hot core, a
   * bloom, a filament), never in hue alone; the state is also in the
   * accessible name.
   *
   * Size: `--lamp-size` is the glass diameter (0.625rem = 10 px at 1×, the
   * switch's lamp); the ring, the dome's offsets, the specular, the filament
   * and the bloom follow it. The recess wall is one pixel at every size.
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
  <span class="lamp__bloom" data-part="bloom"></span>
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
    /* the recess wall: one pixel at every size */
    --lp-recess: 1px;
    --lp-ring: max(1px, calc(var(--lp-size) * 0.16));

    /* --- nickel: the knob's ramp, value for value (Knob.svelte --kn-nickel-*);
           repeated here on the owner's instruction, D1.6.7 ------------------- */
    --lp-nickel-hi: #c2c6c9;
    --lp-nickel-base: #8f9498;
    --lp-nickel-mid: #6e7377;
    --lp-nickel-lo: #4f5357;
    --lp-nickel-deep: #2f3336;

    /* --- amber: the incandescent token inside the amber family ------------ */
    --lp-core: color-mix(in srgb, var(--al-function-amber-hi) 70%, white);
    --lp-body: var(--al-material-lamp);
    --lp-edge: var(--al-function-amber-lo);
    --lp-glow: var(--al-material-lamp);
    --lp-bloom-opacity: 0.8;
    /* dead glass: the body colour sunk into the recess tone — dull, dark, warm */
    --lp-off-hi: color-mix(in srgb, var(--lp-body) 30%, var(--al-material-recess));
    --lp-off-lo: color-mix(in srgb, var(--lp-body) 12%, var(--al-material-recess));
    --lp-off-rim: color-mix(in srgb, var(--lp-body) 8%, black);
    /* the cold filament: dull metal taking the glass's tint */
    --lp-filament: color-mix(in srgb, var(--lp-body) 40%, var(--al-material-metal));
    --lp-filament-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6.5 13.4 9 10.2 11.5 13.4 14 10.2 16.5 13.4 18.2 11.3' fill='none' stroke='black' stroke-width='1' stroke-linecap='round' stroke-linejoin='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
    /* the specular's strength: the room light on the glass, dimmer when off */
    --lp-specular: 0.28;

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
    --lp-bloom-opacity: 0.9;
    /* maroon dead glass */
    --lp-off-hi: color-mix(in srgb, var(--lp-body) 36%, var(--al-material-recess));
    --lp-off-lo: color-mix(in srgb, var(--lp-body) 18%, var(--al-material-recess));
    --lp-off-rim: color-mix(in srgb, var(--lp-body) 12%, black);
  }

  /* --- 1 the bloom: the lit lamp's light on the panel, behind the bezel ---- */

  .lamp__bloom {
    position: absolute;
    z-index: 0;
    /* a box 2.5× the housing: the halo's radius is 2.5× the bezel's */
    inset: -75%;
    border-radius: 50%;
    background: radial-gradient(
      circle closest-side,
      color-mix(in srgb, var(--lp-glow) 75%, transparent) 0%,
      color-mix(in srgb, var(--lp-glow) 30%, transparent) 32%,
      transparent 100%
    );
    mix-blend-mode: screen;
    opacity: 0;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* --- 2 the bezel: a nickel ring, lit from the top-left ------------------- */

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
      var(--lp-nickel-hi) 0%,
      var(--lp-nickel-base) 34%,
      var(--lp-nickel-mid) 62%,
      var(--lp-nickel-lo) 86%,
      var(--lp-nickel-deep) 100%
    );
  }

  /* --- 3 the recess wall: the glass sits below the panel surface ----------- */

  .lamp__recess {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: var(--lp-recess);
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--al-material-recess) 60%, black) 0%,
      var(--al-material-recess) 55%,
      color-mix(in srgb, var(--al-material-recess) 78%, var(--lp-nickel-lo)) 100%
    );
  }

  /* --- 4 the glass, off: dull dark glass in the lamp's own tint ------------ */

  .lamp__lens {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 50%;
    background: radial-gradient(
      circle at 36% 32%,
      var(--lp-off-hi) 0%,
      var(--lp-off-lo) 55%,
      var(--lp-off-rim) 100%
    );
    transition: background 160ms ease-out;
  }

  /* --- 5 the filament: a tiny zigzag wire, seen only when off -------------- */

  .lamp__lens::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--lp-filament);
    -webkit-mask: var(--lp-filament-mask) center / 100% 100% no-repeat;
    mask: var(--lp-filament-mask) center / 100% 100% no-repeat;
    opacity: 0.5;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* --- 7 the specular: the room light on the glass, on or off -------------- */

  .lamp__lens::after {
    content: "";
    position: absolute;
    top: 12%;
    left: 18%;
    width: 30%;
    height: 19%;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0));
    filter: blur(calc(var(--lp-size) * 0.03));
    transform: rotate(-40deg);
    opacity: var(--lp-specular);
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }

  /* --- lit: 4 the glass alight, 6 the hot core over it, 1 the bloom -------- */

  .lamp.is-lit .lamp__lens {
    --lp-specular: 0.55;

    background:
      radial-gradient(
        circle at 36% 32%,
        var(--lp-core) 0%,
        color-mix(in srgb, var(--lp-core) 55%, transparent) 9%,
        transparent 26%
      ),
      radial-gradient(
        circle at 36% 32%,
        color-mix(in srgb, var(--lp-core) 60%, var(--lp-body)) 0%,
        var(--lp-body) 38%,
        var(--lp-edge) 78%,
        color-mix(in srgb, var(--lp-edge) 65%, black) 100%
      );
    transition: background 90ms ease-out;
  }

  .lamp.is-lit .lamp__lens::before {
    opacity: 0;
    transition: opacity 90ms ease-out;
  }

  .lamp.is-lit .lamp__lens::after {
    transition: opacity 90ms ease-out;
  }

  .lamp.is-lit .lamp__bloom {
    opacity: var(--lp-bloom-opacity);
    transition: opacity 90ms ease-out;
  }

  /* the breathe: 3.5% of opacity added on top of the bloom's own, 4 s each
     way — composed onto the value, so the 90 ms rise is kept; only where the
     browser can compose, so an older one simply shows a still bloom */
  @supports (animation-composition: add) {
    .lamp.is-lit .lamp__bloom {
      animation: lamp-breathe 4s ease-in-out infinite alternate;
      animation-composition: add;
    }
  }

  @keyframes lamp-breathe {
    from {
      opacity: 0;
    }
    to {
      opacity: 0.035;
    }
  }

  /* no motion: the lit rules above carry their own transitions and the
     breathe, so these selectors match their specificity and come last */
  @media (prefers-reduced-motion: reduce) {
    .lamp .lamp__lens,
    .lamp .lamp__lens::before,
    .lamp .lamp__lens::after,
    .lamp .lamp__bloom,
    .lamp.is-lit .lamp__lens,
    .lamp.is-lit .lamp__lens::before,
    .lamp.is-lit .lamp__lens::after,
    .lamp.is-lit .lamp__bloom {
      transition: none;
      animation: none;
    }
  }
</style>
