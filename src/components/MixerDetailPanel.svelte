<script lang="ts">
  import type { MixerChannel } from "../lib/mixer";
  import { PROCESSING_CHAIN_STEPS, channelKindLabel } from "../lib/mixer";

  let { channel }: { channel: MixerChannel | undefined } = $props();
</script>

<!-- Processing-detail panel for the selected channel. Placeholders only, using
     the product plan §3 "Mixer room and transparency" contents and the §8 chain
     order.

     Deliberately NOT channel-type aware: the plan requires the panel to branch by
     channel type (track / bus / Return bus) and that branching is Task 2.9. Doing
     it here would be scope creep, so one neutral placeholder layout is shown for
     every channel type. -->
<section
  class="mixer-detail"
  data-mixer-region="detail-panel"
  aria-labelledby="mixer-detail-title"
>
  <header class="mixer-detail__head" data-mixer-region="selection">
    <h2 class="mixer-detail__title" id="mixer-detail-title">
      Selected channel &amp; processing chain
    </h2>

    {#if channel}
      <p class="mixer-detail__selected" data-mixer-selected-name>
        <span class="mixer-detail__code">{channel.code}</span>
        <span class="mixer-detail__name">{channel.name}</span>
        <span class="mixer-detail__kind">{channelKindLabel(channel.kind)}</span>
      </p>
      <p class="mixer-detail__note">
        Selection updates this panel only. No audio is processed in Phase 0.
      </p>
    {:else}
      <p class="mixer-detail__selected" data-mixer-selected-name>
        No channel selected
      </p>
      <p class="mixer-detail__note">Select a channel in the column to inspect it.</p>
    {/if}
  </header>

  {#if channel}
    <div class="mixer-detail__body">
      <section
        class="detail-block detail-block--chain"
        data-mixer-region="processing-chain"
        aria-labelledby="mixer-chain-title"
      >
        <h3 class="detail-block__title" id="mixer-chain-title">Processing chain</h3>
        <p class="detail-block__note">
          Eight neutral steps in the product plan's order — every block is
          bypassable in the finished product.
        </p>
        <ol class="detail-chain">
          {#each PROCESSING_CHAIN_STEPS as step (step.step)}
            <li class="detail-chain__slot">
              <span class="detail-chain__step">{step.step}</span>
              <span class="detail-chain__label">{step.label}</span>
            </li>
          {/each}
        </ol>
      </section>

      <div class="mixer-detail__grid">
        <section
          class="detail-block detail-block--tall"
          data-mixer-region="eq-graph"
          aria-labelledby="mixer-eq-title"
        >
          <h3 class="detail-block__title" id="mixer-eq-title">EQ curve</h3>
          <div class="detail-block__surface" aria-hidden="true">
            <span>EQ graph placeholder</span>
          </div>
        </section>

        <section
          class="detail-block detail-block--tall"
          data-mixer-region="compressor"
          aria-labelledby="mixer-comp-title"
        >
          <h3 class="detail-block__title" id="mixer-comp-title">
            Compressor &amp; gain reduction
          </h3>
          <div class="detail-block__surface" aria-hidden="true">
            <span>Compressor and gain-reduction display placeholder</span>
          </div>
        </section>

        <section
          class="detail-block detail-block--tall"
          data-mixer-region="sends"
          aria-labelledby="mixer-sends-title"
        >
          <h3 class="detail-block__title" id="mixer-sends-title">Sends</h3>
          <div class="detail-block__surface" aria-hidden="true">
            <span>
              Send-level placeholders — post-fader, to Reverb and Delay Returns
            </span>
          </div>
        </section>

        <section
          class="detail-block detail-block--tall"
          data-mixer-region="auto-manual"
          aria-labelledby="mixer-auto-title"
        >
          <h3 class="detail-block__title" id="mixer-auto-title">Auto / Manual</h3>
          <div class="detail-block__surface" aria-hidden="true">
            <span>Per-parameter Auto / Manual placeholders</span>
          </div>
        </section>

        <section
          class="detail-block detail-block--tall"
          data-mixer-region="ghost-indicator"
          aria-labelledby="mixer-ghost-title"
        >
          <h3 class="detail-block__title" id="mixer-ghost-title">
            Original vs current
          </h3>
          <div class="detail-block__surface" aria-hidden="true">
            <span>Ghost-indicator placeholders — original beside current</span>
          </div>
        </section>
      </div>

      <section
        class="detail-block"
        data-mixer-region="what-changed"
        aria-labelledby="mixer-changed-title"
      >
        <h3 class="detail-block__title" id="mixer-changed-title">
          What changed and why
        </h3>
        <div class="detail-block__surface detail-block__surface--short" aria-hidden="true">
          <span>
            Explanation placeholder. Real explanations come from actual engine
            decisions in a later phase.
          </span>
        </div>
      </section>
    </div>
  {/if}
</section>

<style>
  .mixer-detail {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: 0.5rem;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .mixer-detail__head {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid #cfcfcf;
  }

  .mixer-detail__title {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .mixer-detail__selected {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
    min-width: 0;
  }

  .mixer-detail__code {
    flex: 0 0 auto;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #5d5d5d;
  }

  .mixer-detail__name {
    min-width: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mixer-detail__kind {
    flex: 0 0 auto;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #5d5d5d;
  }

  .mixer-detail__note {
    margin: 0;
    font-size: 0.75rem;
    color: #5d5d5d;
  }

  .mixer-detail__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
  }

  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    min-width: 0;
    padding: 0.375rem;
    border: 1px dashed #a3a3a3;
    background: #f7f7f7;
  }

  .mixer-detail__grid {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
  }

  .detail-block__note {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.25;
    color: #5d5d5d;
  }

  .detail-block__title {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .detail-block__surface {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-width: 0;
    min-height: 3rem;
    padding: 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    color: #5d5d5d;
    font-size: 0.6875rem;
    line-height: 1.25;
    text-align: center;
    overflow-wrap: break-word;
  }

  .detail-block--tall .detail-block__surface {
    min-height: 4.5rem;
  }

  .detail-block__surface--short {
    min-height: 2.25rem;
  }

  .detail-chain {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .detail-chain__slot {
    display: flex;
    align-items: baseline;
    gap: 0.3125rem;
    min-width: 0;
    padding: 0.0625rem 0.25rem;
    border: 1px dashed #c4c4c4;
    background: #ededed;
    font-size: 0.6875rem;
    line-height: 1.25;
  }

  .detail-chain__step {
    flex: 0 0 auto;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.625rem;
    color: #6d6d6d;
  }

  .detail-chain__label {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 40rem) {
    .detail-block--tall .detail-block__surface {
      min-height: 3rem;
    }
  }
</style>
