<script lang="ts">
  /**
   * ALLOY — THE EXPORT DIALOG — Task 11.1.
   *
   * The plan §12 export's UI, one overlay: two independent selects — depth
   * (24-bit PCM | 32-bit float) × rate (44.1 | 48 | the project's own) — the
   * optional TPDF dither at 24-bit (off by default), the honest print of the
   * project's rate against the target, and the run itself with progress.
   *
   * HONESTY RULES, in the surface:
   *   - the project's rate is printed beside the target whenever they differ,
   *     and the change is named as what it is: high-quality resampling, NOT
   *     lossless. No word in this dialog ever claims otherwise;
   *   - the destination is the platform's folder picker; a browser without it
   *     (Safari, Firefox) falls back to one download per finished file — the
   *     collect destination's own contract;
   *   - the dialog reads the REAL project rate for its default target and the
   *     REAL settings for the remembered choice, and writes the choice back.
   */
  import ScribbleSelect from "./hardware/ScribbleSelect.svelte";
  import TactileSwitch from "./hardware/TactileSwitch.svelte";
  import ActionKey from "../screens/ActionKey.svelte";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import { settings, settingsOps } from "../lib/settings.svelte";
  import {
    EXPORT_DEPTHS,
    EXPORT_DEPTH_PRINT,
    EXPORT_RATES,
    EXPORT_RATE_PRINT,
    type ExportDepthPreference,
    type ExportRatePreference,
  } from "../lib/settings.svelte";
  import { openProjectSources } from "../lib/playback/sources";
  import { assets } from "../lib/project/assets.svelte";
  import { project } from "../lib/project/store.svelte";
  import { printRate, printRateChange } from "../lib/audio/rates";
  import { formatFromId, printFormat, type ExportFormat } from "../lib/export/encode";
  import { exportProject, type ExportOutcome } from "../lib/export/exporter";
  import { collectDestination, directoryDestination, type ExportDestination } from "../lib/export/destination";

  let { onclose }: { onclose: () => void } = $props();

  /* --- the two selects' state, read from the remembered settings ------------- */
  let depth = $state<ExportDepthPreference>(settings.export.depth);
  let rateChoice = $state<ExportRatePreference>(settings.export.rate);
  let dither = $state<boolean>(settings.export.dither);

  const projectRate = $derived(project.sampleRate);
  const targetRate = $derived<number>(rateChoice ?? projectRate);
  const resampling = $derived(targetRate !== projectRate);
  const format: ExportFormat = $derived(formatFromId(depth, targetRate));

  const depthOptions = EXPORT_DEPTHS.map((d) => ({ id: d, name: EXPORT_DEPTH_PRINT[d] }));
  // built from the reactive rate, so a change re-words the option
  const rateOptions = $derived([
    { id: "project", name: `Project — ${printRate(projectRate)}` },
    ...EXPORT_RATES.map((r) => ({ id: String(r), name: EXPORT_RATE_PRINT[r] })),
  ]);
  const rateValue = $derived(rateChoice === null ? "project" : String(rateChoice));

  function chooseDepth(id: string): void {
    depth = id as ExportDepthPreference;
    settingsOps.setExportDepth(depth);
  }
  function chooseRate(id: string): void {
    rateChoice = id === "project" ? null : (Number(id) as ExportRatePreference);
    settingsOps.setExportRate(rateChoice);
  }

  /* --- the run ----------------------------------------------------------------- */
  let running = $state(false);
  let phase = $state<string | null>(null);
  let fraction = $state(0);
  let outcome = $state<ExportOutcome | null>(null);

  const busy = $derived(running || fraction > 0);

  /** The platform's folder picker; the collect fallback where there is none. */
  async function destinationFor(): Promise<{ dest: ExportDestination; label: string; downloads: boolean }> {
    const picker = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<{ name: string; kind: string } & object> }).showDirectoryPicker;
    if (typeof picker === "function") {
      try {
        const root = await picker({ mode: "readwrite" });
        return { dest: directoryDestination(root as never), label: root.name, downloads: false };
      } catch {
        /* cancelled or refused: the fallback below is the honest answer */
      }
    }
    const collect = collectDestination();
    // The collect destination hands each finished file back; the shell's one
    // job here is turning it into a download.
    collect.onFile = (file) => {
      const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: "audio/wav" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.path.split("/").pop() ?? "export.wav";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    return { dest: collect, label: "downloaded", downloads: true };
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    outcome = null;
    fraction = 0;
    phase = "preparing";
    try {
      const { dest, label } = await destinationFor();
      const sources = await openProjectSources(project as unknown as Parameters<typeof openProjectSources>[0], assets.exportStore);
      const result = await exportProject({
        project: project as never,
        sources,
        selection: {
          fullMix: settings.export.fullMix,
          stems: settings.export.stems,
          buses: settings.export.buses,
        },
        destination: dest,
        format,
        dither: depth === "pcm24" && dither ? "tprf" : "off",
        onProgress: (p) => {
          phase = p.phase;
          fraction = p.fraction;
        },
      });
      outcome = { ...result, destination: label };
    } finally {
      running = false;
    }
  }
</script>

<div
  class="dialog-backdrop"
  data-export-dialog-backdrop
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && !busy && onclose()}
  onkeydown={(e) => e.key === "Escape" && !busy && onclose()}
>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" data-export-dialog>
    <header class="dialog__head">
      <EngravedLabel id="export-dialog-title" text="Export" />
      <p class="dialog__note">The project's rate against the target, printed honestly. Resampling is high quality — never lossless.</p>
    </header>

    <div class="dialog__grid" data-export-format>
      <label class="dialog__field">
        <span class="dialog__field-label">Depth</span>
        <ScribbleSelect options={depthOptions} value={depth} label="Depth" size="sm" align="start" hook="export-depth" onchange={chooseDepth} />
      </label>
      <label class="dialog__field">
        <span class="dialog__field-label">Rate</span>
        <ScribbleSelect options={rateOptions} value={rateValue} label="Rate" size="sm" align="start" hook="export-rate" onchange={chooseRate} />
      </label>
    </div>

    <p class="dialog__target" data-export-target data-resampling={resampling}>
      Project {printRate(projectRate)} → export {printRate(format.sampleRate)} · {printFormat(format)}
      {#if resampling}
        <span class="dialog__conversion">{printRateChange(projectRate, format.sampleRate)} — high-quality resampling, not lossless</span>
      {:else}
        <span class="dialog__conversion">no rate stage — the render's own samples</span>
      {/if}
    </p>

    {#if depth === "pcm24"}
      <div class="dialog__dither" data-export-dither>
        <TactileSwitch variant="panel" label="Dither" value="TPDF" engaged={dither} onToggle={() => { dither = !dither; settingsOps.setExportDither(dither); }} />
        <p class="dialog__hint">TPDF at the 24-bit depth stage — off by default, applied once, no noise shaping.</p>
      </div>
    {/if}

    <footer class="dialog__foot">
      {#if outcome}
        <p class="dialog__outcome" role="status" data-export-outcome data-ok={outcome.ok}>
          {#if outcome.ok}
            {outcome.files.length} file{outcome.files.length === 1 ? "" : "s"} exported to {outcome.destination} — {outcome.plan.folder}
          {:else}
            {outcome.stopped?.message ?? "The export could not run"}
          {/if}
        </p>
      {:else if running}
        <p class="dialog__progress" role="status" data-export-progress>{phase ?? "working"} — {Math.round(fraction * 100)}%</p>
      {:else}
        <p class="dialog__hint">The folder is chosen at export time; a browser without a folder picker downloads each finished file.</p>
      {/if}
      <div class="dialog__keys">
        <ActionKey label="Close" name="Close the export dialog" hook="export-close" onpress={onclose} />
        <ActionKey label="Export" name="Run the export" hook="export-run" onpress={() => void run()} />
      </div>
    </footer>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: var(--al-space-s, 1rem);
    background: color-mix(in srgb, var(--al-material-surface) 55%, transparent);
  }

  .dialog {
    width: min(34rem, 100%);
    padding: var(--al-space-s, 1rem);
    border: 1px solid var(--al-border-subtle);
    border-radius: 4px;
    background: var(--al-material-surface);
    box-shadow: 0 0.5rem 2rem color-mix(in srgb, var(--al-material-metal) 35%, transparent);
  }

  .dialog__head {
    margin-bottom: var(--al-space-2xs, 0.5rem);
  }

  .dialog__note,
  .dialog__hint,
  .dialog__target,
  .dialog__outcome,
  .dialog__progress {
    margin: 0 0 var(--al-space-2xs, 0.5rem);
    font-size: 0.8125rem;
    color: var(--al-text-primary);
  }

  .dialog__note,
  .dialog__hint {
    color: var(--al-text-secondary);
  }

  .dialog__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--al-space-2xs, 0.5rem) var(--al-space-s, 1rem);
    margin: 0 0 var(--al-space-2xs, 0.5rem);
  }

  .dialog__field {
    display: grid;
    gap: 0.25rem;
  }

  .dialog__field-label {
    font-family: var(--al-font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.08em;
    color: var(--al-text-secondary);
  }

  .dialog__target {
    font-family: var(--al-font-mono);
  }

  .dialog__conversion {
    display: block;
    color: var(--al-text-secondary);
  }

  .dialog__target[data-resampling="true"] .dialog__conversion {
    color: var(--al-function-amber-base, inherit);
  }

  .dialog__dither {
    display: flex;
    align-items: center;
    gap: var(--al-space-2xs, 0.5rem);
    margin: 0 0 var(--al-space-2xs, 0.5rem);
  }

  .dialog__dither .dialog__hint {
    margin: 0;
  }

  .dialog__foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--al-space-2xs, 0.5rem);
    margin-top: var(--al-space-2xs, 0.5rem);
  }

  .dialog__outcome[data-ok="false"],
  .dialog__progress {
    color: var(--al-text-secondary);
  }
</style>
