<script module lang="ts">
  /** Unique per-instance id prefix for the strip's labelled regions. */
  let nextId = 0;
</script>
<script lang="ts">
  import type { Snippet } from "svelte";
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import Fader from "../hardware/Fader.svelte";
  import Knob from "../hardware/Knob.svelte";
  import StripMeter from "../hardware/StripMeter.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import SendSlot from "./SendSlot.svelte";
  import type { TrackStripLive } from "./strip-live";
  import {
    PAN_RANGE,
    SEND_SLOT_COUNT,
    SIMULATED,
    TRIM_RANGE,
    formatPan,
    formatSignedDb,
    meterLevelOf,
    orgToken,
  } from "./track-strip-fixtures";

  /**
   * ALLOY Console regular-track channel strip — Task 2.2 (Phase 2 skin),
   * rebuilt compact for the one-window Console (Task 9.5).
   *
   * One physical channel module of the Console's channel bank, repeated once
   * per track by the ChannelBank. It is COMPOSED of the approved Phase 1
   * components and draws no control of its own:
   *
   *   HEAD        channel number and type, then the organisational colour
   *               tab beside the engraved track name (spec §7).
   *   TRIM · PAN  the approved Knobs — cream for trim (spec §5: gain
   *               staging), blue-grey for pan (spec §5: placement) — side
   *               by side on ONE row, trim first (owner, D9.5.2), each at
   *               its approved 40 px size.
   *   SENDS       two configurable send slots side by side in one recessed
   *               bay (owner, D2.2.9): each a scribble window ("SEND", or
   *               the assigned return's name — click to choose, change or
   *               remove) over an approved green Knob (plan §8a) holding
   *               that return's send level.
   *   LEVEL       the approved Fader at its approved 1× size and 160 px
   *               travel — the strip's anchor — with the strip's own LED
   *               meter (Task 9.5's `StripMeter`) standing beside it, as on
   *               the owner's reference console: the thin column of green /
   *               amber / red segments, its top segment the strip's PEAK
   *               indicator (lit while `track.peak`, D9.5.3 — the footer
   *               lamp moved onto the line the eye watches).
   *   MUTE · SOLO two approved panel-labelled TactileSwitches with their
   *               own engaged lamps (owner's choice, D2.2.3).
   *
   * The strip draws and turns ONE object, `track` (`TrackStripLive`,
   * strip-live.ts): identity to print, and the settings its controls are
   * BOUND to — trim, pan, level, MUTE, SOLO and the two send slots. Since
   * Task 3.1 the rooms hand it the project store's view of the track
   * (`trackStrip` in lib/project/store.svelte.ts), so the Console strip and
   * the Mixer strip of one track turn one value, and every write goes
   * through the store's typed operations. The controls keep their approved
   * behaviour — drag, keyboard, numeric entry, press. Still a fixture
   * session (SIMULATED): no audio, no routing, no mute/solo bus logic; the
   * meter's reading is the fixture table's (`meterLevelOf`), never measured.
   *
   * The strip is a fixed-width physical module: 7.2rem at the Console's 0.8×
   * density (Task 9.6, D9.6.1 — 9rem × 0.8, the reference's channel pitch at
   * the scale the owner runs the room at). It never shrinks to fit a
   * viewport; the bank scrolls instead.
   *
   * `identity` (Task 2.7, optional, default none): a room may extend the
   * head with one more section of its own — the Mixer puts its instrument
   * identity print and channel controls there. The section is rendered
   * between the head and the knob row, divided by the same machined rule as
   * every other section, and the strip draws nothing into it. Without the
   * prop the markup and CSS are exactly the Console strip.
   */
  let { track, identity }: { track: TrackStripLive; identity?: Snippet } = $props();

  const uid = `ts${++nextId}`;

  const trimFormat = (value: number) => formatSignedDb(value, 1);

  /* --- send slots -----------------------------------------------------------
     Fixed positions (SEND_SLOT_COUNT), the track's own (`track.sends`): the
     slot component reads and writes them in place. A return the other slot
     already feeds is offered greyed; a slot assigned in the UI takes the
     level the track loaded with for that return, if it has one. */
  const takenBy = (i: number): string | null => track.sends.find((_, j) => j !== i)?.to ?? null;

  /* The meter's fixture reading (Task 9.5): the typed table's level for the
     track's code — SIMULATED, like every reading on the fixture bridge. */
  const meterLevel = $derived(meterLevelOf(track.code));
</script>

<li
  class="strip"
  role="group"
  aria-labelledby={`${uid}-name`}
  data-track-strip={track.code}
  data-track-org={String(track.org)}
  data-simulated={SIMULATED}
>
  <div class="strip__face">
    <!-- HEAD: identity -->
    <header class="strip__head" data-strip-section="head">
      <div class="strip__ident">
        <EngravedLabel text={track.code} size="sm" kind="value" tone="bright" title={`Channel ${track.code}`} />
        <EngravedLabel text={track.type} size="xs" tone="muted" title="Regular track" />
      </div>
      <div class="strip__name-row">
        <span
          class="strip__tab"
          style:--org={orgToken(track.org)}
          data-org-tab={String(track.org)}
          aria-hidden="true"
        ></span>
        <EngravedLabel id={`${uid}-name`} text={track.name} size="sm" kind="value" truncate />
      </div>
    </header>

    {#if identity}
      <!-- IDENTITY EXTENSION (Task 2.7): the room's own section under the head;
           absent in the Console -->
      <div class="strip__section strip__section--identity" data-strip-section="identity">
        {@render identity()}
      </div>
    {/if}

    <!-- TRIM · PAN: one row, trim first (owner, D9.5.2) -->
    <div class="strip__section strip__section--knobs" data-strip-section="trim-pan">
      <Knob
        label="Trim"
        family="cream"
        min={TRIM_RANGE.min}
        max={TRIM_RANGE.max}
        step={TRIM_RANGE.step}
        bind:value={() => track.trim, (v) => (track.trim = v)}
        unit="dB"
        decimals={1}
        extremes={["−20", "+20"]}
        format={trimFormat}
      />
      <Knob
        label="Pan"
        family="bluegrey"
        min={PAN_RANGE.min}
        max={PAN_RANGE.max}
        step={PAN_RANGE.step}
        bind:value={() => track.pan, (v) => (track.pan = v)}
        decimals={0}
        extremes={["L", "R"]}
        format={formatPan}
      />
    </div>

    <!-- SENDS: one recessed bay, two configurable slots -->
    <div class="strip__section strip__section--sends" data-strip-section="sends">
      <div class="strip__bay" role="group" aria-label={`Sends, ${track.name}`}>
        {#each track.sends as slot, i (i)}
          <SendSlot
            index={i + 1}
            count={SEND_SLOT_COUNT}
            {slot}
            taken={takenBy(i)}
            fixtureLevels={track.loadedSendLevels}
            returns={track.returns}
            trackName={track.name}
          />
        {/each}
      </div>
    </div>

    <!-- LEVEL: the approved fader, 1x, 160 px travel, with the strip's own
         meter standing beside it (Task 9.5). The section takes the strip's
         free height; the fader centres in it and the meter stretches with
         it, the way a console's meter column spans its fader. -->
    <div class="strip__section strip__section--fader" data-strip-section="fader">
      <div class="strip__level">
        <Fader label="Level" bind:value={() => track.level, (v) => (track.level = v)} />
        <StripMeter
          level={meterLevel}
          peak={track.peak}
          name={`Level and peak, ${track.name}, ${SIMULATED}`}
        />
      </div>
    </div>

    <!-- MUTE · SOLO (the owner's order, D2.2.3); PEAK lives in the meter's
         top segment now (D9.5.3) -->
    <footer class="strip__section strip__section--switches" data-strip-section="switches">
      <TactileSwitch variant="panel" label="Mute" lamp="red" bind:engaged={() => track.mute, (on) => (track.mute = on)} name={`Mute ${track.name}`} />
      <TactileSwitch variant="panel" label="Solo" lamp="amber" bind:engaged={() => track.solo, (on) => (track.solo = on)} name={`Solo ${track.name}`} />
    </footer>
  </div>
</li>

<style>
  /* =======================================================================
     THE MODULE
     A fixed-width physical channel module: 7.2rem = 115.2 px (Task 9.6,
     D9.6.1 — the owner's "80% zoom" density: 9rem × 0.8; the reference's
     channel pitch at the scale the owner runs the room at). Every control
     keeps its approved proportions, drawn from its own 0.8× size below.
     It never shrinks; the bank scrolls.
     ======================================================================= */
  .strip {
    --strip-width: 7.2rem;
    /* the approved components, at the room's 0.8× density (D9.6.1) */
    --knob-size: 2rem; /* 32 px dials — 2.5rem × 0.8 */
    --fader-width: 3.6rem; /* 57.6 px wide — 4.5rem × 0.8 */
    --switch-size: 1.4rem; /* 22.4 px caps — 1.75rem × 0.8 */
    --meter-width: 0.6rem; /* 9.6 px of glass — 0.75rem × 0.8 */
    /* the strip's vertical rhythm: sections divided by machined rules with
       the minimum air the controls need — compact, like the reference */
    --strip-section-pad: var(--al-space-3xs);

    display: flex;
    flex: 0 0 var(--strip-width);
    flex-direction: column;
    width: var(--strip-width);
    min-width: var(--strip-width);
    max-width: var(--strip-width);
    margin: 0;
    padding: 0;
    list-style: none;
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the panel face: the approved charcoal, lit from the top-left -------- */
  .strip__face {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    padding: var(--al-space-3xs) var(--al-space-2xs) var(--al-space-3xs);
    border-radius: 2px;
    background-color: var(--al-material-panel);
    background-image:
      /* the key light: a soft lift at the top-left, falling off to the lower right */
      radial-gradient(
        140% 70% at 22% 0%,
        rgba(255, 255, 255, 0.06) 0%,
        rgba(255, 255, 255, 0.012) 40%,
        rgba(0, 0, 0, 0.2) 100%
      ),
      /* a fine brushed grain, as on the bridge deck */
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    /* the module's bevel: lit top and left edges, shadowed bottom and right;
       then the dark seam where this module meets its neighbours on the rail */
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 1px 0 0 rgba(255, 255, 255, 0.07),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset -1px 0 0 rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(0, 0, 0, 0.62),
      0 1px 2px rgba(0, 0, 0, 0.45);
  }

  /* --- sections, divided by engraved rules ------------------------------- */
  .strip__section {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: center;
    min-width: 0;
    padding: var(--strip-section-pad) 0;
  }

  .strip__section + .strip__section,
  .strip__head + .strip__section {
    /* a machined division line: the dark groove and its lit lower wall */
    border-top: 1px solid var(--al-bevel-shadow);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }

  /* --- the head ---------------------------------------------------------- */
  .strip__head {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
    padding: var(--al-space-3xs) var(--al-space-3xs) var(--al-space-2xs);
  }

  .strip__ident {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  .strip__name-row {
    display: flex;
    align-items: center;
    gap: var(--al-space-2xs);
    min-width: 0;
    min-height: 1.125rem;
  }

  /* The organisational colour tab (spec §7): a small flat tab of the swatch
     colour beside the name — no gloss, no highlight, no shadow (owner,
     2026-10-31, D2.2.13). The colour never touches the panel. */
  .strip__tab {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }

  /* --- the optional identity extension (Task 2.7) ------------------------ */
  .strip__section--identity {
    flex-direction: column;
    align-items: stretch;
    padding: var(--al-space-2xs) var(--al-space-3xs);
  }

  /* --- the knob row: trim and pan side by side, trim first (D9.5.2) ------- */
  .strip__section--knobs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--al-space-3xs);
    align-items: start;
    padding-top: var(--al-space-3xs);
  }

  /* The sends bay: a shallow recess milled into the face (the same recipe as
     the bridge's spectrum bay) holding the two send slots side by side. */
  .strip__section--sends {
    padding: var(--al-space-3xs) 0;
  }

  .strip__bay {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: 1fr 1fr;
    gap: var(--al-space-3xs);
    min-width: 0;
    padding: var(--al-space-3xs);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 72%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* --- the level row: the fader and its meter ------------------------------ */
  .strip__section--fader {
    flex: 1 1 auto;
    min-height: 0;
    /* the row stretches the section's full height, so the meter column
       spans it — the fader centres in it, the meter runs the whole line */
    align-items: stretch;
    padding-top: var(--al-space-3xs);
    padding-bottom: var(--al-space-3xs);
  }

  /* The fader centres in whatever height the section holds; the meter
     stretches with the section, spanning the fader's line like a console's
     meter column. */
  .strip__level {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: var(--al-space-2xs);
    min-width: 0;
    min-height: 0;
    width: 100%;
  }

  /* --- mute · solo --------------------------------------------------------- */
  .strip__section--switches {
    align-items: flex-start;
    justify-content: space-evenly;
    gap: var(--al-space-2xs);
    padding: var(--al-space-3xs) var(--al-space-3xs) var(--al-space-3xs);
  }
</style>
