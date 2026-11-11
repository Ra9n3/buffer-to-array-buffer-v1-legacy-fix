<script lang="ts">
  import type { Snippet } from "svelte";
  import Knob from "../hardware/Knob.svelte";
  import StripModule from "./StripModule.svelte";
  import {
    BALANCE_RANGE,
    BUS_TRIM_RANGE,
    formatBalance,
    formatSignedDb,
    type BusMasterFixture,
  } from "./bus-return-fixtures";
  import type { BusLive } from "./strip-live";

  /**
   * ALLOY Console bus-master strip — Task 2.4 (Phase 2 skin).
   *
   * The pinned bus master of the Phase 0 bank (0.3) — the mix bus every
   * track and Return sums into — built on the pinned module (`StripModule`:
   * the track strip's chassis). COMPOSED of the approved Phase 1 components:
   *
   *   HEAD         B1 · BUS · the bus's name, with the organisational tab.
   *   BUS TRIM     the approved Knob, orange family (spec §5 / plan §4:
   *                bus and group masters are orange), the track strips' TRIM
   *                range and readout.
   *   BALANCE      the approved Knob, blue-grey family (spec §5: stereo
   *                placement), the track strips' PAN range, L / C / R.
   *   (blank)      a bus has no sends: the module leaves a blank panel where
   *                a track has its sends bay (owner, D2.4.4), so the fader
   *                and the footer stand on the tracks' lines.
   *   MASTER       the approved Fader: the bus master.
   *   MUTE · SOLO  the module's footer, as on every track strip.
   *   · PEAK
   *
   * A fixture session (`bus-return-fixtures.ts` seeds the store, SIMULATED):
   * no summing, no routing. Since Task 3.1 the settings are the project
   * store's (see `live` below).
   *
   * `identity` (Task 2.7, optional, default none) is handed straight to the
   * module's optional identity extension under the head; the Console passes
   * nothing and the strip renders exactly as approved.
   */
  let {
    bus,
    identity = null,
    live = null,
  }: { bus: BusMasterFixture; identity?: Snippet | null; live?: BusLive | null } = $props();

  const trimFormat = (value: number) => formatSignedDb(value, 1);

  /* `live` (Task 3.1, optional, default none): one object that OWNS the
     strip's trim, balance, level, MUTE and SOLO — both rooms pass the
     project store's view of the bus (`busLive`), so the Console's and the
     Mixer's bus master turn one value. Without it the strip keeps those
     settings itself, seeded from the fixture, exactly as approved (the
     component playground passes nothing). */
  // svelte-ignore state_referenced_locally
  const own = $state<BusLive>({ trim: bus.trim, balance: bus.balance, level: bus.level, mute: bus.mute, solo: bus.solo });
  const model = $derived(live ?? own);
</script>

<StripModule
  id={bus.id}
  type={bus.type}
  typeTitle="Bus master"
  name={bus.name}
  org={bus.org}
  kind="bus"
  hook={bus.id}
  sectionA="trim"
  sectionB="balance"
  {identity}
  meterLevel={bus.meter}
  faderLabel="Master"
  bind:faderValue={() => model.level, (v) => (model.level = v)}
  bind:mute={() => model.mute, (on) => (model.mute = on)}
  bind:solo={() => model.solo, (on) => (model.solo = on)}
  peak={bus.peak}
>
  {#snippet knobA()}
    <Knob
      label="Bus trim"
      family="orange"
      min={BUS_TRIM_RANGE.min}
      max={BUS_TRIM_RANGE.max}
      step={BUS_TRIM_RANGE.step}
      bind:value={() => model.trim, (v) => (model.trim = v)}
      unit="dB"
      decimals={1}
      extremes={["−20", "+20"]}
      format={trimFormat}
    />
  {/snippet}

  {#snippet knobB()}
    <Knob
      label="Balance"
      family="bluegrey"
      min={BALANCE_RANGE.min}
      max={BALANCE_RANGE.max}
      step={BALANCE_RANGE.step}
      bind:value={() => model.balance, (v) => (model.balance = v)}
      decimals={0}
      extremes={["L", "R"]}
      format={formatBalance}
    />
  {/snippet}
</StripModule>
