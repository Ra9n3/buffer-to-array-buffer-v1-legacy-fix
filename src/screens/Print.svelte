<script lang="ts">
  /**
   * Panel print that wraps — Task 4.1.
   *
   * The engraved label (EngravedLabel) is a legend: one line, never
   * wrapped. Sentences on the Home / Settings panels — a note under a
   * legend, what a setting does, why an entry cannot be opened — are
   * silk-screen print in the interface face (the approved explanation
   * card's type: `--al-font-ui` at the secondary size), in the panel's
   * secondary or muted paint, wrapping as text does.
   */
  let {
    text,
    tone = "normal",
    as = "p",
    id = null,
  }: {
    text: string;
    tone?: "normal" | "muted" | "bright";
    as?: "p" | "span";
    id?: string | null;
  } = $props();
</script>

<svelte:element this={as} {id} class={`print print--${tone}`} data-screen-print>{text}</svelte:element>

<style>
  .print {
    display: block;
    min-width: 0;
    margin: 0;
    color: var(--al-text-secondary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    font-weight: var(--al-font-weight-regular);
    line-height: var(--al-line-height-snug);
    overflow-wrap: break-word;
  }

  .print--muted {
    color: var(--al-text-muted);
  }

  .print--bright {
    color: var(--al-text-primary);
  }
</style>
