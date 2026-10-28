<script lang="ts">
  import MixerChannelStrip from "../components/MixerChannelStrip.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import {
    DEFAULT_MIXER_SELECTION,
    MIXER_CHANNELS,
    MIXER_KIND_NAMES,
    type MixerChannelPlaceholder,
  } from "../lib/mixer";

  // Local UI state only — no shared project state, no cross-room sync.
  let selectedId = $state<string>(DEFAULT_MIXER_SELECTION);

  const selected = $derived<MixerChannelPlaceholder | undefined>(
    MIXER_CHANNELS.find((channel) => channel.id === selectedId),
  );

  /**
   * Processing-chain slots, in the product plan's proposed chain order (§8,
   * "Proposed channel chain"). Structure only — every slot is a neutral
   * placeholder. Chain-type branching for bus and Return channels is Task 2.9.
   */
  const CHAIN_SLOTS = [
    "Input trim / gain",
    "Cleanup / expander",
    "Static multiband EQ",
    "Dynamic EQ",
    "Compressor",
    "Panning",
    "Channel fader",
    "Sends + bus routing",
  ] as const;
</script>

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
>
  <div class="mixer-room" data-mixer-room>
    <!-- Column A: selectable channel strips. -->
    <section
      class="mixer-channels"
      data-mixer-region="channel-column"
      aria-labelledby="mixer-channels-title"
    >
      <header class="mixer-section-head">
        <h2 class="mixer-section-head__title" id="mixer-channels-title">
          Channels
        </h2>
        <p class="mixer-section-head__detail">
          {MIXER_CHANNELS.length} placeholder channels. Select one to inspect.
        </p>
      </header>
      <div
        class="mixer-channels__list"
        data-mixer-channel-list
        role="group"
        aria-label="Placeholder channels"
      >
        {#each MIXER_CHANNELS as channel (channel.id)}
          <MixerChannelStrip
            {channel}
            selected={channel.id === selectedId}
            onselect={(id) => (selectedId = id)}
          />
        {/each}
      </div>
    </section>

    <!-- Column B: processing detail for the selected channel. -->
    <section
      class="mixer-detail"
      data-mixer-region="detail-panel"
      aria-labelledby="mixer-detail-title"
    >
      <div class="mixer-detail__scroll" data-mixer-detail-scroll>
        <header class="mixer-detail__head" data-mixer-region="selection">
          <p class="mixer-detail__eyebrow">Selected channel</p>
          {#if selected}
            <h2 class="mixer-detail__title" id="mixer-detail-title">
              <span class="mixer-detail__code">{selected.code}</span>
              <span data-mixer-selected-name>{selected.name}</span>
            </h2>
            <p class="mixer-detail__sub">
              {MIXER_KIND_NAMES[selected.kind]} · processing chain placeholder
            </p>
          {:else}
            <h2 class="mixer-detail__title" id="mixer-detail-title">
              No channel selected
            </h2>
            <p class="mixer-detail__sub">
              Select a channel on the left to inspect its processing chain.
            </p>
          {/if}
        </header>

        <div class="mixer-detail__grid">
          <section
            class="mixer-block mixer-block--chain"
            data-mixer-region="processing-chain"
            aria-labelledby="mixer-chain-title"
          >
            <h3 class="mixer-block__title" id="mixer-chain-title">
              Processing chain
            </h3>
            <ol class="mixer-chain" aria-label="Processing chain slots, placeholders">
              {#each CHAIN_SLOTS as slot, index (slot)}
                <li class="mixer-chain__slot">
                  <span class="mixer-chain__index"
                    >{String(index + 1).padStart(2, "0")}</span
                  >
                  <span class="mixer-chain__name">{slot}</span>
                  <span class="mixer-chain__placeholder" aria-hidden="true"
                    >Placeholder</span
                  >
                </li>
              {/each}
            </ol>
          </section>

          <section
            class="mixer-block mixer-block--eq"
            data-mixer-region="eq-graph"
            aria-labelledby="mixer-eq-title"
          >
            <h3 class="mixer-block__title" id="mixer-eq-title">EQ curve</h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>EQ graph placeholder</span>
            </div>
          </section>

          <section
            class="mixer-block mixer-block--dynamics"
            data-mixer-region="compressor"
            aria-labelledby="mixer-dynamics-title"
          >
            <h3 class="mixer-block__title" id="mixer-dynamics-title">
              Compressor &amp; gain reduction
            </h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>Compressor and gain-reduction display placeholder</span>
            </div>
          </section>

          <section
            class="mixer-block"
            data-mixer-region="sends"
            aria-labelledby="mixer-sends-title"
          >
            <h3 class="mixer-block__title" id="mixer-sends-title">Sends</h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>Send-level placeholders — post-fader, reverbs and delay</span>
            </div>
          </section>

          <section
            class="mixer-block"
            data-mixer-region="auto-manual"
            aria-labelledby="mixer-automanual-title"
          >
            <h3 class="mixer-block__title" id="mixer-automanual-title">
              Auto / Manual
            </h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>Per-parameter Auto / Manual placeholders</span>
            </div>
          </section>

          <section
            class="mixer-block"
            data-mixer-region="ghost-indicator"
            aria-labelledby="mixer-ghost-title"
          >
            <h3 class="mixer-block__title" id="mixer-ghost-title">
              Original vs current
            </h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>Ghost-indicator placeholders — original setting beside current</span>
            </div>
          </section>

          <section
            class="mixer-block mixer-block--wide"
            data-mixer-region="what-changed"
            aria-labelledby="mixer-changed-title"
          >
            <h3 class="mixer-block__title" id="mixer-changed-title">
              What changed and why
            </h3>
            <div class="mixer-block__surface" aria-hidden="true">
              <span>
                Explanation placeholders. Real explanations come from actual
                engine decisions in a later phase.
              </span>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</RoomShell>

<style>
  .mixer-room {
    display: grid;
    grid-template-columns: minmax(9rem, 16rem) minmax(0, 1fr);
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .mixer-channels,
  .mixer-detail {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  .mixer-section-head {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.375rem;
    row-gap: 0;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid #b5b5b5;
  }

  .mixer-section-head__title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .mixer-section-head__detail {
    margin: 0;
    color: #5d5d5d;
    font-size: 0.6875rem;
  }

  .mixer-channels__list {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.1875rem;
    min-height: 0;
    padding: 0.25rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .mixer-detail__scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
    min-height: 0;
    padding: 0.375rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .mixer-detail__head {
    flex: 0 0 auto;
    padding: 0.375rem 0.5rem;
    border: 1px solid #a3a3a3;
    background: #e8e8e8;
  }

  .mixer-detail__eyebrow {
    margin: 0;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .mixer-detail__title {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    margin: 0.0625rem 0 0;
    font-size: 1.0625rem;
    line-height: 1.2;
  }

  .mixer-detail__code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: #5d5d5d;
  }

  .mixer-detail__sub {
    margin: 0.125rem 0 0;
    color: #454545;
    font-size: 0.6875rem;
  }

  .mixer-detail__grid {
    display: grid;
    flex: 1 0 auto;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.375rem;
    min-width: 0;
    align-content: start;
  }

  .mixer-block {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    min-width: 0;
    padding: 0.375rem;
    border: 1px dashed #a3a3a3;
    background: #f6f6f6;
  }

  .mixer-block--wide {
    grid-column: 1 / -1;
  }

  .mixer-block__title {
    margin: 0;
    color: #454545;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .mixer-block__surface {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-width: 0;
    min-height: 3.25rem;
    padding: 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    color: #5d5d5d;
    font-size: 0.6875rem;
    text-align: center;
    overflow-wrap: break-word;
  }

  .mixer-block--eq .mixer-block__surface,
  .mixer-block--dynamics .mixer-block__surface {
    min-height: 5rem;
  }

  .mixer-chain {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mixer-chain__slot {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.125rem 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    font-size: 0.6875rem;
  }

  .mixer-chain__index {
    flex: 0 0 auto;
    color: #6d6d6d;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.5625rem;
  }

  .mixer-chain__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mixer-chain__placeholder {
    flex: 0 0 auto;
    color: #6d6d6d;
    font-size: 0.5625rem;
    opacity: 0.85;
  }

  @media (max-width: 48rem) {
    /* Stack: channel column above, detail panel below. Nothing is hidden —
       the channel names and every detail region stay present. */
    .mixer-room {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(8rem, 0.55fr) minmax(0, 1.45fr);
    }
  }
</style>
