<script module lang="ts">
  /** Type steps of the engraved print. Each is one Task 1.1 text-size token. */
  export type LabelSize = "xs" | "sm" | "md" | "lg" | "xl";

  /**
   * What the print says.
   *   label  a control or function legend — INPUT, PAD, PHANTOM. Caps, bold,
   *          tracked wide. The default.
   *   value  a number with its unit — 26 dB, +4, −12. Semibold, tracked less,
   *          never forced to upper case (the unit keeps its case), digits
   *          tabular so a column of them lines up.
   */
  export type LabelKind = "label" | "value";

  /** The paint: normal (secondary text), muted (de-emphasised values), bright (primary). */
  export type LabelTone = "normal" | "muted" | "bright";

  /**
   * How the groove is finished.
   *   filled  paint in the groove — the light lettering every approved
   *           component already prints. The default, and the only finish for
   *           anything small: it is the readable one.
   *   cut     no paint — the dark groove floor with its lit lower wall, the
   *           Task 1.1 `--al-text-engraved` / `-highlight` pair as the tokens
   *           describe it. For large module titles only.
   */
  export type LabelFinish = "filled" | "cut";

  export type LabelElement = "span" | "p" | "div" | "h2" | "h3" | "figcaption";
</script>

<script lang="ts">
  /**
   * ALLOY engraved label — Task 1.6.
   *
   * The lettering machined into a console panel, as plan §4 asks: "engraved
   * or machined into the panel, compact industrial/condensed typography, no
   * floating-label UI". One shared component for every hardware-facing
   * legend in the Console, Arrange and Mixer rooms; ordinary application text
   * (explanations, filenames, menus) is NOT this component — it keeps the
   * readable `--al-font-ui` treatment.
   *
   * HOW THE ENGRAVING IS MADE (layered CSS, spec §6; no image, no SVG):
   *
   *   1. THE PAINT     the real text, in the label face, filled with the
   *                    secondary text tone — the approved components' print
   *                    colour — so the lettering reads as paint in a groove,
   *                    not as interface text on top of the panel.
   *   2. THE WALLS     two hard 1-pixel text-shadows model the groove's two
   *                    walls under the family's top-left light: a dark copy
   *                    shifted UP (the upper wall, which faces away from the
   *                    light and is in shadow) and a lighter copy shifted
   *                    DOWN (the lower wall, which faces the light; the
   *                    `--al-text-engraved-highlight` token, "the 1px lighter
   *                    edge that makes lettering read as cut rather than
   *                    printed"). Offsets are `max(1px, 0.07em)` so a 20 px
   *                    title is cut as deep, in proportion, as a 10 px legend.
   *   3. THE FLOOR     a second copy of the text, an `aria-hidden` span laid
   *                    exactly over the first, painted with a vertical
   *                    gradient clipped to the glyphs: the paint is darker
   *                    along the top of every stroke, where the upper wall
   *                    shades the groove floor, and lightest at the bottom.
   *                    A flat fill cannot do this; it is what separates a
   *                    recess from a drop shadow.
   *
   * Everything scales from the font size, so the five sizes are one style at
   * five depths, not five styles. Colours are tokens only.
   */

  let {
    text,
    size = "sm",
    kind = "label",
    tone = "normal",
    finish = "filled",
    as = "span",
    align = null,
    truncate = false,
    id = null,
    title = null,
  }: {
    /** The legend. Plain text; the component never rewrites it. */
    text: string;
    size?: LabelSize;
    kind?: LabelKind;
    tone?: LabelTone;
    finish?: LabelFinish;
    /** The element to render: span by default; p / h2 / h3 for document structure. */
    as?: LabelElement;
    /** Set to make the label a block of its own and align the print within it. */
    align?: "start" | "center" | "end" | null;
    /** Clip to the available width with an ellipsis (track names in a strip). */
    truncate?: boolean;
    id?: string | null;
    /** Tooltip for a truncated name; defaults to the text when truncating. */
    title?: string | null;
  } = $props();

  const hint = $derived(title ?? (truncate ? text : null));
</script>

<svelte:element
  this={as}
  {id}
  class={`label label--${size} label--${kind} label--${tone} label--${finish}`}
  class:is-block={align !== null || truncate}
  class:is-truncated={truncate}
  style:text-align={align}
  data-engraved-label
  data-label-size={size}
  data-label-kind={kind}
  data-label-finish={finish}
  title={hint}
>
  {text}{#if finish === "filled"}<span class="label__floor" aria-hidden="true">{text}</span>{/if}
</svelte:element>

<style>
  .label {
    /* --- the paint and the two walls, from the Task 1.1 text tokens -------- */
    --lb-fill: var(--al-text-secondary);
    --lb-wall-light: var(--al-text-engraved-highlight);
    --lb-wall-dark: rgba(0, 0, 0, 0.85);
    /* the groove's depth, in proportion to the type, never under a pixel */
    --lb-depth: max(1px, 0.07em);

    position: relative;
    display: inline-block;
    max-width: 100%;
    margin: 0;
    padding: 0;
    color: var(--lb-fill);
    font-family: var(--al-font-label);
    font-weight: var(--al-font-weight-bold);
    line-height: var(--al-line-height-tight);
    letter-spacing: var(--al-letter-spacing-engraved);
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 calc(-1 * var(--lb-depth)) 0 var(--lb-wall-dark),
      0 var(--lb-depth) 0 var(--lb-wall-light);
    /* the walls must not be clipped by a block's own box */
    overflow: visible;
  }

  /* --- the shaded floor: the paint, darker where the upper wall shades it -- */

  .label__floor {
    position: absolute;
    inset: 0;
    overflow: hidden;
    color: transparent;
    background-image: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--lb-fill) 74%, black) 0%,
      color-mix(in srgb, var(--lb-fill) 90%, black) 34%,
      var(--lb-fill) 62%,
      color-mix(in srgb, var(--lb-fill) 94%, white) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    text-shadow: none;
    pointer-events: none;
    user-select: none;
  }

  .label.is-truncated .label__floor {
    text-overflow: ellipsis;
  }

  /* --- sizes: five depths of one cut --------------------------------------- */

  .label--xs {
    font-size: var(--al-text-size-2xs);
  }

  .label--sm {
    font-size: var(--al-text-size-xs);
  }

  .label--md {
    font-size: var(--al-text-size-md);
    letter-spacing: var(--al-letter-spacing-label);
  }

  .label--lg {
    font-size: var(--al-text-size-lg);
    letter-spacing: var(--al-letter-spacing-label);
  }

  .label--xl {
    font-size: var(--al-text-size-xl);
    letter-spacing: var(--al-letter-spacing-label);
  }

  /* --- kind: a value keeps its unit's case and lines its digits up -------- */

  .label--value {
    font-weight: var(--al-font-weight-semibold);
    letter-spacing: var(--al-letter-spacing-label);
    text-transform: none;
    font-variant-numeric: tabular-nums;
  }

  /* --- tone: which paint ---------------------------------------------------- */

  .label--muted {
    --lb-fill: var(--al-text-muted);
  }

  .label--bright {
    --lb-fill: var(--al-text-primary);
  }

  /* --- the unpainted cut: the dark groove floor and its lit lower wall ----- */

  .label--cut {
    --lb-fill: var(--al-text-engraved);
    --lb-wall-dark: rgba(0, 0, 0, 0.6);
    text-shadow:
      0 var(--lb-depth) 0 var(--lb-wall-light),
      0 calc(var(--lb-depth) * 1.6) 0 color-mix(in srgb, var(--lb-wall-light) 45%, transparent),
      0 calc(-1 * var(--lb-depth) * 0.5) 0 var(--lb-wall-dark);
  }

  /* --- block and truncation -------------------------------------------------- */

  .label.is-block {
    display: block;
  }

  .label.is-truncated {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
