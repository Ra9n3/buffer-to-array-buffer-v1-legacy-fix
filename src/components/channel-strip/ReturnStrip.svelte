<script lang="ts">
  import type { Snippet } from "svelte";
  import Knob from "../hardware/Knob.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import StripModule from "./StripModule.svelte";
  import { RETURN_PARAMS, TONE_PARAM, type ReturnStripFixture } from "./bus-return-fixtures";
  import type { ReturnLive } from "./return-live";

  /**
   * ALLOY Console effect Return-bus strip — Task 2.4 (Phase 2 skin).
   *
   * One pinned Return channel (plan §8a: Reverb and Delay Returns are real,
   * visible channels that can be muted, soloed and bypassed like any other),
   * built on the pinned module (`StripModule`: the track strip's chassis).
   * It is COMPOSED of the approved Phase 1 components and draws no control
   * of its own:
   *
   *   HEAD         R1 · RET · the Return's name (the same name the track
   *                send slots print), with the organisational tab.
   *   TIME         the approved Knob, green family (spec §5: sends, auxiliary
   *                paths, reverb / delay): DECAY for a reverb, TIME for a
   *                delay.
   *   SECOND       the approved Knob, green: PRE-DELAY for a reverb,
   *                FEEDBACK for a delay. (These two legends measure 76 and
   *                73 px; the bay's 71 px slot would truncate them, so they
   *                take the full-width section and TONE takes the bay —
   *                reported in the task report.)
   *   EFFECT BAY   the track strip's sends bay with the Return's own slots:
   *                the effect's character in a scribble window (ROOM, PLATE,
   *                TAPE — the Mixer's chain detail, Task 2.9, is where it is
   *                chosen) over the TONE knob (tone / damping, FLAT under
   *                the reference mark), and beside it the BYPASS panel
   *                switch, its own lamp lit while the Return's chain is
   *                bypassed.
   *   RETURN       the approved Fader: the Return's output level.
   *   MUTE · SOLO  the module's footer, as on every track strip.
   *   · PEAK
   *
   * What makes it read as a Return without a new language: the type print
   * RET, green knobs where a track has cream and blue-grey, the character
   * window printed in the same green ink as an assigned send window, and
   * the fader legended RETURN. A fixture session (`bus-return-fixtures.ts`
   * seeds the store, SIMULATED): no effect processing, no routing. Since
   * Task 3.1 the settings are the project store's (see `live` below).
   *
   * `identity` (Task 2.7, optional, default none) is handed straight to the
   * module's optional identity extension under the head; the Console passes
   * nothing and the strip renders exactly as approved.
   *
   * `live` (Task 2.9, optional, default none; Task 3.1): one object that
   * OWNS the strip's decay / time, pre-delay / feedback, tone, character,
   * bypass and — since Task 3.1 — its level, MUTE and SOLO. Both rooms pass
   * the project store's view of the Return (`returnLive`), so the Console
   * strip, the Mixer strip and the Mixer's chain-detail panel turn the same
   * settings (plan §8a: one Return, edited like any channel). Without it
   * the strip keeps those settings itself, seeded from the fixture, exactly
   * as approved (the component playground passes nothing).
   */
  let {
    ret,
    identity = null,
    live = null,
  }: { ret: ReturnStripFixture; identity?: Snippet | null; live?: ReturnLive | null } = $props();

  const params = $derived(RETURN_PARAMS[ret.effect]);

  /* The strip's own settings when nothing is bound (the approved, local
     interaction): seeded from the fixture once. */
  // svelte-ignore state_referenced_locally
  const own = $state<ReturnLive>({
    time: ret.time,
    second: ret.second,
    tone: ret.tone,
    bypass: ret.bypass,
    character: { print: ret.character.print, name: ret.character.name },
    level: ret.level,
    mute: ret.mute,
    solo: ret.solo,
  });
  const model = $derived(live ?? own);
</script>

<StripModule
  id={ret.id}
  type={ret.type}
  typeTitle="Return bus"
  name={ret.name}
  org={ret.org}
  kind="return"
  hook={ret.id}
  sectionA={params.time.id}
  sectionB={params.second.id}
  {identity}
  baySection="effect"
  bayLabel={`Effect, ${ret.name}`}
  meterLevel={ret.meter}
  faderLabel="Return"
  bind:faderValue={() => model.level, (v) => (model.level = v)}
  bind:mute={() => model.mute, (on) => (model.mute = on)}
  bind:solo={() => model.solo, (on) => (model.solo = on)}
  peak={ret.peak}
>
  {#snippet knobA()}
    <Knob
      label={params.time.legend}
      family="green"
      min={params.time.min}
      max={params.time.max}
      step={params.time.step}
      bind:value={() => model.time, (v) => (model.time = v)}
      decimals={params.time.decimals}
      extremes={params.time.extremes}
      format={params.time.format}
    />
  {/snippet}

  {#snippet knobB()}
    <Knob
      label={params.second.legend}
      family="green"
      min={params.second.min}
      max={params.second.max}
      step={params.second.step}
      bind:value={() => model.second, (v) => (model.second = v)}
      decimals={params.second.decimals}
      extremes={params.second.extremes}
      format={params.second.format}
    />
  {/snippet}

  {#snippet bay()}
    <!-- the character window over the tone knob -->
    <div class="effect" data-return-effect={ret.effect}>
      <span
        class="effect__window"
        data-return-character={model.character.print}
        title={`Character: ${model.character.name}`}
        aria-label={`Character, ${model.character.name}`}
      >
        {model.character.print}
      </span>
      <Knob
        label={TONE_PARAM.legend}
        family="green"
        min={TONE_PARAM.min}
        max={TONE_PARAM.max}
        step={TONE_PARAM.step}
        bind:value={() => model.tone, (v) => (model.tone = v)}
        decimals={TONE_PARAM.decimals}
        extremes={TONE_PARAM.extremes}
        format={TONE_PARAM.format}
      />
    </div>

    <!-- BYPASS: the approved panel switch, its lamp lit while bypassed -->
    <div class="bypass" data-return-bypass>
      <TactileSwitch
        variant="panel"
        label="Bypass"
        lamp="amber"
        bind:engaged={() => model.bypass, (on) => (model.bypass = on)}
        name={`Bypass ${ret.name}`}
      />
    </div>
  {/snippet}
</StripModule>

<style>
  /* The character slot: a window over a knob, the send slot's geometry. */
  .effect {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-3xs);
    min-width: 0;
  }

  /* --- the character window -----------------------------------------------
     The send slot's scribble window (itself the knob's value-window recipe:
     a dark recess under a 1 px subtle border, mono print), here a plain
     print — the Console shows the character; the Mixer chooses it. It
     prints in the green function ink like an assigned send window, so a
     Return's window and the sends that feed it read as one family. */
  .effect__window {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    min-height: 1.125rem;
    margin: 0;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: 2px;
    background: var(--al-material-recess);
    color: var(--al-function-green-hi);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-2xs);
    letter-spacing: 0.04em;
    line-height: var(--al-line-height-tight);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.85),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* The bypass switch stands in the bay's second slot, centred on the slot
     beside it. */
  .bypass {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
</style>
