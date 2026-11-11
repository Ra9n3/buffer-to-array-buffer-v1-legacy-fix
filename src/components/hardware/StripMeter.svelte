<script module lang="ts">
  /**
   * The strip meter's compact scale, bottom to top: twelve segments, eight
   * green through −6, three amber through −1, one red at 0 — the same band
   * philosophy as the ladder's sixteen (hardware spec §4b), thinned for the
   * narrow column beside a fader. Demonstration scale only — plan §9 defers
   * every numeric audio value to listening tests.
   */
  export const STRIP_METER_SCALE: readonly { readonly db: number; readonly band: "green" | "amber" | "red" }[] = [
    { db: -40, band: "green" },
    { db: -34, band: "green" },
    { db: -28, band: "green" },
    { db: -22, band: "green" },
    { db: -17, band: "green" },
    { db: -13, band: "green" },
    { db: -9, band: "green" },
    { db: -6, band: "green" },
    { db: -4, band: "amber" },
    { db: -2, band: "amber" },
    { db: -1, band: "amber" },
    { db: 0, band: "red" },
  ];

  /** How many segments a level lights: every threshold reached, counted from
   *  the bottom — the lit run is contiguous, never a lone segment. */
  export function stripMeterLit(segments: readonly { readonly db: number }[], level: number): number {
    let lit = 0;
    while (lit < segments.length && level >= segments[lit].db) lit += 1;
    return lit;
  }
</script>
<script lang="ts">
  /**
   * ALLOY strip level meter — Task 9.5 (hardware spec §4b's third meter).
   *
   * The channel strip's own meter: a thin column of discrete LED segments
   * standing beside the fader, as on the owner's reference console. It shares
   * the ladder's language — discrete blocks lit cumulatively from the bottom,
   * green then amber then red — drawn in CSS rather than SVG for one reason:
   * the column stretches with the fader section it stands in, and segments
   * that flex are the only way a fixed drawing can grow. The look is the
   * ladder's: a recessed well, hard-edged lenses, a hairline top highlight,
   * the die's own tint when unlit.
   *
   * The top segment is also the strip's PEAK indicator: while `peak` is true
   * it stays lit whatever `level` reads — one red lens doing the job the old
   * footer lamp did, on the line the eye is already watching.
   *
   * Nothing here measures anything: `level` and `peak` are whatever the host
   * passes in (fixture data in the Console, SIMULATED).
   */
  let {
    /** Reading in dB. Below the first threshold nothing is lit. */
    level = -60,
    /** Peak latch: keeps the top segment lit while true. */
    peak = false,
    /** Accessible name — the host names the channel and says it is simulated. */
    name,
  }: {
    level?: number;
    peak?: boolean;
    name: string;
  } = $props();

  const lit = $derived(stripMeterLit(STRIP_METER_SCALE, level));
  /* The scale is written bottom to top; the column renders top to bottom. */
  const column = $derived([...STRIP_METER_SCALE].reverse());
  const topIndex = $derived(column.length - 1);
</script>

<div
  class="meter"
  class:meter--peak={peak}
  data-strip-meter
  data-meter-peak={peak || undefined}
  role="img"
  aria-label={name}
>
  <div class="meter__well" aria-hidden="true">
    {#each column as segment, i (segment.db)}
      <span
        class="meter__segment"
        class:meter__segment--lit={i === topIndex ? peak || lit === column.length : i >= column.length - lit}
        data-meter-segment={segment.band}
      ></span>
    {/each}
  </div>
</div>

<style>
  /* The whole column is sized by the host: --meter-width sets the width
     (0.75rem = 12 px = 1×), the height is whatever the fader section gives
     it — the meter stretches with the strip, the way a console's meter
     bridge column spans its fader. */
  .meter {
    --m-width: var(--meter-width, 0.75rem);
    --m-green: var(--al-function-green-hi);
    --m-amber: var(--al-function-amber-hi);
    --m-red: var(--al-function-red-hi);

    display: flex;
    flex: 0 0 auto;
    width: var(--m-width);
    min-width: 0;
    align-self: stretch;
    user-select: none;
    -webkit-user-select: none;
  }

  /* The recessed well: the sends bay's recipe — a darker floor under a
     subtle border, shadowed lip, one flat highlight below it. */
  .meter__well {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    min-height: 0;
    padding: 2px;
    border-radius: 2px;
    background-color: color-mix(in srgb, var(--al-material-recess) 72%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* One lens: a hard-edged block. Unlit, it is the die's own tint deep in
     the recess; lit, it is its band's colour, brightest along its upper
     half — the ladder's lighting, in CSS. */
  .meter__segment {
    flex: 1 1 0;
    min-height: 3px;
    border-radius: 1px;
  }

  .meter__segment[data-meter-segment="green"] {
    background-color: color-mix(in srgb, var(--m-green) 20%, var(--al-material-recess));
  }

  .meter__segment[data-meter-segment="amber"] {
    background-color: color-mix(in srgb, var(--m-amber) 20%, var(--al-material-recess));
  }

  .meter__segment[data-meter-segment="red"] {
    background-color: color-mix(in srgb, var(--m-red) 20%, var(--al-material-recess));
  }

  .meter__segment--lit[data-meter-segment="green"] {
    background-color: var(--m-green);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 3px color-mix(in srgb, var(--m-green) 45%, transparent);
  }

  .meter__segment--lit[data-meter-segment="amber"] {
    background-color: var(--m-amber);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 3px color-mix(in srgb, var(--m-amber) 45%, transparent);
  }

  .meter__segment--lit[data-meter-segment="red"] {
    background-color: var(--m-red);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 3px color-mix(in srgb, var(--m-red) 45%, transparent);
  }
</style>
