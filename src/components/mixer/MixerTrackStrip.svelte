<script lang="ts">
  import TrackStrip from "../channel-strip/TrackStrip.svelte";
  import Lamp from "../hardware/Lamp.svelte";
  import ScribbleSelect from "../hardware/ScribbleSelect.svelte";
  import { PROMINENCE_TIERS, familyLabel, role, sourceType, type ProminenceTier } from "../../lib/arrange";
  import type { MixerTrackChannel } from "../../lib/mixer";
  import MixerIdentity from "./MixerIdentity.svelte";

  /**
   * ALLOY Mixer regular-track channel — Task 2.7.
   *
   * The approved Task 2.2 `TrackStrip` — the same module, the same TRIM,
   * PAN, two send slots, fader, MUTE · SOLO · PEAK with their approved
   * fixture-only behaviour — given the Mixer's identity extension through
   * its optional `identity` snippet:
   *
   *   FAMILY · SOURCE  the track's source family and source type (the
   *                    instrument name), printed from the same Arrange data
   *                    the Arrange row edits (`ARRANGE_TRACKS`, by code), so
   *                    the two rooms can never disagree. The role is in the
   *                    source print's tooltip. Editing stays in Arrange
   *                    (owner, D2.7.2).
   *   SEL              the channel select (owner, D2.7.3).
   *   TIER             the approved ScribbleSelect with the three Prominence
   *                    Tiers (plan §5a; the Arrange row's control, the same
   *                    options and wording), beside an amber Lamp that is lit
   *                    while the tier still "needs confirmation" (plan §5a: a
   *                    suggested classification keeps the default Supporting
   *                    until the user confirms). Choosing any tier — the one
   *                    shown included — confirms it and puts the lamp out
   *                    (owner, D2.7.4; the select's `onchoose`).
   *
   * State: the tier and its confirmation are this strip's own UI state,
   * seeded from the fixture (`tier`, `tierConfirmed`), written nowhere —
   * the Arrange row keeps its own copy the same way; a shared project model
   * is a later task. No classification happens here: the fixture says what
   * is suggested, the user confirms.
   */
  let {
    channel,
    selected,
    onselect,
  }: {
    channel: MixerTrackChannel;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();

  const family = $derived(familyLabel(channel.arrange.familyId));
  const source = $derived(sourceType(channel.arrange.sourceTypeId));
  const theRole = $derived(role(channel.arrange.role));

  // Seeded once from the fixture (strips are keyed by channel id, so a strip
  // never changes channel); from then on the strip's own UI state.
  // svelte-ignore state_referenced_locally
  let tier = $state<ProminenceTier>(channel.arrange.tier);
  // svelte-ignore state_referenced_locally
  let confirmed = $state(channel.arrange.tierConfirmed !== false);

  const tierName = $derived(PROMINENCE_TIERS.find((t) => t.id === tier)?.name ?? tier);
  const tierTitle = $derived(
    confirmed
      ? `Prominence tier, ${channel.name}: ${tierName} \u2014 how the track is treated in mix conflicts`
      : `Prominence tier, ${channel.name}: ${tierName} \u2014 suggested, needs confirmation: choose a tier to confirm it`,
  );
</script>

<TrackStrip track={channel.strip}>
  {#snippet identity()}
    <div
      class="track-identity"
      data-mixer-channel={channel.id}
      data-mixer-channel-kind="track"
      data-track-code={channel.code}
      data-track-tier={tier}
      data-tier-confirmed={confirmed}
    >
      <MixerIdentity
        kindPrint={family ?? "No family"}
        kindTitle={family ? `Family: ${family}` : "No family assigned \u2014 set it in Arrange"}
        sourcePrint={source?.label ?? "Unspecified"}
        sourceTitle={`Source type: ${source?.label ?? "Unspecified"} \u00b7 Role: ${theRole.long} \u2014 edit in Arrange`}
        channelName={channel.name}
        {selected}
        onselect={() => onselect(channel.id)}
      >
        {#snippet control()}
          <span class="track-identity__tier">
            <ScribbleSelect
              label="Prominence tier"
              context={channel.name}
              options={PROMINENCE_TIERS}
              bind:value={tier}
              size="xs"
              hook="tier"
              title={tierTitle}
              onchoose={() => (confirmed = true)}
            />
          </span>
          <span
            class="track-identity__confirm"
            title={confirmed ? "Tier confirmed" : "Tier needs confirmation"}
            data-tier-confirm-lamp
          >
            <Lamp lit={!confirmed} color="amber" name={`Needs confirmation, ${channel.name}`} />
          </span>
        {/snippet}
      </MixerIdentity>
    </div>
  {/snippet}
</TrackStrip>

<style>
  .track-identity {
    display: contents;
  }

  /* the tier window takes the line; the lamp sits at its right */
  .track-identity__tier {
    flex: 1 1 auto;
    min-width: 0;
  }

  .track-identity__tier > :global(.select) {
    width: 100%;
  }

  .track-identity__confirm {
    flex: 0 0 auto;
    display: flex;
  }
</style>
