<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import { formatSend } from "../channel-strip/track-strip-fixtures";
  import type { SendInto } from "../../lib/return-chain";

  /**
   * The Return's input — Task 2.9 (plan §8a: "The Return's input is the
   * incoming sends", post-fader, green).
   *
   * A read-only readout of the tracks whose send slots are assigned to this
   * Return, from the track fixtures: code, name and the send level, the
   * level printed in the green send ink of the strips' send windows so the
   * list and the sends that feed it read as one family. Nothing is edited
   * here — a send is set on its track strip (Task 2.2), where it lives.
   */
  let { sends, returnName }: { sends: readonly SendInto[]; returnName: string } = $props();
</script>

<section class="si" data-sends-in data-send-count={sends.length} aria-labelledby="mixer-sends-in-title">
  <header class="si__head">
    <div class="si__title">
      <EngravedLabel text="Sends in" size="md" tone="bright" as="h3" id="mixer-sends-in-title" />
      <EngravedLabel text="Return input" size="xs" tone="muted" />
    </div>
    <span class="si__count" title={`${sends.length} track send${sends.length === 1 ? "" : "s"} feed ${returnName}; a send is set on its track strip`}>
      <EngravedLabel text={String(sends.length)} size="sm" kind="value" tone="bright" />
      <EngravedLabel text={sends.length === 1 ? "send" : "sends"} size="xs" tone="muted" />
    </span>
  </header>
  <ol class="si__list" aria-label={`Tracks sending to ${returnName}`}>
    {#each sends as s (s.code)}
      <li class="si__row" data-send-from={s.code} title={`${s.code} ${s.name} \u2192 ${returnName}: ${formatSend(s.level)} post-fader \u2014 set on the track strip`}>
        <EngravedLabel text={s.code} size="xs" kind="value" tone="muted" />
        <EngravedLabel text={s.name} size="xs" truncate />
        <span class="si__level">{formatSend(s.level)}</span>
      </li>
    {:else}
      <li class="si__row si__row--empty">No track sends to this Return.</li>
    {/each}
  </ol>
</section>

<style>
  .si {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .si__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--al-space-xs) var(--al-space-md);
    min-width: 0;
  }

  .si__title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .si__count {
    display: flex;
    align-items: baseline;
    gap: var(--al-space-2xs);
  }

  .si__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: var(--al-space-2xs);
    list-style: none;
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 1px var(--al-border-subtle),
      inset 0 1px 0 rgba(0, 0, 0, 0.35);
  }

  .si__row {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: 1px var(--al-space-2xs);
  }

  .si__row--empty {
    display: block;
    color: var(--al-text-muted);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-xs);
  }

  /* the send window's print (SendSlot / ReturnStrip): a dark recess, green
     mono ink — nothing glows, nothing sits behind the print */
  .si__level {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 3.75rem;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: 2px;
    background: var(--al-material-recess);
    color: var(--al-function-green-hi);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-2xs);
    letter-spacing: 0.04em;
    line-height: var(--al-line-height-tight);
    white-space: nowrap;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.85),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }
</style>
