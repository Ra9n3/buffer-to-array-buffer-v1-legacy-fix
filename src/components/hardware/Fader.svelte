<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across faders. */
  let nextId = 0;

  /** One breakpoint of a taper: this value sits at this fraction of the travel (0 = bottom, 1 = top). */
  export type TaperPoint = readonly [value: number, position: number];

  /**
   * Console audio taper. Unity sits at 73% of the travel, the top decade has
   * the most room, and the bottom of the scale is compressed — the law of a
   * long-throw channel fader. Positions are fractions of a −60 … +10 dB
   * travel; `min`/`max` are mapped through this table and re-normalised, so
   * a narrower range keeps the same law over its own travel.
   *
   * Demo law only: plan §9 defers every numeric audio value to listening
   * tests, and no gain law is agreed. See decisions-log D1.3.1.
   */
  export const CONSOLE_TAPER: readonly TaperPoint[] = [
    [-60, 0],
    [-40, 0.13],
    [-30, 0.225],
    [-20, 0.345],
    [-10, 0.495],
    [-5, 0.61],
    [0, 0.73],
    [5, 0.865],
    [10, 1],
  ];
</script>
<script lang="ts">
  import { tick } from "svelte";
  import { functionToken } from "../../lib/tokens";

  /**
   * ALLOY vertical fader — Task 1.3.
   *
   * One assembly, drawn as one SVG at a 1 px = 1 unit scale and scaled as a
   * whole by `--fader-width`:
   *
   *   PANEL PRINT   numerals and tick marks, printed on the panel plane beside
   *                 the slot. They never move.
   *   THE SLOT      a long recess cut into the panel: dark floor, a soft inner
   *                 shadow under its top-left lip, a lit lower-right lip.
   *   THE CAP       the ribbed console cap the owner supplied as a photo in
   *                 review round 4 (decisions-log D1.3.6): 25 x 32, taller
   *                 than wide, small-radius corners, a bevelled rim all the
   *                 way round, and a shallow concave face moulded with
   *                 horizontal grooves — four above and four below a dark
   *                 indicator line across the middle. This replaces the
   *                 finger-hollow cap of hardware spec §3 by explicit
   *                 direction; the spec's 2.5–3 : 1 proportion and its
   *                 two-lip hollow are not in force for this component.
   *
   * Light is the panel's: one key light from the top-left, the same model the
   * knob was built against. The rim's top edge faces it and is brightest; the
   * concave face's upper half tilts away from it and sits in shade, its lower
   * half tilts toward it and is lit nearly to the HI tone; the grooves are
   * deep in the shaded half and washed out in the lit half; the rim's lower
   * edge rounds away into the cap's front wall. The cap's shadow falls down
   * and to the right onto the panel and into the slot.
   *
   * The cap colour is the cream family — hardware spec §5 puts fader caps with
   * input trim and gain staging, and the owner kept it when offered the
   * photo's neutral grey — and comes from the Task 1.1 tokens. Nothing here
   * carries a colour of its own; neutral black/white alphas model light.
   */

  /** Playground-only visual demonstration. Never set in product code. */
  type DemoState = "dragging" | "focused" | "editing" | null;

  let {
    label,
    min = -60,
    max = 10,
    step = 0.5,
    value = $bindable(0),
    unit = "dB",
    decimals = 1,
    disabled = false,
    /** Value → travel law. `null` = linear. */
    taper = CONSOLE_TAPER as readonly TaperPoint[] | null,
    /** Travel of the cap centre between its two limits, in 1× px. */
    travel = 160,
    /** Linear law only: numeral every this many units. Ignored with a taper. */
    majorEvery = null,
    /** Optional custom readout formatter. Defaults to fixed decimals + unit. */
    format = null,
    /** Playground demonstration of a state that needs a pointer or focus. */
    demoState = null,
  }: {
    label: string;
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    unit?: string;
    decimals?: number;
    disabled?: boolean;
    taper?: readonly TaperPoint[] | null;
    travel?: number;
    majorEvery?: number | null;
    format?: ((value: number) => string) | null;
    demoState?: DemoState;
  } = $props();
  const uid = `fd${++nextId}`;

  /* --- geometry, in 1x pixels ---------------------------------------------
     The drawing is 72 units wide. It fits the 6rem channel strip of the
     Console room with its padding, which is what "compact" means here.

         0        19 21   29     44.5  51.5        66    72
         |numerals |  ticks |      | slot |            |     |
                                 30 ───── cap ───── 66
  ------------------------------------------------------------------------- */
  const W = 72;
  /** Numerals are right-aligned here. */
  const NUM_X = 19;
  const TICK_MAJOR_X1 = 21;
  const TICK_MINOR_X1 = 25;
  const TICK_X2 = 29;
  /** The slot's axis; the cap is centred on it. */
  const SLOT_CX = 48;
  const SLOT_W = 7;

  /**
   * Cap: 25 x 32 — the proportion of the owner's reference photo (round 4,
   * decisions-log D1.3.6), replacing the 25 x 20 of round 3. Taller than
   * wide, outside hardware spec §3's 2.5–3 : 1, by explicit direction; do not
   * "correct" it back without the owner.
   */
  const CAP_W = 25;
  const CAP_H = 32;
  /** Small-radius corners, as in the photo: an eighth of the width. */
  const CAP_RX = 3;
  /** The front wall visible below the rim from the slightly raised viewpoint. */
  const CAP_WALL = 2;
  /** The bevelled rim around the face, lit on top, turning down at the bottom. */
  const CAP_RIM = 1.5;
  const FACE_W = CAP_W - 2 * CAP_RIM;
  const FACE_H = CAP_H - 2 * CAP_RIM;
  const FACE_RX = CAP_RX - CAP_RIM;
  /** The indicator line across the middle of the face: a deep, wide groove. */
  const LINE_H = 2;
  /**
   * The grooves moulded into the face: four each side of the line, 3 px
   * apart, the first 1.5 px clear of the line. Each is a 1.2 px cut whose
   * upper wall faces away from the light (dark) and whose lower wall faces
   * it (a 1 px bright line directly below) — together they take most of the
   * pitch, so the face reads ribbed rather than ruled, as in the photo.
   */
  const RIB_PITCH = 3;
  const RIBS_PER_HALF = 4;
  const RIB_CUT = 1.2;
  const RIB_CREST = 1;
  const grooves: { y: number; upper: boolean }[] = [-1, 1].flatMap((side) =>
    Array.from({ length: RIBS_PER_HALF }, (_, k) => ({
      y: side * (LINE_H / 2 + 1.5 + k * RIB_PITCH),
      upper: side < 0,
    })),
  );

  /**
   * The slot continues this far past the cap at either limit, so the track
   * is visible above AND below the cap even at full travel, and the cap can
   * never reach the slot's end.
   */
  const SLOT_OVER = 7;
  /** Top of the slot; also the room left for the top numeral. */
  const TOP = 8;

  /** Cap centre at the top and bottom limits. */
  const CY_MAX = TOP + SLOT_OVER + CAP_H / 2;
  const CY_MIN = $derived(CY_MAX + travel);
  const SLOT_Y = TOP;
  const SLOT_H = $derived(travel + CAP_H + 2 * SLOT_OVER);
  const H = $derived(SLOT_Y + SLOT_H + TOP);

  /** Focus ring: on the panel, clear of the print, inside the drawing. */
  const FOCUS_X = 32;
  const FOCUS_PAD = 4.5;

  /** The cap's shadow is a fixed offset: down and to the right, always. */
  const SHADOW_DX = 1;
  const SHADOW_DY = 2.5;

  let dragging = $state(false);
  let focused = $state(false);
  let editing = $state(false);
  let invalid = $state(false);
  let draft = $state("");
  let hovered = $state(false);

  let startFraction = 0;
  let startY = 0;
  let pxPerUnit = 1;
  let inputEl = $state<HTMLInputElement | null>(null);
  let trackEl = $state<HTMLDivElement | null>(null);
  let cancelOnBlur = false;

  const precision = $derived(Math.pow(10, decimals));
  const span = $derived(Math.max(max - min, Number.EPSILON));

  /* --- the law: value <-> fraction of travel --------------------------------
     Both directions go through the same breakpoint table, re-normalised to
     [min, max], so the cap sits where the printed scale says it does and a
     drag lands on the value under the pointer. `taper = null` is linear.
  ------------------------------------------------------------------------- */
  const law = $derived.by(() => {
    if (!taper || taper.length < 2) return null;
    return [...taper].sort((a, b) => a[0] - b[0]);
  });

  /** Raw table position of a value, extrapolating past the table's ends. */
  function tablePosition(points: readonly TaperPoint[], v: number): number {
    const last = points.length - 1;
    let i = 0;
    while (i < last - 1 && v > points[i + 1][0]) i += 1;
    const [v0, p0] = points[i];
    const [v1, p1] = points[i + 1];
    return p0 + ((v - v0) / (v1 - v0)) * (p1 - p0);
  }

  /** Raw table value at a position, extrapolating past the table's ends. */
  function tableValue(points: readonly TaperPoint[], p: number): number {
    const last = points.length - 1;
    let i = 0;
    while (i < last - 1 && p > points[i + 1][1]) i += 1;
    const [v0, p0] = points[i];
    const [v1, p1] = points[i + 1];
    return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0);
  }

  function fractionOf(v: number): number {
    const clamped = Math.min(max, Math.max(min, v));
    if (!law) return (clamped - min) / span;
    const lo = tablePosition(law, min);
    const hi = tablePosition(law, max);
    return (tablePosition(law, clamped) - lo) / Math.max(hi - lo, Number.EPSILON);
  }

  function valueAt(f: number): number {
    const clamped = Math.min(1, Math.max(0, f));
    if (!law) return min + clamped * span;
    const lo = tablePosition(law, min);
    const hi = tablePosition(law, max);
    return tableValue(law, lo + clamped * (hi - lo));
  }

  const fraction = $derived(fractionOf(value));
  /** The cap centre, in drawing units. Travel is bottom-up. */
  const capCy = $derived(CY_MIN - fraction * travel);

  const display = $derived(
    format ? format(value) : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`,
  );

  /** The real, computed state. Demo states are reported separately. */
  const faderState = $derived(
    disabled
      ? "disabled"
      : editing
        ? "editing"
        : dragging
          ? "dragging"
          : focused
            ? "focused"
            : "default",
  );

  /**
   * Clamp into range and snap to the step grid — every write goes through
   * here. A FINE write (Shift held) skips the step grid and is limited only by
   * the display precision; otherwise a fine nudge smaller than a step would
   * snap straight back to where it started.
   */
  function setValue(next: number, fine = false): void {
    if (!Number.isFinite(next)) return;

    const clamped = Math.min(max, Math.max(min, next));
    const snapped = !fine && step > 0 ? Math.round(clamped / step) * step : clamped;
    value = Math.round(Math.min(max, Math.max(min, snapped)) * precision) / precision;
  }

  /** Shift-step: one tenth of a step, but never finer than the display can show. */
  const fineStep = $derived(Math.max(step / 10, 1 / precision));

  function nudge(delta: number, fine = false): void {
    setValue(value + delta, fine);
  }

  /* --- pointer drag --------------------------------------------------------
     Relative, one to one with the travel: the cap moves exactly as far as the
     pointer does, so a cap grabbed under the finger stays under it, and a
     press on the slot beside the cap moves the cap from where it is rather
     than jumping it — the way a real fader behaves. Shift slows it to 0.2x.
  ------------------------------------------------------------------------- */

  function onPointerDown(event: PointerEvent): void {
    if (disabled || editing || event.button !== 0) return;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    dragging = true;
    startFraction = fraction;
    startY = event.clientY;
    pxPerUnit = trackEl ? trackEl.getBoundingClientRect().height / H : 1;
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;

    const sensitivity = event.shiftKey ? 0.2 : 1;
    const moved = ((startY - event.clientY) / (travel * pxPerUnit)) * sensitivity;
    setValue(valueAt(startFraction + moved), event.shiftKey);
  }

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;

    dragging = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  /* --- keyboard --------------------------------------------------------- */

  function onKeyDown(event: KeyboardEvent): void {
    if (disabled) return;

    const fine = event.shiftKey;
    const stepSize = fine ? fineStep : step;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nudge(stepSize, fine);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nudge(-stepSize, fine);
        break;
      case "PageUp":
        nudge(step * 10);
        break;
      case "PageDown":
        nudge(-step * 10);
        break;
      case "Home":
        setValue(min);
        break;
      case "End":
        setValue(max);
        break;
      case "Enter":
      case "F2":
        openEditor();
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  /* --- numeric entry ---------------------------------------------------- */

  async function openEditor(): Promise<void> {
    if (disabled) return;

    invalid = false;
    draft = value.toFixed(decimals);
    editing = true;

    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function closeEditor(): void {
    editing = false;
    invalid = false;
  }

  /** "" or a non-number is rejected; out-of-range numbers clamp. */
  function parseDraft(raw: string): number | null {
    const cleaned = raw.replace(unit, "").replace("\u2212", "-").trim();
    if (cleaned === "") return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function commitFromInput(): void {
    const parsed = parseDraft(draft);

    if (parsed === null) {
      invalid = true;
      return;
    }

    setValue(parsed);
    closeEditor();
  }

  function onInputKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitFromInput();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelOnBlur = true;
      closeEditor();
    }
  }

  function onInputBlur(): void {
    if (!editing) return;
    if (cancelOnBlur) {
      cancelOnBlur = false;
      return;
    }
    commitFromInput();
  }

  $effect(() => {
    if (demoState === "editing") void openEditor();
  });

  /* --- panel print -----------------------------------------------------------
     Majors are the law's own breakpoints (the printed marks of a console
     scale), each with a numeral; one minor sits halfway between neighbours.
     With a linear law, majors fall every `majorEvery` units plus both ends.
     The print is stationary: it is drawn outside the moving group.
  ------------------------------------------------------------------------- */
  /** Bipolar scales print their sign (+10 / −10); unipolar ones do not. */
  const numeral = (v: number): string =>
    v < 0 ? `\u2212${trim(-v)}` : v > 0 && min < 0 ? `+${trim(v)}` : trim(v);
  const trim = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  /** Two numerals closer than this (in 1x px) would touch; the end wins. */
  const NUMERAL_CLEARANCE = 9;

  const majors = $derived.by((): number[] => {
    let inner: number[];
    if (law) {
      inner = law.map((p) => p[0]).filter((v) => v > min && v < max);
    } else {
      const every = majorEvery ?? span / 5;
      inner = [];
      for (let v = Math.ceil(min / every) * every; v < max; v += every) {
        if (v > min) inner.push(Math.round(v * precision) / precision);
      }
    }
    // The ends are always printed; an inner mark that would collide with one
    // (a +5 under a +6 ceiling, say) gives way to it.
    const clear = (v: number): boolean =>
      Math.abs(fractionOf(v) - 0) * travel >= NUMERAL_CLEARANCE &&
      Math.abs(1 - fractionOf(v)) * travel >= NUMERAL_CLEARANCE;
    return [...new Set([min, ...inner.filter(clear), max])].sort((a, b) => a - b);
  });

  const majorMarks = $derived(
    majors.map((v) => ({ v, y: CY_MIN - fractionOf(v) * travel, text: numeral(v) })),
  );

  const minorMarks = $derived.by(() => {
    const out: { y: number }[] = [];
    for (let i = 0; i < majors.length - 1; i += 1) {
      const mid = (majors[i] + majors[i + 1]) / 2;
      out.push({ y: CY_MIN - fractionOf(mid) * travel });
    }
    return out;
  });

  /** Unity, if the range includes it: printed stronger, like the knob's reference. */
  const referenceY = $derived(min < 0 && max > 0 ? CY_MIN - fractionOf(0) * travel : null);
</script>
<div
  class="fader"
  class:is-disabled={disabled}
  class:is-dragging={dragging || demoState === "dragging"}
  class:is-hovered={hovered}
  class:is-demo-focus={demoState === "focused"}
  style:--cap-hi={functionToken("cream", "hi")}
  style:--cap-base={functionToken("cream", "base")}
  style:--cap-lo={functionToken("cream", "lo")}
  style:--f-shadow-dx={`${SHADOW_DX}px`}
  style:--f-shadow-dy={`${SHADOW_DY}px`}
  data-fader
  data-fader-state={faderState}
>
  <div
    class="fader__track"
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={display}
    aria-disabled={disabled}
    aria-orientation="vertical"
    data-fader-track
    bind:this={trackEl}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onpointerenter={() => (hovered = true)}
    onpointerleave={() => (hovered = false)}
    onkeydown={onKeyDown}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    ondblclick={openEditor}
  >
    <svg class="fader__surface" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <!-- ==============================================================
             THE CAP'S FACE — the owner's photo, round 4 (D1.3.6).
             A shallow concave face between a bevelled rim, with the light
             model written into one vertical gradient:

               0–10%   under the rim's top edge the face tilts away from
                       the top-left light: a quick fall into shade.
              10–46%   the upper half, held in shade. The grooves cut here
                       read deep.
                 46–54 the indicator line (drawn as its own rect, below).
              54–75%   the lower half tilts back toward the light and
                       climbs through the BASE tone…
              75–93%   …to very nearly the HI tone: the brightest part of
                       the face, as in the photo. The grooves here are
                       washed out by the light.
             93–100%   the front edge rounds away toward the rim and the
                       front wall.

             The cream tokens are the only colours; black and white alphas
             are light.
             ============================================================== -->
        <linearGradient id={`${uid}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--f-face-shoulder)" />
          <stop offset="10%" style="stop-color: var(--f-face-upper)" />
          <stop offset="46%" style="stop-color: var(--f-face-upper)" />
          <stop offset="54%" style="stop-color: var(--f-face-lower-root)" />
          <stop offset="75%" style="stop-color: var(--f-face-lower)" />
          <stop offset="93%" style="stop-color: var(--f-face-crest)" />
          <stop offset="100%" style="stop-color: var(--f-face-turn)" />
        </linearGradient>

        <!-- The rim: a rounded bevel all the way round. Its top edge faces the
             light and is the brightest line on the cap; its bottom edge turns
             down toward the front wall. -->
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--f-rim-top)" />
          <stop offset="45%" style="stop-color: var(--f-rim-mid)" />
          <stop offset="100%" style="stop-color: var(--f-rim-bottom)" />
        </linearGradient>

        <!-- The cap's front wall, below the rim: cream in shadow. -->
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--f-wall-top)" />
          <stop offset="100%" style="stop-color: var(--f-wall-bottom)" />
        </linearGradient>

        <!-- Along the cap: the left end faces the light, the right end does not. -->
        <linearGradient id={`${uid}-ends`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" />
          <stop offset="12%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="86%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.16" />
        </linearGradient>

        <!-- A soft specular where the rim's top edge is nearest the light. -->
        <radialGradient id={`${uid}-spec`} cx="0.3" cy="0.06" r="0.42">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.38" />
          <stop offset="55%" stop-color="#ffffff" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>

        <!-- The fingertip, while dragging: a little occlusion on the face. -->
        <radialGradient id={`${uid}-finger`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.16" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>

        <!-- The slot floor: a hair lighter toward the bottom, where the far
             end wall catches the light. -->
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--f-floor)" />
          <stop offset="92%" style="stop-color: var(--f-floor)" />
          <stop offset="100%" style="stop-color: var(--f-floor-end)" />
        </linearGradient>

        <clipPath id={`${uid}-slot-clip`}>
          <rect x={SLOT_CX - SLOT_W / 2} y={SLOT_Y} width={SLOT_W} height={SLOT_H} rx={SLOT_W / 2} />
        </clipPath>
        <clipPath id={`${uid}-cap-clip`}>
          <rect x={-CAP_W / 2} y={-CAP_H / 2} width={CAP_W} height={CAP_H} rx={CAP_RX} />
        </clipPath>
        <clipPath id={`${uid}-face-clip`}>
          <rect x={-FACE_W / 2} y={-FACE_H / 2} width={FACE_W} height={FACE_H} rx={FACE_RX} />
        </clipPath>

        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id={`${uid}-shadow`} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <!-- ================================================================
           PANEL PRINT. Stationary: drawn in the panel plane, outside the
           group that moves. Same convention as the knob's graduations:
           metal-grey ticks, minors fine and faint, majors heavier.
           ================================================================ -->
      <g class="fader__scale" data-part="scale">
        <g class="fader__ticks">
          {#each minorMarks as mark, i (i)}
            <line x1={TICK_MINOR_X1} y1={mark.y} x2={TICK_X2} y2={mark.y} />
          {/each}
          {#each majorMarks as mark (mark.v)}
            <line
              class="is-major"
              class:is-reference={referenceY !== null && mark.v === 0}
              x1={TICK_MAJOR_X1}
              y1={mark.y}
              x2={TICK_X2}
              y2={mark.y}
            />
          {/each}
        </g>
        {#each majorMarks as mark (mark.v)}
          <text class="fader__numeral" x={NUM_X} y={mark.y}>{mark.text}</text>
        {/each}
      </g>

      <!-- ================================================================
           THE SLOT. Cut into the panel: a dark edge where the top-left lip
           casts into it, a light edge where the bottom-right lip catches the
           room, a dark floor, and a soft shadow pooled under the near lip.
           ================================================================ -->
      <g class="fader__slot" data-part="slot">
        <rect
          class="fader__slot-lip-light"
          x={SLOT_CX - SLOT_W / 2 - 1}
          y={SLOT_Y}
          width={SLOT_W + 2}
          height={SLOT_H + 1.5}
          rx={SLOT_W / 2 + 1}
        />
        <rect
          class="fader__slot-lip-dark"
          x={SLOT_CX - SLOT_W / 2 - 1}
          y={SLOT_Y - 1}
          width={SLOT_W + 2}
          height={SLOT_H + 1.5}
          rx={SLOT_W / 2 + 1}
        />
        <g clip-path={`url(#${uid}-slot-clip)`}>
          <rect
            class="fader__slot-floor"
            x={SLOT_CX - SLOT_W / 2}
            y={SLOT_Y}
            width={SLOT_W}
            height={SLOT_H}
            fill={`url(#${uid}-floor)`}
          />
          <!-- Inner shadow: a blurred ring on the slot's edge, pushed down and
               right so the shadow sits under the top-left lip. -->
          <rect
            class="fader__slot-inner"
            x={SLOT_CX - SLOT_W / 2 - 1.5}
            y={SLOT_Y - 1.5}
            width={SLOT_W + 3}
            height={SLOT_H + 3}
            rx={SLOT_W / 2 + 1.5}
            filter={`url(#${uid}-soft)`}
          />
        </g>
      </g>

      <!-- ================================================================
           THE MOVING PART: the cap, placed by the value. The
           group translates only — nothing rotates, nothing reshapes.
           ================================================================ -->
      <g class="fader__carriage" data-part="carriage" transform={`translate(${SLOT_CX} ${capCy})`}>
        <g class="fader__press">
          <!-- The cap's shadow: a fixed offset, down and right. -->
          <rect
            class="fader__cap-shadow"
            x={-CAP_W / 2}
            y={-CAP_H / 2}
            width={CAP_W}
            height={CAP_H}
            rx={CAP_RX}
            filter={`url(#${uid}-shadow)`}
          />

          <g class="fader__cap" data-part="cap">
            <!-- Front wall, seen below the rim. -->
            <rect
              class="fader__cap-wall"
              x={-CAP_W / 2}
              y={-CAP_H / 2 + CAP_WALL}
              width={CAP_W}
              height={CAP_H}
              rx={CAP_RX}
              fill={`url(#${uid}-wall)`}
            />
            <!-- The rim: the whole top outline, bevelled. -->
            <rect
              class="fader__cap-rim"
              data-part="cap-rim"
              x={-CAP_W / 2}
              y={-CAP_H / 2}
              width={CAP_W}
              height={CAP_H}
              rx={CAP_RX}
              fill={`url(#${uid}-rim)`}
            />
            <!-- The face, inside the rim: shallow concave, grooved. -->
            <rect
              class="fader__cap-face"
              data-part="cap-face"
              x={-FACE_W / 2}
              y={-FACE_H / 2}
              width={FACE_W}
              height={FACE_H}
              rx={FACE_RX}
              fill={`url(#${uid}-face)`}
            />
            <g clip-path={`url(#${uid}-face-clip)`} data-part="cap-grooves">
              {#each grooves as groove (groove.y)}
                <!-- the cut's upper wall, facing away from the light -->
                <rect
                  class="fader__cap-groove"
                  class:is-upper={groove.upper}
                  x={-FACE_W / 2}
                  y={groove.y - RIB_CUT / 2}
                  width={FACE_W}
                  height={RIB_CUT}
                />
                <!-- its lower wall, facing the light -->
                <rect
                  class="fader__cap-crest"
                  class:is-upper={groove.upper}
                  x={-FACE_W / 2}
                  y={groove.y + RIB_CUT / 2}
                  width={FACE_W}
                  height={RIB_CREST}
                />
              {/each}
              <!-- The indicator line: one deep groove across the middle. -->
              <rect
                class="fader__cap-line"
                data-part="cap-line"
                x={-FACE_W / 2}
                y={-LINE_H / 2}
                width={FACE_W}
                height={LINE_H}
              />
              <!-- its lit lower wall -->
              <rect
                class="fader__cap-line-crest"
                x={-FACE_W / 2}
                y={LINE_H / 2}
                width={FACE_W}
                height={0.6}
              />
            </g>
            <g clip-path={`url(#${uid}-cap-clip)`}>
              <rect
                class="fader__cap-ends"
                x={-CAP_W / 2}
                y={-CAP_H / 2}
                width={CAP_W}
                height={CAP_H}
                fill={`url(#${uid}-ends)`}
              />
              <rect
                class="fader__cap-spec"
                x={-CAP_W / 2}
                y={-CAP_H / 2}
                width={CAP_W}
                height={CAP_H}
                fill={`url(#${uid}-spec)`}
              />
              <rect
                class="fader__cap-finger"
                x={-CAP_W / 2}
                y={-CAP_H / 2}
                width={CAP_W}
                height={CAP_H}
                fill={`url(#${uid}-finger)`}
              />
            </g>
            <!-- A hairline where the cap meets the air, so the corners read. -->
            <rect
              class="fader__cap-edge"
              x={-CAP_W / 2}
              y={-CAP_H / 2}
              width={CAP_W}
              height={CAP_H}
              rx={CAP_RX}
            />
          </g>
        </g>
      </g>

      <!-- Focus: a ring on the panel around the slot, with a panel-coloured
           break so it reads against the print. -->
      <g class="fader__focus" data-part="focus">
        <rect
          class="fader__focus-gap"
          x={FOCUS_X - 1}
          y={SLOT_Y - FOCUS_PAD}
          width={W - FOCUS_X - 1}
          height={SLOT_H + 2 * FOCUS_PAD}
          rx="4"
        />
        <rect
          class="fader__focus-ring"
          x={FOCUS_X - 1}
          y={SLOT_Y - FOCUS_PAD}
          width={W - FOCUS_X - 1}
          height={SLOT_H + 2 * FOCUS_PAD}
          rx="4"
        />
      </g>
    </svg>
  </div>

  <p class="fader__label">{label}</p>

  <div class="fader__readout">
    {#if editing}
      <input
        class="fader__input"
        class:is-invalid={invalid}
        bind:this={inputEl}
        bind:value={draft}
        type="text"
        inputmode="decimal"
        aria-label={`${label} value`}
        aria-invalid={invalid}
        data-fader-input
        onkeydown={onInputKeyDown}
        onblur={onInputBlur}
      />
    {:else}
      <button
        type="button"
        class="fader__value"
        disabled={disabled}
        aria-label={`${label}: ${display}. Activate to type a value.`}
        data-fader-value
        onclick={openEditor}
      >
        {display}
      </button>
    {/if}
  </div>

  {#if invalid}
    <p class="fader__error" role="alert" data-fader-error>
      Enter a number between {numeral(min)} and {numeral(max)}.
    </p>
  {/if}
</div>

<style>
  .fader {
    /* The whole drawing scales from one width, `--fader-width`, set by the
       host; 4.5rem = 72px = 1x. It is read, not declared, here, so a channel
       strip or the playground can size the fader from outside. */

    /* --- the cap's light model, from the cream tokens -------------------- */
    /* the rim */
    --f-rim-top: var(--cap-hi);
    --f-rim-mid: color-mix(in srgb, var(--cap-hi) 50%, var(--cap-base));
    --f-rim-bottom: color-mix(in srgb, var(--cap-base) 70%, var(--cap-lo));
    /* the face: shaded upper half, lit lower half */
    --f-face-shoulder: color-mix(in srgb, var(--cap-base) 65%, var(--cap-lo));
    --f-face-upper: color-mix(in srgb, var(--cap-base) 16%, var(--cap-lo));
    --f-face-lower-root: color-mix(in srgb, var(--cap-base) 60%, var(--cap-lo));
    --f-face-lower: var(--cap-base);
    --f-face-crest: color-mix(in srgb, var(--cap-hi) 90%, var(--cap-base));
    --f-face-turn: color-mix(in srgb, var(--cap-base) 80%, var(--cap-lo));
    /* the indicator line: the deepest cut, near black */
    --f-line: color-mix(in srgb, var(--cap-lo) 25%, black);
    /* front wall */
    --f-wall-top: color-mix(in srgb, var(--cap-lo) 86%, black);
    --f-wall-bottom: color-mix(in srgb, var(--cap-lo) 55%, black);

    /* --- the recess, from the material tokens ---------------------------- */
    --f-floor: var(--al-material-recess);
    --f-floor-end: color-mix(in srgb, var(--al-material-recess) 88%, white);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .fader__track {
    position: relative;
    display: block;
    width: var(--fader-width, 4.5rem);
    cursor: grab;
    touch-action: none;
    outline: none;
  }

  .fader.is-dragging .fader__track {
    cursor: grabbing;
  }

  .fader.is-disabled .fader__track {
    cursor: not-allowed;
  }

  .fader__surface {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    pointer-events: none;
  }

  /* --- print -------------------------------------------------------------- */

  .fader__ticks line {
    stroke: var(--al-material-metal);
    stroke-width: 0.72;
    stroke-opacity: 0.45;
    stroke-linecap: round;
  }

  .fader__ticks line.is-major {
    stroke-width: 1.2;
    stroke-opacity: 0.9;
  }

  .fader__ticks line.is-reference {
    stroke: var(--al-text-primary);
    stroke-width: 1.4;
    stroke-opacity: 1;
  }

  .fader__numeral {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 7.8px;
    font-variant-numeric: tabular-nums;
    text-anchor: end;
    dominant-baseline: central;
    paint-order: stroke;
    stroke: var(--al-material-panel);
    stroke-width: 2px;
    stroke-linejoin: round;
  }

  /* --- slot --------------------------------------------------------------- */

  .fader__slot-lip-light {
    fill: var(--al-bevel-light);
    fill-opacity: 0.55;
  }

  .fader__slot-lip-dark {
    fill: var(--al-bevel-shadow);
  }

  .fader__slot-inner {
    fill: none;
    stroke: #000;
    stroke-width: 3;
    stroke-opacity: 0.8;
    transform: translate(0.6px, 1px);
  }

  /* --- carriage ----------------------------------------------------------- */

  /* The cap follows input directly; only the press-in is eased. */
  .fader__press {
    transition: transform 70ms ease-out;
  }

  .fader__cap-shadow {
    fill: #000;
    fill-opacity: 0.55;
    transform: translate(var(--f-shadow-dx), var(--f-shadow-dy));
    transition:
      transform 70ms ease-out,
      fill-opacity 70ms ease-out;
  }

  .fader__cap-finger {
    opacity: 0;
    transition: opacity 70ms ease-out;
  }

  /* The grooves: black and white alphas over the face, so each cut takes the
     tone of the half it sits in. In the shaded upper half the cuts are deep
     and their lit walls faint; in the lit lower half the light fills them
     and their lit walls flare. */
  .fader__cap-groove {
    fill: #000;
    fill-opacity: 0.2;
  }

  .fader__cap-groove.is-upper {
    fill-opacity: 0.42;
  }

  .fader__cap-crest {
    fill: #fff;
    fill-opacity: 0.42;
  }

  .fader__cap-crest.is-upper {
    fill-opacity: 0.2;
  }

  .fader__cap-line {
    fill: var(--f-line);
  }

  .fader__cap-line-crest {
    fill: #fff;
    fill-opacity: 0.3;
  }

  .fader__cap-edge {
    fill: none;
    stroke: color-mix(in srgb, var(--cap-lo) 65%, black);
    stroke-width: 0.5;
    stroke-opacity: 0.45;
  }

  /* Dragging: the fingertip is on the cap. The cap presses a hair into its
     carriage, the shadow tightens under it, and the face darkens where the
     finger sits. It does not move sideways and nothing else changes. */
  .fader.is-dragging .fader__press {
    transform: translateY(0.5px);
  }

  .fader.is-dragging .fader__cap-shadow {
    fill-opacity: 0.62;
    transform: translate(calc(var(--f-shadow-dx) * 0.6), calc(var(--f-shadow-dy) * 0.6));
  }

  .fader.is-dragging .fader__cap-finger {
    opacity: 1;
  }

  /* --- focus -------------------------------------------------------------- */

  .fader__focus {
    opacity: 0;
    transition: opacity 90ms ease;
  }

  .fader__focus-gap {
    fill: none;
    stroke: var(--al-material-panel);
    stroke-width: 2.7;
  }

  .fader__focus-ring {
    fill: none;
    stroke: var(--al-text-primary);
    stroke-width: 1.5;
  }

  .fader__track:focus-visible .fader__focus,
  .fader.is-demo-focus .fader__focus {
    opacity: 1;
    filter: drop-shadow(0 0 1px var(--al-material-panel));
  }

  /* --- disabled ----------------------------------------------------------- */

  .fader.is-disabled .fader__cap {
    filter: saturate(0.3) brightness(0.82);
  }

  .fader.is-disabled .fader__cap-shadow {
    fill-opacity: 0.35;
  }

  .fader.is-disabled .fader__ticks line {
    stroke-opacity: 0.18;
  }

  .fader.is-disabled .fader__ticks line.is-reference {
    stroke-opacity: 0.35;
  }

  .fader.is-disabled .fader__numeral {
    opacity: 0.4;
  }

  /* --- label & readout — the knob's conventions, verbatim ----------------- */

  .fader__label {
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

  .fader__readout {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .fader__value,
  .fader__input {
    min-width: 4.6em;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: 2px;
    background: var(--al-material-recess);
    color: var(--al-text-primary);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-xs);
    font-variant-numeric: tabular-nums;
    line-height: var(--al-line-height-tight);
    text-align: center;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.85),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .fader__value {
    cursor: text;
  }

  .fader__value:disabled {
    color: var(--al-text-muted);
    cursor: not-allowed;
  }

  .fader__value:hover:not(:disabled) {
    border-color: var(--al-text-muted);
  }

  .fader__input {
    width: 6.4em;
    outline: none;
  }

  .fader__input:focus {
    border-color: var(--al-text-secondary);
  }

  .fader__input.is-invalid {
    border-color: var(--al-function-red-base);
  }

  .fader__input::selection {
    background: var(--al-function-amber-lo);
    color: var(--al-text-primary);
  }

  .fader__error {
    max-width: 12rem;
    margin: 0;
    color: var(--al-function-red-hi);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-2xs);
    line-height: var(--al-line-height-snug);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .fader__focus,
    .fader__press,
    .fader__cap-shadow,
    .fader__cap-finger {
      transition: none;
    }
  }
</style>
