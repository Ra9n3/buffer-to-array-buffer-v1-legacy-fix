<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across meters. */
  let nextId = 0;

  /** One mark on the VU face: a dB value relative to 0 VU and its weight. */
  export interface VUMark {
    readonly db: number;
    readonly weight: "major" | "medium" | "minor";
    /** Numerals at the key points only (hardware spec §4a). */
    readonly numeral?: boolean;
  }

  /** The scale's two end stops and the start of the red overload band. */
  export const VU_MIN = -20;
  export const VU_MAX = 3;
  export const VU_RED_FROM = 0;

  /**
   * The standard VU face. Numerals at the key points; the one-dB marks either
   * side of 0 as unnumbered ticks; a few minors in the crowded lower range.
   * The face is linear in modulation percentage (0 VU = 100%), which is why
   * the dB marks bunch toward the left and the red third is only 3 dB wide.
   */
  export const VU_MARKS: readonly VUMark[] = [
    { db: -20, weight: "major", numeral: true },
    { db: -15, weight: "minor" },
    { db: -12, weight: "minor" },
    { db: -10, weight: "major", numeral: true },
    { db: -8, weight: "minor" },
    { db: -7, weight: "major", numeral: true },
    { db: -6, weight: "minor" },
    { db: -5, weight: "major", numeral: true },
    { db: -4, weight: "minor" },
    { db: -3, weight: "major", numeral: true },
    { db: -2, weight: "medium" },
    { db: -1, weight: "medium" },
    { db: 0, weight: "major", numeral: true },
    { db: 1, weight: "medium" },
    { db: 2, weight: "medium" },
    { db: 3, weight: "major", numeral: true },
  ];

  /** The needle's sweep, in degrees, centred on vertical: −45° … +45°. */
  export const VU_SWEEP = 90;

  const modulation = (db: number): number => 100 * Math.pow(10, db / 20);

  /**
   * Where a dB value sits along the arc: 0 at the left stop (−20), 1 at the
   * right stop (+3). Values past the stops rest on them — the needle never
   * leaves the printed scale.
   */
  export function vuPosition(db: number): number {
    const clamped = Math.min(VU_MAX, Math.max(VU_MIN, db));
    return (modulation(clamped) - modulation(VU_MIN)) / (modulation(VU_MAX) - modulation(VU_MIN));
  }

  /** The needle's angle from vertical for a dB value, in degrees (clockwise positive). */
  export function vuAngle(db: number): number {
    return -VU_SWEEP / 2 + VU_SWEEP * vuPosition(db);
  }

  /**
   * TWO FACES (Task 2.8). The instrument is the same; only the printed card
   * differs. `"vu"` is the face above. `"gr"` is a dedicated gain-reduction
   * scale: 0 dB of reduction at the RIGHT stop, 20 dB at the left, the
   * needle falling leftward as reduction increases — a VU meter switched to
   * read gain reduction, with the card printed for that job. No red band,
   * no signed numerals, "GR" for the legend. It keeps the movement's own law
   * (linear in modulation from the 0 stop), so the first few dB take most of
   * the arc exactly as they do on the VU face.
   */
  export type MeterFace = "vu" | "gr";
  export const GR_MIN = 0;
  export const GR_MAX = 20;
  export const GR_MARKS: readonly VUMark[] = [
    { db: 0, weight: "major", numeral: true },
    { db: 1, weight: "major", numeral: true },
    { db: 2, weight: "medium" },
    { db: 3, weight: "major", numeral: true },
    { db: 4, weight: "minor" },
    { db: 5, weight: "major", numeral: true },
    { db: 7, weight: "minor" },
    { db: 10, weight: "major", numeral: true },
    { db: 15, weight: "minor" },
    { db: 20, weight: "major", numeral: true },
  ];

  /** Where a gain-reduction value sits along the arc: 0 at the left stop (20 dB), 1 at the right (0 dB). */
  export function grPosition(db: number): number {
    const clamped = Math.min(GR_MAX, Math.max(GR_MIN, db));
    return (modulation(-clamped) - modulation(-GR_MAX)) / (modulation(0) - modulation(-GR_MAX));
  }

  export function grAngle(db: number): number {
    return -VU_SWEEP / 2 + VU_SWEEP * grPosition(db);
  }
</script>
<script lang="ts">
  /**
   * ALLOY analog VU meter — Task 1.5, hardware spec §4a.
   *
   * One instrument, drawn as one SVG at 1 px = 1 unit and scaled as a whole
   * by `--vu-width` (7.5rem = 120 px = 1×), the way the fader scales from
   * `--fader-width`. In its `fill` mode (Task 9.8) the drawing is instead
   * re-cut to the measured box, and since Task 9.9 the print GROWS with
   * the card — bounded by the card's fixed height, the needle never
   * growing (D9.9.2, the owner: "not just the frame, the content too").
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
   *   THE FACE      printed on top of the light: the arc, the tick marks
   *                 radiating from a pivot below the centre, numerals at the
   *                 key points, the red overload band from 0 to +3, "VU".
   *   THE NEEDLE    a thin black blade pivoting on a small hub, with a soft
   *                 drop shadow on the card beneath it; it swings with a VU
   *                 meter's ballistics (a 360 ms rise with a slight overshoot).
   *
   * Every tone is a token or a neutral black/white alpha: the cream and lamp
   * material tokens, the amber family round the lamp, the red family for the
   * band, the wood/recess/metal tokens for the housing. Nothing here measures
   * anything: `level` is whatever the host passes in.
   */
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
     *  re-cut to the measured box so the card fills it exactly and the
     *  scale spreads with it — the sweep widening, capped — and since Task
     *  9.9 (D9.9.2, the owner: "not just the frame, the content too — the
     *  name, the numbers, the arc") the print GROWS with the card: the
     *  numerals, the legend and the arc as far as the card's fixed height
     *  allows, the needle kept at its 1× size (the owner: "the needles
     *  need to be smaller"). Off (the default everywhere else) the meter
     *  keeps its one written-down size, `--vu-width`, and the approved
     *  drawing as a whole. */
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
  /** The needle's pivot: below the centre of the face (spec §4a). */
  const PIVOT_X = 60;
  const PIVOT_Y = 68;
  /** The arc the ticks radiate from, and the numerals outside it. */
  const ARC_R = 46;
  const NUMERAL_R = 55.5;
  const TICK = { major: 5, medium: 3.6, minor: 2.3 } as const;
  const RED_BAND_W = 2.4;
  /** The blade: tapered, its tip just past the ticks, its tail under the hub. */
  const NEEDLE_TIP_R = 53;
  const NEEDLE_TAIL = 2.5;
  const NEEDLE_BASE_W = 1.7;
  const NEEDLE_TIP_W = 0.5;
  const HUB_R = 3.2;
  /** The needle's shadow falls down and to the right onto the card. */
  const SHADOW_DX = 1.1;
  const SHADOW_DY = 1.6;

  const isGr = $derived(face === "gr");
  const faceMin = $derived(isGr ? GR_MIN : VU_MIN);
  const faceMax = $derived(isGr ? GR_MAX : VU_MAX);
  const clampedLevel = $derived(Math.min(faceMax, Math.max(faceMin, level)));
  /** The red zone belongs to the VU face only. */
  const overload = $derived(!isGr && clampedLevel >= VU_RED_FROM);

  /* --- the horizontal stretch (Task 9.8, D9.8.3) --------------------------
     The window's measured box, in px. The drawing is re-cut to it so the
     card fills its box exactly at any width: the height sets the unit scale
     (px per unit = winH / H), the width sets the drawing's width in units.
     At the default box (`--vu-width`, the 1× card's 120/84 ratio) SW is
     exactly W and the drawing is the approved face, value for value. */
  let winW = $state(0);
  let winH = $state(0);
  const SW = $derived(winW > 0 && winH > 0 ? Math.max(W, (winW * H) / winH) : W);
  /** How far the card has been stretched: 1 = the approved face. */
  const stretch = $derived(SW / W);

  /* --- the print's growth (Task 9.9, D9.9.2) -----------------------------
     The owner: "not just the frame, the content too — the name, the
     numbers, the arc". The print grows with the card in the fill mode —
     and only there, so a meter at its written-down width keeps the
     approved drawing as a whole whatever a host sets. At the 1× box the
     scale is exactly 1 (the fill floor IS the 1× card), so what D9.8.3
     wrote down still holds: the drawing there is the approved face value
     for value. The growth rises with the stretch and is full (1.35) by the
     time the card is ~1.7× the 1× width — a little before the sweep's
     own cap, the content leading the mechanism. */
  const PRINT_MAX = 1.35;
  const print = $derived(fill ? 1 + Math.min(PRINT_MAX - 1, Math.max(0, stretch - 1) * 0.5) : 1);
  /** The radii's own bound: the card's fixed height. The 1× print's stack
      over the pivot — arc, major tick, numeral — already spends the card's
      whole budget (PIVOT_Y − FACE_Y = 61 units), and the −3 mark sits
      nearest straight up, so ITS numeral is the one that has to clear the
      card's top edge: with the numerals at their widest (8.5 units) the
      whole stack clears it only to ≈ 1.02× the approved radii (measured,
      D9.9.2). The visible growth of the print is therefore carried by what
      has room — the numerals and the legend — while the arc, the ticks and
      the numeral ring nudge as far as the card allows and no further. */
  const RADIUS_FIT = 1.02;
  const radiusScale = $derived(Math.max(1, Math.min(print, RADIUS_FIT)));
  /** The numerals: 6.6 units at 1× toward 8.5 at the fullest growth (never below 6.6, never over 9). */
  const numeralSize = $derived(6.6 * Math.min(print, 8.5 / 6.6));
  /** The legend: 9 units at 1× toward 11. */
  const legendSize = $derived(9 * Math.min(print, 11 / 9));
  /** The stretched face: the pivot and the window keep to the card's centre
      line; the sweep widens with the card, capped at +24° (±57° — wider
      would read as a tuning meter, not a VU); the radii grow with the
      print (Task 9.9) as far as the card's fixed height allows, never
      crowding it — the print block above carries the bound. */
  const S_PIVOT_X = $derived(PIVOT_X + (SW - W) / 2);
  const S_FACE_W = $derived(FACE_W + (SW - W));
  const S_SWEEP = $derived(VU_SWEEP + Math.min(24, Math.max(0, (stretch - 1) * 18)));
  /** The drawing angle of a dB value on the (possibly widened) sweep. The
      position law is the approved one — linear in modulation, clamped to
      the end stops — only its angular spread widens. */
  const angleOf = (db: number): number => -S_SWEEP / 2 + S_SWEEP * (isGr ? grPosition(db) : vuPosition(db));
  const angle = $derived(angleOf(level));

  /** Point at radius r from the pivot, deg clockwise from straight up. The
      radius arrives in 1× print units and is drawn at the print's grown
      scale (Task 9.9), so the calls keep naming the approved constants. */
  const polar = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    const rr = r * radiusScale;
    return [S_PIVOT_X + rr * Math.sin(a), PIVOT_Y - rr * Math.cos(a)];
  };
  const f = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "");

  /** Arc from one dB value to another at radius r (clockwise, never more
      than the sweep), its curve drawn at the print's grown scale like
      every radius (Task 9.9). */
  const arc = (r: number, fromDb: number, toDb: number): string => {
    const [x0, y0] = polar(r, angleOf(fromDb));
    const [x1, y1] = polar(r, angleOf(toDb));
    const rr = f(r * radiusScale);
    return `M ${f(x0)} ${f(y0)} A ${rr} ${rr} 0 0 1 ${f(x1)} ${f(y1)}`;
  };

  const numeral = (db: number): string => (db < 0 ? `\u2212${-db}` : db > 0 ? `+${db}` : "0");

  const marks = $derived(
    (isGr ? GR_MARKS : VU_MARKS).map((mark) => {
      const a = isGr ? grAngle(mark.db) : vuAngle(mark.db);
      const [x1, y1] = polar(ARC_R, a);
      const [x2, y2] = polar(ARC_R + TICK[mark.weight], a);
      const [nx, ny] = polar(NUMERAL_R, a);
      return {
        ...mark,
        x1,
        y1,
        x2,
        y2,
        nx,
        ny,
        red: !isGr && mark.db > VU_RED_FROM,
        text: isGr ? String(mark.db) : numeral(mark.db),
      };
    }),
  );

  const needlePoints = $derived([
    [S_PIVOT_X - NEEDLE_BASE_W / 2, PIVOT_Y + NEEDLE_TAIL],
    [S_PIVOT_X - NEEDLE_TIP_W / 2, PIVOT_Y - NEEDLE_TIP_R],
    [S_PIVOT_X + NEEDLE_TIP_W / 2, PIVOT_Y - NEEDLE_TIP_R],
    [S_PIVOT_X + NEEDLE_BASE_W / 2, PIVOT_Y + NEEDLE_TAIL],
  ]
    .map(([x, y]) => `${f(x)},${f(y)}`)
    .join(" "));

  /** The pivot as a transform origin, as fractions of the drawing so it survives any scale. */
  const pivotOrigin = $derived(`${f((S_PIVOT_X / SW) * 100)}% ${f((PIVOT_Y / H) * 100)}%`);

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
  style:--vu-angle={`${f(angle)}deg`}
  style:--vu-pivot={pivotOrigin}
  style:--vu-shadow-dx={`${SHADOW_DX}px`}
  style:--vu-shadow-dy={`${SHADOW_DY}px`}
  style:--vu-numeral-size={`${f(numeralSize)}px`}
  style:--vu-legend-size={`${f(legendSize)}px`}
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
             THE PRINT: arc, ticks radiating from the pivot, numerals at
             the key points, the red overload band, "VU".
             ============================================================== -->
        <g class="vu__scale" data-part="scale">
          <path class="vu__arc" d={arc(ARC_R, VU_MIN, VU_MAX)} />
          {#if !isGr}
            <path
              class="vu__arc-red"
              data-part="red-band"
              d={arc(ARC_R + 0.35 + RED_BAND_W / 2, VU_RED_FROM, VU_MAX)}
              style:stroke-width={RED_BAND_W}
            />
          {/if}
          {#each marks as mark (mark.db)}
            <line
              class={`vu__tick is-${mark.weight}`}
              class:is-red={mark.red}
              x1={f(mark.x1)}
              y1={f(mark.y1)}
              x2={f(mark.x2)}
              y2={f(mark.y2)}
            />
          {/each}
          {#each marks.filter((m) => m.numeral) as mark (mark.db)}
            <text class="vu__numeral" class:is-red={mark.red} x={f(mark.nx)} y={f(mark.ny)}>{mark.text}</text>
          {/each}
          <text class="vu__legend" data-part="legend" x={S_PIVOT_X} y={PIVOT_Y - 15.5}>{isGr ? "GR" : "VU"}</text>
        </g>

        <!-- ==============================================================
             THE NEEDLE: its shadow on the card, then the blade, both
             rotating about the pivot; the hub on top.
             ============================================================== -->
        <g class="vu__needle-shadow" data-part="needle-shadow">
          <polygon points={needlePoints} filter={`url(#${uid}-needle-shadow)`} />
        </g>
        <g class="vu__needle" data-part="needle">
          <polygon points={needlePoints} />
        </g>
        <circle class="vu__hub-shadow" cx={S_PIVOT_X + 0.8} cy={PIVOT_Y + 1.1} r={HUB_R} />
        <circle class="vu__hub" data-part="hub" cx={S_PIVOT_X} cy={PIVOT_Y} r={HUB_R} />
        <circle class="vu__hub-pin" cx={S_PIVOT_X} cy={PIVOT_Y} r="1.1" />

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
    /* 6.6 units at 1×; the fill mode grows it toward 8.5 with the card
       (Task 9.9, D9.9.2) — the var written by the instance, the approved
       size the fallback. */
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
    /* 9 units at 1×; the fill mode grows it toward 11 with the card
       (Task 9.9, D9.9.2). */
    font-size: var(--vu-legend-size, 9px);
    font-weight: var(--al-font-weight-black);
    letter-spacing: 0.1em;
    text-anchor: middle;
    dominant-baseline: central;
  }

  /* --- needle ------------------------------------------------------------- */

  /* Both rotate about the pivot. The origin is given as fractions of the
     drawing, resolved against the viewBox, so it holds at any --vu-width. The
     swing is a VU meter's: a 360 ms rise that overshoots a hair and settles. */
  .vu__needle,
  .vu__needle-shadow {
    transform-box: view-box;
    transform-origin: var(--vu-pivot);
    transform: rotate(var(--vu-angle));
    transition: transform 360ms cubic-bezier(0.22, 1.16, 0.4, 1);
  }

  .vu__needle-shadow {
    transform: translate(var(--vu-shadow-dx), var(--vu-shadow-dy)) rotate(var(--vu-angle));
  }

  .vu__needle polygon {
    fill: var(--v-needle);
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

    .vu__needle,
    .vu__needle-shadow {
      transition: transform 120ms ease-out;
    }

    .vu__lamp {
      transition: none;
    }
  }
</style>
