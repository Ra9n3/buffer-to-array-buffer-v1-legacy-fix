<script lang="ts">
  /**
   * ALLOY — the top toolbar (Task 9.2, restyled in 9.3 per the owner's review).
   *
   * The owner's instruction: "implement a top-level toolbar with direct action
   * buttons (e.g. Import Stems, Undo, Redo, Save)". Each button is a real action
   * bound to real state — none of them is decoration — and each is a
   * `ToolbarKey`, the approved cream cap, so the row is hardware like the rest of
   * the app rather than grey web buttons.
   *
   *   Import stems   opens the file picker (also File > Import stems…, Ctrl+I)
   *   Undo / Redo    the project history; dark and unlit when there is nothing
   *                  to do, cream when there is
   *   Save           forces the pending autosave and reports what happened
   *
   * Save is honest about the model rather than pretending: the app saves itself
   * (a debounced autosave after every edit), so a Save key would be inert if it
   * were merely cosmetic. This one flushes that pending write immediately and
   * says so in the band's own status text, which is the only meaning a Save
   * button can have in an auto-saving app.
   */
  import ToolbarKey from "./hardware/ToolbarKey.svelte";
  import FollowControl from "./playhead/FollowControl.svelte";
  import { autosave, history } from "../lib/project/store.svelte";

  let {
    onImport,
    followPanel = null,
  }: {
    onImport: () => void;
    /**
     * Task 10.1: the active timeline panel's id, or null when the active
     * room has no timeline to follow (the Console, the Mixer, Home). The
     * follow group is contextual — one panel's setting, never a global.
     */
    followPanel?: string | null;
  } = $props();

  const canUndo = $derived(history.canUndo);
  const canRedo = $derived(history.canRedo);
  const undoLabel = $derived(history.undoLabel);
  const redoLabel = $derived(history.redoLabel);

  /** A short, honest account of what Save did — never a claim it did nothing. */
  let saved = $state<string | null>(null);

  async function save(): Promise<void> {
    const result = await autosave.save();
    if (!autosave.status.storage) saved = "NOT SAVED — NO STORAGE";
    else if (result && typeof result === "object" && "ok" in result && result.ok === false) saved = "SAVE REFUSED";
    else saved = "SAVED";
    window.setTimeout(() => (saved = null), 2000);
  }
</script>

<div class="toolbar" data-toolbar role="toolbar" aria-label="Actions">
  <!-- Import is the application's primary action: the one thing a new session
       needs. It wears the cream cap at full brightness, like Play does. -->
  <ToolbarKey label="Import stems" name="Import stems: choose WAV files" hook="import" onpress={onImport} />

  <span class="toolbar__divider" aria-hidden="true"></span>

  <ToolbarKey
    label="Undo"
    name={undoLabel ? `Undo ${undoLabel}` : "Nothing to undo"}
    hook="undo"
    disabled={!canUndo}
    onpress={() => history.undo()}
  />
  <ToolbarKey
    label="Redo"
    name={redoLabel ? `Redo ${redoLabel}` : "Nothing to redo"}
    hook="redo"
    disabled={!canRedo}
    onpress={() => history.redo()}
  />

  <span class="toolbar__divider" aria-hidden="true"></span>

  <ToolbarKey label="Save" hook="save" onpress={() => void save()} />

  <!-- Task 10.1: the active timeline panel's follow group (the mode
       selector, the suspended badge, Re-follow). Contextual: it appears for
       the Arrange room and any timeline panel that follows, and reads and
       writes only that panel's setting (§13). -->
  {#if followPanel}
    <span class="toolbar__divider" aria-hidden="true"></span>
    <FollowControl panel={followPanel} />
  {/if}

  <!-- The action's own report, not a permanent label: it appears after a press
       and clears itself. Printed on the panel, so it reads engraved. -->
  <span class="toolbar__report" data-toolbar-report role="status" aria-live="polite">
    {saved ?? ""}
  </span>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  /* A machined slot between groups, not a hairline rule. */
  .toolbar__divider {
    width: 2px;
    height: 1rem;
    margin: 0 0.375rem;
    border-radius: 1px;
    background: linear-gradient(
      180deg,
      var(--al-bevel-shadow) 0%,
      color-mix(in srgb, var(--al-material-metal) 55%, var(--al-material-recess)) 50%,
      var(--al-bevel-shadow) 100%
    );
    box-shadow: 1px 0 0 rgba(255, 255, 255, 0.06);
  }

  .toolbar__report {
    min-width: 0;
    margin-left: 0.25rem;
    overflow: hidden;
    color: var(--al-function-amber-hi);
    font-family: var(--al-font-label);
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 0 6px rgba(237, 178, 104, 0.35);
  }

  /* Confirmation gives way first when the bar narrows. */
  @media (max-width: 60rem) {
    .toolbar__report {
      display: none;
    }
  }
</style>
