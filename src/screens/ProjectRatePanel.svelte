<script lang="ts">
  /**
   * ALLOY — THE PROJECT RATE PANEL — Task 11.1.
   *
   * The project's one rate: what it is, and the explicit, warned operation
   * that changes it. Nothing here is silent — the warning says what a change
   * does (every imported clip re-resampled, with progress), says what
   * resampling is (high quality, not lossless), and the run reports each
   * stem as it is converted. The rate itself is LOCKED at creation; this
   * panel is the only door to the operation, and the operation is the only
   * door to the store's copies.
   */
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import Print from "./Print.svelte";
  import ActionKey from "./ActionKey.svelte";
  import { assets } from "../lib/project/assets.svelte";
  import { project } from "../lib/project/store.svelte";
  import { printRate, printRateChange, type ProjectRate } from "../lib/audio/rates";
  import type { RateChangeProgress, RateChangeResult } from "../lib/project/rate-change";

  const current = $derived(project.sampleRate);
  const other = $derived<ProjectRate>(current === 48000 ? 44100 : 48000);
  const imports = $derived(project.tracks.filter((t) => t.audio !== null).length);

  /* The flow: closed → warned (the change is named before it runs) → running. */
  let stage = $state<"closed" | "warned" | "running">("closed");
  let progress = $state<RateChangeProgress | null>(null);
  let result = $state<RateChangeResult | null>(null);

  function reset(): void {
    stage = "closed";
    progress = null;
    result = null;
  }

  async function run(): Promise<void> {
    if (stage === "running") return;
    stage = "running";
    result = null;
    try {
      result = await assets.changeRate(other, (p) => (progress = p));
      if (result.ok) {
        // the change is applied; the panel returns to showing the new rate
        stage = "closed";
        progress = null;
      } else {
        stage = "closed";
        progress = null;
      }
    } catch (e) {
      result = { ok: false, rate: current, changed: 0, detail: e instanceof Error ? e.message : String(e) };
      stage = "closed";
    }
  }
</script>

<div class="rate-panel" data-project-rate data-rate={current}>
  <div class="rate-panel__row">
    <EngravedLabel text="This project runs at" size="xs" />
    <Print as="span" text={printRate(current)} />
    <Print as="span" tone="muted" text={`· locked at creation · ${imports} imported clip${imports === 1 ? "" : "s"} converted to it`} />
  </div>

  {#if stage === "closed" && !result?.ok}
    <div class="rate-panel__row">
      <Print text="Changing it re-resamples every imported clip with progress — explicit, warned, never silent." tone="muted" />
    </div>
    {#if result && !result.ok}
      <p class="rate-panel__error" role="status" data-rate-change-error>{result.detail}</p>
    {/if}
    {#if imports > 0 || project.tracks.length === 0}
      <div class="rate-panel__row">
        <ActionKey label={`Change to ${printRate(other)}`} name={`Change the project's rate to ${printRate(other)}`} hook="rate-change" onpress={() => (stage = "warned")} />
      </div>
    {/if}
  {:else if stage === "warned"}
    <div class="rate-panel__warn" data-rate-change-warning role="alert">
      <p>
        Change this project to {printRate(other)}? Every imported clip is re-resampled
        {printRateChange(current, other)} — high quality, <em>not lossless</em>. The originals are kept; the copies
        and the waveforms are made again at {printRate(other)}.
      </p>
      <div class="rate-panel__keys">
        <ActionKey label="Keep {printRate(current)}" name="Cancel the rate change" hook="rate-cancel" onpress={reset} />
        <ActionKey label={`Re-resample to ${printRate(other)}`} name="Re-resample every imported clip" hook="rate-confirm" onpress={() => void run()} />
      </div>
    </div>
  {:else}
    <p class="rate-panel__progress" role="status" data-rate-change-progress>
      Re-sampling {progress ? `${progress.name} (${progress.index + 1}/${progress.total})` : "…"} — {Math.round((progress?.fraction ?? 0) * 100)}%
    </p>
  {/if}
</div>

<style>
  .rate-panel {
    display: grid;
    gap: 0.5rem;
  }

  .rate-panel__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }

  .rate-panel__warn {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem;
    border: 1px solid var(--al-border-subtle);
    border-left-width: 3px;
    border-left-color: var(--al-function-amber-base, var(--al-border-subtle));
    background: var(--al-material-recess);
  }

  .rate-panel__warn p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--al-text-primary);
  }

  .rate-panel__keys {
    display: flex;
    gap: 0.5rem;
  }

  .rate-panel__error,
  .rate-panel__progress {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--al-text-secondary);
  }

  .rate-panel__error {
    color: var(--al-function-red-base, inherit);
  }
</style>
