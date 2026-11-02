<script lang="ts">
  import type { Snippet } from "svelte";
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import Print from "./Print.svelte";

  /**
   * A panel of the Home / Settings screens — Task 4.1.
   *
   * The approved panel material (the Mixer detail's deck recipe: the panel
   * token, the trim line under the top edge, the bevels) with an engraved
   * legend, holding whatever the screen puts in it. Compact and functional:
   * no cheeks, no decoration, nothing that is not a control or its print.
   */
  let {
    title,
    id,
    note = null,
    hook,
    children,
  }: {
    /** The engraved legend; also the section's accessible name. */
    title: string;
    /** The legend's element id (aria-labelledby). */
    id: string;
    /** One muted line under the legend, when the panel needs a sentence. */
    note?: string | null;
    /** `data-screen-panel` value for tests and evidence. */
    hook: string;
    children?: Snippet;
  } = $props();
</script>

<section class="panel" aria-labelledby={id} data-screen-panel={hook}>
  <header class="panel__head">
    <EngravedLabel as="h2" {id} text={title} size="sm" />
    {#if note}
      <Print text={note} tone="muted" />
    {/if}
  </header>
  <div class="panel__body">
    {@render children?.()}
  </div>
</section>

<style>
  .panel {
    --pn-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-md) var(--al-space-md);
    border-radius: 4px;
    background-color: var(--al-material-panel);
    background-image:
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--pn-trim) 1px, var(--pn-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
      radial-gradient(120% 100% at 18% 0%, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 38%, rgba(0, 0, 0, 0.22) 100%);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      0 2px 4px rgba(0, 0, 0, 0.35);
  }

  .panel__head {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
    padding: var(--al-space-2xs) 0 var(--al-space-xs);
    border-bottom: 1px solid var(--al-separator);
  }

  .panel__body {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
  }
</style>
