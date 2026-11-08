<script lang="ts">
  /**
   * ALLOY — the shared chrome band (Task 9.3, owner's review).
   *
   * The owner's second note on the top bar: "all the grey areas should be the
   * same as the green area — the whole app, the whole tabs should look like a
   * hardware". The green area in the screenshot is the Console's own deck: warm
   * near-black panel, lit top bevel, shaded bottom bevel, subtle vertical
   * brushing, walnut cheeks at the edges.
   *
   * This component is the one material for the top bar and the transport strip,
   * so they cannot drift apart: the same panel colour, the same bevel pair, the
   * same brushing, the same walnut cheeks as the Console housing. It is built
   * from the shared material tokens rather than from the Console's private
   * variables, and the recipes are copied from it value for value.
   *
   * It renders a single band: [cheek] [content] [cheek].
   */
  let {
    label,
    children,
  }: {
    /** The band's accessible name ("Application bar", "Transport"). */
    label: string;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<div class="band" role="group" aria-label={label} data-chrome-band>
  <span class="band__cheek band__cheek--left" aria-hidden="true"></span>
  <div class="band__plate">
    {@render children?.()}
  </div>
  <span class="band__cheek band__cheek--right" aria-hidden="true"></span>
</div>

<style>
  .band {
    /* --- geometry: one thin band, both places ---------------------------- */
    --cb-cheek: 0.625rem;
    --cb-radius: 4px;
    --cb-pad-y: 0.25rem;
    --cb-pad-x: 0.75rem;

    display: grid;
    grid-template-columns: var(--cb-cheek) minmax(0, 1fr) var(--cb-cheek);
    min-width: 0;
    width: 100%;
    border-radius: var(--cb-radius);
    /* walnut side trim, as the Console housing has (plan §4) */
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal)) 0%,
      var(--al-material-wood) 12%,
      var(--al-material-wood) 88%,
      color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess)) 100%
    );
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  .band__cheek {
    align-self: stretch;
  }

  .band__cheek--left {
    border-radius: var(--cb-radius) 0 0 var(--cb-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .band__cheek--right {
    border-radius: 0 var(--cb-radius) var(--cb-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the plate: warm near-black, bevels, brushing --------------------- */
  .band__plate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: var(--cb-pad-y) var(--cb-pad-x);
    background-color: var(--al-material-panel);
    background-image:
      linear-gradient(
        180deg,
        rgba(0, 0, 0, 0) 1px,
        color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream)) 1px,
        color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream)) 2px,
        rgba(0, 0, 0, 0.5) 2px,
        rgba(0, 0, 0, 0) 3px
      ),
      radial-gradient(
        120% 100% at 18% 0%,
        rgba(255, 255, 255, 0.07) 0%,
        rgba(255, 255, 255, 0.015) 38%,
        rgba(0, 0, 0, 0.22) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8);
  }

  /* Thin, as ordered: the bar must not eat the window. */
  @media (max-width: 48rem) {
    .band {
      --cb-cheek: 0.375rem;
      --cb-pad-x: 0.5rem;
    }

    .band__plate {
      gap: 0.25rem;
    }
  }
</style>
