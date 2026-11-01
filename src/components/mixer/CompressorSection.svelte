<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import ScribbleSelect from "../hardware/ScribbleSelect.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import VUMeter from "../hardware/VUMeter.svelte";
  import {
    COMP_CHARACTERS,
    characterChanged,
    characterName,
    compMode,
    compParams,
    setCharacter,
    setMode,
    type CharacterId,
    type CompState,
  } from "../../lib/mixer-chain";
  import AutoManualControls from "./AutoManualControls.svelte";
  import ChainKnob from "./ChainKnob.svelte";

  /**
   * The compressor bay — Task 2.8 (plan §8 block 5: "compressor, with a
   * selectable character: VCA, Opto, FET, or Vari-Mu"; §3 "compressor and
   * gain-reduction display").
   *
   *   HEAD        title, the module's Auto / Manual, BYPASS (lamp lit while
   *               the compressor is out of circuit).
   *   CHARACTER   the four characters in the approved scribble window — a
   *               fixture selection, nothing is modelled — with its own MODE
   *               switch; when it differs from the one the track loaded
   *               with, "was <loaded>" is printed under the window (the
   *               ghost, in words: a selection has no pointer to ghost).
   *   KNOBS       THRESH · RATIO · ATTACK · RELEASE · MAKEUP in red (spec §5:
   *               compression and dynamics), each with its MODE switch.
   *   GR          the approved VU meter on its gain-reduction face: 0 dB at
   *               the right stop, reduction increasing leftward. A fixed
   *               illustrative reading from the fixture; 0 while bypassed.
   */
  let {
    comp,
    trackName,
  }: {
    comp: CompState;
    trackName: string;
  } = $props();

  const params = $derived([comp.character, ...compParams(comp)]);
  const mode = $derived(compMode(comp));
  const grDb = $derived(comp.bypassed ? 0 : comp.gainReductionDb);
  const charChanged = $derived(characterChanged(comp.character));
  const charManual = $derived(comp.character.mode === "manual");
  const characterTitle = $derived(
    `Character, Compressor: ${characterName(comp.character.value)}` +
      (charChanged ? ` \u2014 loaded as ${characterName(comp.character.original)}` : "") +
      " (a fixture selection; no circuit is modelled)",
  );
</script>

<section
  class="cs"
  data-chain-module="comp"
  data-module-bypassed={comp.bypassed}
  data-module-mode={mode}
  aria-labelledby="mixer-comp-title"
>
  <header class="cs__head">
    <div class="cs__title">
      <EngravedLabel text="Compressor" size="md" tone="bright" as="h3" id="mixer-comp-title" />
      <EngravedLabel text="Dynamics" size="xs" tone="muted" />
    </div>
    <AutoManualControls {params} module="Compressor" {mode} />
    <div class="cs__bypass" data-module-bypass>
      <TactileSwitch
        variant="panel"
        label="Bypass"
        lamp="amber"
        bind:engaged={() => comp.bypassed, (on) => (comp.bypassed = on)}
        name={`Compressor bypass, ${trackName}: ${comp.bypassed ? "bypassed" : "in circuit"}`}
      />
    </div>
  </header>

  <div class="cs__body">
    <div
      class="cs__character"
      data-comp-character={comp.character.value}
      data-chain-mode={comp.character.mode}
      data-chain-changed={charChanged}
      title={characterTitle}
    >
      <EngravedLabel text="Character" size="xs" />
      <ScribbleSelect
        label="Character"
        context={trackName}
        options={COMP_CHARACTERS}
        bind:value={() => comp.character.value, (id) => setCharacter(comp, id as CharacterId)}
        size="sm"
        hook="character"
        title={characterTitle}
      />
      <span class="cs__was" data-chain-ghost-text={charChanged ? characterName(comp.character.original) : null}>
        {#if charChanged}
          <EngravedLabel text={`was ${characterName(comp.character.original)}`} size="xs" tone="muted" />
        {/if}
      </span>
      <TactileSwitch
        variant="panel"
        label="Mode"
        value={charManual ? "Manual" : "Auto"}
        bind:engaged={() => charManual, (on) => setMode(comp.character, on ? "manual" : "auto")}
        name={`Mode, Character, Compressor: ${charManual ? "Manual" : "Auto"}`}
      />
    </div>

    <div class="cs__knobs">
      <ChainKnob param={comp.threshold} family="red" context="Compressor" />
      <ChainKnob param={comp.ratio} family="red" context="Compressor" />
      <ChainKnob param={comp.attack} family="red" context="Compressor" />
      <ChainKnob param={comp.release} family="red" context="Compressor" />
      <ChainKnob param={comp.makeup} family="red" context="Compressor" />
    </div>

    <div
      class="cs__gr"
      data-chain-gr
      data-gr-db={grDb}
      title={`Gain reduction: ${grDb} dB \u2014 a fixed, illustrative reading${comp.bypassed ? " (bypassed)" : ""}`}
    >
      <VUMeter face="gr" level={grDb} label="Gain reduction" name={`Gain reduction, ${trackName}`} />
    </div>
  </div>
</section>

<style>
  .cs {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
    min-width: 0;
  }

  .cs__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--al-space-xs) var(--al-space-md);
    min-width: 0;
  }

  .cs__title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .cs__bypass {
    display: flex;
  }

  .cs__body {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-sm) var(--al-space-md);
    min-width: 0;
  }

  .cs__character {
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

  .cs__character > :global(.select) {
    width: 100%;
  }

  .cs__was {
    display: flex;
    justify-content: center;
    min-height: 0.875rem;
  }

  .cs__knobs {
    display: flex;
    flex: 0 0 auto;
    gap: var(--al-space-2xs);
    padding: var(--al-space-2xs) var(--al-space-2xs) var(--al-space-xs);
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 1px var(--al-border-subtle),
      inset 0 1px 0 rgba(0, 0, 0, 0.35);
  }

  .cs__gr {
    display: flex;
    flex: 0 0 auto;
  }
</style>
