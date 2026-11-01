<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import Lamp from "../hardware/Lamp.svelte";
  import { CHAIN_BLOCKS, blockEngaged, type BlockHome, type ChainState } from "../../lib/mixer-chain";

  /**
   * The track's processing chain — Task 2.8.
   *
   * Plan §3: "selecting a track exposes its complete processing chain";
   * plan §8: the eight blocks in signal order, each bypassable. This is the
   * chain as a readout, from the shared step list the Task 0.5 panel already
   * printed: the block's number and the plan's label, and an amber lamp lit
   * while the block is in circuit for this track — the fixture's state
   * (cleanup, a dynamic band) and the EQ / COMP bypass switches below.
   *
   * The EQ and compressor controls are in this panel; trim, pan, fader and
   * sends are on the channel strip (Tasks 2.2 / 2.7) and are not duplicated
   * here. Nothing reorders or routes.
   */
  let { chain }: { chain: ChainState } = $props();

  const HOME_TEXT: Readonly<Record<BlockHome, string>> = {
    strip: "controls on the channel strip",
    panel: "controls in this panel",
    fixture: "no controls in this build",
  };
</script>

<ol class="chain" aria-label="Processing chain" data-chain-rail>
  {#each CHAIN_BLOCKS as block (block.id)}
    {@const engaged = blockEngaged(chain, block.id)}
    <li
      class="chain__block"
      data-chain-block={block.id}
      data-chain-engaged={engaged}
      title={`${block.step} \u00b7 ${block.label} \u2014 ${engaged ? "in circuit" : "bypassed"}; ${HOME_TEXT[block.home]}`}
    >
      <span class="chain__lamp">
        <Lamp lit={engaged} color="amber" name={`${block.label}: ${engaged ? "in circuit" : "bypassed"}`} />
      </span>
      <EngravedLabel text={block.step} size="xs" kind="value" tone="muted" />
      <EngravedLabel text={block.label} size="xs" tone={engaged ? "normal" : "muted"} truncate />
    </li>
  {/each}
</ol>

<style>
  .chain {
    display: flex;
    flex-wrap: wrap;
    gap: var(--al-space-2xs) var(--al-space-md);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  .chain__block {
    display: flex;
    align-items: center;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: 1px var(--al-space-xs) 1px var(--al-space-2xs);
    border-radius: 2px;
    /* a shallow engraved slot per block */
    box-shadow:
      inset 0 1px 1px rgba(0, 0, 0, 0.45),
      inset 0 0 0 1px var(--al-border-subtle);
  }

  .chain__lamp {
    --lamp-size: 0.5rem; /* 8 px glass: the Lamp's own size variable */
    display: flex;
    flex: 0 0 auto;
  }
</style>
