<script lang="ts">
  type ChannelKind = "track" | "bus" | "return";

  let {
    code,
    name,
    kind,
    pinned = false,
  }: {
    code: string;
    name: string;
    kind: ChannelKind;
    pinned?: boolean;
  } = $props();

  const kindLabels: Record<ChannelKind, string> = {
    track: "TRK",
    bus: "BUS",
    return: "RET",
  };
</script>

<li
  class="channel-strip"
  class:channel-strip--pinned={pinned}
  data-channel-strip-kind={kind}
  data-channel-strip-pinned={pinned ? "true" : "false"}
>
  <div class="channel-strip__head">
    <span class="channel-strip__code">{code}</span>
    <span class="channel-strip__kind">{kindLabels[kind]}</span>
  </div>
  <p class="channel-strip__name">{name}</p>
  <div class="channel-strip__slots">
    <span class="channel-strip__slot channel-strip__slot--trim">Trim</span>
    <span class="channel-strip__slot channel-strip__slot--pan">Pan</span>
    <span class="channel-strip__slot channel-strip__slot--fader">Fader</span>
    <span class="channel-strip__slot channel-strip__slot--switches">
      Mute / Solo
    </span>
    <span class="channel-strip__slot channel-strip__slot--peak">Peak</span>
  </div>
</li>

<style>
  .channel-strip {
    display: flex;
    flex: 0 0 6rem;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
    padding: 0.375rem;
    border: 1px solid #8a8a8a;
    background: #f7f7f7;
    color: #2d2d2d;
    font-size: 0.75rem;
    text-align: left;
  }

  .channel-strip--pinned {
    border-style: dashed;
    background: #f1f1f1;
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

  .channel-strip__code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  }

  .channel-strip__kind {
    flex: 0 0 auto;
  }

  .channel-strip__name {
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
