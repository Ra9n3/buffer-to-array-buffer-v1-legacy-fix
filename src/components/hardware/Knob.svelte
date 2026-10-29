<script lang="ts">
  import { tick } from "svelte";
  import { functionToken, type FunctionFamily } from "../../lib/tokens";

  /**
   * ALLOY rotary pot — Task 1.2.
   *
   * One component serves every functional colour; the colour is a `family`
   * prop that resolves to the Task 1.1 tokens (`functionToken()`), never to a
   * hex value of its own.
   *
   * Construction, per hardware spec §1:
   *   - knurled dark cylindrical base (CSS repeating-conic-gradient, 18 ridges)
   *   - flat circular cap, slightly smaller, with a radial highlight
   *   - single pointer line rotating with the value, in the family's ink colour
   *   - tick ring generated programmatically across 270°
   *   - numerals at the two extremes only
   *   - a fixed reference triangle printed on the panel
   *
   * Spec §6 requires layered gradients/SVG rather than flat fills, so nothing
   * here is a flat single-colour circle.
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

  const CX = 60;
  const CY = 60;
  /** Travel spans 270°, centred on 12 o'clock. */
  const SWEEP = 270;
  const START_ANGLE = -135;
  const TICK_COUNT = 11;

  let dragging = $state(false);
  let focused = $state(false);
  let editing = $state(false);
  let invalid = $state(false);
  let draft = $state("");

  let startValue = 0;
  let startX = 0;
  let startY = 0;
  let inputEl = $state<HTMLInputElement | null>(null);
  let cancelOnBlur = false;

  const precision = $derived(Math.pow(10, decimals));
  const span = $derived(Math.max(max - min, Number.EPSILON));

  const fraction = $derived(
    Math.min(1, Math.max(0, (value - min) / span)),
  );
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

  const tickMarks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const t = index / (TICK_COUNT - 1);
    const a = ((START_ANGLE + SWEEP * t) * Math.PI) / 180;
    const major = index === 0 || index === TICK_COUNT - 1 || index % 5 === 0;
    const r1 = 41.5;
    const r2 = major ? 47.5 : 45.5;

    return {
      index,
      major,
      x1: CX + r1 * Math.sin(a),
      y1: CY - r1 * Math.cos(a),
      x2: CX + r2 * Math.sin(a),
      y2: CY - r2 * Math.cos(a),
    };
  });

  const extremePositions = [-135, 135].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: CX + 56 * Math.sin(a), y: CY - 56 * Math.cos(a) };
  });
</script>

<div
  class="knob"
  class:is-disabled={disabled}
  class:is-dragging={dragging}
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
      onkeydown={onKeyDown}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      ondblclick={openEditor}
    >
      <span class="knob__ring" aria-hidden="true"></span>
      <span class="knob__base" aria-hidden="true"></span>
      <span class="knob__cap" aria-hidden="true"></span>

      <svg class="knob__overlay" viewBox="0 0 120 120" aria-hidden="true">
        <!-- Tick ring, generated across 270°, centred on 12 o'clock. -->
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

        <!-- Fixed reference triangle printed on the panel; does not rotate. -->
        <polygon class="knob__reference" points="60,7 55.5,15 64.5,15" />

        <!-- Numerals at the extremes only, per spec §1. -->
        <text class="knob__extreme" x={extremePositions[0].x} y={extremePositions[0].y} text-anchor="end">
          {extremeLabels[0]}
        </text>
        <text class="knob__extreme" x={extremePositions[1].x} y={extremePositions[1].y} text-anchor="start">
          {extremeLabels[1]}
        </text>

        <!-- Pointer: rotates with the value, drawn above the cap. -->
        <g class="knob__pointer" transform={`rotate(${angle} 60 60)`}>
          <line x1="60" y1="57" x2="60" y2="37" />
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
    padding: var(--al-space-2xs);
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

  /* Focus ring. Deliberately drawn ON the knurled collar, just inside the
     printed tick ring — not as an outer halo. A real panel prints its scale
     around the knob, so an outer ring would cut straight through the extreme
     numerals; sitting on the collar it reads as the collar catching light, and
     it cannot collide with any printed marking. */
  .knob__ring {
    position: absolute;
    inset: 16.5%;
    border: 2px solid var(--al-text-primary);
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 1px var(--al-material-panel),
      0 0 0 1px var(--al-material-panel),
      0 0 0 2px var(--al-text-primary);
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease;
  }

  .knob__dial:focus-visible .knob__ring,
  .knob.is-demo-focus .knob__ring {
    opacity: 1;
  }

  /* Knurled base: 18 alternating ridges (360° / 20° = 18), per spec's 16–20. */
  .knob__base {
    position: absolute;
    inset: 18%;
    border-radius: 50%;
    /* Ridge dark/light come from the material tokens, not from literals: the
       spec says the base is dark/black, and --al-material-recess is exactly
       that, with --al-material-surface-raised as the lit ridge face. */
    background: repeating-conic-gradient(
      from 0deg,
      var(--al-material-recess) 0deg 5deg,
      var(--al-material-surface-raised) 5deg 20deg
    );
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.85),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 3px 6px rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8);
  }

  /* Cylinder shading over the ridges, so the base reads as round, not striped. */
  .knob__base::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(
      circle at 36% 30%,
      rgba(255, 255, 255, 0.16) 0%,
      rgba(255, 255, 255, 0) 42%,
      rgba(0, 0, 0, 0.55) 100%
    );
  }

  /* Flat cap, slightly smaller than the base, radially lit from upper-left. */
  .knob__cap {
    position: absolute;
    inset: 27%;
    border-radius: 50%;
    background: radial-gradient(
      circle at 33% 27%,
      var(--cap-hi) 0%,
      var(--cap-base) 46%,
      var(--cap-lo) 100%
    );
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.5),
      inset -2px -3px 6px rgba(0, 0, 0, 0.4),
      0 2px 3px rgba(0, 0, 0, 0.55);
  }

  /* Dragging: the cap sits fractionally deeper under the finger. */
  .knob.is-dragging .knob__cap {
    box-shadow:
      inset 0 2px 2px rgba(255, 255, 255, 0.42),
      inset -2px -3px 8px rgba(0, 0, 0, 0.5),
      0 1px 1px rgba(0, 0, 0, 0.7);
  }

  .knob.is-disabled .knob__base,
  .knob.is-disabled .knob__cap {
    filter: grayscale(1) brightness(0.72) contrast(0.85);
    opacity: 0.8;
  }

  .knob__overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .knob__ticks line {
    stroke: var(--al-material-metal);
    stroke-width: 1;
    stroke-opacity: 0.55;
  }

  .knob__ticks line.is-major {
    stroke-width: 1.75;
    stroke-opacity: 0.95;
  }

  .knob__reference {
    fill: var(--al-material-metal);
    fill-opacity: 0.9;
  }

  .knob__extreme {
    fill: var(--al-text-secondary);
    font-family: var(--al-font-mono);
    font-size: 11px;
    dominant-baseline: middle;
    /* Dark halo first, fill second: keeps the numeral readable where it
       overlaps the tick ring or the panel edge. */
    paint-order: stroke;
    stroke: var(--al-material-panel);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .knob__pointer line {
    stroke: var(--cap-ink);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .knob.is-disabled .knob__pointer line {
    stroke-opacity: 0.45;
  }

  .knob.is-disabled .knob__reference,
  .knob.is-disabled .knob__extreme {
    opacity: 0.45;
  }

  /* Engraved label: light infill with a hard dark shadow beneath, which reads
     as lettering cut into a dark panel. */
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
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
    white-space: nowrap;
  }

  .knob__readout {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .knob__value {
    padding: 0 var(--al-space-2xs);
    border: 1px solid var(--al-border-subtle);
    border-radius: var(--al-space-3xs);
    background: var(--al-material-recess);
    color: var(--al-text-primary);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-xs);
    line-height: var(--al-line-height-tight);
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
    width: 6.5em;
    padding: 0 var(--al-space-2xs);
    border: 1px solid var(--al-text-secondary);
    border-radius: var(--al-space-3xs);
    background: var(--al-material-recess);
    color: var(--al-text-primary);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-xs);
    line-height: var(--al-line-height-tight);
    text-align: center;
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

  /* The only motion is the focus ring fading in; the pointer follows input
     directly and must never be animated, or it would lag a drag. */
  @media (prefers-reduced-motion: reduce) {
    .knob__ring {
      transition: none;
    }
  }
</style>
