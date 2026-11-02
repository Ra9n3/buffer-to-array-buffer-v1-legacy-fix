<script lang="ts">
  import BusMasterStrip from "../channel-strip/BusMasterStrip.svelte";
  import type { Bus } from "../../lib/project/model";
  import { busLive, busStripOf } from "../../lib/project/store.svelte";
  import MixerIdentity from "./MixerIdentity.svelte";

  /**
   * ALLOY Mixer bus-master channel — Task 2.7.
   *
   * The approved Task 2.4 `BusMasterStrip` (BUS print, orange trim and
   * balance, blank bay, fader legended MASTER, MUTE · SOLO · PEAK) given the
   * Mixer's identity extension: "BUS MASTER" where a track prints its
   * family, SEL at the right, and blank second and third lines — the bus
   * has no source type and no Prominence Tier; the blanks keep its controls
   * on the tracks' lines (D2.4.4).
   */
  let {
    channel,
    selected,
    onselect,
  }: {
    channel: Bus;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();

  /* Task 3.1: the Console's bus master bound to the project store's view of
     this bus — one trim, balance, level, MUTE and SOLO in both rooms. */
  const bus = $derived(busStripOf(channel.id));
  const live = $derived(busLive(channel.id));
</script>

<BusMasterStrip {bus} {live}>
  {#snippet identity()}
    <div class="bus-identity" data-mixer-channel={channel.id} data-mixer-channel-kind="bus">
      <MixerIdentity
        kindPrint="Bus master"
        kindTitle="Bus master"
        channelName={channel.name}
        {selected}
        onselect={() => onselect(channel.id)}
      />
    </div>
  {/snippet}
</BusMasterStrip>

<style>
  .bus-identity {
    display: contents;
  }
</style>
