<script lang="ts">
  import { PROMINENCE_TIERS, familyLabel, role, sourceType } from "../lib/arrange";
  import { createBusChainState, type BusChainState } from "../lib/bus-chain";
  import { MIXER_BUSES, MIXER_TRACKS, channelKindLabel, type MixerChannelEntry } from "../lib/mixer";
  import { createChainState, supportsChainDetail, trackRailBlocks, type ChainState } from "../lib/mixer-chain";
  import { returnChain, returnCharacter, sendsInto } from "../lib/return-chain.svelte";
  import { orgToken } from "./channel-strip/track-strip-fixtures";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import BusDetail from "./mixer/BusDetail.svelte";
  import CompressorSection from "./mixer/CompressorSection.svelte";
  import EqSection from "./mixer/EqSection.svelte";
  import ProcessingChain from "./mixer/ProcessingChain.svelte";
  import ReturnDetail from "./mixer/ReturnDetail.svelte";
  import WhatChanged from "./mixer/WhatChanged.svelte";

  /**
   * ALLOY Mixer detail panel — Task 2.8: the selected STANDARD TRACK's
   * processing chain (plan §3 "Mixer room and transparency", §8, §10).
   *
   * The room hands in the selected channel exactly as it did for the Task
   * 0.5 placeholder (`MixerRoom.svelte` is untouched). The panel branches
   * ONCE, on `supportsChainDetail` (`kind === "track"` on the existing
   * model):
   *
   *   a standard track   → the IDENTITY HEADER from the shared session, the
   *                        PROCESSING CHAIN readout, the EQ bay, the
   *                        COMPRESSOR bay, and WHAT CHANGED AND WHY;
   *   a Return / a bus   → the identity header and an explicit empty state.
   *                        Their chains differ (plan §3, §8a) and are Task
   *                        2.9; a standard-track chain is never shown for
   *                        them.
   *
   * State: one chain per standard track, created from its fixture once and
   * edited in place for the life of the room, so edits survive leaving and
   * returning to a track and never leak between tracks. Nothing is stored,
   * shared across rooms or persisted; nothing is processed.
   *
   * Housing: the Mixer bank's (walnut end-cheeks, the charcoal deck), copied
   * value for value, so the panel is the same desk furniture as the bank
   * above it.
   */
  let { channel }: { channel: MixerChannelEntry | undefined } = $props();

  const chains = $state<Record<string, ChainState>>(
    Object.fromEntries(MIXER_TRACKS.map((t) => [t.id, createChainState(t)])),
  );

  /* Task 2.9: the buses' chains, panel-local like the tracks'; the Returns'
     chains are the shared per-Return state the Mixer's Return strips are
     bound to (return-chain.svelte.ts), so strip and panel turn one value. */
  const busChains = $state<Record<string, BusChainState>>(
    Object.fromEntries(MIXER_BUSES.map((b) => [b.id, createBusChainState(b.bus)])),
  );

  const track = $derived(supportsChainDetail(channel) ? channel : undefined);
  const chain = $derived(track ? chains[track.id] : undefined);
  const theReturn = $derived(channel?.kind === "return" ? returnChain(channel.ret) : undefined);
  const bus = $derived(channel?.kind === "bus" ? busChains[channel.id] : undefined);
  const supported = $derived(track !== undefined || theReturn !== undefined || bus !== undefined);

  const returnEffect = $derived(theReturn ? (theReturn.effect === "reverb" ? "Reverb" : "Delay") : null);
  const returnCharacterName = $derived(theReturn ? returnCharacter(theReturn.effect, theReturn.character.value).name : null);
  const returnSendCount = $derived(theReturn ? sendsInto(theReturn.returnId).length : 0);

  const family = $derived(track ? familyLabel(track.arrange.familyId) : null);
  const source = $derived(track ? sourceType(track.arrange.sourceTypeId) : null);
  const theRole = $derived(track ? role(track.arrange.role) : null);
  const tierName = $derived(
    track ? (PROMINENCE_TIERS.find((t) => t.id === track.arrange.tier)?.name ?? track.arrange.tier) : null,
  );
  const kindPrint = $derived(
    channel ? (channel.kind === "track" ? "Standard track" : channelKindLabel(channel.kind)) : "",
  );
  const org = $derived(
    channel ? (channel.kind === "track" ? channel.strip.org : channel.kind === "return" ? channel.ret.org : channel.bus.org) : null,
  );
</script>

<section
  class="detail"
  data-mixer-region="detail-panel"
  data-detail-channel={channel?.id ?? ""}
  data-detail-kind={channel?.kind ?? ""}
  data-detail-supported={supported}
  aria-labelledby="mixer-detail-title"
>
  <div class="detail__cheek detail__cheek--left" aria-hidden="true"></div>

  <div class="detail__deck">
    <!-- ---- identity, from the shared session ------------------------- -->
    <header class="detail__head" data-mixer-region="selection">
      {#if channel}
        <div class="detail__identity" data-mixer-selected-name>
          <EngravedLabel text={channel.code} size="lg" kind="value" tone="bright" />
          {#if org !== null}
            <span class="detail__tab" style:--org={orgToken(org)} data-org-tab={String(org)} aria-hidden="true"></span>
          {/if}
          <EngravedLabel text={channel.name} size="lg" tone="bright" as="h2" id="mixer-detail-title" truncate />
          {#if track}
            <span class="detail__meta">
              <EngravedLabel
                text={`${family ?? "No family"} \u00b7 ${source?.label ?? "Unspecified"}`}
                size="xs"
                tone="muted"
                truncate
                title={`Family: ${family ?? "none"} \u00b7 Source type: ${source?.label ?? "Unspecified"} \u2014 edit in Arrange`}
              />
            </span>
          {:else if theReturn && returnEffect}
            <span class="detail__meta" data-detail-return-effect={theReturn.effect} data-detail-return-character={theReturn.character.value}>
              <EngravedLabel
                text={`${returnEffect} \u00b7 ${returnCharacterName}`}
                size="xs"
                tone="muted"
                truncate
                title={`Effect: ${returnEffect} \u00b7 Character: ${returnCharacterName} (chosen in the effect module below)`}
              />
            </span>
          {:else if bus}
            <span class="detail__meta" data-detail-bus-output={bus.output}>
              <EngravedLabel
                text={`Output \u2192 ${bus.output}`}
                size="xs"
                tone="muted"
                truncate
                title={`Output: ${bus.output} \u2014 the bus every track and Return sums into (plan \u00a78)`}
              />
            </span>
          {/if}
        </div>
        <div class="detail__facts">
          {#if track && theRole && tierName}
            <span class="detail__fact" title={`Role: ${theRole.long}`}>
              <EngravedLabel text="Role" size="xs" tone="muted" />
              <EngravedLabel text={theRole.long} size="xs" kind="value" />
            </span>
            <span class="detail__fact" title={`Prominence tier: ${tierName} (the session fixture's value)`}>
              <EngravedLabel text="Tier" size="xs" tone="muted" />
              <EngravedLabel text={tierName} size="xs" kind="value" />
            </span>
          {:else if theReturn}
            <span class="detail__fact" data-detail-return-sends={returnSendCount} title={`${returnSendCount} track send${returnSendCount === 1 ? "" : "s"} feed this Return (plan \u00a78a: the Return's input is its incoming sends)`}>
              <EngravedLabel text="Input" size="xs" tone="muted" />
              <EngravedLabel text={`${returnSendCount} send${returnSendCount === 1 ? "" : "s"}`} size="xs" kind="value" />
            </span>
            <span class="detail__fact" title={`${theReturn.bypassed ? "Bypassed" : "In circuit"} \u2014 the Return's BYPASS, on its strip and in the effect module`}>
              <EngravedLabel text="Chain" size="xs" tone="muted" />
              <EngravedLabel text={theReturn.bypassed ? "Bypassed" : "In circuit"} size="xs" kind="value" />
            </span>
          {:else if bus}
            <span class="detail__fact" data-detail-bus-peak={bus.peakProtection.engaged} title={`Peak protection: ${bus.peakProtection.text} (plan \u00a78: transparent peak protection only if needed; no loudness maximisation, no mastering)`}>
              <EngravedLabel text="Peak protection" size="xs" tone="muted" />
              <EngravedLabel text={bus.peakProtection.engaged ? "Engaged" : "Not engaged"} size="xs" kind="value" />
            </span>
          {/if}
          <span class="detail__fact">
            <EngravedLabel text={kindPrint} size="xs" kind="value" tone="muted" />
          </span>
        </div>
      {:else}
        <div class="detail__identity" data-mixer-selected-name>
          <EngravedLabel text="No channel selected" size="lg" tone="bright" as="h2" id="mixer-detail-title" />
        </div>
      {/if}
    </header>

    {#if track && chain}
      <!-- ---- the chain ------------------------------------------------- -->
      <div class="detail__chain" data-mixer-region="processing-chain">
        <EngravedLabel text="Processing chain" size="xs" tone="muted" />
        <ProcessingChain blocks={trackRailBlocks(chain)} />
      </div>

      <!-- ---- the two bays ---------------------------------------------- -->
      <div class="detail__bays">
        <div class="detail__bay detail__bay--eq" data-mixer-region="eq-graph">
          <EqSection eq={chain.eq} trackName={track.name} />
        </div>
        <div class="detail__bay detail__bay--comp" data-mixer-region="compressor">
          <CompressorSection comp={chain.comp} trackName={track.name} />
        </div>
      </div>

      <!-- ---- what changed and why -------------------------------------- -->
      <div class="detail__changed" data-mixer-region="what-changed">
        <WhatChanged notes={chain.notes} trackName={track.name} />
      </div>
    {:else if theReturn}
      <!-- A Return: its effect-specific chain (plan §3, §8a) — Task 2.9. -->
      <ReturnDetail chain={theReturn} />
    {:else if bus}
      <!-- A regular bus: the bus path (plan §8) — Task 2.9. -->
      <BusDetail chain={bus} />
    {:else if channel}
      <!-- A kind this build has no chain for: say so, never show another kind's controls. -->
      <div class="detail__empty" role="status" data-detail-empty>
        <EngravedLabel
          text={`Processing detail for ${channelKindLabel(channel.kind).toLowerCase()} channels is not available in this build`}
          size="sm"
          tone="muted"
        />
      </div>
    {:else}
      <div class="detail__empty" role="status" data-detail-empty>
        <EngravedLabel text="Select a channel in the bank to inspect it" size="sm" tone="muted" />
      </div>
    {/if}
  </div>

  <div class="detail__cheek detail__cheek--right" aria-hidden="true"></div>
</section>

<style>
  /* =======================================================================
     THE HOUSING — the Mixer bank's (MixerBank.svelte), value for value.
     ======================================================================= */
  .detail {
    --dt-cheek: 0.875rem;
    --dt-radius: 4px;
    --dt-wood-light: color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal));
    --dt-wood: var(--al-material-wood);
    --dt-wood-dark: color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess));
    --dt-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: grid;
    grid-template-columns: var(--dt-cheek) minmax(0, 1fr) var(--dt-cheek);
    /* the host is a flex row with a floored grid row (MixerRoom): take the
       content's height, never less than the row's floor, never stretched */
    align-self: flex-start;
    min-width: 0;
    width: 100%;
    min-height: 100%;
    border-radius: var(--dt-radius);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  .detail__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--dt-wood);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.32) 100%),
      repeating-linear-gradient(
        93deg,
        var(--dt-wood-light) 0 1px,
        var(--dt-wood) 1px 3px,
        var(--dt-wood-dark) 3px 4px,
        var(--dt-wood) 4px 7px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .detail__cheek--left {
    border-radius: var(--dt-radius) 0 0 var(--dt-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .detail__cheek--right {
    border-radius: 0 var(--dt-radius) var(--dt-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  .detail__deck {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-md) var(--al-space-md);
    background-color: var(--al-material-panel);
    background-image:
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--dt-trim) 1px, var(--dt-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
      radial-gradient(
        120% 100% at 18% 0%,
        rgba(255, 255, 255, 0.07) 0%,
        rgba(255, 255, 255, 0.015) 38%,
        rgba(0, 0, 0, 0.22) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8);
  }

  /* --- identity ---------------------------------------------------------- */
  .detail__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-2xs) var(--al-space-lg);
    min-width: 0;
    padding: var(--al-space-2xs) 0 var(--al-space-xs);
    border-bottom: 1px solid var(--al-separator);
  }

  .detail__identity {
    display: flex;
    flex: 1 1 18rem;
    align-items: baseline;
    gap: var(--al-space-sm);
    min-width: 0;
  }

  /* the organisational colour tab: flat, the swatch colour only (D2.2.13) */
  .detail__tab {
    flex: 0 0 auto;
    align-self: center;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }

  .detail__meta {
    display: flex;
    min-width: 0;
    padding-left: var(--al-space-xs);
    border-left: 1px solid var(--al-separator);
  }

  .detail__facts {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--al-space-2xs) var(--al-space-md);
    min-width: 0;
  }

  .detail__fact {
    display: inline-flex;
    align-items: baseline;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  /* --- the chain --------------------------------------------------------- */
  .detail__chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--al-space-2xs) var(--al-space-sm);
    min-width: 0;
  }

  /* --- the bays ---------------------------------------------------------- */
  .detail__bays {
    display: flex;
    flex-wrap: wrap;
    /* each plate is its module's height: a plate is never stretched over
       panel it has nothing to put on */
    align-items: flex-start;
    gap: var(--al-space-md);
    min-width: 0;
  }

  .detail__bay {
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-sm) var(--al-space-sm);
    border-radius: 3px;
    /* a module plate bolted to the deck: a touch lighter, lit on top */
    background-color: color-mix(in srgb, var(--al-material-surface-raised) 60%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 2px rgba(0, 0, 0, 0.45);
  }

  /* The EQ takes what the compressor leaves: the compressor's base is its
     one-row content (character, five knobs, the meter) and it never grows;
     when the two no longer fit side by side they stack, each full width. */
  .detail__bay--eq {
    flex: 1 1 36rem;
  }

  .detail__bay--comp {
    flex: 0 1 auto;
  }

  /* --- what changed ------------------------------------------------------ */
  .detail__changed {
    min-width: 0;
  }

  /* --- the empty state (nothing selected; or a kind with no chain) ------- */
  .detail__empty {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-height: 8rem;
    padding: var(--al-space-md);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong);
  }
</style>
