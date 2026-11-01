<script lang="ts">
  import BusMasterStrip from "../components/channel-strip/BusMasterStrip.svelte";
  import ReturnStrip from "../components/channel-strip/ReturnStrip.svelte";
  import {
    BUS_MASTERS,
    RETURN_STRIPS,
    type BusMasterFixture,
    type ReturnStripFixture,
  } from "../components/channel-strip/bus-return-fixtures";

  /**
   * Playground fixture for the Console's pinned strips — Task 2.4.
   *
   * A row of pinned modules on the family's dark panel: either the room's
   * own pinned block (every fixture Return, then the bus master — the same
   * fixture objects the Console renders) or a set of state variants built
   * from those fixtures (a bypassed and muted Return, a soloed bus master
   * with its peak lamp lit, …) so each visual state can be reviewed side by
   * side. Nothing here is project state: the variants are typed-in copies
   * of the fixtures with one or two flags changed.
   */
  export interface PinnedStripFixtureConfig {
    readonly id: string;
    /** Variants to show instead of the room's block. */
    readonly returns?: readonly ReturnStripFixture[];
    readonly buses?: readonly BusMasterFixture[];
    readonly stateNote: string;
  }

  let { config }: { config: PinnedStripFixtureConfig } = $props();

  const returns = $derived(config.returns ?? RETURN_STRIPS);
  const buses = $derived(config.buses ?? BUS_MASTERS);
</script>

<figure class="pinned-fixture" data-dev-pinned-fixture={config.id}>
  <div class="pinned-fixture__panel">
    <ul class="pinned-fixture__row" aria-label={config.stateNote}>
      {#each returns as ret (ret.returnId)}
        <ReturnStrip {ret} />
      {/each}
      {#each buses as bus (bus.id)}
        <BusMasterStrip {bus} />
      {/each}
    </ul>
  </div>
  <figcaption class="pinned-fixture__caption">
    <span class="pinned-fixture__state">{config.stateNote}</span>
  </figcaption>
</figure>

<style>
  .pinned-fixture {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    margin: 0;
  }

  /* The family's dark panel (the transport fixture's), with a rail recess
     the modules stand on, as in the room; it scrolls sideways on its own if
     the playground column is narrower than the row. */
  .pinned-fixture__panel {
    padding: var(--al-space-lg);
    border-radius: var(--al-space-3xs);
    overflow-x: auto;
    background-color: var(--al-material-panel);
    background-image:
      radial-gradient(120% 100% at 18% 0%, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 38%, rgba(0, 0, 0, 0.22) 100%),
      repeating-linear-gradient(92deg, rgba(255, 255, 255, 0.012) 0 1px, rgba(0, 0, 0, 0.012) 1px 2px);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow);
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .pinned-fixture__row {
    display: flex;
    align-items: stretch;
    gap: var(--al-space-2xs);
    width: max-content;
    margin: 0;
    padding: var(--al-space-xs) var(--al-space-xs) var(--al-space-sm);
    border-radius: 3px;
    list-style: none;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .pinned-fixture__caption {
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .pinned-fixture__state {
    font-weight: var(--al-font-weight-semibold);
  }
</style>
