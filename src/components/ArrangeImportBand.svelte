<script lang="ts">
  import ActionKey from "../screens/ActionKey.svelte";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import { assets } from "../lib/project/assets.svelte";
  import type { ImportLine, ImportOutcome } from "../lib/project/import";
  import { project } from "../lib/project/store.svelte";

  /**
   * ALLOY Arrange import band — Task 5.1 (plan §3: "Arrange / import").
   *
   * One slim band at the top of the Arrange room, in both of its states:
   * the panel's legend, one momentary key (the Home screen's ActionKey — the
   * approved tactile switch in its panel-labelled variant) that opens the
   * platform's file picker for one or more WAV files, and the batch's
   * report: a line per file saying what was accepted (length, format, the
   * plan's flags) or why not. The report belongs to the project it was
   * made in — a project switch clears it — and CLEAR takes it away by hand.
   *
   * Nothing here decodes or judges a file: lib/project/import.ts does, and
   * lib/project/assets.svelte.ts commits what passed. The band only prints.
   */
  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);
  let progress = $state<{ index: number; total: number; name: string } | null>(null);
  let report = $state<{ projectId: string; lines: readonly ImportLine[]; added: number; refused: number } | null>(null);
  let notice = $state<string | null>(null);

  // the report is the open project's: a switch while it is up takes it down
  $effect(() => {
    if (report && report.projectId !== project.id) report = null;
  });

  const STAMP: Readonly<Record<ImportOutcome, string>> = {
    added: "ADDED",
    unsupported: "REFUSED",
    corrupt: "UNREADABLE",
    failed: "FAILED",
  };

  function choose(): void {
    notice = null;
    if (!assets.attached) {
      notice = "Import needs the browser's project storage (IndexedDB), which is not available here — nothing was imported.";
      return;
    }
    input?.click();
  }

  async function onchange(): Promise<void> {
    const files = Array.from(input?.files ?? []);
    if (input) input.value = "";
    if (files.length === 0 || busy) return;
    busy = true;
    report = null;
    notice = null;
    progress = { index: 0, total: files.length, name: files[0].name };
    try {
      const result = await assets.importBatch(
        files.map((f) => ({ name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) })),
        (index, total, name) => {
          progress = { index, total, name };
        },
      );
      report = { projectId: result.projectId, lines: result.lines, added: result.added, refused: result.refused };
    } catch (e) {
      notice = `Import stopped: ${e instanceof Error ? e.message : String(e)} — nothing from this batch was added.`;
    } finally {
      busy = false;
      progress = null;
    }
  }

  // what needs the owner's hand comes first — a long batch's refusals must not hide below the
  // report's fold behind the lines that went in; each group keeps the batch's own order
  const ordered = $derived.by((): readonly ImportLine[] => {
    if (!report) return [];
    return [...report.lines.filter((l) => l.outcome !== "added"), ...report.lines.filter((l) => l.outcome === "added")];
  });

  const summary = $derived.by((): string => {
    if (!report) return "";
    const n = report.lines.length;
    if (report.added === n) return `${n} of ${n} imported`;
    return `${report.added} of ${n} imported`;
  });
</script>

<div class="band" data-arrange-import data-import-busy={busy}>
  <div class="band__row">
    <EngravedLabel text="Import" size="xs" tone="muted" as="p" />
    <ActionKey label="Import stems" name="Import stems: choose WAV files to add as tracks" hook="import-stems" onpress={choose} />
    <input
      bind:this={input}
      class="band__input"
      type="file"
      multiple
      accept=".wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave"
      tabindex="-1"
      aria-hidden="true"
      data-import-input
      {onchange}
    />
    <!-- progress, then the summary: one readout, announced -->
    <p class="band__status" role="status" aria-live="polite" data-import-status={busy ? "busy" : report ? "done" : notice ? "notice" : "idle"}>
      {#if progress}
        Importing {Math.min(progress.index + 1, progress.total)} of {progress.total}{progress.name ? ` — ${progress.name}` : ""}…
      {:else if report}
        {summary}
      {:else if notice}
        {notice}
      {/if}
    </p>
    {#if report}
      <ActionKey label="Clear" name="Clear the import report" hook="import-clear" onpress={() => (report = null)} />
    {/if}
  </div>

  {#if report}
    <ul class="report" data-import-report>
      {#each ordered as line, index (index)}
        <li class="line" class:is-refused={line.outcome !== "added"} data-import-line={line.outcome} data-import-file={line.file}>
          <span class="line__stamp"><EngravedLabel text={STAMP[line.outcome]} size="xs" tone="muted" /></span>
          <span class="line__text"><span class="line__file">{line.file}</span> — {line.detail}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* the panel's material, as the empty-state notice and the list corner use it */
  .band {
    --band-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
    /* room above the keys' panel print: it must clear the trim line, not sit on it */
    padding: var(--al-space-xs) var(--al-space-sm) var(--al-space-3xs);
    border-radius: 4px;
    background-color: var(--al-material-panel);
    background-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--band-trim) 1px, var(--band-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      0 2px 4px rgba(0, 0, 0, 0.35);
  }

  .band__row {
    display: flex;
    gap: var(--al-space-xs);
    align-items: center;
    min-width: 0;
    min-height: 2.75rem;
  }

  /* the platform's control is the input; the key is what the panel shows */
  .band__input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
  }

  .band__status {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: var(--al-text-secondary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    overflow-wrap: anywhere;
  }

  /* the report: compact lines, capped so a long batch scrolls inside the band */
  .report {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 7.5rem;
    margin: 0;
    padding: 0 0 var(--al-space-3xs);
    overflow: auto;
    list-style: none;
    border-top: 1px solid var(--al-separator);
  }

  .line {
    display: flex;
    gap: var(--al-space-xs);
    align-items: baseline;
    min-width: 0;
    padding: 2px 0;
  }

  .line__stamp {
    flex: 0 0 5.25rem;
  }

  /* a refused file is a warning: the shell's red on the stamp's rule, never on the text */
  .line.is-refused .line__stamp {
    box-shadow: inset 0 -1px 0 var(--al-function-red-base);
  }

  .line__text {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--al-text-secondary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-xs);
    line-height: var(--al-line-height-snug);
    overflow-wrap: anywhere;
  }

  .line__file {
    color: var(--al-text-primary);
  }
</style>
