<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide across knobs. */
  let nextId = 0;
</script>
<script lang="ts">
  import { tick } from "svelte";
  import { functionToken, type FunctionFamily } from "../../lib/tokens";

  /**
   * ALLOY rotary pot — Task 1.2.
   *
   * The supplied artwork IS the knob: its 400 x 400 canvas, its geometry, its
   * two ridge rings, its filters, its gradients and its fixed lighting are all
   * kept. What changed is only what had to change to make it a control:
   *
   *   1. THE WHOLE ASSEMBLY ROTATES. The supplied `rotating-surfaces` group
   *      already contains both ridge rings AND the white pointer, and that is
   *      exactly what rotates here, together, about the knob centre (200,200).
   *      The pointer is never separated from the grip detail: it is a child of
   *      the same rotating group the artwork put it in.
   *
   *   2. THE -88 DEGREE POSE IS THE ARTWORK'S ORIENTATION, NOT THE VALUE. It is
   *      kept as ARTWORK_ORIENTATION, and the value's angle rides on top of it.
   *      The artwork draws its pointer along +x pointing 2 degrees short of
   *      vertical, so a 2 degree trim reconciles the supplied pose with the
   *      component's scale — without it the index would sit 2 degrees past every
   *      graduation at every value. Set ORIENTATION_TRIM to 0 for the artwork's
   *      literal pose.
   *
   *   3. THE BLUE IS NOW THE FAMILY COLOUR. The paint, the side wall and both
   *      ridge rings are driven by the family's hi / base / lo tokens, so the
   *      same artwork renders all six functional colours. The ridge rings keep
   *      their supplied per-ridge variation, re-expressed as a per-ridge opacity
   *      ramp derived from each ridge's angle against the key light.
   *
   * The body and face circles are radially symmetric, so their rotation is a
   * visual no-op; the supplied file draws the light as a separate, stationary
   * overlay (fixed-lighting), which is retained exactly as supplied.
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

  /* --- the artwork's coordinate system -------------------------------------
     Supplied: a 400 x 400 canvas, knob centred at (200,200).

       continuous body   r = 150, centred (200,200)
       side wall         r = 150, centred (200,210) — the crescent below
       recessed cap      r = 131, centred (200,200)
       ridge rings       96 dark ridges (3.75 deg pitch, from 0 deg)
                         96 light ridges (same pitch, offset 1.6 deg)
                         both running r = 134 -> 148, i.e. 0.89 -> 0.99 of the body
       pointer           rect from r = 20 to r = 125 along +x, 15 wide
  ------------------------------------------------------------------------- */

  const C = 200;

  /** Supplied orientation pose of `rotating-surfaces`. */
  const ARTWORK_ORIENTATION = -88;
  /**
   * The supplied pointer points 2 degrees short of 12 o'clock. This trims that
   * so the index lands exactly on the component's graduations. 0 = literal
   * artwork pose.
   */
  const ORIENTATION_TRIM = 2;

  const RIDGE_INNER = 134;
  const RIDGE_OUTER = 148;
  const RIDGE_COUNT = 96;
  const RIDGE_PITCH = 360 / RIDGE_COUNT;
  /** The light ring sits between the dark ring's ridges, as supplied. */
  const RIDGE_LIGHT_OFFSET = 1.6;

  /** The drawing is scaled to leave room for the panel print around it. */
  const ART_SCALE = 0.88;
  const ART_TRANSFORM = `translate(${C} ${C}) scale(${ART_SCALE}) translate(${-C} ${-C})`;

  /* --- panel print, in the panel plane outside the housing ----------------
     The artwork's canvas is 400 units wide where the earlier component drew in
     120, and the knob is shown at 7.5rem (120 px), so one user unit is 0.3 px.
     Print sizes here are therefore ~3.33x the earlier numbers, which restores
     the approved Task 1.1 scale: numerals ~7.8 px, minor ticks ~0.72 px.
  ------------------------------------------------------------------------- */
  const TICK_IN = 142;
  const TICK_MINOR = 163;
  const TICK_MAJOR = 170;
  const NUM_R = 185;
  const REF_R = 176;

  /** Focus ring: in the clear band between the housing and the first tick. */
  const FOCUS_R = 136.5;

  /** Sweep and graduations — unchanged from the existing component. */
  const SWEEP = 270;
  const START_ANGLE = -135;
  const TICK_COUNT = 27;

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

  /* --- artwork helpers ----------------------------------------------------- */

  const rad = (deg: number): number => (deg * Math.PI) / 180;

  /** A point in panel-plane coordinates. 0 deg is 12 o'clock, clockwise. */
  function onCircle(radius: number, deg: number): [number, number] {
    return [C + radius * Math.sin(rad(deg)), C - radius * Math.cos(rad(deg))];
  }

  /**
   * One ridge ring, generated to the supplied geometry.
   *
   * The supplied file lists 96 lines per ring at a 3.75 degree pitch from
   * r=134 to r=148; they are reproduced exactly, with the supplied per-ridge
   * colour variation re-expressed as an opacity ramp against the key light
   * (brightest at 12 o'clock, darkest at 6 o'clock), so the rings can be driven
   * by the family colour without losing their variation.
   */
  function ridgeRing(offsetDeg: number) {
    return Array.from({ length: RIDGE_COUNT }, (_, i) => {
      const phi = offsetDeg + i * RIDGE_PITCH;
      // Angle away from 12 o'clock, for the light ramp.
      const lit = (1 + Math.cos(rad(phi + 90))) / 2;
      const a = rad(phi);
      return {
        i,
        x1: C + RIDGE_INNER * Math.cos(a),
        y1: C + RIDGE_INNER * Math.sin(a),
        x2: C + RIDGE_OUTER * Math.cos(a),
        y2: C + RIDGE_OUTER * Math.sin(a),
        lit,
      };
    });
  }

  const ridgesDark = ridgeRing(0);
  const ridgesLight = ridgeRing(RIDGE_LIGHT_OFFSET);

  /* --- panel scale --------------------------------------------------------- */

  const tickMarks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const t = index / (TICK_COUNT - 1);
    const deg = START_ANGLE + SWEEP * t;
    const major = index === 0 || index === TICK_COUNT - 1 || index % 5 === 0;
    const [x1, y1] = onCircle(TICK_IN, deg);
    const [x2, y2] = onCircle(major ? TICK_MAJOR : TICK_MINOR, deg);

    return { index, major, x1, y1, x2, y2 };
  });

  const extremePositions = [START_ANGLE, -START_ANGLE].map((deg) => {
    const [x, y] = onCircle(NUM_R, deg);
    return { x, y };
  });

  const referencePoint = onCircle(REF_R, 0);

  /** The assembly's rotation: the artwork's pose, the value's angle, the trim. */
  const assemblyRotation = $derived(angle + ARTWORK_ORIENTATION - ORIENTATION_TRIM);
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

      <!-- Panel print sits in the panel plane: it never rotates with the pointer. -->
    <svg class="knob__surface" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <!-- ============================================================
             Supplied artwork, kept: silhouette clip (body + lower side
             wall), recessed-face clip, the three supplied paints, the
             four supplied filters. Every id is namespaced with the
             instance uid so two knobs can share a page.
             ============================================================ -->
        <clipPath id={`${uid}-silhouette`}>
          <circle cx="200" cy="200" r="150" />
          <circle cx="200" cy="210" r="150" />
        </clipPath>

        <clipPath id={`${uid}-face-clip`}>
          <circle cx="200" cy="200" r="131" />
        </clipPath>

        <!-- Outer rim (body) paint. Supplied geometry, axis and stop offsets;
             colour is now the brushed-nickel ramp, so the grip is metal and
             the cap carries the functional family colour. -->
        <linearGradient
          id={`${uid}-paint`}
          gradientUnits="userSpaceOnUse"
          x1="85"
          y1="65"
          x2="310"
          y2="335"
        >
          <stop offset="0%" style="stop-color: var(--kn-nickel-hi)" />
          <stop offset="30%" style="stop-color: var(--kn-nickel-base)" />
          <stop offset="58%" style="stop-color: var(--kn-nickel-mid)" />
          <stop offset="100%" style="stop-color: var(--kn-nickel-lo)" />
        </linearGradient>

        <!-- Recessed-face paint: the body paint, turned down into the recess.
             Same supplied geometry and stop offsets; every stop is mixed
             toward black so the face sits a visible step below the annulus
             instead of reading as the top of a dome. -->
        <linearGradient
          id={`${uid}-face-paint`}
          gradientUnits="userSpaceOnUse"
          x1="85"
          y1="65"
          x2="310"
          y2="335"
        >
          <stop offset="0%" style="stop-color: var(--kn-face-hi)" />
          <stop offset="30%" style="stop-color: var(--kn-face-base)" />
          <stop offset="58%" style="stop-color: var(--kn-face-base)" />
          <stop offset="100%" style="stop-color: var(--kn-face-lo)" />
        </linearGradient>

        <!-- Lower side wall: the same brushed nickel turned from the light. -->
        <linearGradient
          id={`${uid}-side-wall`}
          gradientUnits="userSpaceOnUse"
          x1="55"
          y1="95"
          x2="325"
          y2="360"
        >
          <stop offset="0%" style="stop-color: var(--kn-nickel-base)" />
          <stop offset="55%" style="stop-color: var(--kn-nickel-lo)" />
          <stop offset="100%" style="stop-color: var(--kn-nickel-deep)" />
        </linearGradient>

        <!-- Pointer: white on the dark families, ink where the body is pale,
             so the index stays legible in all six. -->
        <linearGradient id={`${uid}-indicator`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--kn-ink)" />
          <stop offset="100%" style="stop-color: var(--kn-ink-far)" />
        </linearGradient>

        <!-- The turned outer edge of the rim: a thin specular strip that
             fades round the circumference, the way a machined bevel catches
             the room light on the side facing it. Shading only. -->
        <linearGradient
          id={`${uid}-rim-light`}
          gradientUnits="userSpaceOnUse"
          x1="85"
          y1="65"
          x2="310"
          y2="335"
        >
          <stop offset="0%" style="stop-color: var(--kn-nickel-crest)" stop-opacity="0.55" />
          <stop offset="34%" style="stop-color: var(--kn-nickel-crest)" stop-opacity="0.16" />
          <stop offset="62%" style="stop-color: var(--kn-nickel-deep)" stop-opacity="0.35" />
          <stop offset="100%" style="stop-color: var(--kn-nickel-deep)" stop-opacity="0.7" />
        </linearGradient>

        <!-- Recess: the supplied inset shadow, re-tinted neutral so it does
             not read blue on a non-blue family. -->
        <!--
          The recess shadow hugs the cap's whole circumference.

          It used to be offset down-right, which made the shadow read as a
          *drop* shadow under the cap's lower-right edge — the cap looked like a
          loose plate lying on the metal on that side, and, with no shadow at
          all at the upper-left, it looked sunk on the other side. An offset of
          zero keeps the same supplied offset → blur → composite out → flood →
          merge structure, but the shadow now rings the cap evenly, which is
          what a collar gripping a cap casts.
        -->
        <filter id={`${uid}-inset`} x="-15%" y="-15%" width="130%" height="130%">
          <feOffset dx="0" dy="0" in="SourceAlpha" result="off" />
          <feGaussianBlur in="off" stdDeviation="4.2" result="blur" />
          <feComposite in="SourceAlpha" in2="blur" operator="out" result="ring" />
          <feFlood flood-color="black" flood-opacity="0.8" />
          <feComposite in2="ring" operator="in" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode />
          </feMerge>
        </filter>

        <!-- Inside the cap: the collar's far wall throws a shadow across the
             upper-left of the face, and the face falls away into the recess all
             round. Shading only — same r 131 disc, no geometry change. -->
        <radialGradient id={`${uid}-cap-inset`} cx="50%" cy="50%" r="50%">
          <stop offset="62%" style="stop-color: black" stop-opacity="0" />
          <stop offset="88%" style="stop-color: black" stop-opacity="0.16" />
          <stop offset="100%" style="stop-color: black" stop-opacity="0.42" />
        </radialGradient>
        <linearGradient
          id={`${uid}-cap-wall-shade`}
          gradientUnits="userSpaceOnUse"
          x1="150"
          y1="150"
          x2="250"
          y2="250"
        >
          <stop offset="0%" style="stop-color: black" stop-opacity="0.3" />
          <stop offset="42%" style="stop-color: black" stop-opacity="0" />
          <stop offset="100%" style="stop-color: black" stop-opacity="0.08" />
        </linearGradient>

        <filter id={`${uid}-soft-light`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>

        <filter id={`${uid}-wall-light`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>

        <!-- Satin grain: supplied turbulence grain, multiplied over the paint. -->
        <filter id={`${uid}-satin`} x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.1"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.075 0"
            result="grain"
          />
          <feBlend in="SourceGraphic" in2="grain" mode="multiply" />
        </filter>
      </defs>

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
        points={`${referencePoint[0]},${referencePoint[1] - 6} ${referencePoint[0] - 4},${referencePoint[1]} ${referencePoint[0] + 4},${referencePoint[1]}`}
      />
      <text
        class="knob__extreme"
        x={extremePositions[0].x}
        y={extremePositions[0].y}
        text-anchor="middle"
      >
        {extremeLabels[0]}
      </text>
      <text
        class="knob__extreme"
        x={extremePositions[1].x}
        y={extremePositions[1].y}
        text-anchor="middle"
      >
        {extremeLabels[1]}
      </text>

      <!-- Contact shadow, on the panel. Does not rotate. -->
      <ellipse
        class="knob__contact"
        cx="200"
        cy="336"
        rx="122"
        ry="16"
        filter={`url(#${uid}-soft-light)`}
      />

      <!-- Press-in while dragging: a CSS transform on this wrapper, so the
           artwork's own transforms stay untouched. -->
      <g class="knob__press">
        <g transform={ART_TRANSFORM}>
          <g data-part="knob">
            <!-- 1. The supplied satin group: side wall, body and recessed
                 cap, in the supplied order. All three are radially
                 symmetric, so their rotation is a visual no-op — they stay
                 where the artwork put them. -->
            <g filter={`url(#${uid}-satin)`} clip-path={`url(#${uid}-silhouette)`}>
              <circle cx="200" cy="210" r="150" fill={`url(#${uid}-side-wall)`} />
              <circle cx="200" cy="200" r="150" fill={`url(#${uid}-paint)`} />
              <!-- The machined outer edge: same circle, shading only. -->
              <circle
                class="knob__rim-light"
                cx="200"
                cy="200"
                r="148.6"
                fill="none"
                stroke={`url(#${uid}-rim-light)`}
              />

              <!-- 2. Recessed cap, with its supplied inset shadow. -->
              <circle
                cx="200"
                cy="200"
                r="131"
                fill={`url(#${uid}-face-paint)`}
                filter={`url(#${uid}-inset)`}
              />
              <!-- The collar's shadow across the face, and the face falling
                   into the recess. Same disc, shading only. -->
              <g clip-path={`url(#${uid}-face-clip)`}>
                <circle cx="200" cy="200" r="131" fill={`url(#${uid}-cap-inset)`} />
                <circle cx="200" cy="200" r="131" fill={`url(#${uid}-cap-wall-shade)`} />
              </g>

              <!-- The lip of the recess: a thin shadow just inside the face
                   edge, which is what makes the step read at small sizes. -->
              <circle
                class="knob__face-lip"
                cx="200"
                cy="200"
                r="129.5"
              />
              <!-- Where the coloured cap sits into the metal: a soft contact
                   shadow on the machined annulus. Shading only. -->
              <circle
                class="knob__cap-seat"
                cx="200"
                cy="200"
                r="132.6"
                filter={`url(#${uid}-wall-light)`}
              />
            </g>

            <!-- 3. THE ASSEMBLY. Both grip-ridge rings and the white pointer,
                 rotating together as one body about the artwork's centre. -->
            <g
              class="knob__assembly"
              data-part="rotating-surfaces"
              transform={`rotate(${assemblyRotation} 200 200)`}
            >
              <g class="knob__ridges" stroke-linecap="round">
                {#each ridgesDark as ridge (ridge.i)}
                  <line
                    x1={ridge.x1}
                    y1={ridge.y1}
                    x2={ridge.x2}
                    y2={ridge.y2}
                    stroke-width="2.2"
                    stroke="var(--kn-nickel-groove)"
                    stroke-opacity={0.82 + 0.14 * ridge.lit}
                  />
                {/each}
                {#each ridgesLight as ridge (ridge.i)}
                  <line
                    x1={ridge.x1}
                    y1={ridge.y1}
                    x2={ridge.x2}
                    y2={ridge.y2}
                    stroke-width="1.4"
                    stroke="var(--kn-nickel-crest)"
                    stroke-opacity={0.26 + 0.38 * ridge.lit}
                  />
                {/each}
              </g>

              <rect
                class="knob__pointer-ink"
                x="220"
                y="192.5"
                width="105"
                height="15"
                rx="1.5"
                fill={`url(#${uid}-indicator)`}
              />
            </g>

            <!-- 4. Fixed lighting, exactly as supplied: the panel's key light
                 does not travel round with the knob. -->
            <g class="knob__light" data-part="fixed-lighting">
              <path
                d="M 74 200 A 126 126 0 0 1 326 200"
                fill="none"
                stroke="#ffffff"
                stroke-width="7"
                stroke-opacity="0.075"
                filter={`url(#${uid}-soft-light)`}
              />
              <path
                d="M 88 200 A 112 112 0 0 1 312 200"
                fill="none"
                stroke="var(--kn-hi)"
                stroke-width="4"
                stroke-opacity="0.3"
                clip-path={`url(#${uid}-face-clip)`}
                filter={`url(#${uid}-wall-light)`}
              />
              <ellipse
                cx="176"
                cy="178"
                rx="74"
                ry="40"
                fill="#ffffff"
                fill-opacity="0.045"
                filter={`url(#${uid}-soft-light)`}
              />
            </g>
          </g>
        </g>
      </g>

      <!-- Focus ring: in the clear band between housing and first tick. -->
      <g class="knob__focus">
        <circle
          class="knob__focus-gap"
          cx="200"
          cy="200"
          r={FOCUS_R}
        />
        <circle class="knob__focus-ring" cx="200" cy="200" r={FOCUS_R} />
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
    /* The cap is the colour-variable part: it keeps the family tokens. */
    --kn-hi: var(--cap-hi);
    --kn-base: var(--cap-base);
    --kn-lo: var(--cap-lo);
    --kn-ink: var(--cap-ink);
    --kn-ink-far: color-mix(in srgb, var(--cap-ink) 88%, var(--cap-lo));
    /* Barely stepped down from the family ramp: the nickel rim now supplies
       the step into the recess, so the cap can read at (almost) its true
       family colour. Only the recess shadow darkens it further. */
    --kn-face-hi: color-mix(in srgb, var(--cap-hi) 94%, black);
    --kn-face-base: color-mix(in srgb, var(--cap-base) 94%, black);
    --kn-face-lo: color-mix(in srgb, var(--cap-lo) 94%, black);

    /* Brushed nickel: the grip, the ridges and the outer rim. Declared once,
       neutral (every channel within a few points of the others), satin —
       no warm yellow cast, no mirror chrome, no hard white. */
    --kn-nickel-hi: #c2c6c9;
    --kn-nickel-base: #8f9498;
    --kn-nickel-mid: #6e7377;
    --kn-nickel-lo: #4f5357;
    --kn-nickel-deep: #2f3336;
    --kn-nickel-groove: #34383b;
    --kn-nickel-crest: #c3c7cb;

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

  /* --- artwork ---------------------------------------------------------- */

  /* The pointer follows input directly; only the press-in is eased. */
  .knob__press {
    transition: transform 70ms ease-out;
  }

  .knob.is-dragging .knob__press {
    transform: translateY(1.4px);
  }

  .knob__contact {
    fill: rgba(0, 0, 0, 0.55);
  }

  .knob__light {
    /* Rest state is slightly under full strength so hover has somewhere to go;
       an opacity above 1 would simply clamp and do nothing. */
    opacity: 0.9;
    transition: opacity 110ms ease;
  }

  .knob__face-lip {
    fill: none;
    stroke: black;
    stroke-opacity: 0.3;
    stroke-width: 3.5;
  }

  .knob__rim-light {
    stroke-width: 2.2;
  }

  .knob__cap-seat {
    fill: none;
    stroke: black;
    stroke-opacity: 0.42;
    stroke-width: 6;
  }

  .knob__pointer-ink {
    transition: opacity 110ms ease;
  }

  /* --- scale ------------------------------------------------------------ */

  .knob__ticks line {
    stroke: var(--al-material-metal);
    /* 2.4 user units = 0.72 px at the default 7.5rem size. */
    stroke-width: 2.4;
    stroke-opacity: 0.45;
    stroke-linecap: round;
  }

  .knob__ticks line.is-major {
    stroke-width: 4;
    stroke-opacity: 0.9;
  }

  .knob__reference {
    fill: var(--al-material-metal);
    fill-opacity: 0.85;
  }

  .knob__extreme {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: var(--al-material-panel);
    stroke-width: 6px;
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
    stroke-width: 9;
  }

  .knob__focus-ring {
    fill: none;
    /* The ring now sits on the panel, not on the knob: dark engraving would
       vanish against the dark panel, so it is drawn in the panel's light text
       colour and given a panel-coloured break outside it. */
    stroke: var(--al-text-primary);
    stroke-width: 5;
  }

  .knob__dial:focus-visible .knob__focus,
  .knob.is-demo-focus .knob__focus {
    opacity: 1;
    filter: drop-shadow(0 0 2px var(--al-material-panel));
  }


  /* Hover: the room light catches the body a little more. No movement. */
  .knob.is-hovered:not(.is-disabled) .knob__light {
    opacity: 1;
  }

  /* Disabled: de-energised, not greyscaled — the highlights fall away,
     the paint sinks toward the panel and the index loses contrast. */
  .knob.is-disabled .knob__light {
    opacity: 0.2;
  }

  .knob.is-disabled .knob__pointer-ink {
    opacity: 0.42;
  }

  .knob.is-disabled .knob__press {
    opacity: 0.8;
  }

  .knob.is-disabled .knob__ticks line {
    stroke-opacity: 0.18;
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

  @media (prefers-reduced-motion: reduce) {
    .knob__focus,
    .knob__light,
    .knob__pointer-ink,
    .knob__press {
      transition: none;
    }
  }
</style>


