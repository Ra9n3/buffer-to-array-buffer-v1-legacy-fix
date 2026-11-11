<script module lang="ts">
  /** Unique per-instance id prefix, so SVG defs never collide between meters. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY stereo phase / correlation meter — Task 9.5 (hardware spec §4a's
   * family, the owner's reference console's "PHASE LEVEL").
   *
   * The bridge's fourth instrument: a compact cream-face needle meter reading
   * stereo correlation, −1 (out of phase, left) through 0 to +1 (in phase,
   * right). It is drawn in the VU meter's language — the approved cream card
   * in its recessed well, the dark scale with its engraved numerals, a
   * balanced needle on a shadowed pin — but it is visibly its own instrument:
   * a horizontal −1 · 0 · +1 scale, no VU arc, no red band, no dB.
   *
   * Nothing here measures anything: `value` is whatever the host passes in
   * (the fixture's correlation reading, SIMULATED).
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";

  let {
    /** Correlation, −1 … +1. */
    value = 0,
    /** Accessible name; says the reading is simulated when it is. */
    name,
    /** Print the “Phase” legend under the card? The bridge runs bare — no
     *  legends, the owner's call (Task 9.6, D9.6.3): people who know consoles
     *  know the needle. The legend stays in the accessibility tree. */
    legend = true,
  }: {
    value?: number;
    name: string;
    legend?: boolean;
  } = $props();

  const uid = `phase${++nextId}`;

  /* --- geometry, in 1x units: the card is 120 × 72, the VU's proportions -- */
  const W = 120;
  const H = 72;
  /** The needle's pivot, below the scale's centre so the needle sweeps it. */
  const PIVOT_X = W / 2;
  const PIVOT_Y = 58;
  /** The scale's arc: 66° of sweep, 33° either side of vertical. */
  const SWEEP = 33;
  const R = 40;

  const rad = (deg: number) => ((90 - deg) * Math.PI) / 180;
  const onArc = (deg: number, radius: number) => ({
    x: PIVOT_X + radius * Math.cos(rad(deg)),
    y: PIVOT_Y - radius * Math.sin(rad(deg)),
  });

  /** Where −1 … +1 sits on the sweep: −1 at −SWEEP, +1 at +SWEEP. */
  const degOf = (v: number) => Math.max(-SWEEP, Math.min(SWEEP, v * SWEEP));

  /* The ticks: −1, −0.5, 0, +0.5, +1 — the major at full length with its
     numeral, the minors short. */
  const ticks = [-1, -0.5, 0, 0.5, 1].map((v) => {
    const deg = degOf(v);
    const major = v === -1 || v === 0 || v === 1;
    const inner = onArc(deg, R - (major ? 7 : 4));
    const outer = onArc(deg, R);
    const num = onArc(deg, R + 5);
    return {
      label: v === 0 ? "0" : v > 0 ? `+${v}` : `${v}`,
      major,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
      nx: num.x,
      ny: num.y,
      anchor: deg < -10 ? "end" : deg > 10 ? "start" : "middle",
    };
  });

  const needle = $derived(onArc(degOf(Math.max(-1, Math.min(1, value))), R - 2));
</script>

<div class="phase" data-phase-meter>
  <div class="phase__well">
    <svg class="phase__surface" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-card`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" class="phase__card-hi" />
          <stop offset="0.55" class="phase__card-mid" />
          <stop offset="1" class="phase__card-lo" />
        </linearGradient>
      </defs>

      <!-- the card -->
      <rect class="phase__card" x="1.5" y="1.5" width={W - 3} height={H - 3} rx="3" fill={`url(#${uid}-card)`} />

      <!-- the scale -->
      {#each ticks as tick (tick.label)}
        <line class="phase__tick" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
        {#if tick.major}
          <text class="phase__numeral" x={tick.nx} y={tick.ny} text-anchor={tick.anchor}>{tick.label}</text>
        {/if}
      {/each}

      <!-- the needle, on its shadowed pin -->
      <line class="phase__needle-shadow" x1={PIVOT_X} y1={PIVOT_Y} x2={needle.x + 0.7} y2={needle.y + 0.7} />
      <line class="phase__needle" x1={PIVOT_X} y1={PIVOT_Y} x2={needle.x} y2={needle.y} />
      <circle class="phase__pin" cx={PIVOT_X} cy={PIVOT_Y} r="2.6" />
    </svg>
  </div>
  <!-- The legend prints on the standalone meter; on the bridge it is hidden
       from the face but stays in the accessibility tree (D9.6.3). -->
  {#if legend}
    <EngravedLabel text="Phase" size="xs" tone="muted" title={`Stereo correlation, ${name}`} />
  {:else}
    <span class="phase__legend phase__legend--hidden">
      <EngravedLabel text="Phase" size="xs" tone="muted" title={`Stereo correlation, ${name}`} />
    </span>
  {/if}
</div>

<style>
  /* The whole instrument scales from one width, `--phase-width`, set by the
     host (8.5rem = 136 px = 1× here), the way the VU scales from
     `--vu-width`. */
  .phase {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-3xs);
    min-width: 0;
    width: var(--phase-width, 8.5rem);
    user-select: none;
    -webkit-user-select: none;
  }

  /* The recessed well: the VU's — a darker floor under a subtle border, a
     shadowed lip, one flat highlight below it. */
  .phase__well {
    display: flex;
    width: 100%;
    min-width: 0;
    padding: 2px;
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 72%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .phase__surface {
    display: block;
    width: 100%;
    height: auto;
  }

  /* The bridge's bare mode (D9.6.3): the legend is clipped out of the face
     but never out of the accessibility tree — the room's own hidden-heading
     recipe (ConsoleRoom, Task 9.5). */
  .phase__legend--hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* --- the card: the approved VU cream, lit from the top-left -------------- */
  .phase__card-hi { stop-color: color-mix(in srgb, var(--al-material-cream) 88%, #ffffff); }
  .phase__card-mid { stop-color: var(--al-material-cream); }
  .phase__card-lo { stop-color: color-mix(in srgb, var(--al-material-cream) 80%, var(--al-material-recess)); }

  .phase__card {
    stroke: var(--al-border-strong);
    stroke-width: 0.8;
  }

  /* --- the scale: dark engraved ink ---------------------------------------- */
  .phase__tick {
    stroke: color-mix(in srgb, var(--al-material-recess) 55%, #000000);
    stroke-width: 0.7;
  }

  .phase__numeral {
    fill: color-mix(in srgb, var(--al-material-recess) 62%, #000000);
    font-family: var(--al-font-mono);
    font-size: 6px;
    letter-spacing: 0.02em;
  }

  /* --- the needle: dark, with its own soft shadow, on a black pin ---------- */
  .phase__needle-shadow {
    stroke: rgba(0, 0, 0, 0.25);
    stroke-width: 1.1;
    stroke-linecap: round;
  }

  .phase__needle {
    stroke: color-mix(in srgb, var(--al-material-recess) 40%, #000000);
    stroke-width: 0.9;
    stroke-linecap: round;
  }

  .phase__pin {
    fill: #000000;
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 0.4;
  }
</style>
