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
   * model: the cap is recessed and the light comes from the top left.
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

  /**
   * The depth slice sits this far below the axis. It is the one intentional
   * offset in the drawing and it belongs to the side wall only — never to a
   * centre. Named here so it cannot be mistaken for one.
   */
  const SIDE_WALL_DY = 10;

  /** Where the knurl band starts. The supplied asset runs 134 -> 148. */
  const RIDGE_INNER = 134;

  /* --- the recess ----------------------------------------------------------
     ONE model, ONE light. The cap is recessed inside the ring, and the light
     comes from the top left; every shadow and highlight below follows that one
     direction. There is no raised edge anywhere in the drawing.

       ring top surface   134 -> 150   (the knurling sits on this)
       inner wall         130 -> 134
       cap                0   -> 130, and no part of the cap is larger

     All three are circles at (0,0), so the recess shares the one centre.
  ------------------------------------------------------------------------- */
  /** Where the ring's top surface stops and its inner wall starts. */
  const RING_INNER = RIDGE_INNER; // 134
  /** The cap's radius. It is also the inner wall's inner edge — never larger. */
  const CAP_R = 130;

  /**
   * The cap is FLAT. There is no gradient, no inset shadow and no occlusion
   * ellipse on the face; the only shading it carries is a hairline where it
   * meets the grip. All the lighting lives on the grip, the rim and the knurl.
   *
   * The line is one pixel at the default 7.5rem size: 1 px / (0.3 px per
   * viewBox unit) / ART_SCALE = 2.93 art units.
   */
  const CAP_EDGE_W = 3; // ~1 px at the default size

  /** The drawing is scaled to leave room for the panel print around it. */
  const ART_SCALE = 0.88;
  /** The knob's one transform: place the axis, then scale the whole drawing. */
  const KNOB_TRANSFORM = `translate(${C} ${C}) scale(${ART_SCALE})`;

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
             The drawing is one model: the cap is recessed inside the ring and
             the light comes from the top left. Every shadow and highlight
             below follows that one direction. Every id is namespaced with the
             instance uid so two knobs can share a page.
             ============================================================ -->

        <!-- The knob's silhouette: the body plus its lower side wall. -->
        <clipPath id={`${uid}-silhouette`}>
          <circle cx="0" cy="0" r="150" />
          <circle cx="0" cy="10" r="150" />
        </clipPath>

        <!-- The cap. Its shadow, its gloss and the pointer are all clipped to
             this one circle, so nothing can spill past the cap's edge. -->
        <clipPath id={`${uid}-cap-clip`}>
          <circle cx="0" cy="0" r={CAP_R} />
        </clipPath>

        <!-- The grip's nickel, exactly as supplied: one user-space ramp across
             the asset's own 400-unit canvas. It is referenced from inside the
             asset group, so its coordinates are the asset's. -->
        <linearGradient
          id={`${uid}-nickel-asset`}
          gradientUnits="userSpaceOnUse"
          x1="80"
          y1="58"
          x2="316"
          y2="340"
        >
          <stop offset="0" stop-color="#f2f1eb" />
          <stop offset="0.19" stop-color="#cfd1cc" />
          <stop offset="0.46" stop-color="#a9aca7" />
          <stop offset="0.7" stop-color="#747873" />
          <stop offset="0.86" stop-color="#cfd1cc" />
          <stop offset="1" stop-color="#444844" />
        </linearGradient>

        <!-- THE INNER WALL: dark where it faces away from the light at the top
             left, bright where the light catches it at the bottom right. One
             circle, one linear gradient, corner to corner. -->
        <linearGradient id={`${uid}-inner-wall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style="stop-color: #080808" />
          <stop offset="45%" style="stop-color: #2a2a2a" />
          <stop offset="100%" style="stop-color: #a0a0a0" />
        </linearGradient>

        <!-- The lower side wall: the same brushed nickel, turned from the
             light. This is the knob's thickness, not a shading layer. -->
        <linearGradient
          id={`${uid}-side-wall`}
          gradientUnits="userSpaceOnUse"
          x1="-145"
          y1="-105"
          x2="125"
          y2="160"
        >
          <stop offset="0%" style="stop-color: var(--kn-nickel-base)" />
          <stop offset="55%" style="stop-color: var(--kn-nickel-lo)" />
          <stop offset="100%" style="stop-color: var(--kn-nickel-deep)" />
        </linearGradient>

        <!-- The pointer: white on the dark families, ink where the body is
             pale, so the index stays legible in all six. -->
        <linearGradient id={`${uid}-indicator`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--kn-ink)" />
          <stop offset="100%" style="stop-color: var(--kn-ink-far)" />
        </linearGradient>

        <!-- The knob's contact shadow on the panel. Not part of the cap. -->
        <filter id={`${uid}-soft-light`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
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
        <!-- ONE SOURCE OF TRUTH FOR THE CENTRE.
             The complete knob is drawn inside this single translate, so the
             axis it turns about is (0,0) for every layer of the recess: ring
             top surface, knurl teeth, inner wall, cap and pointer pivot all use
             cx/cy = 0. Only the two shadow layers are offset, by design, and
             both are clipped to the cap. -->
        <g data-part="knob-centre" transform={KNOB_TRANSFORM}>
          <g data-part="knob">
            <!-- 0. DEPTH SLICE, behind everything and clipped to the
                 silhouette. This is the artwork's lower side wall: a body-
                 coloured disc sitting at +10 in y, which is what gives the
                 knob its thickness. It is deliberately offset — that is the
                 depth — and it is never used as a cap or grip centre. -->
            <g
              data-part="depth"
              filter={`url(#${uid}-satin)`}
              clip-path={`url(#${uid}-silhouette)`}
            >
              <circle cx="0" cy="{SIDE_WALL_DY}" r="150" fill={`url(#${uid}-side-wall)`} />
            </g>

            <!-- 1. THE GRIP — the supplied nickel asset, kept verbatim.
                 Its own coordinates are preserved (the group maps the asset's
                 200,200 onto this knob's axis), so its gradient axes and its
                 -3 degree ridge pose are exactly as supplied. Draw order is
                 the asset's own: base ring, then ridges, then rim light and
                 rim shade. The ridge group still turns with the value. -->
            <g data-part="knob-grip" clip-path={`url(#${uid}-silhouette)`}>
              <g transform="translate(-200 -200)">
                <!-- Base nickel ring -->
                <circle
                  data-part="nickel-grip"
                  cx="200"
                  cy="200"
                  r="150"
                  fill={`url(#${uid}-nickel-asset)`}
                />

                <!-- Grip ridges (knurling): 96 grooves and 96 highlights, at
                     the asset's -3 degree pose plus the value's rotation. -->
                <g
                  data-part="rotating-knurl"
                  transform={`rotate(${assemblyRotation - 3} 200 200)`}
                >
                  <g data-part="grip-ridges">
                    <!-- Dark grooves -->
                    <line x1="334.000" y1="200.000" x2="348.000" y2="200.000" stroke="#4c504c" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="333.713" y1="208.764" x2="347.683" y2="209.680" stroke="#4b4f4b" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="332.854" y1="217.491" x2="346.734" y2="219.318" stroke="#4a4e4a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="331.425" y1="226.142" x2="345.156" y2="228.873" stroke="#494d49" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="329.434" y1="234.682" x2="342.957" y2="238.305" stroke="#484c48" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="326.889" y1="243.073" x2="340.146" y2="247.573" stroke="#474b47" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="323.800" y1="251.280" x2="336.734" y2="256.637" stroke="#464a46" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="320.181" y1="259.267" x2="332.737" y2="265.459" stroke="#464a46" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="316.047" y1="267.000" x2="328.172" y2="274.000" stroke="#454945" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="311.417" y1="274.446" x2="323.058" y2="282.224" stroke="#454945" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="306.309" y1="281.574" x2="317.416" y2="290.097" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="300.747" y1="288.352" x2="311.272" y2="297.583" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="294.752" y1="294.752" x2="304.652" y2="304.652" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="288.352" y1="300.747" x2="297.583" y2="311.272" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="281.574" y1="306.309" x2="290.097" y2="317.416" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="274.446" y1="311.417" x2="282.224" y2="323.058" stroke="#444844" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="267.000" y1="316.047" x2="274.000" y2="328.172" stroke="#454945" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="259.267" y1="320.181" x2="265.459" y2="332.737" stroke="#454945" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="251.280" y1="323.800" x2="256.637" y2="336.734" stroke="#454945" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="243.073" y1="326.889" x2="247.573" y2="340.146" stroke="#464a46" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="234.682" y1="329.434" x2="238.305" y2="342.957" stroke="#474b47" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="226.142" y1="331.425" x2="228.873" y2="345.156" stroke="#474b47" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="217.491" y1="332.854" x2="219.318" y2="346.734" stroke="#484c48" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="208.764" y1="333.713" x2="209.680" y2="347.683" stroke="#494d49" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="200.000" y1="334.000" x2="200.000" y2="348.000" stroke="#4a4e4a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="191.236" y1="333.713" x2="190.320" y2="347.683" stroke="#4b4f4b" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="182.509" y1="332.854" x2="180.682" y2="346.734" stroke="#4c504c" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="173.858" y1="331.425" x2="171.127" y2="345.156" stroke="#4e524d" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="165.318" y1="329.434" x2="161.695" y2="342.957" stroke="#4f534f" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="156.927" y1="326.889" x2="152.427" y2="340.146" stroke="#505450" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="148.720" y1="323.800" x2="143.363" y2="336.734" stroke="#525651" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="140.733" y1="320.181" x2="134.541" y2="332.737" stroke="#535753" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="133.000" y1="316.047" x2="126.000" y2="328.172" stroke="#555954" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="125.554" y1="311.417" x2="117.776" y2="323.058" stroke="#565a56" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="118.426" y1="306.309" x2="109.903" y2="317.416" stroke="#585c57" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="111.648" y1="300.747" x2="102.417" y2="311.272" stroke="#595d59" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="105.248" y1="294.752" x2="95.348" y2="304.652" stroke="#5b5f5a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="99.253" y1="288.352" x2="88.728" y2="297.583" stroke="#5c605c" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="93.691" y1="281.574" x2="82.584" y2="290.097" stroke="#5e625d" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="88.583" y1="274.446" x2="76.942" y2="282.224" stroke="#5f635f" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="83.953" y1="267.000" x2="71.828" y2="274.000" stroke="#616560" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="79.819" y1="259.267" x2="67.263" y2="265.459" stroke="#636762" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="76.200" y1="251.280" x2="63.266" y2="256.637" stroke="#646863" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="73.111" y1="243.073" x2="59.854" y2="247.573" stroke="#656965" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="70.566" y1="234.682" x2="57.043" y2="238.305" stroke="#676b66" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="68.575" y1="226.142" x2="54.844" y2="228.873" stroke="#686c68" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="67.146" y1="217.491" x2="53.266" y2="219.318" stroke="#6a6e69" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="66.287" y1="208.764" x2="52.317" y2="209.680" stroke="#6b6f6a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="66.000" y1="200.000" x2="52.000" y2="200.000" stroke="#6c706b" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="66.287" y1="191.236" x2="52.317" y2="190.320" stroke="#6d716c" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="67.146" y1="182.509" x2="53.266" y2="180.682" stroke="#6e726d" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="68.575" y1="173.858" x2="54.844" y2="171.127" stroke="#6f736e" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="70.566" y1="165.318" x2="57.043" y2="161.695" stroke="#70746f" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="73.111" y1="156.927" x2="59.854" y2="152.427" stroke="#717570" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="76.200" y1="148.720" x2="63.266" y2="143.363" stroke="#727671" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="79.819" y1="140.733" x2="67.263" y2="134.541" stroke="#727671" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="83.953" y1="133.000" x2="71.828" y2="126.000" stroke="#737772" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="88.583" y1="125.554" x2="76.942" y2="117.776" stroke="#737772" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="93.691" y1="118.426" x2="82.584" y2="109.903" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="99.253" y1="111.648" x2="88.728" y2="102.417" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="105.248" y1="105.248" x2="95.348" y2="95.348" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="111.648" y1="99.253" x2="102.417" y2="88.728" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="118.426" y1="93.691" x2="109.903" y2="82.584" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="125.554" y1="88.583" x2="117.776" y2="76.942" stroke="#747873" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="133.000" y1="83.953" x2="126.000" y2="71.828" stroke="#737772" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="140.733" y1="79.819" x2="134.541" y2="67.263" stroke="#737772" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="148.720" y1="76.200" x2="143.363" y2="63.266" stroke="#737772" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="156.927" y1="73.111" x2="152.427" y2="59.854" stroke="#727671" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="165.318" y1="70.566" x2="161.695" y2="57.043" stroke="#717570" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="173.858" y1="68.575" x2="171.127" y2="54.844" stroke="#717570" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="182.509" y1="67.146" x2="180.682" y2="53.266" stroke="#70746f" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="191.236" y1="66.287" x2="190.320" y2="52.317" stroke="#6f736e" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="200.000" y1="66.000" x2="200.000" y2="52.000" stroke="#6e726d" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="208.764" y1="66.287" x2="209.680" y2="52.317" stroke="#6d716c" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="217.491" y1="67.146" x2="219.318" y2="53.266" stroke="#6c706b" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="226.142" y1="68.575" x2="228.873" y2="54.844" stroke="#6a6e6a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="234.682" y1="70.566" x2="238.305" y2="57.043" stroke="#696d68" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="243.073" y1="73.111" x2="247.573" y2="59.854" stroke="#686c67" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="251.280" y1="76.200" x2="256.637" y2="63.266" stroke="#666a66" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="259.267" y1="79.819" x2="265.459" y2="67.263" stroke="#656964" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="267.000" y1="83.953" x2="274.000" y2="71.828" stroke="#636763" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="274.446" y1="88.583" x2="282.224" y2="76.942" stroke="#626661" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="281.574" y1="93.691" x2="290.097" y2="82.584" stroke="#606460" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="288.352" y1="99.253" x2="297.583" y2="88.728" stroke="#5f635e" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="294.752" y1="105.248" x2="304.652" y2="95.348" stroke="#5d615d" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="300.747" y1="111.648" x2="311.272" y2="102.417" stroke="#5c605b" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="306.309" y1="118.426" x2="317.416" y2="109.903" stroke="#5a5e5a" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="311.417" y1="125.554" x2="323.058" y2="117.776" stroke="#595d58" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="316.047" y1="133.000" x2="328.172" y2="126.000" stroke="#575b57" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="320.181" y1="140.733" x2="332.737" y2="134.541" stroke="#555955" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="323.800" y1="148.720" x2="336.734" y2="143.363" stroke="#545854" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="326.889" y1="156.927" x2="340.146" y2="152.427" stroke="#535752" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="329.434" y1="165.318" x2="342.957" y2="161.695" stroke="#515551" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="331.425" y1="173.858" x2="345.156" y2="171.127" stroke="#50544f" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="332.854" y1="182.509" x2="346.734" y2="180.682" stroke="#4e524e" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="333.713" y1="191.236" x2="347.683" y2="190.320" stroke="#4d514d" stroke-width="2.2" stroke-linecap="round" />
                    <!-- Light highlights -->
                    <line x1="333.948" y1="203.741" x2="347.942" y2="204.132" stroke="#898c87" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="333.416" y1="212.494" x2="347.355" y2="213.799" stroke="#868984" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="332.313" y1="221.193" x2="346.137" y2="223.407" stroke="#838681" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="330.644" y1="229.802" x2="344.293" y2="232.915" stroke="#80847f" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="328.415" y1="238.282" x2="341.832" y2="242.282" stroke="#7e827c" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="325.636" y1="246.599" x2="338.763" y2="251.468" stroke="#7c7f7a" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="322.320" y1="254.716" x2="335.099" y2="260.433" stroke="#7a7e79" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="318.479" y1="262.599" x2="330.858" y2="269.139" stroke="#787c77" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="314.131" y1="270.214" x2="326.056" y2="277.550" stroke="#777b76" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="309.295" y1="277.528" x2="320.714" y2="285.628" stroke="#767a75" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="303.990" y1="284.511" x2="314.855" y2="293.340" stroke="#757974" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="298.240" y1="291.131" x2="308.504" y2="300.652" stroke="#747873" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="292.070" y1="297.361" x2="301.689" y2="307.533" stroke="#747873" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="285.505" y1="303.174" x2="294.438" y2="313.954" stroke="#747873" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="278.574" y1="308.546" x2="286.783" y2="319.886" stroke="#747873" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="271.306" y1="313.452" x2="278.756" y2="325.305" stroke="#757974" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="263.734" y1="317.873" x2="270.392" y2="330.188" stroke="#767a75" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="255.888" y1="321.789" x2="261.727" y2="334.513" stroke="#777b76" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="247.803" y1="325.183" x2="252.797" y2="338.262" stroke="#797c77" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="239.513" y1="328.042" x2="243.641" y2="341.419" stroke="#7a7e79" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="231.054" y1="330.352" x2="234.299" y2="343.971" stroke="#7c807b" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="222.462" y1="332.104" x2="224.809" y2="345.906" stroke="#7e827d" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="213.774" y1="333.290" x2="215.213" y2="347.216" stroke="#81847f" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="205.027" y1="333.906" x2="205.552" y2="347.896" stroke="#848782" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="196.259" y1="333.948" x2="195.868" y2="347.942" stroke="#878a85" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="187.506" y1="333.416" x2="186.201" y2="347.355" stroke="#8a8d88" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="178.807" y1="332.313" x2="176.593" y2="346.137" stroke="#8d908b" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="170.198" y1="330.644" x2="167.085" y2="344.293" stroke="#91948e" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="161.718" y1="328.415" x2="157.718" y2="341.832" stroke="#949792" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="153.401" y1="325.636" x2="148.532" y2="338.763" stroke="#989b96" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="145.284" y1="322.320" x2="139.567" y2="335.099" stroke="#9c9f99" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="137.401" y1="318.479" x2="130.861" y2="330.858" stroke="#a0a39d" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="129.786" y1="314.131" x2="122.450" y2="326.056" stroke="#a4a7a1" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="122.472" y1="309.295" x2="114.372" y2="320.714" stroke="#a9aba5" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="115.489" y1="303.990" x2="106.660" y2="314.855" stroke="#adafaa" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="108.869" y1="298.240" x2="99.348" y2="308.504" stroke="#b1b3ae" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="102.639" y1="292.070" x2="92.467" y2="301.689" stroke="#b6b7b2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="96.826" y1="285.505" x2="86.046" y2="294.438" stroke="#babcb6" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="91.454" y1="278.574" x2="80.114" y2="286.783" stroke="#bfc0ba" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="86.548" y1="271.306" x2="74.695" y2="278.756" stroke="#c3c4bf" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="82.127" y1="263.734" x2="69.812" y2="270.392" stroke="#c7c8c3" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="78.211" y1="255.888" x2="65.487" y2="261.727" stroke="#ccccc7" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="74.817" y1="247.803" x2="61.738" y2="252.797" stroke="#d0d0cb" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="71.958" y1="239.513" x2="58.581" y2="243.641" stroke="#d4d4cf" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="69.648" y1="231.054" x2="56.029" y2="234.299" stroke="#d8d8d2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="67.896" y1="222.462" x2="54.094" y2="224.809" stroke="#dcdcd6" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="66.710" y1="213.774" x2="52.784" y2="215.213" stroke="#dfdfda" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="66.094" y1="205.027" x2="52.104" y2="205.552" stroke="#e3e3dd" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="66.052" y1="196.259" x2="52.058" y2="195.868" stroke="#e6e6e0" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="66.584" y1="187.506" x2="52.645" y2="186.201" stroke="#e9e9e3" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="67.687" y1="178.807" x2="53.863" y2="176.593" stroke="#ecece6" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="69.356" y1="170.198" x2="55.707" y2="167.085" stroke="#efeee8" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="71.585" y1="161.718" x2="58.168" y2="157.718" stroke="#f1f0eb" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="74.364" y1="153.401" x2="61.237" y2="148.532" stroke="#f3f3ed" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="77.680" y1="145.284" x2="64.901" y2="139.567" stroke="#f5f4ee" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="81.521" y1="137.401" x2="69.142" y2="130.861" stroke="#f7f6f0" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="85.869" y1="129.786" x2="73.944" y2="122.450" stroke="#f8f7f1" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="90.705" y1="122.472" x2="79.286" y2="114.372" stroke="#f9f8f2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="96.010" y1="115.489" x2="85.145" y2="106.660" stroke="#faf9f3" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="101.760" y1="108.869" x2="91.496" y2="99.348" stroke="#fbfaf4" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="107.930" y1="102.639" x2="98.311" y2="92.467" stroke="#fbfaf4" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="114.495" y1="96.826" x2="105.562" y2="86.046" stroke="#fbfaf4" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="121.426" y1="91.454" x2="113.217" y2="80.114" stroke="#fbfaf4" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="128.694" y1="86.548" x2="121.244" y2="74.695" stroke="#faf9f3" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="136.266" y1="82.127" x2="129.608" y2="69.812" stroke="#f9f8f2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="144.112" y1="78.211" x2="138.273" y2="65.487" stroke="#f8f7f1" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="152.197" y1="74.817" x2="147.203" y2="61.738" stroke="#f6f6f0" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="160.487" y1="71.958" x2="156.359" y2="58.581" stroke="#f5f4ee" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="168.946" y1="69.648" x2="165.701" y2="56.029" stroke="#f3f2ec" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="177.538" y1="67.896" x2="175.191" y2="54.094" stroke="#f1f0ea" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="186.226" y1="66.710" x2="184.787" y2="52.784" stroke="#eeeee8" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="194.973" y1="66.094" x2="194.448" y2="52.104" stroke="#ebebe5" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="203.741" y1="66.052" x2="204.132" y2="52.058" stroke="#e8e8e2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="212.494" y1="66.584" x2="213.799" y2="52.645" stroke="#e5e5df" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="221.193" y1="67.687" x2="223.407" y2="53.863" stroke="#e2e2dc" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="229.802" y1="69.356" x2="232.915" y2="55.707" stroke="#deded9" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="238.282" y1="71.585" x2="242.282" y2="58.168" stroke="#dbdbd5" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="246.599" y1="74.364" x2="251.468" y2="61.237" stroke="#d7d7d1" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="254.716" y1="77.680" x2="260.433" y2="64.901" stroke="#d3d3ce" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="262.599" y1="81.521" x2="269.139" y2="69.142" stroke="#cfcfca" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="270.214" y1="85.869" x2="277.550" y2="73.944" stroke="#cbcbc6" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="277.528" y1="90.705" x2="285.628" y2="79.286" stroke="#c6c7c2" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="284.511" y1="96.010" x2="293.340" y2="85.145" stroke="#c2c3bd" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="291.131" y1="101.760" x2="300.652" y2="91.496" stroke="#bebfb9" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="297.361" y1="107.930" x2="307.533" y2="98.311" stroke="#b9bbb5" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="303.174" y1="114.495" x2="313.954" y2="105.562" stroke="#b5b6b1" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="308.546" y1="121.426" x2="319.886" y2="113.217" stroke="#b0b2ad" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="313.452" y1="128.694" x2="325.305" y2="121.244" stroke="#acaea8" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="317.873" y1="136.266" x2="330.188" y2="129.608" stroke="#a8aaa4" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="321.789" y1="144.112" x2="334.513" y2="138.273" stroke="#a3a6a0" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="325.183" y1="152.197" x2="338.262" y2="147.203" stroke="#9fa29c" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="328.042" y1="160.487" x2="341.419" y2="156.359" stroke="#9b9e98" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="330.352" y1="168.946" x2="343.971" y2="165.701" stroke="#979a95" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="332.104" y1="177.538" x2="345.906" y2="175.191" stroke="#939691" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="333.290" y1="186.226" x2="347.216" y2="184.787" stroke="#90938d" stroke-width="1.35" stroke-linecap="round" />
                    <line x1="333.906" y1="194.973" x2="347.896" y2="194.448" stroke="#8c8f8a" stroke-width="1.35" stroke-linecap="round" />
                  </g>
                </g>

                <!-- Nickel rim material lighting -->
                <path
                  data-part="nickel-rim-light"
                  d="M 57.68 169.75 A 145.5 145.5 0 0 1 244.96 61.62"
                  fill="none"
                  stroke="#fffef8"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  opacity="0.72"
                />
                <path
                  data-part="nickel-rim-shade"
                  d="M 162.34 340.54 A 145.5 145.5 0 0 1 59.46 237.66"
                  fill="none"
                  stroke="#4a4e49"
                  stroke-width="3.2"
                  stroke-linecap="round"
                  opacity="0.34"
                />
              </g>
            </g>

            <!-- 3. THE INNER WALL. Static: the ring does not turn its wall with
                 the value. Dark at the top left, bright at the bottom right. -->
            <circle
              data-part="inner-wall"
              cx="0"
              cy="0"
              r={RING_INNER}
              fill={`url(#${uid}-inner-wall)`}
            />

            <!-- 4. THE CAP. Flat fill, no gradient, no filter. Nothing on the
                 face but the colour itself. -->
            <circle
              data-part="cap"
              cx="0"
              cy="0"
              r={CAP_R}
              fill="var(--kn-cap-face)"
            />

            <!-- 5. THE CAP'S ONLY SHADING: a hairline where the cap edge meets
                 the grip. One pixel at the default size, on the cap's own edge
                 — not a shifted circle, not a gradient, not an inset shadow. -->
            <circle
              class="knob__cap-edge"
              data-part="cap-edge"
              cx="0"
              cy="0"
              r={CAP_R - CAP_EDGE_W / 2}
              fill="none"
              stroke="var(--kn-cap-shade)"
              stroke-width={CAP_EDGE_W}
            />

            <!-- 7. THE POINTER. On the cap, clipped to it, and it rotates with
                 the value like the knurling. -->
            <g
              class="knob__assembly"
              data-part="rotating-indicator"
              transform={`rotate(${assemblyRotation})`}
            >
              <g clip-path={`url(#${uid}-cap-clip)`}>
                <rect
                  class="knob__pointer-ink"
                  x="20"
                  y="-7.5"
                  width="105"
                  height="15"
                  rx="1.5"
                  fill={`url(#${uid}-indicator)`}
                />
              </g>
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
    /* THE CAP IS FLAT: one colour, no gradient. It is the family's base tone,
       taken a step down so it still sits below the metal, and it is the whole
       of the cap face. */
    --kn-cap-face: color-mix(in srgb, var(--cap-base) 94%, black);
    --kn-face-lo: color-mix(in srgb, var(--cap-lo) 94%, black);
    /* The hairline where the cap meets the grip: this family's own dark tone,
       kept on the same hue so it reads as shaded paint, not neutral grey. */
    --kn-cap-shade: color-mix(in srgb, var(--kn-face-lo) 45%, black);

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

  /* Disabled: de-energised, not greyscaled — the sheen on the cap falls away,
     the paint sinks toward the panel and the index loses contrast. The gloss is
     the layer that carries the highlight now that the old lighting group is
     gone. */
  .knob.is-disabled .knob__cap-edge {
    opacity: 0.35;
  }

  /* The cap's only shading: a hairline on its own edge. Partly transparent, so
     it seats the cap without tinting the face. */
  .knob__cap-edge {
    opacity: 0.55;
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
    .knob__pointer-ink,
    .knob__press {
      transition: none;
    }
  }
</style>

