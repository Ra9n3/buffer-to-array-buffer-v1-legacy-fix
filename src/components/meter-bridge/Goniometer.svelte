<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide between scopes. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY stereo goniometer — Task 2.1 (provisional treatment, decisions-log
   * D2.1.4), the scope alone since Task 9.7 (D9.7.2).
   *
   * One instrument, one plate, and nothing printed on it: the scope. The
   * correlation STRIP that shared this plate until 9.6 read the same
   * fixture value the row's needle correlation meter reads — the owner
   * asked for the phase meter's removal, and the duplicate is the one that
   * went ("first remove the phase meter"). The needle meter third from the
   * left is the row's one correlation reading now.
   *
   *   THE SCOPE    a dark recessed window — the recess token behind a thin
   *                metal frame, a shadowed lip, a weak glass sheen — with a
   *                faint engraved graticule (the L and R diagonals, a ring, a
   *                centre pin) and one representative Lissajous trace drawn
   *                three times over itself: a wide blurred bloom, a soft body
   *                and a thin hot core, all from the lamp / amber family, so
   *                it reads as a warm phosphor behind glass and never as a
   *                cold green VFD (plan §4).
   *
   * Nothing here measures anything: the trace is a fixed set of fixture
   * points (bridge-fixtures).
   */
  import {
    GONIOMETER_TRACE,
    SIMULATED,
    type GoniometerPoint,
  } from "./bridge-fixtures";

  let {
    /** The trace, in goniometer space (x = side, y = mid, −1 … +1). Fixture by default. */
    trace = GONIOMETER_TRACE,
  }: {
    trace?: readonly GoniometerPoint[];
  } = $props();
  const uid = `gonio${++nextId}`;

  /* --- the scope's geometry, in 1x units (the window is 100 × 100) -------- */
  const SIZE = 100;
  const CENTRE = SIZE / 2;
  /** The graticule ring and the trace's full-scale radius. */
  const RING_R = 42;
  const TRACE_SCALE = 34;
  const AXIS_IN = 11;

  const f = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "");

  const points = $derived(
    trace.map(([x, y]) => `${f(CENTRE + x * TRACE_SCALE)},${f(CENTRE - y * TRACE_SCALE)}`).join(" "),
  );
</script>

<div class="gonio" data-goniometer data-simulated={SIMULATED}>
  <!-- The scope. Static artwork: a representative trace, so an image role
       with a spoken description rather than a live meter. -->
  <div class="gonio__scope" role="img" aria-label={`Goniometer, ${SIMULATED} trace: a mostly upright stereo figure`} data-goniometer-scope>
    <svg class="gonio__surface" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-floor`} cx="50%" cy="48%" r="68%">
          <stop offset="0%" style="stop-color: var(--g-floor-centre)" />
          <stop offset="100%" style="stop-color: var(--g-floor-edge)" />
        </radialGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stop-color="white" stop-opacity="0.075" />
          <stop offset="42%" stop-color="white" stop-opacity="0.012" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <filter id={`${uid}-bloom`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          <rect x="0" y="0" width={SIZE} height={SIZE} rx="2.5" />
        </clipPath>
      </defs>

      <g clip-path={`url(#${uid}-clip)`}>
        <!-- the floor of the recess, faintly lifted at the centre -->
        <rect class="gonio__floor" x="0" y="0" width={SIZE} height={SIZE} fill={`url(#${uid}-floor)`} />

        <!-- the graticule: L and R diagonals, the ring, the centre pin -->
        <g class="gonio__graticule" data-part="graticule">
          <circle cx={CENTRE} cy={CENTRE} r={RING_R} />
          <path d={`M ${AXIS_IN} ${AXIS_IN} L ${SIZE - AXIS_IN} ${SIZE - AXIS_IN} M ${SIZE - AXIS_IN} ${AXIS_IN} L ${AXIS_IN} ${SIZE - AXIS_IN}`} />
          <circle class="gonio__pin" cx={CENTRE} cy={CENTRE} r="0.9" />
          <text class="gonio__axis" x={AXIS_IN - 3} y="9.5">L</text>
          <text class="gonio__axis" x={SIZE - AXIS_IN + 3} y="9.5">R</text>
        </g>

        <!-- the trace: bloom, body, core -->
        <g class="gonio__trace" data-part="trace">
          <polyline class="gonio__trace-bloom" {points} filter={`url(#${uid}-bloom)`} />
          <polyline class="gonio__trace-body" {points} />
          <polyline class="gonio__trace-core" {points} />
        </g>

        <!-- the glass over it -->
        <rect class="gonio__glass" x="0" y="0" width={SIZE} height={SIZE} fill={`url(#${uid}-glass)`} />
      </g>
    </svg>
  </div>
</div>

<style>
  .gonio {
    /* The instrument is host-sized, the VU's pattern (Task 9.6, D9.6.3): the
       scope's edge is read with its 1× fallback at the USE SITE, never
       declared here, so a host's value always wins — the bridge drives the
       instrument from one height. Since Task 9.7 (D9.7.2) the scope is the
       whole instrument: it centres in the host's box. */

    /* --- materials, from the tokens -------------------------------------- */
    --g-floor-centre: color-mix(in srgb, var(--al-material-recess) 84%, var(--al-material-surface));
    --g-floor-edge: color-mix(in srgb, var(--al-material-recess) 92%, black);
    --g-frame: var(--al-material-metal-shadow);
    --g-graticule: var(--al-material-metal);
    --g-trace: var(--al-material-lamp);
    --g-trace-core: var(--al-function-amber-hi);

    display: flex;
    justify-content: center;
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the scope window ----------------------------------------------------- */
  .gonio__scope {
    flex: 0 0 auto;
    width: var(--gonio-size, 6.25rem); /* 100 px = 1× */
    height: var(--gonio-size, 6.25rem);
    padding: 1px;
    border-radius: 3.5px;
    /* a thin metal frame round a recess: the frame's top edge lit, its
       bottom edge in shadow, the recess lip shadowing down onto the floor */
    background: linear-gradient(180deg, var(--al-material-metal) 0%, var(--g-frame) 50%, var(--al-bevel-shadow) 100%);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .gonio__surface {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 2.5px;
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.8),
      inset 0 0 0 1px var(--al-border-strong);
  }

  .gonio__graticule circle,
  .gonio__graticule path {
    fill: none;
    stroke: var(--g-graticule);
    stroke-width: 0.5;
    stroke-opacity: 0.2;
  }

  .gonio__graticule .gonio__pin {
    fill: var(--g-graticule);
    fill-opacity: 0.45;
    stroke: none;
  }

  .gonio__axis {
    fill: var(--g-graticule);
    fill-opacity: 0.62;
    font-family: var(--al-font-label);
    font-size: 6.5px;
    font-weight: var(--al-font-weight-bold);
    text-anchor: middle;
  }

  .gonio__trace polyline {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .gonio__trace-bloom {
    stroke: var(--g-trace);
    stroke-width: 3.4;
    stroke-opacity: 0.26;
  }

  .gonio__trace-body {
    stroke: var(--g-trace);
    stroke-width: 1.25;
    stroke-opacity: 0.66;
  }

  .gonio__trace-core {
    stroke: var(--g-trace-core);
    stroke-width: 0.5;
    stroke-opacity: 0.92;
  }
</style>
