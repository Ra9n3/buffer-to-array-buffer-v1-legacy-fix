<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import { busRailBlocks } from "../../lib/bus-chain";
  import type { Bus } from "../../lib/project/model";
  import { project } from "../../lib/project/store.svelte";
  import CompressorSection from "./CompressorSection.svelte";
  import EqSection from "./EqSection.svelte";
  import ProcessingChain from "./ProcessingChain.svelte";
  import WhatChanged from "./WhatChanged.svelte";

  /**
   * The regular bus's chain detail — Task 2.9 (plan §8 "Bus and master
   * path": buses have their own strip state and may receive EQ / dynamics
   * when MIX is run; the final output stage does safety checks and
   * transparent peak protection only if needed, never loudness
   * maximisation or mastering).
   *
   * Under the panel's shared identity header: the bus's rail (trim → EQ →
   * compressor → balance → fader → output → peak protection, the last a
   * status lamp with no control), the same EQ and compressor modules a
   * track has — the bus's own gentle fixture values, no dynamic band, no
   * cleanup, no sends — and the authored "what changed and why" card.
   */
  /* Task 3.1: the bus entity from the project store — its chain is edited
     here, its strip settings on the strips of both rooms; the output is a
     reference the store names. */
  let { bus }: { bus: Bus } = $props();

  const chain = $derived(bus.chain);
  const blocks = $derived(busRailBlocks(chain, project.outputLabel(bus.output)));
</script>

<div class="bd" data-detail-bus={bus.id}>
  <div class="bd__chain" data-mixer-region="processing-chain">
    <EngravedLabel text="Processing chain" size="xs" tone="muted" />
    <ProcessingChain {blocks} />
  </div>

  <div class="bd__bays">
    <div class="bd__bay bd__bay--eq" data-mixer-region="eq-graph">
      <EqSection eq={chain.eq} trackName={bus.name} />
    </div>
    <div class="bd__bay bd__bay--comp" data-mixer-region="compressor">
      <CompressorSection comp={chain.comp} trackName={bus.name} />
    </div>
  </div>

  <div class="bd__changed" data-mixer-region="what-changed">
    <WhatChanged notes={chain.notes} trackName={bus.name} />
  </div>
</div>

<style>
  .bd {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .bd__chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--al-space-2xs) var(--al-space-sm);
    min-width: 0;
  }

  /* the track detail's bays, value for value (MixerDetailPanel.svelte) */
  .bd__bays {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .bd__bay {
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-sm) var(--al-space-sm);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-surface-raised) 60%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .bd__bay--eq {
    flex: 1 1 36rem;
  }

  .bd__bay--comp {
    flex: 0 1 auto;
  }

  .bd__changed {
    min-width: 0;
  }
</style>
