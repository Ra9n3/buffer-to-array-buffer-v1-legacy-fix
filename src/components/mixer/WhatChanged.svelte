<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import { NOTE_MODULE_PRINT, type ExplanationNote } from "../../lib/mixer-chain";

  /**
   * "What changed and why" — Task 2.8 (plan §3: a concise "What changed?"
   * list with explanations such as "Reduced energy around 3 kHz to make
   * room for the lead vocal"; §10: a plain-language summary).
   *
   * A cream card in a recessed holder — the scribble strip's material, dark
   * print — with one line per note: the module it belongs to and the plain
   * sentence. Every line here is AUTHORED FIXTURE TEXT for the track: the
   * plan requires final explanations to come from actual engine decisions,
   * and there is no engine yet, so the card is stamped as fixture and its
   * tooltip says so. Nothing is written at runtime: the user's own edits do
   * not add lines.
   */
  let {
    notes,
    trackName,
  }: {
    notes: readonly ExplanationNote[];
    trackName: string;
  } = $props();
</script>

<section
  class="wc"
  data-what-changed
  data-note-count={notes.length}
  data-simulated="true"
  aria-labelledby="mixer-changed-title"
>
  <header class="wc__head">
    <EngravedLabel text="What changed and why" size="md" tone="bright" as="h3" id="mixer-changed-title" />
    <span
      class="wc__stamp"
      data-fixture-stamp
      title={`Authored fixture text for ${trackName}. No audio has been analysed and no engine has run; real explanations come from engine decisions in a later phase.`}
    >
      <EngravedLabel text="Fixture text" size="xs" tone="muted" />
    </span>
  </header>
  <div class="wc__holder">
    <ol class="wc__card">
      {#each notes as n, i (i)}
        <li class="wc__note" data-note-module={n.module}>
          <span class="wc__tag">{NOTE_MODULE_PRINT[n.module]}</span>
          <span class="wc__text">{n.text}</span>
        </li>
      {:else}
        <li class="wc__note wc__note--empty">No notes for this track.</li>
      {/each}
    </ol>
  </div>
</section>

<style>
  .wc {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .wc__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .wc__stamp {
    display: flex;
    flex: 0 0 auto;
  }

  /* the holder: a shallow recess the card sits in */
  .wc__holder {
    padding: 3px;
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 70%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong);
  }

  /* the card: cream, a little yellowed at the edges, dark print — no glow */
  .wc__card {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    margin: 0;
    padding: var(--al-space-xs) var(--al-space-sm);
    list-style: none;
    border-radius: 1.5px;
    color: var(--al-text-on-cream);
    background-color: var(--al-material-cream);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0) 40%),
      radial-gradient(120% 90% at 50% 50%, rgba(0, 0, 0, 0) 60%, rgba(90, 70, 30, 0.14) 100%);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  }

  .wc__note {
    display: grid;
    grid-template-columns: 4.25rem minmax(0, 1fr);
    gap: var(--al-space-sm);
    align-items: baseline;
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
  }

  .wc__tag {
    font-family: var(--al-font-label);
    font-size: var(--al-text-size-2xs);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-label);
    text-transform: uppercase;
    opacity: 0.7;
  }

  .wc__text {
    min-width: 0;
  }

  .wc__note--empty {
    grid-template-columns: minmax(0, 1fr);
    opacity: 0.7;
  }
</style>
