<script lang="ts">
  /**
   * ALLOY — a small tactile key for the chrome (Task 9.3, owner's review).
   *
   * The owner's note on the first pass was blunt and correct: the new menus,
   * toolbar and tabs were "grey" web buttons sitting next to hardware, and every
   * button in the app should look like "the rest of the tactile buttons".
   *
   * So this is not a new button. It is the **approved cream cap** from
   * `TactileSwitch` variant A, rebuilt at chrome scale: the same 135° convex
   * ramp lit from the top-left, the same edge lights and shades, the same broad
   * specular bloom, the same visible side wall and foot standing the cap proud
   * of its seat, the same press that sinks it to a 1 px wall. The recipe is
   * copied value for value from the reviewed component rather than approximated,
   * because "looks similar" is exactly what the owner rejected.
   *
   * Differences from `TactileSwitch`, all deliberate:
   *   - the cap is a wide rectangle sized by its label, not a square;
   *   - there is no lamp: these are momentary commands, and a lamp would claim a
   *     state that does not exist;
   *   - an `active` mode repaints the cap dark instead of lighting a lamp, for
   *     the one case that genuinely is a selection (the current tab / source).
   *
   * A real `<button>` underneath, so focus, Enter and Space come from the
   * platform.
   */
  let {
    label,
    name = null,
    active = false,
    disabled = false,
    tone = "cream",
    size = "sm",
    hook = null,
    title = null,
    onpress,
  }: {
    /** What is printed on the cap. */
    label: string;
    /** Accessible name when the printed word is not enough. */
    name?: string | null;
    /** The cap is the current selection: painted dark, printed in ivory. */
    active?: boolean;
    disabled?: boolean;
    /** cream: the transport keys' material. dark: a secondary, quieter key. */
    tone?: "cream" | "dark";
    /** sm for the top bar, m for the transport strip. */
    size?: "sm" | "m";
    /** `data-*` hook for tests and evidence. */
    hook?: string | null;
    title?: string | null;
    onpress?: (() => void) | null;
  } = $props();

  let pressed = $state(false);

  function onPointerDown(event: PointerEvent): void {
    if (disabled || event.button !== 0) return;
    pressed = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function release(): void {
    pressed = false;
  }

  function activate(): void {
    if (disabled) return;
    onpress?.();
  }
</script>

<button
  type="button"
  class="tkey"
  class:tkey--dark={tone === "dark"}
  class:tkey--active={active}
  class:tkey--m={size === "m"}
  class:is-pressed={pressed}
  aria-label={name ?? undefined}
  aria-pressed={active ? "true" : undefined}
  aria-disabled={disabled ? "true" : undefined}
  {title}
  data-tkey={hook ?? undefined}
  onpointerdown={onPointerDown}
  onpointerup={release}
  onpointercancel={release}
  onlostpointercapture={release}
  onclick={activate}
>
  <span class="tkey__cap" data-part="cap">
    <span class="tkey__label" data-part="label">{label}</span>
  </span>
</button>

<style>
  .tkey {
    /* --- the cap's material: the approved cream family --------------- */
    --tk-hi: var(--al-function-cream-hi);
    --tk-base: var(--al-function-cream-base);
    --tk-lo: var(--al-function-cream-lo);
    --tk-dim: color-mix(in srgb, var(--tk-base) 46%, var(--tk-lo));
    --tk-wall: color-mix(in srgb, var(--tk-lo) 70%, black);
    --tk-wall-foot: color-mix(in srgb, var(--tk-lo) 42%, black);
    --tk-ink: var(--al-text-on-cream);

    /* --- geometry ---------------------------------------------------- */
    --tk-height: 1.5rem;
    --tk-radius: 4px;
    --tk-lift: 2px;
    --tk-pad: 0.5rem;
    --tk-font: 0.6875rem;

    display: inline-flex;
    margin: 0;
    padding: 0 0 0 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .tkey--m {
    --tk-height: 1.75rem;
    --tk-radius: 5px;
    --tk-lift: 3px;
    --tk-pad: 0.625rem;
    --tk-font: 0.75rem;
  }

  .tkey:focus-visible {
    outline: 2px solid var(--al-function-amber-hi);
    outline-offset: 2px;
  }

  .tkey[aria-disabled="true"] {
    cursor: default;
  }

  /* --- the cap: the switch's variant A, value for value ----------------- */
  .tkey__cap {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-height: var(--tk-height);
    padding: 0 var(--tk-pad);
    border-radius: var(--tk-radius);
    overflow: hidden;
    background: linear-gradient(
      135deg,
      var(--tk-hi) 0%,
      var(--tk-hi) 10%,
      var(--tk-base) 48%,
      var(--tk-dim) 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 1px 0 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.28),
      inset -1px 0 0 rgba(0, 0, 0, 0.14),
      inset -2px -3px 4px rgba(0, 0, 0, 0.16),
      0 var(--tk-lift) 0 0 var(--tk-wall),
      0 calc(var(--tk-lift) + 1px) 0 0 var(--tk-wall-foot),
      0 calc(var(--tk-lift) + 2px) 3px rgba(0, 0, 0, 0.55);
    transform: translateY(calc(-1 * var(--tk-lift)));
    transition:
      transform 60ms ease-out,
      box-shadow 60ms ease-out;
  }

  /* the broad specular bloom in the upper-left, over a faint second sheen */
  .tkey__cap::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        62% 46% at 30% 20%,
        rgba(255, 255, 255, 0.78) 0%,
        rgba(255, 255, 255, 0.22) 46%,
        rgba(255, 255, 255, 0) 72%
      ),
      radial-gradient(
        50% 30% at 70% 88%,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(255, 255, 255, 0) 70%
      );
    opacity: 1;
    transition: opacity 60ms ease-out;
    pointer-events: none;
  }

  /* the press: the cap sinks to a 1 px wall, the bloom dims */
  .tkey:active:not([aria-disabled="true"]) .tkey__cap,
  .tkey.is-pressed .tkey__cap {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 1px 0 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      inset -1px 0 0 rgba(0, 0, 0, 0.16),
      inset 0 2px 3px rgba(0, 0, 0, 0.22),
      0 1px 0 0 var(--tk-wall),
      0 2px 0 0 var(--tk-wall-foot),
      0 2px 2px rgba(0, 0, 0, 0.45);
  }

  .tkey:active:not([aria-disabled="true"]) .tkey__cap::before,
  .tkey.is-pressed .tkey__cap::before {
    opacity: 0.35;
  }

  .tkey__label {
    position: relative;
    color: var(--tk-ink);
    font-family: var(--al-font-label);
    font-size: var(--tk-font);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow: 0 0.5px 0 rgba(255, 255, 255, 0.28);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- active: the current selection, painted dark ---------------------- */
  /* Not a lamp: these cap-only keys have none. The cap itself reads as the
     engraved dark key the approved console uses for an engaged function. */
  .tkey--active .tkey__cap {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--al-material-surface-raised) 88%, white) 0%,
      var(--al-material-surface-raised) 12%,
      var(--al-material-surface) 52%,
      var(--al-material-recess) 100%
    );
  }

  .tkey--active .tkey__cap::before {
    opacity: 0.22;
  }

  .tkey--active .tkey__label {
    color: var(--al-text-primary);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
  }

  /* --- dark: the quieter secondary key --------------------------------- */
  .tkey--dark .tkey__cap {
    background: linear-gradient(
      135deg,
      var(--al-material-surface-raised) 0%,
      var(--al-material-surface) 55%,
      var(--al-material-recess) 100%
    );
  }

  .tkey--dark .tkey__cap::before {
    opacity: 0.18;
  }

  .tkey--dark .tkey__label {
    color: var(--al-text-secondary);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
  }

  /* --- disabled: the cap keeps its material, loses its light ----------- */
  .tkey[aria-disabled="true"] .tkey__cap {
    filter: saturate(0.35) brightness(0.72);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      inset 0 -1px 0 rgba(0, 0, 0, 0.2),
      0 1px 0 0 var(--tk-wall),
      0 1px 2px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
  }

  .tkey[aria-disabled="true"] .tkey__label {
    color: color-mix(in srgb, var(--tk-ink) 55%, transparent);
  }
</style>
