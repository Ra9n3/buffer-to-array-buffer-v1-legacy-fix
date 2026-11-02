<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import ScribbleSelect from "../hardware/ScribbleSelect.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import { characterChanged, setMode } from "../../lib/mixer-chain";
  import {
    RETURN_CHARACTERS,
    returnCharacter,
    returnMode,
    returnOwned,
    setReturnCharacter,
    type ReturnChainState,
    type ReturnCharacterId,
  } from "../../lib/return-chain.svelte";
  import AutoManualControls from "./AutoManualControls.svelte";
  import ChainKnob from "./ChainKnob.svelte";

  /**
   * The Return's effect module — Task 2.9 (plan §8a).
   *
   * The compressor bay's layout (Task 2.8) with the Return's controls in
   * it: the effect's CHARACTER in the approved scribble select (Room · Hall
   * · Plate for a reverb; Tape · Analogue · Digital for a delay — fixture
   * selections, no algorithm modelled) with its MODE and "was …" ghost;
   * then the Return's three parameters on green chain knobs (spec §5:
   * green is sends, auxiliary paths, reverb and delay) — DECAY and
   * PRE-DELAY for a reverb, TIME and FEEDBACK for a delay, TONE for both —
   * each with its MODE switch and loaded-value ghost; the module's Auto /
   * Manual status with ALL AUTO · ALL MANUAL; and BYPASS. The Return's
   * output level is its strip fader and is not duplicated here.
   *
   * These are the SAME values the Mixer's Return strip turns: one state per
   * Return (`return-chain.svelte.ts`), so a knob turned on the strip moves
   * here, and a character chosen here prints in the strip's window.
   */
  let { chain }: { chain: ReturnChainState } = $props();

  const effectTitle = $derived(chain.effect === "reverb" ? "Reverb" : "Delay");
  const params = $derived(returnOwned(chain));
  const mode = $derived(returnMode(chain));
  const charChanged = $derived(characterChanged(chain.character));
  const charManual = $derived(chain.character.mode === "manual");
  const name = (id: ReturnCharacterId) => returnCharacter(chain.effect, id).name;
  const characterTitle = $derived(
    `Character, ${effectTitle}: ${name(chain.character.value)}` +
      (charChanged ? ` \u2014 loaded as ${name(chain.character.original)}` : "") +
      " (a fixture selection; no algorithm is modelled)",
  );
</script>

<section
  class="fx"
  data-chain-module="effect"
  data-return-effect={chain.effect}
  data-module-bypassed={chain.bypassed}
  data-module-mode={mode}
  aria-labelledby="mixer-effect-title"
>
  <header class="fx__head">
    <div class="fx__title">
      <EngravedLabel text={effectTitle} size="md" tone="bright" as="h3" id="mixer-effect-title" />
      <EngravedLabel text="Effect Return" size="xs" tone="muted" />
    </div>
    <AutoManualControls {params} module={effectTitle} {mode} />
    <div class="fx__bypass" data-module-bypass>
      <TactileSwitch
        variant="panel"
        label="Bypass"
        lamp="amber"
        bind:engaged={() => chain.bypassed, (on) => (chain.bypassed = on)}
        name={`${effectTitle} bypass, ${chain.name}: ${chain.bypassed ? "bypassed" : "in circuit"}`}
      />
    </div>
  </header>

  <div class="fx__body">
    <div
      class="fx__character"
      data-effect-character={chain.character.value}
      data-chain-mode={chain.character.mode}
      data-chain-changed={charChanged}
      title={characterTitle}
    >
      <EngravedLabel text="Character" size="xs" />
      <ScribbleSelect
        label="Character"
        context={chain.name}
        options={RETURN_CHARACTERS[chain.effect]}
        bind:value={() => chain.character.value, (id) => setReturnCharacter(chain, id as ReturnCharacterId)}
        size="sm"
        hook="character"
        title={characterTitle}
      />
      <span class="fx__was" data-chain-ghost-text={charChanged ? name(chain.character.original) : null}>
        {#if charChanged}
          <EngravedLabel text={`was ${name(chain.character.original)}`} size="xs" tone="muted" />
        {/if}
      </span>
      <TactileSwitch
        variant="panel"
        label="Mode"
        value={charManual ? "Manual" : "Auto"}
        bind:engaged={() => charManual, (on) => setMode(chain.character, on ? "manual" : "auto")}
        name={`Mode, Character, ${effectTitle}: ${charManual ? "Manual" : "Auto"}`}
      />
    </div>

    <div class="fx__knobs">
      <ChainKnob param={chain.time} family="green" context={effectTitle} />
      <ChainKnob param={chain.second} family="green" context={effectTitle} />
      <ChainKnob param={chain.tone} family="green" context={effectTitle} />
    </div>
  </div>
</section>

<style>
  .fx {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
  }

  .fx__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--al-space-xs) var(--al-space-md);
    min-width: 0;
  }

  .fx__title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .fx__bypass {
    display: flex;
  }

  .fx__body {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-sm) var(--al-space-md);
    min-width: 0;
  }

  .fx__character {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-2xs);
    width: 6.5rem;
    padding: var(--al-space-2xs) var(--al-space-2xs) var(--al-space-xs);
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 1px var(--al-border-subtle),
      inset 0 1px 0 rgba(0, 0, 0, 0.35);
  }

  .fx__character > :global(.select) {
    width: 100%;
  }

  .fx__was {
    display: flex;
    justify-content: center;
    min-height: 0.875rem;
  }

  .fx__knobs {
    display: flex;
    flex: 0 0 auto;
    gap: var(--al-space-2xs);
    padding: var(--al-space-2xs) var(--al-space-2xs) var(--al-space-xs);
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 1px var(--al-border-subtle),
      inset 0 1px 0 rgba(0, 0, 0, 0.35);
  }
</style>
