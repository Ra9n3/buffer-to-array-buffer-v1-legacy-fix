<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across knobs. */
  let nextId = 0;
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { functionToken, type FunctionFamily } from "../../lib/tokens";

  /**
   * ALLOY rotary pot — Task 1.2, refined.
   *
   * One component serves every functional colour; the colour is a `family`
   * prop resolving through the Task 1.1 tokens (`functionToken()`), never a hex
   * value of its own.
   *
   * The knob is built as FIVE distinct physical parts, bottom to top:
   *   1. contact shadow — soft ground shadow, offset down, wider than the knob
   *   2. knurled skirt   — 18 soft flutes in CSS, lit as a cylinder
   *   3. flat top face   — machined annulus, dark plastic, lit from upper-left
   *   4. groove + rim    — ambient occlusion where the cap meets the face
   *   5. domed cap       — family-coloured, convex, with specular + rim light
   * On top of that, painted *into* the cap: the pointer.
   *
   * One lighting model, everywhere: key light from the upper-left (convention
   * below: azimuth −45°), fill from the panel, and a dark lower-right falloff.
   * The lighting is static and never moves; only the pointer, value and states
   * change. That is what makes the six variants read as one hardware family.
   */

  /** Playground-only visual demonstration. Never set in product code. */
  type DemoState = "dragging" | "focused" | "editing" | null;

  let {
    label,
    family = "cream" as FunctionFamily,
    min = 0,
    max = 10,
    step = 0.1,
    value = $bindable(0),
    unit = "",
    decimals = 1,
    disabled = false,
    /** Extreme numerals. Defaults to the bound values rendered without units. */
    extremes = null,
    /** Optional custom formatter. Defaults to fixed decimals + unit. */
    format = null,
    /** Playground demonstration of a state that needs a pointer or focus. */
    demoState = null,
  }: {
    label: string;
    family?: FunctionFamily;
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    unit?: string;
    decimals?: number;
    disabled?: boolean;
    extremes?: readonly [string, string] | null;
    format?: ((value: number) => string) | null;
    demoState?: DemoState;
  } = $props();

  const uid = `kn${++nextId}`;

  /* --- geometry, in the 120-unit viewBox -------------------------------- */

  const CX = 60;
  const CY = 60;
  /** Travel spans 270°, centred on 12 o'clock. */
  const SWEEP = 270;
  const START_ANGLE = -135;
  /** 21 graduations over 270° = one every 13.5°, majors every fifth. */
  const TICK_COUNT = 21;

  /** Cap (the coloured dome). */
  const CAP_R = 20.0;
  /** Chamfered rim where the cap turns down into the groove. */
  const RIM_R = 21.3;
  /** Flat machined face of the skirt. */
  const FACE_R = 23.7;
  /** Outer edge of the knurled skirt. */
  const SKIRT_R = 28.6;
  /** Focus ring sits in the clear gap between skirt and scale. */
  const FOCUS_R = 30.6;

  const TICK_IN = 31.4;
  const TICK_MINOR = 34.6;
  const TICK_MAJOR = 37.2;
  const NUM_R = 42.6;

  /** 18 flutes = 20° pitch, inside the spec's 16–20 range. */
  const FLUTES = 18;

  /** Skirt geometry is derived from SKIRT_R, not re-typed in the stylesheet. */
  const skirtInset = `${(((60 - SKIRT_R) / 120) * 100).toFixed(2)}%`;

  let dragging = $state(false);
  let focused = $state(false);
  let editing = $state(false);
  let invalid = $state(false);
  let draft = $state("");
  let hovered = $state(false);

  let startValue = 0;
  let startX = 0;
  let startY = 0;
  let inputEl = $state<HTMLInputElement | null>(null);
  let cancelOnBlur = false;

  const precision = $derived(Math.pow(10, decimals));
  const span = $derived(Math.max(max - min, Number.EPSILON));

  const fraction = $derived(Math.min(1, Math.max(0, (value - min) / span)));
  const angle = $derived(START_ANGLE + SWEEP * fraction);

  const display = $derived(
    format ? format(value) : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`,
  );

  const extremeLabels = $derived(
    extremes ?? ([min.toFixed(decimals), max.toFixed(decimals)] as const),
  );

  /** The real, computed state. Demo states are reported separately. */
  const knobState = $derived(
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

  /** Snap to the step grid and clamp into range — every write goes through here. */
  function setValue(next: number): void {
    if (!Number.isFinite(next)) return;

    const clamped = Math.min(max, Math.max(min, next));
    const snapped = step > 0 ? Math.round(clamped / step) * step : clamped;
    value = Math.round(Math.min(max, Math.max(min, snapped)) * precision) / precision;
  }

  /** Shift-step: one tenth of a step, but never finer than the display can show. */
  const fineStep = $derived(Math.max(step / 10, 1 / precision));

  function nudge(delta: number): void {
    setValue(value + delta);
  }

  /* --- pointer drag ------------------------------------------------------ */

  function onPointerDown(event: PointerEvent): void {
    if (disabled || editing || event.button !== 0) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
    startValue = value;
    startX = event.clientX;
    startY = event.clientY;
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;

    // Vertical travel is the primary axis; horizontal adds the same amount so
    // a sideways drag still works. 180px covers the full range.
    const travel = startY - event.clientY + (event.clientX - startX);
    const sensitivity = event.shiftKey ? 0.2 : 1;

    setValue(startValue + (travel / 180) * span * sensitivity);
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

    const stepSize = event.shiftKey ? fineStep : step;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nudge(stepSize);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nudge(-stepSize);
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
    const cleaned = raw.replace(unit, "").trim();
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

  /* --- scale generation ------------------------------------------------- */

  /** Polar → cartesian. 0° is 12 o'clock, positive angles run clockwise. */
  function pointOn(radius: number, degrees: number): [number, number] {
    const a = (degrees * Math.PI) / 180;
    return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
  }

  /** Clockwise arc path at a given radius, used for light/shade crescents. */
  function arcPath(radius: number, from: number, to: number): string {
    const [x0, y0] = pointOn(radius, from);
    const [x1, y1] = pointOn(radius, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  /** Annular sector, used for the knurl facets. */
  function sectorPath(r0: number, r1: number, a0: number, a1: number): string {
    const [x0, y0] = pointOn(r1, a0);
    const [x1, y1] = pointOn(r1, a1);
    const [x2, y2] = pointOn(r0, a1);
    const [x3, y3] = pointOn(r0, a0);
    return (
      `M ${x0.toFixed(2)} ${y0.toFixed(2)} ` +
      `A ${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `L ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `A ${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
    );
  }

  /**
   * The knurl. Each flute is a cut ridge: a narrow face that catches the key
   * light and a wider face turned away from it. Every facet's brightness is
   * modulated by its own azimuth, so the whole skirt is lit by one light
   * source rather than by a repeating pattern.
   */
  const LIGHT_AZIMUTH = 315; // upper-left
  const fluteFacets = Array.from({ length: FLUTES }, (_, i) => {
    const pitch = 360 / FLUTES;
    const a0 = i * pitch;
    const ridge = a0 + pitch * 0.42;
    const mid = a0 + pitch / 2;
    const facing = Math.max(
      0,
      Math.cos(((mid - LIGHT_AZIMUTH) * Math.PI) / 180),
    );

    return {
      i,
      lead: sectorPath(FACE_R - 0.2, SKIRT_R, a0, ridge),
      trail: sectorPath(FACE_R - 0.2, SKIRT_R, ridge, a0 + pitch),
      // Shallow milled grooves, not teeth: the contrast has to stay low or
      // the skirt reads as a gear instead of a machined grip.
      leadOpacity: Number((0.02 + 0.09 * facing).toFixed(3)),
      trailOpacity: Number((0.13 - 0.05 * facing).toFixed(3)),
    };
  });

  const tickMarks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const t = index / (TICK_COUNT - 1);
    const deg = START_ANGLE + SWEEP * t;
    const major = index === 0 || index === TICK_COUNT - 1 || index % 5 === 0;
    const r2 = major ? TICK_MAJOR : TICK_MINOR;
    const [x1, y1] = pointOn(TICK_IN, deg);
    const [x2, y2] = pointOn(r2, deg);

    return { index, major, x1, y1, x2, y2 };
  });

  const extremePositions = [START_ANGLE, -START_ANGLE].map((deg) => {
    const [x, y] = pointOn(NUM_R, deg);
    return { x, y };
  });

  /** Key light comes from the upper-left; these arcs sell the roundness. */
  const capRimLight = arcPath(RIM_R - 0.45, 264, 330);
  const capRimShade = arcPath(RIM_R - 0.45, 46, 134);
  const faceRimLight = arcPath(FACE_R - 0.3, 262, 336);
</script>

<div
  class="knob"
  class:is-disabled={disabled}
  class:is-dragging={dragging || demoState === "dragging"}
  class:is-hovered={hovered}
  class:is-demo-focus={demoState === "focused"}
  style:--cap-hi={functionToken(family, "hi")}
  style:--cap-base={functionToken(family, "base")}
  style:--cap-lo={functionToken(family, "lo")}
  style:--cap-ink={functionToken(family, "ink")}
  style:--skirt-inset={skirtInset}
  data-knob
  data-knob-family={family}
  data-knob-state={knobState}
>
  <div class="knob__dial-wrap">
    <div
      class="knob__dial"
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={display}
      aria-disabled={disabled}
      aria-orientation="vertical"
      data-knob-dial
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
      <!-- 1. contact shadow only; the skirt itself is drawn below. -->
      <span class="knob__skirt" aria-hidden="true"></span>

      <!-- 3–5. face, groove, dome, pointer, scale — one lighting model. -->
      <svg class="knob__surface" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <!-- Cap dome: family hi→base→lo, key light upper-left. -->
          <!-- Key light upper-left, but only ~30% off centre: a real dome's
               highlight sits inside the silhouette, not on its edge. -->
          <radialGradient id={`${uid}-dome`} cx="38%" cy="31%" r="82%">
            <stop offset="0%" style="stop-color: var(--cap-hi)" />
            <stop offset="13%" style="stop-color: var(--cap-hi)" />
            <stop offset="38%" style="stop-color: var(--cap-base)" />
            <stop offset="72%" style="stop-color: var(--cap-lo)" />
            <stop offset="100%" style="stop-color: var(--cap-lo)" />
          </radialGradient>
          <!-- Terminator: darkens the lower-right of the dome. -->
          <radialGradient id={`${uid}-terminator`} cx="70%" cy="74%" r="76%">
            <stop offset="20%" style="stop-color: rgba(0,0,0,0)" />
            <stop offset="62%" style="stop-color: rgba(0,0,0,0.08)" />
            <stop offset="88%" style="stop-color: rgba(0,0,0,0.15)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.24)" />
          </radialGradient>
          <!-- Cylinder falloff across the skirt; deliberately gentle, or the
               skirt's outer edge sinks into the panel and the part vanishes. -->
          <radialGradient id={`${uid}-skirt-shade`} cx="35%" cy="28%" r="76%">
            <stop offset="0%" style="stop-color: rgba(255,255,255,0.14)" />
            <stop offset="38%" style="stop-color: rgba(255,255,255,0.00)" />
            <stop offset="74%" style="stop-color: rgba(0,0,0,0.14)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.34)" />
          </radialGradient>
          <!-- Flat machined face: same key light, much lower albedo. -->
          <radialGradient id={`${uid}-face`} cx="33%" cy="26%" r="76%">
            <stop offset="0%" style="stop-color: rgba(255,255,255,0.20)" />
            <stop offset="42%" style="stop-color: rgba(255,255,255,0.03)" />
            <stop offset="76%" style="stop-color: rgba(0,0,0,0.26)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.55)" />
          </radialGradient>
          <!-- Specular: a soft, slightly elliptical sheen, not a dot. -->
          <radialGradient id={`${uid}-spec`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style="stop-color: rgba(255,255,255,0.26)" />
            <stop offset="48%" style="stop-color: rgba(255,255,255,0.10)" />
            <stop offset="100%" style="stop-color: rgba(255,255,255,0)" />
          </radialGradient>
          <!-- Ambient occlusion inside the groove around the cap. -->
          <radialGradient id={`${uid}-groove`} cx="50%" cy="50%" r="50%">
            <stop offset={`${(RIM_R / FACE_R) * 100 - 6}%`} style="stop-color: rgba(0,0,0,0.55)" />
            <stop offset={`${(RIM_R / FACE_R) * 100 + 2}%`} style="stop-color: rgba(0,0,0,0.34)" />
            <stop offset={`${(FACE_R / FACE_R) * 100}%`} style="stop-color: rgba(0,0,0,0)" />
          </radialGradient>
          <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
          <filter id={`${uid}-blur-soft`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.7" />
          </filter>
          <clipPath id={`${uid}-cap-clip`}>
            <circle cx={CX} cy={CY} r={CAP_R} />
          </clipPath>
        </defs>

        <!-- 2. knurled skirt: body, 18 lit/cut facets, cylindrical falloff. -->
        <circle class="knob__skirt-body" cx={CX} cy={CY} r={SKIRT_R} />
        <g class="knob__flutes">
          {#each fluteFacets as facet (facet.i)}
            <path class="knob__flute-lead" d={facet.lead} fill-opacity={facet.leadOpacity} />
            <path class="knob__flute-trail" d={facet.trail} fill-opacity={facet.trailOpacity} />
          {/each}
        </g>
        <circle class="knob__skirt-shade" cx={CX} cy={CY} r={SKIRT_R} fill={`url(#${uid}-skirt-shade)`} />
        <circle class="knob__skirt-edge" cx={CX} cy={CY} r={SKIRT_R} />

        <!-- 3. machined top face of the skirt. -->
        <circle
          class="knob__face"
          cx={CX}
          cy={CY}
          r={FACE_R}
          fill={`url(#${uid}-face)`}
        />
        <path class="knob__face-rim" d={faceRimLight} />

        <!-- 4. groove: ambient occlusion where cap meets face. -->
        <circle class="knob__groove" cx={CX} cy={CY} r={FACE_R} fill={`url(#${uid}-groove)`} />
        <circle class="knob__groove-line" cx={CX} cy={CY} r={RIM_R + 0.55} />

        <!-- 5. the cap: dome, terminator, specular, rim. -->
        <circle class="knob__cap" cx={CX} cy={CY} r={CAP_R} fill={`url(#${uid}-dome)`} />

        <g clip-path={`url(#${uid}-cap-clip)`}>
          <circle cx={CX} cy={CY} r={CAP_R} fill={`url(#${uid}-terminator)`} />
          <circle class="knob__cap-veil" cx={CX} cy={CY} r={CAP_R} />
          <!-- A neutral, very weak scrim: knocks a little saturation out of
               every colour so nothing reads as modern sign-red or mint. -->
          <circle class="knob__cap-scrim" cx={CX} cy={CY} r={CAP_R} />
          <ellipse
            class="knob__spec"
            cx={CX - 4.9}
            cy={CY - 6.1}
            rx="6.2"
            ry="4"
            transform={`rotate(-30 ${CX - 4.9} ${CY - 6.1})`}
            fill={`url(#${uid}-spec)`}
            filter={`url(#${uid}-blur-soft)`}
          />
          <!-- A second, much weaker bounce sheen, low and right. -->
          <ellipse
            class="knob__bounce"
            cx={CX + 5.2}
            cy={CY + 6.4}
            rx="9"
            ry="3.6"
            transform={`rotate(-24 ${CX + 5.2} ${CY + 6.4})`}
            fill={`url(#${uid}-spec)`}
            opacity="0.18"
            filter={`url(#${uid}-blur-soft)`}
          />

          <!-- Pointer: inlaid into the cap. Groove, ink, then its lit edge. -->
          <g class="knob__pointer" transform={`rotate(${angle} ${CX} ${CY})`}>
            <line class="knob__pointer-bed" x1={CX} y1={CY - 4.4} x2={CX} y2={CY - 16.2} />
            <line class="knob__pointer-ink" x1={CX} y1={CY - 4.9} x2={CX} y2={CY - 15.8} />
            <line class="knob__pointer-edge" x1={CX} y1={CY - 4.9} x2={CX} y2={CY - 15.8} />
          </g>
        </g>

        <!-- Cap rim: a chamfer, lit upper-left, shaded lower-right. -->
        <path class="knob__rim-light" d={capRimLight} />
        <path class="knob__rim-shade" d={capRimShade} />
        <circle class="knob__cap-edge" cx={CX} cy={CY} r={CAP_R + 0.15} />

        <!-- Scale: fine graduations, majors longer and firmer. -->
        <g class="knob__ticks">
          {#each tickMarks as mark (mark.index)}
            <line
              x1={mark.x1}
              y1={mark.y1}
              x2={mark.x2}
              y2={mark.y2}
              class:is-major={mark.major}
            />
          {/each}
        </g>

        <!-- Fixed reference triangle printed on the panel; never rotates. -->
        <polygon
          class="knob__reference"
          points={`${CX},${CY - 28.3} ${CX - 1.9},${CY - 30.7} ${CX + 1.9},${CY - 30.7}`}
        />

        <!-- Extreme numerals only, on the same rays as the scale ends. -->
        <text
          class="knob__extreme"
          x={extremePositions[0].x}
          y={extremePositions[0].y}
          text-anchor="end"
        >
          {extremeLabels[0]}
        </text>
        <text
          class="knob__extreme"
          x={extremePositions[1].x}
          y={extremePositions[1].y}
          text-anchor="start"
        >
          {extremeLabels[1]}
        </text>

        <!-- Focus ring: a machined bezel in the clear gap, never over print. -->
        <g class="knob__focus">
          <circle class="knob__focus-gap" cx={CX} cy={CY} r={FOCUS_R} />
          <circle class="knob__focus-ring" cx={CX} cy={CY} r={FOCUS_R} />
        </g>
      </svg>
    </div>
  </div>

  <p class="knob__label">{label}</p>

  <div class="knob__readout">
    {#if editing}
      <input
        class="knob__input"
        class:is-invalid={invalid}
        bind:this={inputEl}
        bind:value={draft}
        type="text"
        inputmode="decimal"
        aria-label={`${label} value`}
        aria-invalid={invalid}
        data-knob-input
        onkeydown={onInputKeyDown}
        onblur={onInputBlur}
      />
    {:else}
      <button
        type="button"
        class="knob__value"
        disabled={disabled}
        aria-label={`${label}: ${display}. Activate to type a value.`}
        data-knob-value
        onclick={openEditor}
      >
        {display}
      </button>
    {/if}
  </div>

  {#if invalid}
    <p class="knob__error" role="alert" data-knob-error>
      Enter a number between {extremeLabels[0]} and {extremeLabels[1]}.
    </p>
  {/if}
</div>

<style>
  .knob {
    --knob-size: 5.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-2xs);
    min-width: 0;
    max-width: 100%;
  }

  .knob__dial-wrap {
    display: grid;
    place-items: center;
    padding: var(--al-space-3xs);
  }

  .knob__dial {
    position: relative;
    width: var(--knob-size);
    max-width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    touch-action: none;
    cursor: grab;
    outline: none;
  }

  .knob.is-dragging .knob__dial {
    cursor: grabbing;
  }

  .knob.is-disabled .knob__dial {
    cursor: not-allowed;
  }

  /* --- 1 & 2: contact shadow + knurled skirt ----------------------------- */

  /* The knob body is drawn in the SVG. This element carries only the contact
     shadow: tight and dark directly beneath the skirt, wide and soft beyond
     it, so the part sits ON the panel instead of floating above it. */
  .knob__skirt {
    position: absolute;
    inset: var(--skirt-inset);
    border-radius: 50%;
    box-shadow:
      0 1px 1.5px rgba(0, 0, 0, 0.75),
      0 2px 4px rgba(0, 0, 0, 0.55),
      0 5px 9px rgba(0, 0, 0, 0.35),
      0 9px 16px rgba(0, 0, 0, 0.20);
  }

  /* Knurled skirt. */
  .knob__skirt-body {
    fill: var(--al-material-surface-raised);
  }

  /* Facet fills are pure white/black at fractional opacity: the facet is a
     surface normal, not a colour, so it is a lighting term rather than a
     palette entry. */
  .knob__flute-lead {
    fill: rgb(255 255 255);
  }

  .knob__flute-trail {
    fill: rgb(0 0 0);
  }

  /* A dark machined edge, so the skirt ends on a crisp line against the
     panel rather than fading into it. */
  .knob__skirt-edge {
    fill: none;
    stroke: rgba(0, 0, 0, 0.5);
    stroke-width: 0.5;
  }

  /* --- 3–5: everything above the skirt ---------------------------------- */

  .knob__surface {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  /* Top face: dark machined plastic, same key light as the cap. */
  .knob__face {
    fill-opacity: 1;
  }

  .knob__face-rim {
    fill: none;
    stroke: rgba(255, 255, 255, 0.10);
    stroke-width: 0.7;
    stroke-linecap: round;
  }

  /* Ambient occlusion in the groove — this is what separates cap from face. */
  .knob__groove {
    pointer-events: none;
  }

  .knob__groove-line {
    fill: none;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 0.8;
  }

  .knob__cap {
    /* Fill comes from the dome gradient; the shadow beneath the cap edge is
       what makes it sit proud of the face rather than painted on it. */
    filter: drop-shadow(0 0.8px 0.9px rgba(0, 0, 0, 0.5));
  }

  .knob__cap-veil {
    fill: rgba(42, 30, 18, 0.12);
  }

  .knob__cap-scrim {
    fill: rgba(126, 118, 104, 0.07);
  }

  .knob__cap-edge {
    fill: none;
    stroke: rgba(0, 0, 0, 0.18);
    stroke-width: 0.4;
  }

  .knob__rim-light {
    fill: none;
    stroke: rgba(255, 255, 255, 0.30);
    stroke-width: 0.6;
    stroke-linecap: round;
  }

  .knob__rim-shade {
    fill: none;
    stroke: rgba(0, 0, 0, 0.28);
    stroke-width: 0.7;
    stroke-linecap: round;
  }

  /* Pointer, in three passes: dark channel, ink, then the lit edge of the
     inlay. The 0.5px offsets are what make it read as cut into the surface. */
  .knob__pointer-bed {
    stroke: rgba(0, 0, 0, 0.42);
    stroke-width: 3.1;
    stroke-linecap: round;
  }

  .knob__pointer-ink {
    stroke: var(--cap-ink);
    stroke-width: 1.9;
    stroke-linecap: round;
  }

  .knob__pointer-edge {
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 0.7;
    stroke-linecap: round;
    transform: translate(0.75px, 0.4px);
  }

  /* --- scale ------------------------------------------------------------ */

  .knob__ticks line {
    stroke: var(--al-material-metal);
    stroke-width: 0.5;
    stroke-opacity: 0.28;
    stroke-linecap: round;
  }

  .knob__ticks line.is-major {
    stroke-width: 0.85;
    stroke-opacity: 0.7;
  }

  .knob__reference {
    fill: var(--al-material-metal);
    fill-opacity: 0.7;
  }

  .knob__extreme {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 8.6px;
    font-variant-numeric: tabular-nums;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: var(--al-material-panel);
    stroke-width: 2.6px;
    stroke-linejoin: round;
  }

  /* --- interaction states ----------------------------------------------- */

  .knob__focus {
    opacity: 0;
    transition: opacity 90ms ease;
  }

  .knob__focus-gap {
    fill: none;
    stroke: var(--al-material-panel);
    stroke-width: 3.2;
  }

  .knob__focus-ring {
    fill: none;
    stroke: var(--al-text-engraved);
    stroke-width: 1.15;
  }

  .knob__dial:focus-visible .knob__focus,
  .knob.is-demo-focus .knob__focus {
    opacity: 0.9;
  }

  /* Hover: the face catches a little more light. No movement, no scale. */
  .knob__face {
    transition: filter 110ms ease;
  }

  .knob.is-hovered:not(.is-disabled) .knob__face {
    filter: brightness(1.08);
  }

  /* Dragging: the cap presses into the groove. The same lighting, slightly
     tighter — the shadow shortens, it does not change direction. */
  .knob.is-dragging .knob__cap {
    filter: drop-shadow(0 0.4px 0.5px rgba(0, 0, 0, 0.6));
  }

  .knob.is-dragging .knob__rim-light {
    stroke-opacity: 0.85;
  }

  .knob.is-dragging .knob__spec {
    opacity: 0.75;
  }

  .knob.is-dragging .knob__cap-veil {
    fill: rgba(42, 30, 18, 0.22);
  }

  /* Disabled: not a grey filter. The control reads as an unlit, de-energised
     part of the same panel — colours sink toward the panel, the specular
     highlight is gone (nothing is lit), and print contrast drops. */
  .knob.is-disabled .knob__skirt {
    background-blend-mode: multiply;
    opacity: 0.62;
  }

  .knob.is-disabled .knob__spec,
  .knob.is-disabled .knob__bounce,
  .knob.is-disabled .knob__rim-light {
    opacity: 0.12;
  }

  .knob.is-disabled .knob__cap {
    opacity: 0.55;
    filter: drop-shadow(0 0.5px 0.6px rgba(0, 0, 0, 0.4));
  }

  .knob.is-disabled .knob__pointer-ink {
    stroke: rgba(0, 0, 0, 0.45);
    stroke-opacity: 1;
  }

  .knob.is-disabled .knob__pointer-edge {
    opacity: 0.15;
  }

  .knob.is-disabled .knob__ticks line {
    stroke-opacity: 0.22;
  }

  .knob.is-disabled .knob__reference,
  .knob.is-disabled .knob__extreme {
    opacity: 0.4;
  }

  /* --- label & readout --------------------------------------------------- */

  /* Engraved label: light infill, hard dark shadow beneath — lettering cut
     into a dark panel rather than printed on it. */
  .knob__label {
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

  .knob__readout {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  /* Instrument window: a dark recess with a lit lower lip, so it reads as
     cut into the panel rather than drawn on it. */
  .knob__value,
  .knob__input {
    min-width: 4.6em;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: var(--al-space-3xs);
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

  .knob__value {
    cursor: text;
  }

  .knob__value:disabled {
    color: var(--al-text-muted);
    cursor: not-allowed;
  }

  .knob__value:hover:not(:disabled) {
    border-color: var(--al-text-muted);
    color: var(--al-text-primary);
  }

  .knob__input {
    width: 6.4em;
    outline: none;
  }

  .knob__input::selection {
    background: var(--al-function-amber-lo);
    color: var(--al-text-primary);
  }

  .knob__input:focus {
    border-color: var(--al-text-secondary);
  }

  .knob__input.is-invalid {
    border-color: var(--al-function-red-base);
  }

  .knob__error {
    max-width: 12rem;
    margin: 0;
    color: var(--al-function-red-hi);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-2xs);
    line-height: var(--al-line-height-snug);
    text-align: center;
  }

  /* The only motion is the focus ring fading and the hover sheen easing in.
     The pointer follows input directly and must never be animated, or it
     would lag a drag. */
  @media (prefers-reduced-motion: reduce) {
    .knob__focus,
    .knob__face {
      transition: none;
    }
  }
</style>
