<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import type { ReturnBus } from "../../lib/project/model";
  import { project } from "../../lib/project/store.svelte";
  import { returnRailBlocks } from "../../lib/return-chain";
  import EffectSection from "./EffectSection.svelte";
  import ProcessingChain from "./ProcessingChain.svelte";
  import SendsIn from "./SendsIn.svelte";
  import WhatChanged from "./WhatChanged.svelte";

  /**
   * The Return bus's chain detail — Task 2.9 (plan §8a).
   *
   * Under the panel's shared identity header, the Return's own path: the
   * rail (sends in → reverb / delay → tone → the strip's Return level →
   * Master), then two plates — the Return's INPUT (the tracks sending to
   * it, read-only) beside the effect module (character, decay or time,
   * pre-delay or feedback, tone, Auto / Manual, bypass) — and the authored
   * "what changed and why" card. No EQ, compressor, pan or sends bay: a
   * Return's chain is effect-specific (plan §3, §8a).
   */
  /* Task 3.1: the Return entity from the project store — its chain is the
     state the strips of both rooms are bound to; the sends feeding it are a
     live selector over the project's tracks. */
  let { ret }: { ret: ReturnBus } = $props();

  const chain = $derived(ret.chain);
  const sends = $derived(project.sendsInto(ret.id));
  const blocks = $derived(returnRailBlocks(chain, sends.length));
</script>

<div class="rd" data-detail-return={ret.id}>
  <div class="rd__chain" data-mixer-region="processing-chain">
    <EngravedLabel text="Processing chain" size="xs" tone="muted" />
    <ProcessingChain {blocks} />
  </div>

  <div class="rd__bays">
    <div class="rd__bay rd__bay--sends" data-mixer-region="sends-in">
      <SendsIn {sends} returnName={ret.name} />
    </div>
    <div class="rd__bay rd__bay--effect" data-mixer-region="effect">
      <EffectSection {chain} returnName={ret.name} />
    </div>
  </div>

  <div class="rd__changed" data-mixer-region="what-changed">
    <WhatChanged notes={chain.notes} trackName={ret.name} />
  </div>
</div>

<style>
  .rd {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .rd__chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--al-space-2xs) var(--al-space-sm);
    min-width: 0;
  }

  /* the detail panel's bays, value for value: module plates on the deck,
     each its own height, stacking full width when they no longer fit */
  .rd__bays {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .rd__bay {
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-sm) var(--al-space-sm);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-surface-raised) 60%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 2px rgba(0, 0, 0, 0.45);
  }

  /* The input list is a column of its own width; the effect module is its
     content's width, like the compressor plate (a plate is never stretched
     over panel it has nothing to put on); the two stack, each full width,
     when the room is narrower than both. */
  .rd__bay--sends {
    flex: 0 1 17rem;
  }

  .rd__bay--effect {
    flex: 0 1 auto;
  }

  .rd__changed {
    min-width: 0;
  }
</style>
