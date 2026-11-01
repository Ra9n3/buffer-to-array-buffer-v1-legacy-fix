<script module lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import {
    currentSettings,
    dynamicFloorSettings,
    eqResponseDb,
    originalSettings,
    paramChanged,
    responseFrequencies,
    type EqState,
  } from "../../lib/mixer-chain";

  /**
   * The EQ curve — Task 2.8 (plan §3 "EQ curve"; §10 "original/dotted EQ
   * curves").
   *
   * A recessed scope window in the goniometer's language (Task 2.1): a dark
   * floor behind glass in a thin metal frame, an engraved graticule, a warm
   * trace. Three things are drawn on it, all from the CONTROL VALUES:
   *
   *   SOLID    the current response — the four bands' settings evaluated
   *            through the textbook analog-prototype filters and summed, so
   *            the curve and the knobs can never disagree;
   *   DOTTED   the response the fixture loaded with — the plan's original —
   *            drawn only while something differs from it;
   *   SHADED   under a dynamic-EQ band (plan §8 block 4): the range between
   *            the current curve and the curve with that band at the bottom
   *            of its range. An illustration of the fixture's range; nothing
   *            moves, nothing is measured.
   *
   * Neither curve is a spectrum: no signal exists here. The window is a
   * static image for assistive technology and is dimmed while the EQ is
   * bypassed (its settings stay drawn — a bypassed module's knobs do not move).
   */
  let {
    eq,
    trackName,
  }: {
    eq: EqState;
    trackName: string;
  } = $props();

  const uid = `eqg${++nextId}`;

  const H = 150;
  const PAD = { top: 10, right: 14, bottom: 18, left: 30 };
  const DB_RANGE = 15; // ± the window: the gain knobs' whole range
  const F_LO = 20;
  const F_HI = 20000;
  const FREQ_LINES = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const DB_LINES = [12, 6, 0, -6, -12];

  let width = $state(600);
  const plotW = $derived(Math.max(60, width - PAD.left - PAD.right));
  const plotH = H - PAD.top - PAD.bottom;
  const midY = PAD.top + plotH / 2;

  const x = $derived((f: number) => PAD.left + (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * plotW);
  const y = (db: number) => midY - (Math.min(DB_RANGE, Math.max(-DB_RANGE, db)) / DB_RANGE) * (plotH / 2);
  const f = (n: number): string => n.toFixed(1).replace(/\.0$/, "");

  const freqs = responseFrequencies(160, F_LO, F_HI);

  const current = $derived(currentSettings(eq));
  const original = $derived(originalSettings(eq));
  const floor = $derived(dynamicFloorSettings(eq));

  const changed = $derived(eq.bands.some((b) => paramChanged(b.freq) || paramChanged(b.gain) || (b.q !== null && paramChanged(b.q))));
  const hasDynamic = $derived(eq.bands.some((b) => b.dynamicDepthDb !== null));

  const path = (settings: ReturnType<typeof currentSettings>): string =>
    freqs.map((fr, i) => `${i === 0 ? "M" : "L"} ${f(x(fr))} ${f(y(eqResponseDb(settings, fr)))}`).join(" ");

  const currentPath = $derived(path(current));
  const originalPath = $derived(path(original));
  /** The shaded range: along the current curve, back along the floor curve. */
  const dynamicArea = $derived(
    hasDynamic
      ? `${path(current)} ${[...freqs]
          .reverse()
          .map((fr) => `L ${f(x(fr))} ${f(y(eqResponseDb(floor, fr)))}`)
          .join(" ")} Z`
      : "",
  );

  const markers = $derived(
    eq.bands.map((b) => ({
      id: b.band.id,
      label: b.band.label,
      cx: x(b.freq.value),
      cy: y(eqResponseDb(current, b.freq.value)),
      dynamic: b.dynamicDepthDb !== null,
    })),
  );

  const freqLabel = (fr: number): string => (fr >= 1000 ? `${fr / 1000}k` : `${fr}`);
  const dbLabel = (db: number): string => (db > 0 ? `+${db}` : db < 0 ? `\u2212${-db}` : "0");

  const description = $derived(
    `EQ response for ${trackName}, drawn from the control settings${eq.bypassed ? " (EQ bypassed)" : ""}: ` +
      eq.bands
        .map(
          (b) =>
            `${b.band.label} ${b.freq.spec.format(b.freq.value)} ${b.gain.spec.format(b.gain.value)}${
              b.q ? ` Q ${b.q.spec.format(b.q.value)}` : ""
            }${b.dynamicDepthDb !== null ? ` (dynamic, up to ${b.dynamicDepthDb} dB down)` : ""}`,
        )
        .join("; ") +
      (changed ? ". The dotted line is the response the track loaded with." : ""),
  );
</script>

<div
  class="eqg"
  class:is-bypassed={eq.bypassed}
  role="img"
  aria-label={description}
  bind:clientWidth={width}
  data-eq-graph
  data-eq-bypassed={eq.bypassed}
  data-eq-original-shown={changed}
  data-eq-dynamic-shown={hasDynamic}
  title={eq.bypassed ? "EQ response (bypassed) \u2014 the settings drawn as a curve" : "EQ response \u2014 the settings drawn as a curve, not a measurement"}
>
  <svg class="eqg__surface" viewBox={`0 0 ${width} ${H}`} width={width} height={H} aria-hidden="true">
    <defs>
      <radialGradient id={`${uid}-floor`} cx="50%" cy="40%" r="75%">
        <stop offset="0%" style="stop-color: var(--eqg-floor-centre)" />
        <stop offset="100%" style="stop-color: var(--eqg-floor-edge)" />
      </radialGradient>
      <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" style="stop-color: white; stop-opacity: 0.07" />
        <stop offset="45%" style="stop-color: white; stop-opacity: 0.015" />
        <stop offset="100%" style="stop-color: white; stop-opacity: 0" />
      </linearGradient>
      <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" class="eqg__hatch" />
      </pattern>
      <filter id={`${uid}-bloom`} x="-10%" y="-40%" width="120%" height="180%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
      <clipPath id={`${uid}-plot`}>
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
      </clipPath>
    </defs>

    <rect class="eqg__floor" x="0" y="0" width={width} height={H} fill={`url(#${uid}-floor)`} />

    <!-- the graticule: frequency lines, dB lines, the 0 dB line a touch firmer -->
    <g class="eqg__graticule" data-part="graticule">
      {#each FREQ_LINES as fr (fr)}
        <line x1={f(x(fr))} y1={PAD.top} x2={f(x(fr))} y2={PAD.top + plotH} />
        <text x={f(x(fr))} y={H - 5} text-anchor="middle">{freqLabel(fr)}</text>
      {/each}
      {#each DB_LINES as db (db)}
        <line class:is-zero={db === 0} x1={PAD.left} y1={f(y(db))} x2={PAD.left + plotW} y2={f(y(db))} />
        <text x={PAD.left - 4} y={f(y(db) + 2.5)} text-anchor="end">{dbLabel(db)}</text>
      {/each}
      <text class="eqg__unit" x={PAD.left - 4} y={PAD.top + 1} text-anchor="end">dB</text>
      <text class="eqg__unit" x={PAD.left + plotW} y={H - 5} text-anchor="end">Hz</text>
    </g>

    <g class="eqg__traces" clip-path={`url(#${uid}-plot)`} data-part="traces">
      {#if hasDynamic}
        <g class="eqg__dynamic" data-part="dynamic">
          <path class="eqg__dynamic-fill" d={dynamicArea} />
          <path class="eqg__dynamic-hatch" d={dynamicArea} fill={`url(#${uid}-hatch)`} />
        </g>
      {/if}
      {#if changed}
        <path class="eqg__original" d={originalPath} data-part="original" />
      {/if}
      <path class="eqg__bloom" d={currentPath} filter={`url(#${uid}-bloom)`} />
      <path class="eqg__current" d={currentPath} data-part="current" />
    </g>

    <g class="eqg__markers" data-part="markers">
      {#each markers as m (m.id)}
        <circle class="eqg__dot" class:is-dynamic={m.dynamic} cx={f(m.cx)} cy={f(m.cy)} r="3" />
        <text class="eqg__band" x={f(m.cx)} y={f(m.cy < midY ? m.cy + 12 : m.cy - 7)} text-anchor="middle">{m.label}</text>
      {/each}
    </g>

    <rect class="eqg__glass" x="0" y="0" width={width} height={H} fill={`url(#${uid}-glass)`} />
  </svg>
</div>

<style>
  .eqg {
    --eqg-floor-centre: color-mix(in srgb, var(--al-material-recess) 84%, var(--al-material-surface));
    --eqg-floor-edge: color-mix(in srgb, var(--al-material-recess) 92%, black);
    --eqg-frame: var(--al-material-metal-shadow);
    --eqg-graticule: var(--al-material-metal);
    --eqg-trace: var(--al-material-lamp);
    --eqg-trace-core: var(--al-function-amber-hi);
    --eqg-original: var(--al-material-cream);

    display: block;
    width: 100%;
    min-width: 0;
    padding: 1px;
    border-radius: 3.5px;
    /* the goniometer's frame: a thin metal rim, lit on top, shadowed below */
    background: linear-gradient(180deg, var(--al-material-metal) 0%, var(--eqg-frame) 50%, var(--al-bevel-shadow) 100%);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.4);
    user-select: none;
    -webkit-user-select: none;
  }

  .eqg__surface {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 2.5px;
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.8),
      inset 0 0 0 1px var(--al-border-strong);
  }

  .eqg__graticule line {
    stroke: var(--eqg-graticule);
    stroke-width: 0.5;
    stroke-opacity: 0.2;
  }

  .eqg__graticule line.is-zero {
    stroke-opacity: 0.42;
  }

  .eqg__graticule text {
    fill: var(--eqg-graticule);
    fill-opacity: 0.62;
    font-family: var(--al-font-label);
    font-size: 7.5px;
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.02em;
  }

  .eqg__unit {
    fill-opacity: 0.4;
  }

  .eqg__hatch {
    stroke: var(--eqg-trace);
    stroke-width: 0.6;
    stroke-opacity: 0.35;
  }

  .eqg__dynamic-fill {
    fill: var(--eqg-trace);
    fill-opacity: 0.12;
    stroke: none;
  }

  .eqg__dynamic-hatch {
    stroke: none;
  }

  .eqg__original {
    fill: none;
    stroke: var(--eqg-original);
    stroke-width: 1.1;
    stroke-opacity: 0.7;
    stroke-dasharray: 1.5 3.5;
    stroke-linecap: round;
  }

  .eqg__bloom {
    fill: none;
    stroke: var(--eqg-trace);
    stroke-width: 4;
    stroke-opacity: 0.28;
    stroke-linejoin: round;
  }

  .eqg__current {
    fill: none;
    stroke: var(--eqg-trace-core);
    stroke-width: 1.4;
    stroke-opacity: 0.95;
    stroke-linejoin: round;
  }

  .eqg__dot {
    fill: var(--eqg-trace-core);
    stroke: var(--eqg-floor-edge);
    stroke-width: 1;
  }

  .eqg__dot.is-dynamic {
    fill: var(--eqg-trace);
  }

  .eqg__band {
    fill: var(--eqg-trace);
    fill-opacity: 0.85;
    font-family: var(--al-font-label);
    font-size: 7.5px;
    font-weight: var(--al-font-weight-bold);
  }

  /* bypassed: the print stays, the traces dim */
  .is-bypassed .eqg__traces,
  .is-bypassed .eqg__markers {
    opacity: 0.4;
  }

  .eqg__glass {
    pointer-events: none;
  }
</style>
