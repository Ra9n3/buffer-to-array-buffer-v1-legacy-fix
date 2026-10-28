<script lang="ts">
  import {
    CHANNEL_KIND_NAMES,
    type ChannelPlaceholder,
  } from "../lib/channels";

  let {
    channel,
  }: {
    channel: ChannelPlaceholder | undefined;
  } = $props();

  /**
   * Processing-chain slots, in the product plan's proposed chain order (§8).
   * Structure only — every slot is a neutral placeholder. Chain-type branching
   * for bus and Return channels is Task 2.9.
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

<!-- Shared "Selected Channel & Processing Chain" panel, used by both the
     Console and Mixer rooms so the two tabs stay structurally identical.

     Every block is a neutral placeholder. The panel does NOT branch by channel
     type — that is Task 2.9. -->
<section class="detail" data-detail-panel>
  <header class="detail__head" data-detail-region="selection">
    <p class="detail__eyebrow">Selected channel</p>
    {#if channel}
      <h2 class="detail__title">
        <span class="detail__code">{channel.code}</span>
        <span data-detail-selected-name>{channel.name}</span>
      </h2>
      <p class="detail__sub">
        {CHANNEL_KIND_NAMES[channel.kind]} · processing chain placeholder
      </p>
    {:else}
      <h2 class="detail__title">No channel selected</h2>
      <p class="detail__sub">
        Select a channel in the channel bank to inspect its processing chain.
      </p>
    {/if}
  </header>

  <div class="detail__grid">
    <section
      class="detail-block detail-block--chain"
      data-detail-region="processing-chain"
      aria-labelledby="detail-chain-title"
    >
      <h3 class="detail-block__title" id="detail-chain-title">
        Processing chain
      </h3>
      <ol class="detail-chain" aria-label="Processing chain slots, placeholders">
        {#each CHAIN_SLOTS as slot, index (slot)}
          <li class="detail-chain__slot">
            <span class="detail-chain__index"
              >{String(index + 1).padStart(2, "0")}</span
            >
            <span class="detail-chain__name">{slot}</span>
            <span class="detail-chain__placeholder" aria-hidden="true"
              >Placeholder</span
            >
          </li>
        {/each}
      </ol>
    </section>

    <section
      class="detail-block detail-block--tall"
      data-detail-region="eq-graph"
      aria-labelledby="detail-eq-title"
    >
      <h3 class="detail-block__title" id="detail-eq-title">EQ curve</h3>
      <div class="detail-block__surface" aria-hidden="true">
        <span>EQ graph placeholder</span>
      </div>
    </section>

    <section
      class="detail-block detail-block--tall"
      data-detail-region="compressor"
      aria-labelledby="detail-dynamics-title"
    >
      <h3 class="detail-block__title" id="detail-dynamics-title">
        Compressor &amp; gain reduction
      </h3>
      <div class="detail-block__surface" aria-hidden="true">
        <span>Compressor and gain-reduction display placeholder</span>
      </div>
    </section>

    <section
      class="detail-block"
      data-detail-region="sends"
      aria-labelledby="detail-sends-title"
    >
      <h3 class="detail-block__title" id="detail-sends-title">Sends</h3>
      <div class="detail-block__surface" aria-hidden="true">
        <span>Send-level placeholders — post-fader, reverbs and delay</span>
      </div>
    </section>

    <section
      class="detail-block"
      data-detail-region="auto-manual"
      aria-labelledby="detail-automanual-title"
    >
      <h3 class="detail-block__title" id="detail-automanual-title">
        Auto / Manual
      </h3>
      <div class="detail-block__surface" aria-hidden="true">
        <span>Per-parameter Auto / Manual placeholders</span>
      </div>
    </section>

    <section
      class="detail-block"
      data-detail-region="ghost-indicator"
      aria-labelledby="detail-ghost-title"
    >
      <h3 class="detail-block__title" id="detail-ghost-title">
        Original vs current
      </h3>
      <div class="detail-block__surface" aria-hidden="true"></div>
    </section>

    <section
      class="detail-block detail-block--wide"
      data-detail-region="what-changed"
      aria-labelledby="detail-changed-title"
    >
      <h3 class="detail-block__title" id="detail-changed-title">
        What changed and why
      </h3>
      <div class="detail-block__surface" aria-hidden="true"></div>
    </section>
  </div>
</section>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
  }

  .detail__head {
    flex: 0 0 auto;
    padding: 0.3125rem 0.5rem;
    border: 1px solid #a3a3a3;
    background: #e8e8e8;
  }

  .detail__eyebrow {
    margin: 0;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .detail__title {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    margin: 0.0625rem 0 0;
    font-size: 1rem;
    line-height: 1.2;
  }

  .detail__code {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: #5d5d5d;
  }

  .detail__sub {
    margin: 0.125rem 0 0;
    color: #454545;
    font-size: 0.6875rem;
  }

  .detail__grid {
    display: grid;
    flex: 1 0 auto;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.375rem;
    min-width: 0;
    align-content: start;
  }

  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    min-width: 0;
    padding: 0.375rem;
    border: 1px dashed #a3a3a3;
    background: #f6f6f6;
  }

  .detail-block--wide {
    grid-column: 1 / -1;
  }

  .detail-block__title {
    margin: 0;
    color: #454545;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .detail-block__surface {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    color: #5d5d5d;
    font-size: 0.6875rem;
    text-align: center;
    overflow-wrap: break-word;
  }

  .detail-block--tall .detail-block__surface {
    min-height: 4.5rem;
  }

  .detail-chain {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .detail-chain__slot {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.125rem 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    font-size: 0.6875rem;
  }

  .detail-chain__index {
    flex: 0 0 auto;
    color: #6d6d6d;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.5625rem;
  }

  .detail-chain__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-chain__placeholder {
    flex: 0 0 auto;
    color: #6d6d6d;
    font-size: 0.5625rem;
    opacity: 0.85;
  }
</style>
