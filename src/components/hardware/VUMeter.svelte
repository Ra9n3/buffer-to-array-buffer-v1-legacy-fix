<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across meters. */
  let nextId = 0;

  /* The scale's LAW and its GEOMETRY live in ./vu-geometry — one pure module,
     no DOM, importable by the tests — and are re-exported here unchanged, so
     every existing import from this component keeps working. The law is the
     approved one, nothing about which dB sits where has moved; the geometry
     is this stage's re-cut: the print spans the whole face it is drawn on. */
  export {
    GR_MARKS,
    GR_MAX,
    GR_MIN,
    SWEEP_DEG,
    VU_MARKS,
    VU_MAX,
    VU_MIN,
    VU_RED_FROM,
    grAngle,
    grPosition,
    vuAngle,
    vuGeometry,
    vuPosition,
  } from "./vu-geometry";
  export type { MeterFace, VUMark } from "./vu-geometry";
</script>
<script lang="ts">
  /**
   * ALLOY analog VU meter — Task 1.5, hardware spec §4a.
   *
   * One instrument, drawn as one SVG at 1 px = 1 unit and scaled as a whole
   * by `--vu-width` (7.5rem = 120 px = 1×), the way the fader scales from
   * `--fader-width`. In its `fill` mode (Task 9.8) the drawing is instead
   * re-cut to the measured box — and the print now SPANS THE WHOLE FACE
   * whatever its shape (this stage's re-geometry): an elliptical scale from
   * end to end, its sizes riding the card's height, the old capped stretch
   * and print-growth machinery gone with it.
   * From the back forward:
   *
   *   THE HOUSING   a dark walnut frame, bevelled, with a thin brass bead
   *                 between it and a near-black inner bezel; the bezel's lip
   *                 casts a shadow down onto the face, so the window reads
   *                 as recessed, not as a flat container.
   *   THE LAMP      the face is a translucent cream card lit from behind by
   *                 one incandescent bulb at the lower centre. The light is
   *                 not a gradient: three irregular blobs in the lamp token
   *                 are Gaussian-blurred with large radii — a wide pool from
   *                 the bulb, a hot core slightly left of it, a faint lift
   *                 in the upper right — then a frosted grain and an
   *                 off-centre vignette make the falloff uneven. A slow,
   *                 barely perceptible brightness drift on two different
   *                 periods suggests a filament, never a steady backlight.
   *   THE FACE      printed on top of the light: the elliptical arc from
   *                 end to end of the card, the tick marks running inward
   *                 from it, numerals at the key points, the red overload
   *                 band from 0 to +3, "VU".
   *   THE NEEDLE    a thin black line from the pivot to the scale, with a
   *                 soft drop shadow on the card beneath it; it follows the
   *                 level directly — the ballistics arrive with the audio
   *                 detector in a later stage.
   *
   * Every tone is a token or a neutral black/white alpha: the cream and lamp
   * material tokens, the amber family round the lamp, the red family for the
   * band, the wood/recess/metal tokens for the housing. Nothing here measures
   * anything: `level` is whatever the host passes in.
   */
  import { GR_MARKS, GR_MAX, GR_MIN, VU_MARKS, VU_MAX, VU_MIN, VU_RED_FROM, grAngle, grPosition, vuAngle, vuGeometry, vuPosition } from "./vu-geometry";
  import type { MeterFace } from "./vu-geometry";

  let {
    /** Engraved under the housing: "L", "MASTER", … Optional. */
    label = null,
    /** Reading in dB VU (or dB of gain reduction on the "gr" face). Values past the end stops rest on them. */
    level = VU_MIN,
    /** The printed card: the VU face (default, unchanged) or the gain-reduction face. */
    face = "vu" as MeterFace,
    /** Bulb power. Off, the card is dark cream in shadow and the print still reads. */
    lamp = true,
    /** The slow filament drift (spec §4a's optional variation). Off under prefers-reduced-motion regardless. */
    lampDrift = true,
    /** Accessible name when `label` is absent or too terse. */
    name = null,
    /** Task 9.8 (D9.8.3, the owner: "the vu meters should be extended with
     *  their content"): stretch the card horizontally to fill its host's
     *  box. The window takes the host's width and height, the drawing is
     *  re-cut to the measured box so the card fills it exactly — and the
     *  scale SPANS the whole of it (this stage's re-geometry): an elliptical
     *  arc from end to end, its sizes riding the card's fixed height. Off
     *  (the default everywhere else) the meter keeps its one written-down
     *  size, `--vu-width`, and the drawing as a whole. */
    fill = false,
  }: {
    label?: string | null;
    level?: number;
    face?: MeterFace;
    lamp?: boolean;
    lampDrift?: boolean;
    name?: string | null;
    fill?: boolean;
  } = $props();
  const uid = `vu${++nextId}`;

  /* --- geometry, in 1x pixels -------------------------------------------- */
  const W = 120;
  const H = 84;
  /** The brass bead between the walnut frame and the inner bezel. */
  const TRIM = 3.5;
  /** The window: the visible card. */
  const FACE_X = 7;
  const FACE_Y = 7;
  const FACE_W = 106;
  const FACE_H = 68;
  const FACE_RX = 2.5;
  const isGr = $derived(face === "gr");
  const faceMin = $derived(isGr ? GR_MIN : VU_MIN);
  const faceMax = $derived(isGr ? GR_MAX : VU_MAX);
  const clampedLevel = $derived(Math.min(faceMax, Math.max(faceMin, level)));
  /** The red zone belongs to the VU face only. */
  const overload = $derived(!isGr && clampedLevel >= VU_RED_FROM);

  /* --- the face's own box (the fill mode measures it; Task 9.8, D9.8.3) ----
     The window's measured box, in px. The drawing keeps its one unit scale
     (px per unit = winH / H) and its width in units follows the window's, so
     at the default box (`--vu-width`, the 1× card's 120/84 ratio) SW is
     exactly W and the housing is the approved one, value for value. */
  let winW = $state(0);
  let winH = $state(0);
  const SW = $derived(winW > 0 && winH > 0 ? Math.max(W, (winW * H) / winH) : W);
  const S_FACE_W = $derived(FACE_W + (SW - W));

  /* --- the print, cut to the face (this stage's re-geometry) ----------------
     The scale SPANS the whole face: one pure function, vuGeometry (see
     ./vu-geometry), cuts the arc, the ticks, the numerals, the red band, the
     legend, the needle and the pivot screw to the face's own box — drawn
     through a nested SVG whose viewport IS the card and whose viewBox is the
     card's own shape, so the print maps onto it with the drawing's one
     uniform scale: no letterboxing, no distortion, every 1× size riding the
     card's height (scaled by H / 68). The needle is a straight line from
     computed coordinates — no CSS rotation, no transition; it follows the
     level directly, and the audio detector's real ballistics arrive with a
     later stage. */
  const geo = $derived(
    vuGeometry(S_FACE_W, FACE_H, {
      level,
      marks: isGr ? GR_MARKS : VU_MARKS,
      position: isGr ? grPosition : vuPosition,
      redFrom: isGr ? null : VU_RED_FROM,
    }),
  );
  const redBand = $derived(geo.redBand);
  /** The needle's angle from vertical, the geometry's own law, for the data attribute. */
  const angle = $derived((isGr ? grAngle : vuAngle)(level));

  const numeral = (db: number): string => (db < 0 ? `\u2212${-db}` : db > 0 ? `+${db}` : "0");
  const f = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "");

  const valueText = $derived(
    isGr
      ? `${Math.round(clampedLevel * 10) / 10} dB gain reduction${lamp ? "" : ", lamp off"}`
      : `${level < VU_MIN ? "below \u221220" : level > VU_MAX ? "over +3" : numeral(Math.round(clampedLevel * 10) / 10)} VU${
          overload ? ", in the red" : ""
        }${lamp ? "" : ", lamp off"}`,
  );
</script>
<div
  class="vu"
  class:is-unlit={!lamp}
  class:is-drifting={lamp && lampDrift}
  class:is-overload={overload}
  class:is-fill={fill}
  style:--vu-numeral-size={`${f(geo.sizes.numeral)}px`}
  style:--vu-legend-size={`${f(geo.sizes.legend)}px`}
  data-vu
  data-vu-face={face}
  data-vu-level={f(clampedLevel)}
  data-vu-angle={f(angle)}
  data-vu-lamp={lamp}
  data-vu-zone={overload ? "overload" : "normal"}
>
  <div
    class="vu__window"
    role="meter"
    aria-label={name ?? label ?? (isGr ? "Gain-reduction meter" : "VU meter")}
    aria-valuemin={faceMin}
    aria-valuemax={faceMax}
    aria-valuenow={clampedLevel}
    aria-valuetext={valueText}
    data-vu-meter
    bind:clientWidth={winW}
    bind:clientHeight={winH}
  >
    <svg class="vu__surface" viewBox={`0 0 ${SW} ${H}`} aria-hidden="true">
      <defs>
        <!-- The walnut frame: lit from above, darker toward its foot. -->
        <linearGradient id={`${uid}-housing`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--v-housing-top)" />
          <stop offset="100%" style="stop-color: var(--v-housing-bottom)" />
        </linearGradient>
        <!-- Its bevel: a light top-left edge turning to a shadowed bottom-right. -->
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16" />
          <stop offset="55%" stop-color="#ffffff" stop-opacity="0.02" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.55" />
        </linearGradient>

        <clipPath id={`${uid}-face-clip`}>
          <rect x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} rx={FACE_RX} />
        </clipPath>

        <!-- ==============================================================
             THE LAMP. Three blurred blobs, not gradients: the blur radii
             are large (8 / 13 / 16 units on a 68-unit-tall card) and the
             shapes are irregular and off-centre, so the falloff is soft and
             asymmetric with no edge anywhere. Filter regions are oversized
             so the blur is never clipped before the face clip is.
             ============================================================== -->
        <filter id={`${uid}-blur-pool`} x="-80%" y="-120%" width="260%" height="340%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
        <filter id={`${uid}-blur-core`} x="-100%" y="-120%" width="300%" height="340%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={`${uid}-blur-far`} x="-100%" y="-150%" width="300%" height="400%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <!-- The frosted card: a fine monochrome grain, so the light reads as
             coming through a translucent surface rather than a clean screen. -->
        <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <!-- The vignette: centred low on the card, its focus a little left,
             transparent across the middle, darkening only toward the far
             corners. -->
        <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.7" r="0.78" fx="0.46" fy="0.76">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="46%" stop-color="#000000" stop-opacity="0" />
          <stop offset="76%" stop-color="#000000" stop-opacity="0.14" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.4" />
        </radialGradient>
        <!-- The bezel's lip, casting onto the recessed card: deep under the
             top edge, lighter down the left, a hint on the right. -->
        <linearGradient id={`${uid}-lip-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-lip-left`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-lip-right`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.14" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
        <!-- The glass over the card: one restrained diagonal sheen. -->
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.07" />
          <stop offset="28%" stop-color="#ffffff" stop-opacity="0.03" />
          <stop offset="46%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>

        <filter id={`${uid}-needle-shadow`} x="-50%" y="-20%" width="200%" height="140%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      <!-- ================================================================
           THE HOUSING: walnut frame, bevel, brass bead, black inner bezel.
           ================================================================ -->
      <g class="vu__housing" data-part="housing">
        <rect x="0" y="0" width={SW} height={H} rx="3.5" fill={`url(#${uid}-housing)`} />
        <rect class="vu__housing-bevel" x="0.5" y="0.5" width={SW - 1} height={H - 1} rx="3" fill="none" stroke={`url(#${uid}-bevel)`} />
        <!-- the bead's own shadow, then the bead -->
        <rect
          class="vu__trim-shadow"
          x={TRIM + 0.4}
          y={TRIM + 0.6}
          width={SW - 2 * TRIM}
          height={H - 2 * TRIM}
          rx="2.6"
        />
        <rect
          class="vu__trim"
          data-part="trim"
          x={TRIM}
          y={TRIM}
          width={SW - 2 * TRIM}
          height={H - 2 * TRIM}
          rx="2.6"
        />
        <rect
          class="vu__bezel"
          data-part="bezel"
          x={TRIM + 1.2}
          y={TRIM + 1.2}
          width={SW - 2 * TRIM - 2.4}
          height={H - 2 * TRIM - 2.4}
          rx="2.2"
        />
      </g>

      <!-- ================================================================
           THE WINDOW: everything from here is on, or behind, the card.
           ================================================================ -->
      <g clip-path={`url(#${uid}-face-clip)`}>
        <!-- The card with the bulb off: cream in shadow. -->
        <rect class="vu__card" data-part="card" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} />

        <!-- The bulb behind it. The whole lamp assembly rides the card's
             centre line: translated by half the stretch so the one bulb
             keeps its place under the (re-centred) pivot (Task 9.8). -->
        <g class="vu__lamp" data-part="lamp">
          <!-- light reaching every part of the translucent card -->
          <rect class="vu__wash" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} />
          <g class="vu__bulb" transform={`translate(${f((SW - W) / 2)} 0)`}>
            <!-- the pool of light from the bulb at the lower centre -->
            <path
              class="vu__glow-pool"
              data-part="glow-pool"
              d="M 18 72 C 20 52, 40 40, 60 42 C 80 44, 96 54, 98 70 C 100 85, 82 94, 58 93 C 34 92, 16 88, 18 72 Z"
              filter={`url(#${uid}-blur-pool)`}
            />
            <!-- a faint, uneven lift toward the upper right, so the
                 vignette is not a tidy ring around one point -->
            <path
              class="vu__glow-far"
              data-part="glow-far"
              d="M 70 22 C 84 18, 104 26, 106 40 C 108 52, 94 56, 80 52 C 68 48, 60 28, 70 22 Z"
              filter={`url(#${uid}-blur-far)`}
            />
            <g class="vu__bulb-core">
              <!-- the hot spot, a little left of the bulb's axis -->
              <path
                class="vu__glow-core"
                data-part="glow-core"
                d="M 40 72 C 44 61, 58 58, 68 63 C 77 68, 77 80, 66 85 C 54 90, 38 85, 40 72 Z"
                filter={`url(#${uid}-blur-core)`}
              />
            </g>
          </g>
          <!-- the frosted grain of the card -->
          <rect class="vu__grain" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} filter={`url(#${uid}-grain)`} />
        </g>

        <!-- The vignette and the bezel's lip shadow: on the card, lit or not. -->
        <rect class="vu__vignette" data-part="vignette" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} fill={`url(#${uid}-vignette)`} />
        <rect class="vu__lip" x={FACE_X} y={FACE_Y} width={S_FACE_W} height="10" fill={`url(#${uid}-lip-top)`} />
        <rect class="vu__lip" x={FACE_X} y={FACE_Y} width="7" height={FACE_H} fill={`url(#${uid}-lip-left)`} />
        <rect class="vu__lip" x={FACE_X + S_FACE_W - 4} y={FACE_Y} width="4" height={FACE_H} fill={`url(#${uid}-lip-right)`} />

        <!-- ==============================================================
             THE FACE: the print cut to the card's own box — the elliptical
             arc from end to end, the ticks running inward from it, the
             numerals at the key points, the red overload band, "VU", the
             needle and its screw — drawn through a nested SVG whose viewport
             IS the card and whose viewBox is the card's own shape, so the
             scale spans it at every size (this stage's re-geometry).
             ============================================================== -->
        <svg
          class="vu__face"
          x={FACE_X}
          y={FACE_Y}
          width={S_FACE_W}
          height={FACE_H}
          viewBox={`0 0 ${S_FACE_W} ${FACE_H}`}
        >
          <g class="vu__scale" data-part="scale">
            <path class="vu__arc" d={geo.arc.d} />
            {#if redBand}
              <path
                class="vu__arc-red"
                data-part="red-band"
                d={redBand.d}
                style:stroke-width={f(redBand.strokeWidth)}
              />
            {/if}
            {#each geo.ticks as tick (tick.db)}
              <line
                class={`vu__tick is-${tick.weight}`}
                class:is-red={tick.red}
                x1={f(tick.x1)}
                y1={f(tick.y1)}
                x2={f(tick.x2)}
                y2={f(tick.y2)}
              />
            {/each}
            {#each geo.ticks.filter((t) => t.numeral) as tick (tick.db)}
              <text class="vu__numeral" class:is-red={tick.red} x={f(tick.nx)} y={f(tick.ny)}>{isGr ? String(tick.db) : numeral(tick.db)}</text>
            {/each}
            <text class="vu__legend" data-part="legend" x={f(geo.legend.x)} y={f(geo.legend.y)}>{isGr ? "GR" : "VU"}</text>
          </g>

          <!-- ==============================================================
               THE NEEDLE: its shadow on the card, then the line — both from
               computed coordinates, no rotation — then the screw on top.
               ============================================================== -->
          <g class="vu__needle-shadow" data-part="needle-shadow">
            <polygon points={geo.needle.shadow.points} filter={`url(#${uid}-needle-shadow)`} />
          </g>
          <g class="vu__needle" data-part="needle">
            <line
              x1={f(geo.needle.x1)}
              y1={f(geo.needle.y1)}
              x2={f(geo.needle.x2)}
              y2={f(geo.needle.y2)}
              style:stroke-width={f(geo.sizes.needle)}
            />
          </g>
          <circle class="vu__hub-shadow" cx={f(geo.hub.cx + geo.hub.shadowDx)} cy={f(geo.hub.cy + geo.hub.shadowDy)} r={f(geo.hub.r)} />
          <circle class="vu__hub" data-part="hub" cx={f(geo.hub.cx)} cy={f(geo.hub.cy)} r={f(geo.hub.r)} />
          <circle class="vu__hub-pin" cx={f(geo.hub.cx)} cy={f(geo.hub.cy)} r={f(geo.hub.pinR)} />
        </svg>

        <!-- The glass. -->
        <rect class="vu__sheen" data-part="sheen" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} fill={`url(#${uid}-sheen)`} />
      </g>

      <!-- Where the glass meets the bezel: a dark seam, and a thread of light
           along the lower edge where the room catches it. -->
      <rect class="vu__seam" x={FACE_X} y={FACE_Y} width={S_FACE_W} height={FACE_H} rx={FACE_RX} />
      <path class="vu__glint" d={`M ${FACE_X + 4} ${FACE_Y + FACE_H + 0.6} H ${FACE_X + S_FACE_W - 4}`} />
    </svg>
  </div>

  {#if label}
    <p class="vu__label">{label}</p>
  {/if}
</div>

<style>
  .vu {
    /* The whole drawing scales from one width, `--vu-width`, set by the host;
       7.5rem = 120px = 1x. Read here, not declared, so a meter bridge or the
       playground sizes the meter from outside. */

    /* --- materials, from the tokens -------------------------------------- */
    --v-housing-top: color-mix(in srgb, var(--al-material-wood) 42%, var(--al-material-recess));
    --v-housing-bottom: color-mix(in srgb, var(--al-material-wood) 22%, var(--al-material-recess));
    --v-trim: color-mix(in srgb, var(--al-function-amber-base) 58%, var(--al-material-metal));
    --v-bezel: var(--al-material-recess);
    /* the card: cream in shadow with the bulb off; lit, the cream token
       yellowed a little by the lamp behind it (spec §4a: "slightly yellowed") */
    --v-card-unlit: color-mix(in srgb, var(--al-material-cream) 46%, black);
    --v-card-lit: color-mix(in srgb, var(--al-material-cream) 80%, var(--al-material-lamp));
    /* the bulb: the incandescent token, and a hotter core from the amber family */
    --v-lamp: var(--al-material-lamp);
    --v-lamp-core: color-mix(in srgb, var(--al-function-amber-hi) 55%, white);
    /* the print */
    --v-ink: var(--al-text-on-cream);
    --v-red: color-mix(in srgb, var(--al-function-red-base) 85%, var(--al-function-red-lo));
    --v-needle: color-mix(in srgb, var(--al-text-on-cream) 55%, black);
    --v-hub: color-mix(in srgb, var(--al-material-metal-shadow) 45%, black);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .vu__window {
    display: block;
    width: var(--vu-width, 7.5rem);
    /* the 1× card's shape: the drawing is 120 × 84, so the window's height
       follows its width and the svg fills it exactly. Written down here
       (Task 9.8) so the fill mode below can override it. */
    aspect-ratio: 120 / 84;
    min-width: 0;
  }

  /* Task 9.8 (D9.8.3, the owner: "the vu meters should be extended with
     their content"): the fill mode. The meter takes its share of the host's
     width and the host's written-down height; the drawing is re-cut to the
     measured box (see SW in the script) so the card — housing, print, needle
     and all — fills the box exactly, nothing letterboxed, nothing distorted. */
  .vu.is-fill {
    flex: 1 1 0;
    min-width: var(--vu-fill-min, 7.5rem);
  }

  .vu.is-fill .vu__window {
    width: 100%;
    height: var(--vu-fill-height, auto);
    aspect-ratio: auto;
    /* the window's width is the host's business, never its content's: the
       drawing is sized top-down from the measured box, so it must not feed
       its own width back through the ancestors' intrinsic sizing (size
       containment on the inline axis breaks that loop) */
    contain: inline-size;
  }

  .vu__surface {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* --- housing ------------------------------------------------------------ */

  .vu__housing-bevel {
    stroke-width: 1;
  }

  .vu__trim-shadow {
    fill: none;
    stroke: #000;
    stroke-width: 0.9;
    stroke-opacity: 0.5;
  }

  .vu__trim {
    fill: none;
    stroke: var(--v-trim);
    stroke-width: 0.9;
  }

  .vu__bezel {
    fill: var(--v-bezel);
  }

  /* --- the card and the bulb --------------------------------------------- */

  .vu__card {
    fill: var(--v-card-unlit);
  }

  /* The bulb warms up and cools down; it does not snap. */
  .vu__lamp {
    opacity: 1;
    transition: opacity 480ms ease-out;
  }

  .vu.is-unlit .vu__lamp {
    opacity: 0;
    transition: opacity 360ms ease-in;
  }

  .vu__wash {
    fill: var(--v-card-lit);
    fill-opacity: 0.8;
  }

  .vu__glow-pool {
    fill: var(--v-lamp);
    fill-opacity: 0.88;
  }

  .vu__glow-core {
    fill: var(--v-lamp-core);
    fill-opacity: 0.82;
  }

  .vu__glow-far {
    fill: var(--v-lamp);
    fill-opacity: 0.3;
  }

  .vu__grain {
    opacity: 0.075;
  }

  /* The filament: two slow drifts on unrelated periods, each within 4%, so
     the sum never repeats visibly and never reads as a flicker. */
  @keyframes vu-bulb-drift {
    0%,
    100% {
      opacity: 1;
    }
    29% {
      opacity: 0.972;
    }
    47% {
      opacity: 0.992;
    }
    68% {
      opacity: 0.962;
    }
    83% {
      opacity: 0.986;
    }
  }

  @keyframes vu-core-drift {
    0%,
    100% {
      opacity: 1;
    }
    37% {
      opacity: 0.95;
    }
    61% {
      opacity: 0.988;
    }
    80% {
      opacity: 0.96;
    }
  }

  .vu.is-drifting .vu__bulb {
    animation: vu-bulb-drift 9.7s ease-in-out infinite;
  }

  .vu.is-drifting .vu__bulb-core {
    animation: vu-core-drift 6.3s ease-in-out infinite;
  }

  /* --- print -------------------------------------------------------------- */

  .vu__arc {
    fill: none;
    stroke: var(--v-ink);
    stroke-width: 0.7;
  }

  .vu__arc-red {
    fill: none;
    stroke: var(--v-red);
    stroke-linecap: butt;
  }

  .vu__tick {
    stroke: var(--v-ink);
    stroke-linecap: butt;
  }

  .vu__tick.is-major {
    stroke-width: 1;
  }

  .vu__tick.is-medium {
    stroke-width: 0.7;
  }

  .vu__tick.is-minor {
    stroke-width: 0.5;
    stroke-opacity: 0.8;
  }

  .vu__tick.is-red {
    stroke: var(--v-red);
  }

  .vu__numeral {
    fill: var(--v-ink);
    font-family: var(--al-font-label);
    /* 6.6 units at 1×; the geometry writes the size the card's height gives
       it (this stage's re-geometry) — the var written by the instance, the
       1× size the fallback. */
    font-size: var(--vu-numeral-size, 6.6px);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.02em;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .vu__numeral.is-red {
    fill: var(--v-red);
  }

  .vu__legend {
    fill: var(--v-ink);
    font-family: var(--al-font-label);
    /* 9 units at 1×; the geometry writes the size the card's height gives
       it — the var written by the instance, the 1× size the fallback. */
    font-size: var(--vu-legend-size, 9px);
    font-weight: var(--al-font-weight-black);
    letter-spacing: 0.1em;
    text-anchor: middle;
    dominant-baseline: central;
  }

  /* --- needle ------------------------------------------------------------- */

  /* A straight line from the pivot to the scale, drawn from its computed
     endpoints — no rotation, no transition: it follows the level directly,
     and the audio detector's real ballistics arrive with a later stage. Its
     width comes from the geometry (the 1× stroke scaled by the card's
     height); only its colour lives here. */
  .vu__needle line {
    stroke: var(--v-needle);
  }

  .vu__needle-shadow polygon {
    fill: #000;
    fill-opacity: 0.32;
  }

  .vu__hub-shadow {
    fill: #000;
    fill-opacity: 0.3;
  }

  .vu__hub {
    fill: var(--v-hub);
    stroke: #fff;
    stroke-opacity: 0.16;
    stroke-width: 0.5;
  }

  .vu__hub-pin {
    fill: var(--al-material-metal-shadow);
  }

  /* --- glass -------------------------------------------------------------- */

  .vu__seam {
    fill: none;
    stroke: #000;
    stroke-width: 0.8;
    stroke-opacity: 0.6;
  }

  .vu__glint {
    fill: none;
    stroke: #fff;
    stroke-width: 0.5;
    stroke-opacity: 0.1;
  }

  /* --- label — the knob's and fader's conventions, verbatim --------------- */

  .vu__label {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    color: var(--al-text-secondary);
    font-family: var(--al-font-label);
    font-size: var(--al-text-size-xs);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-engraved);
    line-height: var(--al-line-height-tight);
    text-align: center;
    text-overflow: ellipsis;
    text-transform: uppercase;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.9),
      0 -0.5px 0 rgba(255, 255, 255, 0.06);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .vu.is-drifting .vu__bulb,
    .vu.is-drifting .vu__bulb-core {
      animation: none;
    }

    .vu__lamp {
      transition: none;
    }
  }
</style>
