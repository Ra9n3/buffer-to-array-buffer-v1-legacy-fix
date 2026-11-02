<script lang="ts">
  import ReturnStrip from "../channel-strip/ReturnStrip.svelte";
  import type { MixerReturnChannel } from "../../lib/mixer";
  import { returnLive } from "../../lib/return-chain.svelte";
  import MixerIdentity from "./MixerIdentity.svelte";

  /**
   * ALLOY Mixer Return channel — Task 2.7.
   *
   * The approved Task 2.4 `ReturnStrip` (RET print, green knobs, character
   * window, BYPASS, fader legended RETURN, MUTE · SOLO · PEAK) given the
   * Mixer's identity extension: "RETURN" where a track prints its family,
   * the effect (REVERB, DELAY) where a track prints its source type, SEL at
   * the right, and a blank third line where a track has its tier window —
   * a Return has no Prominence Tier (plan §5a tiers are for tracks) and the
   * blank keeps every control on the tracks' lines (D2.4.4's blank panel,
   * the same idea). Plan §8a: Return buses are first-class channels,
   * selected and inspected like any other.
   */
  let {
    channel,
    selected,
    onselect,
  }: {
    channel: MixerReturnChannel;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();

  const effectName = $derived(channel.ret.effect === "reverb" ? "Reverb" : "Delay");

  /* Task 2.9: the Mixer's Return strip is bound to the Return's one shared
     chain state, the same the chain-detail panel edits (plan §8a). */
  const live = $derived(returnLive(channel.ret));
</script>

<ReturnStrip ret={channel.ret} {live}>
  {#snippet identity()}
    <div class="return-identity" data-mixer-channel={channel.id} data-mixer-channel-kind="return" data-return-id={channel.ret.returnId}>
      <MixerIdentity
        kindPrint="Return"
        kindTitle="Return bus"
        sourcePrint={effectName}
        sourceTitle={`Effect: ${effectName} \u00b7 ${live.character.name}`}
        channelName={channel.name}
        {selected}
        onselect={() => onselect(channel.id)}
      />
    </div>
  {/snippet}
</ReturnStrip>

<style>
  .return-identity {
    display: contents;
  }
</style>
