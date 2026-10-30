<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across ladders. */
  let nextId = 0;

  /** The three colour bands of hardware spec §4b, bottom to top. */
  export type LedBand = "green" | "amber" | "red";

  /** One segment: it lights when the level reaches `db`. */
  export interface LedSegment {
    readonly db: number;
    readonly band: LedBand;
    /** Printed beside the ladder at the key points only. */
    readonly numeral?: boolean;
  }

  /**
   * The default ladder, bottom to top: sixteen segments, nine green through
   * −6, four amber through −1, three red from 0. Demonstration scale only —
   * plan §9 defers every numeric audio value to listening tests.
   */
  export const LED_LADDER_SCALE: readonly LedSegment[] = [
    { db: -40, band: "green", numeral: true },
    { db: -30, band: "green" },
    { db: -24, band: "green" },
    { db: -20, band: "green", numeral: true },
    { db: -16, band: "green" },
    { db: -13, band: "green" },
    { db: -10, band: "green", numeral: true },
    { db: -8, band: "green" },
    { db: -6, band: "green", numeral: true },
    { db: -4, band: "amber" },
    { db: -3, band: "amber", numeral: true },
    { db: -2, band: "amber" },
    { db: -1, band: "amber" },
    { db: 0, band: "red", numeral: true },
    { db: 2, band: "red" },
    { db: 4, band: "red", numeral: true },
  ];

  /**
   * How many segments a level lights: every segment whose threshold the
   * level has reached, counted from the bottom — so the lit run is always
   * contiguous from the bottom up, never a segment on its own.
   */
  export function ledLitCount(segments: readonly LedSegment[], level: number): number {
    const sorted = [...segments].sort((a, b) => a.db - b.db);
    let lit = 0;
    while (lit < sorted.length && level >= sorted[lit].db) lit += 1;
    return lit;
  }
</script>
<script lang="ts">
  /**
   * ALLOY LED segment ladder — Task 1.5, hardware spec §4b.
   *
   * The other meter: a column of discrete, crisply edged blocks that light
   * cumulatively from the bottom, green then amber then red. Drawn as one SVG
   * at 1 px = 1 unit and scaled as a whole by `--ladder-width` (3rem = 48 px
   * = 1×). It shares nothing with the VU meter but the panel it sits on:
   * no blur wider than a block's own faint bloom, no cream, no warm wash —
   * this look is for a secondary peak ladder and nowhere else (spec §4b).
   *
   *   THE WELL      a recessed slot in the panel, dark floor, shadowed lip.
   *   THE SEGMENTS  each a small lens: a hard-edged block with a thin dark
   *                 seam and a hairline highlight on its top edge. Unlit, it
   *                 is the die's own tint deep in the recess — visibly a
   *                 segment, visibly not lit. Lit, it is the band's family
   *                 from the Task 1.1 tokens, brightest along its upper
   *                 half, with a tight 1.7-unit bloom behind it that never
   *                 softens the edge.
   *   THE PRINT     dB numerals on the panel beside the key segments, the
   *                 fader's convention, so the relation between the level
   *                 and the lit count is readable.
   *
   * Nothing here measures anything: `level` is whatever the host passes in.
   */
  let {
    /** Engraved under the ladder. Optional. */
    label = null,
    /** Reading in dB. Below the first threshold nothing is lit. */
    level = -60,
    /** Bottom-to-top thresholds and bands. */
    segments = LED_LADDER_SCALE,
    /** Accessible name when `label` is absent or too terse. */
    name = null,
  }: {
    label?: string | null;
    level?: number;
    segments?: readonly LedSegment[];
    name?: string | null;
  } = $props();
  const uid = `led${++nextId}`;

  /* --- geometry, in 1x pixels -------------------------------------------- */
  const SEG_W = 16;
  const SEG_H = 5;
  const SEG_GAP = 2.5;
  const PITCH = SEG_H + SEG_GAP;
  const SEG_RX = 0.6;
  /** The well round the column. */
  const WELL_X = 4;
  const WELL_Y = 4;
  const WELL_PAD = 3;
  const WELL_W = SEG_W + 2 * WELL_PAD;
  /** The print beside it. */
  const TICK_X1 = WELL_X + WELL_W + 1.5;
  const TICK_X2 = TICK_X1 + 1.8;
  /** Clear of the tick, so a minus sign never reads as part of it. */
  const NUMERAL_X = TICK_X2 + 3;
  const W = 48;

  const f = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "");

  const ordered = $derived([...segments].sort((a, b) => a.db - b.db));
  const count = $derived(ordered.length);
  const WELL_H = $derived(count * PITCH - SEG_GAP + 2 * WELL_PAD);
  const H = $derived(WELL_Y + WELL_H + WELL_Y);

  const lit = $derived(ledLitCount(ordered, level));

  const rows = $derived(
    ordered.map((segment, i) => ({
      ...segment,
      i,
      y: WELL_Y + WELL_PAD + (count - 1 - i) * PITCH,
      lit: i < lit,
    })),
  );

  const litByBand = $derived({
    green: rows.filter((r) => r.lit && r.band === "green").length,
    amber: rows.filter((r) => r.lit && r.band === "amber").length,
    red: rows.filter((r) => r.lit && r.band === "red").length,
  });
  /** The band of the topmost lit segment — the ladder's colour at a glance. */
  const topBand = $derived(lit > 0 ? rows[lit - 1].band : "none");

  const numeral = (db: number): string => (db < 0 ? `\u2212${-db}` : db > 0 ? `+${db}` : "0");
  /** The printed scale is unsigned — tick, number — by owner direction (review round 1);
   *  the sign lives in the spoken value and the fixture captions, not on the panel. */
  const printed = (db: number): string => String(Math.abs(db));

  const min = $derived(ordered[0]?.db ?? 0);
  const max = $derived(ordered[count - 1]?.db ?? 0);
  const valueNow = $derived(Math.min(max, Math.max(min, level)));
  const valueText = $derived(
    `${level < min ? `below ${numeral(min)}` : numeral(Math.round(level))} dB, ${lit} of ${count} segments lit${
      topBand === "none" ? "" : `, ${topBand}`
    }`,
  );
</script>
<div
  class="led"
  data-led
  data-led-level={f(level)}
  data-led-lit={lit}
  data-led-count={count}
  data-led-top-band={topBand}
  data-led-lit-green={litByBand.green}
  data-led-lit-amber={litByBand.amber}
  data-led-lit-red={litByBand.red}
>
  <div
    class="led__column"
    role="meter"
    aria-label={name ?? label ?? "Level"}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={valueNow}
    aria-valuetext={valueText}
    data-led-meter
  >
    <svg class="led__surface" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <!-- A lit block: the band's HI tone along the upper half, settling
             to its BASE below — a lens over a die, not a flat fill. -->
        {#each ["green", "amber", "red"] as band (band)}
          <linearGradient id={`${uid}-lit-${band}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={`stop-color: var(--l-${band}-top)`} />
            <stop offset="45%" style={`stop-color: var(--l-${band}-mid)`} />
            <stop offset="100%" style={`stop-color: var(--l-${band}-bottom)`} />
          </linearGradient>
        {/each}
        <!-- The bloom behind a lit block: tight, so the edge stays crisp. -->
        <filter id={`${uid}-bloom`} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="1.7" />
        </filter>
        <clipPath id={`${uid}-well-clip`}>
          <rect x={WELL_X} y={WELL_Y} width={WELL_W} height={WELL_H} rx="1.5" />
        </clipPath>
      </defs>

      <!-- The well: a dark lip at the top-left, the floor, a lit lower edge. -->
      <g class="led__well" data-part="well">
        <rect class="led__well-lip-light" x={WELL_X - 1} y={WELL_Y} width={WELL_W + 2} height={WELL_H + 1.5} rx="2.5" />
        <rect class="led__well-lip-dark" x={WELL_X - 1} y={WELL_Y - 1} width={WELL_W + 2} height={WELL_H + 1.5} rx="2.5" />
        <rect class="led__well-floor" x={WELL_X} y={WELL_Y} width={WELL_W} height={WELL_H} rx="1.5" />
        <g clip-path={`url(#${uid}-well-clip)`}>
          <rect class="led__well-inner" x={WELL_X - 1.5} y={WELL_Y - 1.5} width={WELL_W + 3} height={WELL_H + 3} rx="3" />
        </g>
      </g>

      <!-- The segments, bottom to top. -->
      <g class="led__segments" data-part="segments">
        {#each rows as row (row.i)}
          <g
            class={`led__segment led__segment--${row.band}`}
            class:is-lit={row.lit}
            data-part="segment"
            data-led-band={row.band}
            data-led-segment-lit={row.lit}
            data-led-db={row.db}
          >
            <rect
              class="led__bloom"
              x={WELL_X + WELL_PAD}
              y={f(row.y)}
              width={SEG_W}
              height={SEG_H}
              rx={SEG_RX}
              filter={`url(#${uid}-bloom)`}
            />
            <rect
              class="led__die"
              data-part="die"
              x={WELL_X + WELL_PAD}
              y={f(row.y)}
              width={SEG_W}
              height={SEG_H}
              rx={SEG_RX}
              fill={row.lit ? `url(#${uid}-lit-${row.band})` : `var(--l-${row.band}-off)`}
            />
            <rect
              class="led__lens"
              x={WELL_X + WELL_PAD + 0.8}
              y={f(row.y + 0.5)}
              width={SEG_W - 1.6}
              height="1.1"
              rx="0.4"
            />
          </g>
        {/each}
      </g>

      <!-- The print on the panel: a tick and a numeral at the key segments. -->
      <g class="led__print" data-part="print">
        {#each rows.filter((r) => r.numeral) as row (row.i)}
          <line x1={TICK_X1} y1={f(row.y + SEG_H / 2)} x2={TICK_X2} y2={f(row.y + SEG_H / 2)} />
          <text class="led__numeral" x={NUMERAL_X} y={f(row.y + SEG_H / 2)}>{printed(row.db)}</text>
        {/each}
      </g>
    </svg>
  </div>

  {#if label}
    <p class="led__label">{label}</p>
  {/if}
</div>

<style>
  .led {
    /* The whole drawing scales from one width, `--ladder-width`, set by the
       host; 3rem = 48px = 1x. Read here, not declared. */

    /* --- the three bands, from the functional families -------------------- */
    --l-green-top: color-mix(in srgb, var(--al-function-green-hi) 70%, var(--al-function-green-base));
    --l-green-mid: color-mix(in srgb, var(--al-function-green-hi) 22%, var(--al-function-green-base));
    --l-green-bottom: color-mix(in srgb, var(--al-function-green-base) 78%, var(--al-function-green-lo));
    --l-green-off: color-mix(in srgb, var(--al-function-green-lo) 30%, var(--al-material-recess));
    --l-green-glow: var(--al-function-green-base);

    --l-amber-top: color-mix(in srgb, var(--al-function-amber-hi) 70%, var(--al-function-amber-base));
    --l-amber-mid: color-mix(in srgb, var(--al-function-amber-hi) 22%, var(--al-function-amber-base));
    --l-amber-bottom: color-mix(in srgb, var(--al-function-amber-base) 78%, var(--al-function-amber-lo));
    --l-amber-off: color-mix(in srgb, var(--al-function-amber-lo) 30%, var(--al-material-recess));
    --l-amber-glow: var(--al-function-amber-base);

    --l-red-top: color-mix(in srgb, var(--al-function-red-hi) 70%, var(--al-function-red-base));
    --l-red-mid: color-mix(in srgb, var(--al-function-red-hi) 22%, var(--al-function-red-base));
    --l-red-bottom: color-mix(in srgb, var(--al-function-red-base) 78%, var(--al-function-red-lo));
    --l-red-off: color-mix(in srgb, var(--al-function-red-lo) 30%, var(--al-material-recess));
    --l-red-glow: var(--al-function-red-base);

    /* --- the recess ------------------------------------------------------- */
    --l-floor: var(--al-material-recess);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .led__column {
    display: block;
    width: var(--ladder-width, 3rem);
    min-width: 0;
  }

  .led__surface {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  /* --- well — the fader slot's construction ------------------------------- */

  .led__well-lip-light {
    fill: var(--al-bevel-light);
    fill-opacity: 0.5;
  }

  .led__well-lip-dark {
    fill: var(--al-bevel-shadow);
  }

  .led__well-floor {
    fill: var(--l-floor);
  }

  .led__well-inner {
    fill: none;
    stroke: #000;
    stroke-width: 3;
    stroke-opacity: 0.75;
    transform: translate(0.6px, 1px);
  }

  /* --- segments ----------------------------------------------------------- */

  /* Every block has a hard dark seam round it, lit or not: the segments stay
     individually distinguishable at every level. */
  .led__die {
    stroke: #000;
    stroke-width: 0.5;
    stroke-opacity: 0.6;
  }

  .led__lens {
    fill: #fff;
    fill-opacity: 0.05;
    transition: fill-opacity 60ms linear;
  }

  .led__segment.is-lit .led__lens {
    fill-opacity: 0.22;
  }

  /* An LED is instant: the bloom appears with the block, no ballistics. */
  .led__bloom {
    opacity: 0;
    transition: opacity 60ms linear;
  }

  .led__segment.is-lit .led__bloom {
    opacity: 0.75;
  }

  .led__segment--green .led__bloom {
    fill: var(--l-green-glow);
  }

  .led__segment--amber .led__bloom {
    fill: var(--l-amber-glow);
  }

  .led__segment--red .led__bloom {
    fill: var(--l-red-glow);
  }

  /* --- print — the fader's numerals, verbatim ----------------------------- */

  .led__print line {
    stroke: var(--al-material-metal);
    stroke-width: 0.9;
    stroke-opacity: 0.8;
    stroke-linecap: round;
  }

  .led__numeral {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 6.4px;
    font-variant-numeric: tabular-nums;
    text-anchor: start;
    dominant-baseline: central;
  }

  /* --- label — the knob's and fader's conventions, verbatim --------------- */

  .led__label {
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
    .led__bloom,
    .led__lens {
      transition: none;
    }
  }
</style>
