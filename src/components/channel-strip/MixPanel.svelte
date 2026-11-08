<script lang="ts">
  /**
   * ALLOY — the pinned MIX panel (Task 9.4, owner).
   *
   * The owner's placement: the mix control belongs to the bus it feeds, so it
   * sits directly ABOVE the bus master in the bank's pinned block, not on the
   * Console's transport deck and not on the shared top bar (D9.4.2).
   *
   * This component is deliberately thin. The control itself is the approved
   * `MixButton` from the console-transport folder — the same cream key, the
   * same MIX print, the same lamp and the same `state` prop — so there is one
   * mix key in the app and not two that could drift. All this panel adds is
   * the housing, the engraved legend and the state word.
   *
   * HONEST SCOPE (plan §10, §14): the mix runs the real render through the
   * shared transport (`transport.render()`), but no mixing DECISIONS are
   * applied yet — the mixing rulebook is deferred. The panel therefore prints
   * the state it genuinely holds ("ready" / "mixing" / "complete") and makes
   * no claim beyond it. The owner accepted a prominent mix control that does
   * not yet mix (2026-11-05): this is scaffolding for a development build.
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import MixButton from "../console-transport/MixButton.svelte";
  import { transport } from "../../lib/playback/store.svelte";

  /** Unique per-instance id prefix for the legend and the status line. */
  let nextId = 0;
  const uid = `mixpanel${++nextId}`;

  /** Live: act on the shared transport. Otherwise the panel is a fixture. */
  let { live = false }: { live?: boolean } = $props();

  /**
   * The button's state. `mixRevision` is non-null only while a finished mix
   * still describes the project (Task 9.1.3), so a stale mix cannot report
   * "complete" — that logic already lives in the transport store and this
   * panel reads it rather than re-deriving it.
   */
  const state = $derived.by(() => {
    if (!live) return "ready" as const;
    if (transport.renderProgress !== null && transport.renderProgress < 1) return "processing" as const;
    if (transport.mixRevision !== null) return "complete" as const;
    return "ready" as const;
  });

  const word = $derived(
    state === "processing" ? "Mixing" : state === "complete" ? "Mixed" : "Ready",
  );

  function onMix() {
    if (live) void transport.render();
  }
</script>

<div class="mixpanel" data-mix-panel data-mix-state={state}>
  <EngravedLabel as="h3" id={`${uid}-title`} text="Mix" size="xs" tone="muted" />
  <MixButton
    {state}
    describedBy={`${uid}-status`}
    onPress={live ? onMix : undefined}
  />
  <p class="mixpanel__status" id={`${uid}-status`} data-mix-status>
    <EngravedLabel text={word} size="xs" tone={state === "complete" ? "bright" : "muted"} />
  </p>
</div>

<style>
  /* The panel is the pinned block's top cell: it wears the raised face-plate
     material so it reads as a separate instrument from the bus module below
     it, and it is exactly as wide as that module because the pinned column
     sets the width. */
  .mixpanel {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-2xs);
    padding: var(--al-space-xs) var(--al-space-2xs) var(--al-space-sm);
    border-radius: 2px;
    background-color: var(--al-material-surface-raised);
    background-image:
      radial-gradient(
        140% 80% at 26% 0%,
        rgba(255, 255, 255, 0.11) 0%,
        rgba(255, 255, 255, 0.02) 45%,
        rgba(0, 0, 0, 0.28) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.02) 0 1px,
        rgba(0, 0, 0, 0.02) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -2px 0 rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(0, 0, 0, 0.7),
      0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .mixpanel__status {
    margin: 0;
    min-height: 1rem;
    text-align: center;
  }
</style>
