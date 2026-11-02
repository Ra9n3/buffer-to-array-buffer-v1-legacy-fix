<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import Lamp from "../hardware/Lamp.svelte";
  import type { BlockHome, RailBlock } from "../../lib/mixer-chain";

  /**
   * The selected channel's processing chain — Task 2.8, generalised in 2.9.
   *
   * Plan §3: "selecting a track exposes its complete processing chain";
   * plan §8: the blocks in signal order, each bypassable. This is the chain
   * as a readout: the block's number and the plan's label, and an amber
   * lamp lit while the block is in circuit — the fixture's state (cleanup,
   * a dynamic band, a routed output) and the bypass switches below.
   *
   * The blocks come from the channel's own chain model, so a track (plan §8,
   * `trackRailBlocks`), a Return (plan §8a, `returnRailBlocks`) and a bus
   * (plan §8 bus path, `busRailBlocks`) each read as their own path, never
   * one universal layout (plan §3). A block with a `status` is a state
   * rather than a module (an output; the final output stage's peak
   * protection) and speaks that status in place of "in circuit" /
   * "bypassed". Controls that live on the channel strip are not duplicated
   * here. Nothing reorders or routes.
   */
  let { blocks }: { blocks: readonly RailBlock[] } = $props();

  function stateText(block: RailBlock): string {
    return block.status ?? (block.engaged ? "in circuit" : "bypassed");
  }

  const HOME_TEXT: Readonly<Record<BlockHome, string>> = {
    strip: "controls on the channel strip",
    panel: "controls in this panel",
    fixture: "no controls in this build",
  };
</script>

<ol class="chain" aria-label="Processing chain" data-chain-rail>
  {#each blocks as block (block.id)}
    {@const engaged = block.engaged}
    <li
      class="chain__block"
      data-chain-block={block.id}
      data-chain-engaged={engaged}
      data-chain-status={block.status ? "" : undefined}
      title={`${block.step} \u00b7 ${block.label} \u2014 ${stateText(block)}; ${HOME_TEXT[block.home]}`}
    >
      <span class="chain__lamp">
        <Lamp lit={engaged} color="amber" name={`${block.label}: ${stateText(block)}`} />
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
