<script lang="ts">
  import { CHANNEL_KIND_LABELS, type ChannelPlaceholder } from "../lib/channels";

  let {
    channel,
    selected = false,
    onselect,
  }: {
    channel: ChannelPlaceholder;
    selected?: boolean;
    onselect?: (id: string) => void;
  } = $props();

  function select(): void {
    onselect?.(channel.id);
  }
</script>

<li class="channel-strip-item">
  <!-- A real button so selection works by mouse, Enter/Space, and assistive
       technology. When no onselect is supplied the strip is still a button but
       reports the room's state via aria-pressed. -->
  <button
    type="button"
    class="channel-strip"
    class:is-selected={selected}
    data-channel-strip
    data-channel-id={channel.id}
    data-channel-strip-kind={channel.kind}
    data-selected={selected ? "true" : "false"}
    aria-pressed={selected}
    onclick={select}
  >
    <span class="channel-strip__head">
      <span class="channel-strip__code">{channel.code}</span>
      <span class="channel-strip__kind">{CHANNEL_KIND_LABELS[channel.kind]}</span>
    </span>
    <span class="channel-strip__name">{channel.name}</span>
    <span class="channel-strip__slots" aria-hidden="true">
      <span class="channel-strip__slot channel-strip__slot--trim">Trim</span>
      <span class="channel-strip__slot channel-strip__slot--pan">Pan</span>
      <span class="channel-strip__slot channel-strip__slot--fader">Fader</span>
      <span class="channel-strip__slot channel-strip__slot--switches">
        Mute / Solo
      </span>
      <span class="channel-strip__slot channel-strip__slot--peak">Peak</span>
    </span>
  </button>
</li>

<style>
  .channel-strip-item {
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  .channel-strip {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.375rem;
    border: 1px solid #8a8a8a;
    background: #f7f7f7;
    color: #2d2d2d;
    font: inherit;
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
  }

  .channel-strip:hover {
    background: #ffffff;
  }

  .channel-strip.is-selected {
    border-color: #1b1b1b;
    border-left: 3px solid #1b1b1b;
    background: #3b3b3b;
    color: #ffffff;
  }

  .channel-strip__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-width: 0;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .channel-strip.is-selected .channel-strip__head {
    color: #d8d8d8;
  }

  .channel-strip__code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  }

  .channel-strip__kind {
    flex: 0 0 auto;
  }

  .channel-strip__name {
    display: block;
    margin: 0;
    min-height: 2.25em;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .channel-strip__slots {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 0;
  }

  .channel-strip__slot {
    display: grid;
    place-items: center;
    padding: 0.125rem;
    border: 1px dashed #b0b0b0;
    background: #ececec;
    color: #5d5d5d;
    font-size: 0.625rem;
    line-height: 1.1;
    text-align: center;
    overflow-wrap: break-word;
  }

  .channel-strip.is-selected .channel-strip__slot {
    border-color: #6d6d6d;
    background: #333333;
    color: #d8d8d8;
  }

  .channel-strip__slot--trim,
  .channel-strip__slot--pan,
  .channel-strip__slot--switches,
  .channel-strip__slot--peak {
    flex: 0 0 auto;
    min-height: 1.75rem;
  }

  .channel-strip__slot--fader {
    flex: 1 1 auto;
    min-height: 3rem;
  }
</style>
