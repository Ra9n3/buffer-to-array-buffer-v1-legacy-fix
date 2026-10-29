<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across knobs. */
  let nextId = 0;
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { functionToken, type FunctionFamily } from "../../lib/tokens";

  /**
   * ALLOY rotary pot — Task 1.2, vintage redesign.
   *
   * Built to match 1970s/80s British console pots (Neve / SSL 4000 / API
   * hardware): a tall finely-fluted body, a flared skirt sitting on the panel,
   * and a separate flat-topped cap in the functional colour with a painted
   * index line running from its centre out to the edge.
   *
   * The knob is drawn in a slightly raised projection rather than straight
   * down: the top faces are ellipses (ry ≈ 0.85 rx) and every part has visible
   * side wall, so it reads as an object standing on the panel instead of a
   * circle printed on it. The scale is printed in the panel plane (its own
   * ellipse) and is drawn *behind* the knob, so the knob occludes it — which is
   * what happens on real hardware.
   *
   * One light source throughout: key light upper-left. Every gradient, every
   * flute highlight and every shadow derives from that single constant, which
   * is what makes six colours read as one product line.
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

  /* --- geometry, in the 120-unit viewBox --------------------------------
     Measured proportions, taken from the reference hardware:
       knob body diameter ≈ 0.62 of the scale-ring diameter
       body flute band    ≈ 0.45 × cap diameter, tall
       skirt              ≈ 1.15 × body diameter, flared, 3 units high
       cap height         ≈ 0.45 × cap diameter
  ----------------------------------------------------------------------- */

  const CX = 60;

  /** Panel-plane scale ellipse (the print lives on the panel, not the knob). */
  const RING_CY = 66;
  const RING_RX = 44.7;
  const RING_RY = 38;
  const TICK_INNER = 0.93;

  /** Knob stack, bottom to top. */
  const BASE_CY = 66;
  const SKIRT_BOT_RX = 24;
  const SKIRT_BOT_RY = 18.7;
  const SKIRT_TOP_RX = 21.6;
  const SKIRT_TOP_RY = 16.8;
  const SKIRT_CY = 61;

  const BODY_BOT_RX = 21.2;
  const BODY_BOT_RY = 16.5;
  const BODY_TOP_RX = 18.9;
  const BODY_TOP_RY = 14.7;
  const BODY_CY = 45.4;

  const CAP_RX = 16.6;
  const CAP_RY = 12.9;
  const CAP_BOT_CY = 45.4;
  const CAP_TOP_CY = 40;

  /** Focus bezel sits in the clear band between skirt and scale. */
  const FOCUS_RX = 27.6;
  const FOCUS_RY = 21.4;

  /** Sweep and graduations. */
  const SWEEP = 270;
  const START_ANGLE = -135;
  const TICK_COUNT = 27;

  /**
   * Flute count. The reference hardware uses very fine knurling — far finer
   * than the 16–20 ridges in the hardware spec — so the count is tuned for the
   * rendered size rather than the spec's figure. Documented as D1.2.13; the
   * spec range is one constant away if the owner prefers it.
   */
  const BODY_FLUTES = 30;
  const SKIRT_FLUTES = 34;

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

  /* --- geometry helpers -------------------------------------------------- */

  const rad = (deg: number): number => (deg * Math.PI) / 180;

  /** A point on an ellipse in the panel plane. 0° is 12 o'clock, clockwise. */
  function onEllipse(rx: number, ry: number, deg: number, cy = RING_CY): [number, number] {
    return [CX + rx * Math.sin(rad(deg)), cy - ry * Math.cos(rad(deg))];
  }

  /** Side wall of a truncated cylinder: top and bottom ellipses joined. */
  function wallPath(
    topRx: number,
    topCy: number,
    botRx: number,
    botRy: number,
    botCy: number,
  ): string {
    return (
      `M ${(CX - topRx).toFixed(2)} ${topCy.toFixed(2)} ` +
      `L ${(CX - botRx).toFixed(2)} ${botCy.toFixed(2)} ` +
      `A ${botRx} ${botRy} 0 0 1 ${(CX + botRx).toFixed(2)} ${botCy.toFixed(2)} ` +
      `L ${(CX + topRx).toFixed(2)} ${topCy.toFixed(2)} Z`
    );
  }

  /**
   * Vertical flutes wrapped round a truncated cylinder.
   *
   * Each flute runs from the front edge of the top ellipse to the front edge
   * of the bottom ellipse at the same angular position, so the lines converge
   * with the taper exactly as a turned knurl does. Brightness is a function of
   * the flute's own azimuth against the key light, never a repeating pattern.
   */
  function flutes(
    count: number,
    topRx: number,
    topRy: number,
    topCy: number,
    botRx: number,
    botRy: number,
    botCy: number,
  ) {
    return Array.from({ length: count }, (_, i) => {
      const theta = -90 + ((i + 0.5) * 180) / count;
      const t = rad(theta);
      const facing = Math.max(0, Math.cos(rad(theta + 30)));

      return {
        i,
        x1: CX + topRx * Math.sin(t),
        y1: topCy + topRy * Math.cos(t),
        x2: CX + botRx * Math.sin(t),
        y2: botCy + botRy * Math.cos(t),
        // Grooves stay dark; ridges brighten as they face the light.
        groove: Number((0.56 - 0.26 * facing).toFixed(3)),
        ridge: Number((0.10 + 0.62 * facing).toFixed(3)),
      };
    });
  }

  const bodyFlutes = flutes(
    BODY_FLUTES,
    BODY_TOP_RX,
    BODY_TOP_RY,
    BODY_CY,
    BODY_BOT_RX,
    BODY_BOT_RY,
    SKIRT_CY,
  );

  const skirtFlutes = flutes(
    SKIRT_FLUTES,
    SKIRT_TOP_RX,
    SKIRT_TOP_RY,
    SKIRT_CY,
    SKIRT_BOT_RX,
    SKIRT_BOT_RY,
    BASE_CY,
  );

  /* --- scale ------------------------------------------------------------- */

  const tickMarks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const t = index / (TICK_COUNT - 1);
    const deg = START_ANGLE + SWEEP * t;
    const major = index === 0 || index === TICK_COUNT - 1 || index % 5 === 0;
    const outer = major ? 1.06 : 1;
    const [x1, y1] = onEllipse(RING_RX * TICK_INNER, RING_RY * TICK_INNER, deg);
    const [x2, y2] = onEllipse(RING_RX * outer, RING_RY * outer, deg);

    return { index, major, x1, y1, x2, y2 };
  });

  const extremePositions = [START_ANGLE, -START_ANGLE].map((deg) => {
    const [x, y] = onEllipse(RING_RX * 0.855, RING_RY * 0.855, deg);
    return { x, y };
  });

  /* --- pointer, painted in the cap's plane ------------------------------ */

  /** Start at the cap centre, end on the cap's rim, in ellipse space. */
  const pointer = $derived.by(() => {
    const [x, y] = onEllipse(CAP_RX - 0.4, CAP_RY - 0.4, angle, CAP_TOP_CY);
    return { x1: CX, y1: CAP_TOP_CY, x2: x, y2: y };
  });
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
      <svg class="knob__surface" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <!-- Skirt and body: dark turned plastic, lit as a cylinder. -->
          <linearGradient id={`${uid}-stack`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style="stop-color: rgba(0,0,0,0.42)" />
            <stop offset="16%" style="stop-color: rgba(255,255,255,0.11)" />
            <stop offset="34%" style="stop-color: rgba(255,255,255,0.05)" />
            <stop offset="58%" style="stop-color: rgba(0,0,0,0.16)" />
            <stop offset="84%" style="stop-color: rgba(0,0,0,0.34)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.46)" />
          </linearGradient>

          <!-- Top face of the body, in the shadow of the cap. -->
          <radialGradient id={`${uid}-bodyface`} cx="34%" cy="26%" r="82%">
            <stop offset="0%" style="stop-color: rgba(255,255,255,0.26)" />
            <stop offset="48%" style="stop-color: rgba(255,255,255,0.06)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.28)" />
          </radialGradient>

          <!-- Cap top. Deliberately a LINEAR ramp, not a radial one: a radial
               ramp reads as a sphere, a linear one reads as a flat machined
               face with a light gradient across it — which is what these pots
               actually have. -->
          <linearGradient id={`${uid}-cap`} x1="0.16" y1="0.02" x2="0.84" y2="0.98">
            <stop offset="0%" style="stop-color: var(--cap-hi)" />
            <stop offset="26%" style="stop-color: var(--cap-base)" />
            <stop offset="80%" style="stop-color: var(--cap-base)" />
            <stop offset="100%" style="stop-color: var(--cap-lo)" />
          </linearGradient>

          <!-- Cap wall: same colour, turned away from the light. -->
          <linearGradient id={`${uid}-capwall`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style="stop-color: var(--cap-lo)" />
            <stop offset="14%" style="stop-color: var(--cap-base)" />
            <stop offset="46%" style="stop-color: var(--cap-lo)" />
            <stop offset="100%" style="stop-color: rgba(0,0,0,0.35)" />
          </linearGradient>

          <!-- Broad glossy sheen across the flat top, not a dot. -->
          <linearGradient id={`${uid}-gloss`} x1="0.15" y1="0" x2="0.7" y2="1">
            <stop offset="0%" style="stop-color: rgba(255,255,255,0.20)" />
            <stop offset="42%" style="stop-color: rgba(255,255,255,0.05)" />
            <stop offset="100%" style="stop-color: rgba(255,255,255,0)" />
          </linearGradient>

          <filter id={`${uid}-blur-sm`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="0.55" />
          </filter>
          <filter id={`${uid}-blur`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          <filter id={`${uid}-blur-lg`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.8" />
          </filter>
        </defs>

        <!-- Contact shadow: tight and dark at the base, wide and soft beyond. -->
        <ellipse
          class="knob__shadow-wide"
          cx={CX + 1.4}
          cy={BASE_CY + 3.8}
          rx={SKIRT_BOT_RX + 3.6}
          ry={SKIRT_BOT_RY + 1.6}
          filter={`url(#${uid}-blur-lg)`}
        />
        <ellipse
          class="knob__shadow-tight"
          cx={CX}
          cy={BASE_CY + 1.2}
          rx={SKIRT_BOT_RX + 0.4}
          ry={SKIRT_BOT_RY - 1.4}
          filter={`url(#${uid}-blur)`}
        />

        <!-- Scale, printed on the panel behind the knob. -->
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
        <polygon
          class="knob__reference"
          points={`${CX},${RING_CY - RING_RY - 1.2} ${CX - 2.1},${RING_CY - RING_RY - 4.6} ${CX + 2.1},${RING_CY - RING_RY - 4.6}`}
        />
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

        <!-- 1. Skirt: flared, fluted, sitting on the panel. -->
        <path
          class="knob__skirt"
          d={wallPath(SKIRT_TOP_RX, SKIRT_CY, SKIRT_BOT_RX, SKIRT_BOT_RY, BASE_CY)}
        />
        <path
          class="knob__skirt-shade"
          d={wallPath(SKIRT_TOP_RX, SKIRT_CY, SKIRT_BOT_RX, SKIRT_BOT_RY, BASE_CY)}
          fill={`url(#${uid}-stack)`}
        />
        <g class="knob__skirt-flutes">
          {#each skirtFlutes as f (f.i)}
            <line
              x1={f.x1}
              y1={f.y1}
              x2={f.x2}
              y2={f.y2}
              stroke-width="0.62"
              stroke={`rgba(0,0,0,${f.groove})`}
            />
            <line
              x1={f.x1 + 0.34}
              y1={f.y1}
              x2={f.x2 + 0.34}
              y2={f.y2}
              stroke-width="0.34"
              stroke={`rgba(255,255,255,${f.ridge})`}
            />
          {/each}
        </g>
        <!-- Lit lip where the skirt's edge catches the room light. -->
        <path
          class="knob__skirt-lip"
          d={`M ${CX - SKIRT_BOT_RX + 2} ${BASE_CY + 0.6} A ${SKIRT_BOT_RX - 2} ${SKIRT_BOT_RY - 2} 0 0 0 ${CX + SKIRT_BOT_RX - 2} ${BASE_CY + 0.6}`}
        />

        <!-- 2. Body: the tall fluted barrel the cap sits on. -->
        <path
          class="knob__body"
          d={wallPath(BODY_TOP_RX, BODY_CY, BODY_BOT_RX, BODY_BOT_RY, SKIRT_CY)}
        />
        <path
          class="knob__body-shade"
          d={wallPath(BODY_TOP_RX, BODY_CY, BODY_BOT_RX, BODY_BOT_RY, SKIRT_CY)}
          fill={`url(#${uid}-stack)`}
        />
        <g class="knob__body-flutes">
          {#each bodyFlutes as f (f.i)}
            <line
              x1={f.x1}
              y1={f.y1}
              x2={f.x2}
              y2={f.y2}
              stroke-width="0.58"
              stroke={`rgba(0,0,0,${f.groove})`}
            />
            <line
              x1={f.x1 + 0.32}
              y1={f.y1}
              x2={f.x2 + 0.32}
              y2={f.y2}
              stroke-width="0.32"
              stroke={`rgba(255,255,255,${f.ridge})`}
            />
          {/each}
        </g>

        <!-- 3. Body top face: the shoulder around the cap. -->
        <ellipse
          class="knob__shoulder"
          cx={CX}
          cy={BODY_CY}
          rx={BODY_TOP_RX}
          ry={BODY_TOP_RY}
          fill={`url(#${uid}-bodyface)`}
        />

        <!-- 4. Cap. -->
        <g class="knob__cap-group">
          <!-- Ambient occlusion where the cap meets the shoulder. -->
          <ellipse
            class="knob__cap-ao"
            cx={CX}
            cy={CAP_BOT_CY + 0.6}
            rx={CAP_RX + 1.2}
            ry={CAP_RY + 0.7}
            filter={`url(#${uid}-blur-sm)`}
          />

          <path
            class="knob__cap-wall"
            d={wallPath(CAP_RX, CAP_TOP_CY, CAP_RX, CAP_RY, CAP_BOT_CY)}
            fill={`url(#${uid}-capwall)`}
          />

          <ellipse
            class="knob__cap-top"
            cx={CX}
            cy={CAP_TOP_CY}
            rx={CAP_RX}
            ry={CAP_RY}
            fill={`url(#${uid}-cap)`}
          />
          <ellipse
            class="knob__cap-gloss"
            cx={CX - 1.6}
            cy={CAP_TOP_CY - 2.2}
            rx={CAP_RX * 0.82}
            ry={CAP_RY * 0.78}
            fill={`url(#${uid}-gloss)`}
          />
          <!-- A single tight specular, high on the top-left: the giveaway that
               this is moulded plastic with a semi-gloss finish. -->
          <ellipse
            class="knob__cap-spec"
            cx={CX - 6.2}
            cy={CAP_TOP_CY - 5.2}
            rx="2.9"
            ry="1.4"
            transform={`rotate(-28 ${CX - 6.2} ${CAP_TOP_CY - 5.2})`}
            filter={`url(#${uid}-blur-sm)`}
          />
          <!-- Top bevel: a thin lit rim on the upper-left, dark on the far side. -->
          <ellipse
            class="knob__cap-bevel"
            cx={CX}
            cy={CAP_TOP_CY}
            rx={CAP_RX - 0.35}
            ry={CAP_RY - 0.35}
          />

          <!-- Painted index line: centre of the cap out to the rim. -->
          <g class="knob__pointer">
            <line
              class="knob__pointer-ink"
              x1={pointer.x1}
              y1={pointer.y1}
              x2={pointer.x2}
              y2={pointer.y2}
            />
          </g>
        </g>

        <!-- Focus bezel: in the clear band, never over printed scale. -->
        <g class="knob__focus">
          <ellipse
            class="knob__focus-gap"
            cx={CX}
            cy={BASE_CY}
            rx={FOCUS_RX}
            ry={FOCUS_RY}
          />
          <ellipse
            class="knob__focus-ring"
            cx={CX}
            cy={BASE_CY}
            rx={FOCUS_RX}
            ry={FOCUS_RY}
          />
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
    --knob-size: 7.5rem;
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

  .knob__surface {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  /* --- shadows ---------------------------------------------------------- */

  .knob__shadow-wide {
    fill: rgba(0, 0, 0, 0.5);
  }

  .knob__shadow-tight {
    fill: rgba(0, 0, 0, 0.72);
  }

  /* --- skirt + body: dark turned plastic -------------------------------- */

  .knob__skirt {
    fill: var(--al-material-surface-raised);
  }

  .knob__body {
    fill: var(--al-material-surface-raised);
  }

  /* The stack gradient is applied over the fills so both parts share the
     same cylinder lighting; the skirt sits a touch darker than the body. */
  .knob__skirt-shade,
  .knob__body-shade {
    pointer-events: none;
  }

  .knob__skirt-flutes,
  .knob__body-flutes {
    pointer-events: none;
  }

  .knob__skirt-lip {
    fill: none;
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 0.6;
    stroke-linecap: round;
  }

  .knob__shoulder {
    fill: var(--al-material-surface-raised);
  }

  /* --- cap -------------------------------------------------------------- */

  .knob__cap-ao {
    fill: rgba(0, 0, 0, 0.45);
  }

  .knob__cap-top,
  .knob__cap-wall {
    /* A hairline dark edge keeps the cap's silhouette crisp against the
       shoulder without adding a drawn outline. */
    filter: drop-shadow(0 0.6px 0.7px rgba(0, 0, 0, 0.55));
  }

  .knob__cap-spec {
    fill: rgba(255, 255, 255, 0.55);
  }

  .knob__cap-bevel {
    fill: none;
    stroke: rgba(255, 255, 255, 0.38);
    stroke-width: 0.55;
    stroke-opacity: 0.85;
  }

  /* --- pointer: painted index line -------------------------------------- */

  .knob__pointer-ink {
    stroke: var(--cap-ink);
    stroke-width: 2;
    stroke-linecap: butt;
    /* A hair of dark beneath the paint: the line sits in the surface rather
       than floating on it. */
    filter: drop-shadow(0 0.35px 0.35px rgba(0, 0, 0, 0.45));
  }

  /* --- scale ------------------------------------------------------------ */

  .knob__ticks line {
    stroke: var(--al-material-metal);
    stroke-width: 0.7;
    stroke-opacity: 0.45;
    stroke-linecap: round;
  }

  .knob__ticks line.is-major {
    stroke-width: 1.1;
    stroke-opacity: 0.9;
  }

  .knob__reference {
    fill: var(--al-material-metal);
    fill-opacity: 0.85;
  }

  .knob__extreme {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 8.2px;
    font-variant-numeric: tabular-nums;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: var(--al-material-panel);
    stroke-width: 2.4px;
    stroke-linejoin: round;
  }

  /* --- states ----------------------------------------------------------- */

  .knob__focus {
    opacity: 0;
    transition: opacity 90ms ease;
  }

  .knob__focus-gap {
    fill: none;
    stroke: var(--al-material-panel);
    stroke-width: 3.4;
  }

  .knob__focus-ring {
    fill: none;
    stroke: var(--al-text-engraved);
    stroke-width: 1.7;
  }

  .knob__dial:focus-visible .knob__focus,
  .knob.is-demo-focus .knob__focus {
    opacity: 1;
    /* A second, wider break in the panel print: unmistakable without
       crossing into the tick ring. */
    filter: drop-shadow(0 0 1.2px var(--al-material-panel));
  }

  /* Hover: the cap catches a little more room light. No movement. */
  .knob__cap-top,
  .knob__cap-gloss {
    transition: opacity 110ms ease;
  }

  .knob.is-hovered:not(.is-disabled) .knob__cap-gloss {
    opacity: 1.15;
  }

  /* Dragging: the cap presses down into the barrel — it physically lowers,
     which is what a finger on a pot does. */
  .knob__cap-group {
    transition: transform 70ms ease-out;
  }

  .knob.is-dragging .knob__cap-group {
    transform: translateY(1.6px);
  }

  .knob.is-dragging .knob__cap-spec {
    opacity: 0.6;
  }

  .knob.is-dragging .knob__cap-ao {
    fill: rgba(0, 0, 0, 0.72);
  }

  /* Disabled: de-energised, not greyscaled. No specular, no gloss, colours
     sink toward the panel, print contrast drops. */
  .knob.is-disabled .knob__cap-spec,
  .knob.is-disabled .knob__cap-gloss {
    opacity: 0.1;
  }

  .knob.is-disabled .knob__cap-top,
  .knob.is-disabled .knob__cap-wall {
    opacity: 0.55;
  }

  .knob.is-disabled .knob__body,
  .knob.is-disabled .knob__skirt,
  .knob.is-disabled .knob__shoulder {
    opacity: 0.72;
  }

  .knob.is-disabled .knob__body-flutes,
  .knob.is-disabled .knob__skirt-flutes {
    opacity: 0.5;
  }

  .knob.is-disabled .knob__pointer-ink {
    stroke: rgba(0, 0, 0, 0.4);
  }

  .knob.is-disabled .knob__ticks line {
    stroke-opacity: 0.2;
  }

  .knob.is-disabled .knob__reference,
  .knob.is-disabled .knob__extreme {
    opacity: 0.4;
  }

  /* --- label & readout --------------------------------------------------- */

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

  .knob__value,
  .knob__input {
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

  .knob__value {
    cursor: text;
  }

  .knob__value:disabled {
    color: var(--al-text-muted);
    cursor: not-allowed;
  }

  .knob__value:hover:not(:disabled) {
    border-color: var(--al-text-muted);
  }

  .knob__input {
    width: 6.4em;
    outline: none;
  }

  .knob__input:focus {
    border-color: var(--al-text-secondary);
  }

  .knob__input.is-invalid {
    border-color: var(--al-function-red-base);
  }

  .knob__input::selection {
    background: var(--al-function-amber-lo);
    color: var(--al-text-primary);
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

  /* Only the focus ring and hover sheen ease. The pointer follows input
     directly and must never be animated, or it would lag a drag. */
  @media (prefers-reduced-motion: reduce) {
    .knob__focus,
    .knob__cap-top,
    .knob__cap-gloss,
    .knob__cap-group {
      transition: none;
    }
  }
</style>
