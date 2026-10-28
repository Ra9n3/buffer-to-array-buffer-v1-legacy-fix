<script lang="ts">
  import type { MixerChannel } from "../lib/mixer";
  import { channelKindLabel } from "../lib/mixer";

  let {
    channel,
    selected,
    onselect,
  }: {
    channel: MixerChannel;
    selected: boolean;
    onselect: (id: string) => void;
  } = $props();
</script>

<!-- One selectable channel header in the Mixer column.

     Geometry is deliberately identical to the Arrange track header
     (ArrangeTrackRow): same row height, same padding, same code/name typography
     scale, same border treatment. The shared values live as custom properties in
     app.css so the two rooms cannot drift. The selection state is drawn with a
     background change and an inset box-shadow ring — neither affects the box
     dimensions, so selecting a channel never resizes the header. -->
<li class="mixer-strip-item">
  <button
    type="button"
    class="mixer-strip"
    class:is-selected={selected}
    aria-pressed={selected}
    data-mixer-strip
    data-channel-id={channel.id}
    data-channel-kind={channel.kind}
    data-channel-code={channel.code}
    onclick={() => onselect(channel.id)}
  >
    <span class="mixer-strip__identity">
      <span class="mixer-strip__code">{channel.code}</span>
      <span class="mixer-strip__name">{channel.name}</span>
    </span>
    <span class="mixer-strip__kind">{channelKindLabel(channel.kind)}</span>
  </button>
</li>

<style>
  .mixer-strip-item {
    display: block;
    min-width: 0;
  }

  .mixer-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--track-header-gap);
    width: 100%;
    min-width: 0;
    height: var(--track-header-height);
    padding: var(--track-header-padding-block) var(--track-header-padding-inline);
    border: 0;
    border-right: 2px solid #8a8a8a;
    border-bottom: 1px solid #d0d0d0;
    background: #ececec;
    color: #1b1b1b;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
  }

  .mixer-strip:hover {
    background: #f5f5f5;
  }

  .mixer-strip.is-selected {
    /* Selection is drawn inside the existing box: no size change. */
    background: #dcdcdc;
    box-shadow:
      inset 3px 0 0 #1b1b1b,
      inset 0 0 0 2px #1b1b1b;
  }

  .mixer-strip__identity {
    display: flex;
    align-items: baseline;
    gap: var(--track-header-gap);
    min-width: 0;
  }

  .mixer-strip__code {
    flex: 0 0 auto;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: var(--track-header-code-size);
    font-weight: 700;
    color: #5d5d5d;
  }

  .mixer-strip__name {
    min-width: 0;
    overflow: hidden;
    font-size: var(--track-header-name-size);
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Bus and Return channels are distinguished from tracks by their name and by
     this small tag, exactly as the Console bank does. */
  .mixer-strip__kind {
    flex: 0 0 auto;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .mixer-strip[data-channel-kind="track"] .mixer-strip__kind {
    display: none;
  }
</style>
