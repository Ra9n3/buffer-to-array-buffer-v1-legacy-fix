<script lang="ts">
  import {
    MIXER_KIND_LABELS,
    type MixerChannelPlaceholder,
  } from "../lib/mixer";

  let {
    channel,
    selected,
    onselect,
  }: {
    channel: MixerChannelPlaceholder;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();

  function select(): void {
    onselect(channel.id);
  }
</script>

<!-- Selectable channel strip placeholder. A real <button> so selection works
     with mouse, keyboard, and assistive technology without extra wiring, and
     so the selected state is exposed via aria-pressed. Placeholder only: it
     selects a channel, it does not process anything. -->
<button
  type="button"
  class="mixer-strip"
  class:is-selected={selected}
  data-mixer-strip
  data-channel-id={channel.id}
  data-channel-kind={channel.kind}
  data-selected={selected ? "true" : "false"}
  aria-pressed={selected}
  onclick={select}
>
  <span class="mixer-strip__head">
    <span class="mixer-strip__code">{channel.code}</span>
    <span class="mixer-strip__kind">{MIXER_KIND_LABELS[channel.kind]}</span>
  </span>
  <span class="mixer-strip__name">{channel.name}</span>
  <span class="mixer-strip__slots" aria-hidden="true">
    <span class="mixer-strip__slot">Trim</span>
    <span class="mixer-strip__slot">Pan</span>
    <span class="mixer-strip__slot mixer-strip__slot--fader">Fader</span>
    <span class="mixer-strip__slot">Mute / Solo</span>
  </span>
</button>

<style>
  .mixer-strip {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 0.125rem;
    width: 100%;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border: 1px solid #b5b5b5;
    border-left: 3px solid transparent;
    background: #f3f3f3;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .mixer-strip:hover {
    background: #ffffff;
  }

  .mixer-strip.is-selected {
    border-color: #1b1b1b;
    border-left-color: #1b1b1b;
    background: #3b3b3b;
    color: #ffffff;
  }

  .mixer-strip__head {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
  }

  .mixer-strip__code {
    flex: 0 0 auto;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.625rem;
    font-weight: 700;
    opacity: 0.75;
  }

  .mixer-strip__kind {
    flex: 0 0 auto;
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    opacity: 0.65;
  }

  .mixer-strip__name {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mixer-strip__slots {
    display: flex;
    gap: 0.1875rem;
    min-width: 0;
    margin-top: 0.125rem;
  }

  .mixer-strip__slot {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    padding: 0.0625rem 0.125rem;
    border: 1px dashed #b5b5b5;
    color: #6d6d6d;
    font-size: 0.5rem;
    line-height: 1.3;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mixer-strip.is-selected .mixer-strip__slot {
    border-color: #6d6d6d;
    color: #d8d8d8;
  }

  .mixer-strip__slot--fader {
    flex: 2 1 auto;
  }
</style>
