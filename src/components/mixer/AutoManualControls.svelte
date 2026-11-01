<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import { MODE_PRINT, setAllModes, type ChainParam, type CharacterParam, type ModuleMode } from "../../lib/mixer-chain";

  /**
   * A module's Auto / Manual — Task 2.8.
   *
   * Plan §8: every parameter has its own mode (the MODE switch under each
   * control), and "bulk controls such as 'Panning: Manual' set base values
   * for the category". Here the category is the module:
   *
   *   the STATUS window prints the module over its parameters — AUTO, MIXED
   *   or MANUAL — so a module that is partly Manual is never shown as a
   *   binary lamp (owner, Task 2.8 clarifications);
   *   ALL AUTO / ALL MANUAL: two panel-labelled switches (spec §2 Variant B)
   *   whose lamps light only while the module is wholly that way. Pressing
   *   one sets every parameter's MODE and nothing else — no value moves,
   *   nothing is reset or recomputed. A lit one pressed again changes nothing.
   */
  let {
    params,
    module,
    mode,
  }: {
    params: readonly (ChainParam | CharacterParam)[];
    /** For the spoken names: "EQ", "Compressor". */
    module: string;
    mode: ModuleMode;
  } = $props();
</script>

<div class="am" data-module-mode={mode}>
  <div
    class="am__status"
    title={`${module}: ${MODE_PRINT[mode]} \u2014 ${
      mode === "auto"
        ? "every parameter is open to recalculation"
        : mode === "manual"
          ? "every parameter is protected from recalculation"
          : "some parameters are Manual, the rest Auto"
    }`}
  >
    <EngravedLabel text="Auto / Manual" size="xs" tone="muted" />
    <span class="am__window" data-module-mode-print={MODE_PRINT[mode]}>
      <EngravedLabel text={MODE_PRINT[mode]} kind="value" size="sm" tone="bright" />
    </span>
  </div>
  <div class="am__all" data-module-all="auto">
    <TactileSwitch
      variant="panel"
      label="All"
      value="Auto"
      bind:engaged={() => mode === "auto", () => setAllModes(params, "auto")}
      name={`All ${module} parameters Auto`}
    />
  </div>
  <div class="am__all" data-module-all="manual">
    <TactileSwitch
      variant="panel"
      label="All"
      value="Manual"
      bind:engaged={() => mode === "manual", () => setAllModes(params, "manual")}
      name={`All ${module} parameters Manual`}
    />
  </div>
</div>

<style>
  .am {
    display: flex;
    align-items: flex-end;
    gap: var(--al-space-sm);
    min-width: 0;
  }

  .am__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-3xs);
    min-width: 0;
  }

  /* the status window: a recessed well in the panel, the print engraved in it */
  .am__window {
    display: inline-flex;
    justify-content: center;
    min-width: 4.5rem;
    padding: 1px var(--al-space-xs);
    border-radius: 2px;
    background-color: color-mix(in srgb, var(--al-material-recess) 70%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong);
  }

  .am__all {
    display: flex;
  }
</style>
