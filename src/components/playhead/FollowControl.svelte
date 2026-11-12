<script lang="ts">
  /**
   * ALLOY follow control — Task 10.1's toolbar face (§15).
   *
   * The active timeline panel's follow group in the top bar: the mode
   * selector (a scribble window, the approved control for choosing a word),
   * and — while the panel's follow is suspended — the "Follow suspended"
   * badge with the Re-follow key. The F key is the same resume by keyboard
   * (§5), installed only while the control exists, i.e. only while the
   * active room is a timeline panel; the typing guard (isTextEntry, the
   * shell's own) keeps it out of text entry.
   *
   * The control reads and writes ONE panel's state (§13): switching rooms
   * switches which panel this shows; the Arrange room keeps its choice, and
   * the Piano Roll and the Automation editor will keep theirs.
   */
  import { onMount } from "svelte";
  import ScribbleSelect from "../hardware/ScribbleSelect.svelte";
  import ToolbarKey from "../hardware/ToolbarKey.svelte";
  import { FOLLOW_MODES, FOLLOW_MODE_PRINT, type FollowMode } from "../../lib/playback/follow";
  import { playhead } from "../../lib/playback/playhead.svelte";
  import { isTextEntry } from "../../lib/text-entry";

  let { panel = "arrange" }: { panel?: string } = $props();

  const MODE_OPTIONS = FOLLOW_MODES.map((id) => ({ id, name: FOLLOW_MODE_PRINT[id].short }));

  /** The panel's live view — its own choice, or the Settings defaults. */
  const view = $derived(playhead.followOf(panel));
  const suspendedPrint = $derived(view.suspended ? "Follow suspended" : "");

  function onShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() !== "f") return;
    if (event.defaultPrevented || isTextEntry(event.target)) return;
    event.preventDefault();
    playhead.resumeFollow(panel);
  }

  onMount(() => {
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  });
</script>

<div class="follow" data-follow-control data-follow-panel={panel} role="group" aria-label="Follow playhead">
  <ScribbleSelect
    label="Follow"
    options={MODE_OPTIONS}
    bind:value={() => view.mode, (id) => playhead.setFollowMode(panel, id as FollowMode)}
    size="sm"
    align="start"
    title={`Follow playhead. ${FOLLOW_MODE_PRINT[view.mode].intent}`}
    hook="follow-mode"
  />

  {#if view.suspended}
    <span class="follow__badge" data-follow-suspended={view.reason ?? ""} title="The view is where you left it; playback continues at the true position.">
      {suspendedPrint}
    </span>
    <ToolbarKey
      label="Re-follow"
      name="Re-follow: resume following the playhead from where it is now"
      hook="refollow"
      size="sm"
      onpress={() => playhead.resumeFollow(panel)}
    />
  {/if}
</div>

<style>
  .follow {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  /* The suspended badge: the amber report treatment — a small printed flag,
     not a lamp, because it reports a state the user chose. */
  .follow__badge {
    min-width: 0;
    padding: 0 0.375rem;
    overflow: hidden;
    color: var(--al-function-amber-hi);
    font-family: var(--al-font-label);
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-overflow: ellipsis;
    text-shadow: 0 0 6px rgba(237, 178, 104, 0.35);
    white-space: nowrap;
  }

  @media (max-width: 70rem) {
    .follow__badge {
      display: none;
    }
  }
</style>
