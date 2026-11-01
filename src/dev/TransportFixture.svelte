<script lang="ts">
  import ConsoleTransport from "../components/console-transport/ConsoleTransport.svelte";
  import MixButton from "../components/console-transport/MixButton.svelte";
  import {
    TRANSPORT_FIXTURE,
    TRANSPORT_STATE_FIXTURES,
    type MixState,
    type TransportFixture,
  } from "../components/console-transport/transport-fixtures";

  /**
   * Playground fixture for the Console transport deck — Task 2.3.
   *
   * Either the whole deck printing one of the fixture snapshots (the
   * Console's READY default, PLAYING, PROCESSING, COMPLETE), or the MIX
   * button alone in a state, on the family's dark panel. Nothing here is
   * project state, playback or a render: the snapshots are the same static
   * fixtures the Console room uses, and the keys' only behaviour is their
   * own (PLAY / STOP swap lamps, momentary keys release).
   */

  export interface TransportFixtureConfig {
    readonly id: string;
    /** Which snapshot the deck prints; omitted = the Console's default. */
    readonly snapshot?: keyof typeof TRANSPORT_STATE_FIXTURES;
    /** MIX button alone, in this state, instead of the deck. */
    readonly mixOnly?: MixState;
    readonly stateNote: string;
  }

  let { config }: { config: TransportFixtureConfig } = $props();

  const fixture: TransportFixture = $derived(config.snapshot ? TRANSPORT_STATE_FIXTURES[config.snapshot] : TRANSPORT_FIXTURE);
</script>

<figure class="transport-fixture" class:transport-fixture--mix={config.mixOnly !== undefined} data-dev-transport-fixture={config.id}>
  {#if config.mixOnly !== undefined}
    <div class="transport-fixture__panel">
      <MixButton state={config.mixOnly} name={`MIX, ${config.mixOnly}`} />
    </div>
  {:else}
    <ConsoleTransport {fixture} headingId={`dev-transport-${config.id}`} />
  {/if}
  <figcaption class="transport-fixture__caption">
    <span class="transport-fixture__state">{config.stateNote}</span>
  </figcaption>
</figure>

<style>
  .transport-fixture {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    margin: 0;
  }

  .transport-fixture--mix {
    flex: 0 0 auto;
  }

  /* the family's dark panel, the approved fixture face */
  .transport-fixture__panel {
    display: grid;
    place-items: center;
    padding: var(--al-space-xl) var(--al-space-lg);
    border-radius: var(--al-space-3xs);
    background-color: var(--al-material-panel);
    background-image:
      radial-gradient(120% 100% at 18% 0%, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 38%, rgba(0, 0, 0, 0.22) 100%),
      repeating-linear-gradient(92deg, rgba(255, 255, 255, 0.012) 0 1px, rgba(0, 0, 0, 0.012) 1px 2px);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow);
  }

  .transport-fixture__caption {
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .transport-fixture__state {
    font-weight: var(--al-font-weight-semibold);
  }
</style>
