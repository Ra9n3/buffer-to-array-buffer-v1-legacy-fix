<script lang="ts">
  import { familyLabel, sourceType } from "../../lib/arrange";
  import { channelKindLabel } from "../../lib/mixer";
  import type { Channel } from "../../lib/project/model";
  import { orgToken } from "../channel-strip/track-strip-fixtures";
  import EngravedLabel from "../hardware/EngravedLabel.svelte";

  /**
   * ALLOY Mixer compact channel strip — Task 0.5 layout, current project data.
   *
   * The Mixer's left column is the approved vertical channel list: one compact
   * header per channel, sized from the shared `--track-header-*` geometry so it
   * matches the Arrange track-row head. It selects a channel for the detail
   * panel; it is not a second control surface (the Console bank and the detail
   * panel carry the controls).
   *
   * The facts are read from the one project entity: code, kind, name and the
   * organisational tab. A track also prints its family/source, a Return its
   * effect, so the list still identifies the session at a glance.
   */
  let {
    channel,
    selected,
    onselect,
  }: {
    channel: Channel;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();

  const detail = $derived.by(() => {
    if (channel.kind === "track") {
      return `${familyLabel(channel.familyId) ?? "No family"} \u00b7 ${sourceType(channel.sourceTypeId)?.label ?? "Unspecified"}`;
    }
    if (channel.kind === "return") {
      return channel.effect === "reverb" ? "Reverb return" : "Delay return";
    }
    return "Bus master";
  });

  const org = $derived(channel.org);
  const kind = $derived(channelKindLabel(channel.kind));
</script>

<button
  type="button"
  class="channel"
  class:is-selected={selected}
  data-mixer-strip
  data-channel-id={channel.id}
  data-channel-kind={channel.kind}
  data-selected={selected ? "true" : "false"}
  aria-pressed={selected}
  aria-label={`Select ${channel.code} ${channel.name}`}
  onclick={() => onselect(channel.id)}
>
  <span class="channel__ident">
    <span class="channel__tab" style:--org={orgToken(org)} data-org-tab={String(org)} aria-hidden="true"></span>
    <EngravedLabel text={channel.code} size="sm" kind="value" tone="bright" />
    <EngravedLabel text={kind} size="xs" tone="muted" />
  </span>
  <span class="channel__name">
    <EngravedLabel text={channel.name} size="md" kind="value" tone="bright" truncate />
  </span>
  <span class="channel__detail">
    <EngravedLabel text={detail} size="xs" tone="muted" truncate />
  </span>
</button>

<style>
  .channel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--track-header-gap);
    width: 100%;
    min-width: 0;
    height: var(--track-header-height);
    padding: var(--track-header-padding-block) var(--track-header-padding-inline);
    border: 0;
    border-bottom: 1px solid var(--al-separator);
    background-color: var(--al-material-panel);
    background-image: repeating-linear-gradient(
      92deg,
      rgba(255, 255, 255, 0.012) 0 1px,
      rgba(0, 0, 0, 0.012) 1px 2px
    );
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .channel:hover {
    background-color: color-mix(in srgb, var(--al-material-panel) 88%, var(--al-material-metal));
  }

  .channel:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: -2px;
  }

  .channel.is-selected {
    background-color: color-mix(in srgb, var(--al-material-panel) 76%, var(--al-material-cream));
    box-shadow:
      inset 3px 0 0 var(--al-text-primary),
      inset 0 0 0 1px var(--al-border-strong);
  }

  .channel__ident {
    display: flex;
    align-items: baseline;
    gap: var(--al-space-xs);
    min-width: 0;
    min-height: 1.125rem;
  }

  .channel__tab {
    flex: 0 0 auto;
    align-self: center;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }

  .channel__name,
  .channel__detail {
    display: flex;
    min-width: 0;
  }

  .channel__name :global(.label) {
    font-size: var(--track-header-name-size);
  }

  .channel__ident :global(.label--value),
  .channel__detail :global(.label) {
    font-size: var(--track-header-code-size);
  }
</style>
