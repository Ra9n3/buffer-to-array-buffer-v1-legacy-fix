<script module lang="ts">
  /** Unique per-instance id prefix for the strip's labelled regions. */
  let nextId = 0;
</script>
<script lang="ts">
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import Fader from "../hardware/Fader.svelte";
  import Knob from "../hardware/Knob.svelte";
  import Lamp from "../hardware/Lamp.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import {
    PAN_RANGE,
    SEND_RANGE,
    SIMULATED,
    TRIM_RANGE,
    formatPan,
    formatSend,
    formatSignedDb,
    orgToken,
    type TrackStripFixture,
  } from "./track-strip-fixtures";

  /**
   * ALLOY Console regular-track channel strip — Task 2.2 (Phase 2 skin).
   *
   * One physical channel module of the Console's lower section (plan §3:
   * "name label, fader, pan, mute/solo, input trim, and a peak indicator",
   * plus the per-track Reverb and Delay sends of plan §8a), repeated once per
   * track by the channel bank. It is COMPOSED of the approved Phase 1
   * components and draws no control of its own:
   *
   *   HEAD        channel number and type, then the organisational colour
   *               tab beside the engraved track name (spec §7: a small tab,
   *               never a washed strip).
   *   TRIM        the approved Knob, cream family (spec §5: input trim and
   *               gain staging), ±20 dB with unity under the reference mark.
   *   PAN         the approved Knob, blue-grey family (spec §5: pan and
   *               stereo placement), L / C / R readout, centre under the mark.
   *   SENDS       the two approved green Knobs (spec §5 / plan §8a: sends
   *               are green), REV SEND and DLY SEND side by side in one
   *               recessed bay so they read as one auxiliary group.
   *   LEVEL       the approved Fader at its approved 1× size and 160 px
   *               travel — the strip's anchor.
   *   MUTE · SOLO two approved panel-labelled TactileSwitches with their
   *   · PEAK      own engaged lamps (owner's choice, D2.2.3), then the
   *               approved Lamp, red: a warning.
   *
   * Everything is a fixture (`track-strip-fixtures.ts`, SIMULATED): the
   * controls keep their approved local behaviour — drag, keyboard, numeric
   * entry, press — and change only their own on-screen state. No audio, no
   * routing, no mute/solo logic, no project state.
   *
   * The strip is a fixed-width physical module (owner's rule, D2.2.1): it
   * never shrinks to fit a viewport; the bank scrolls instead.
   */
  let { track }: { track: TrackStripFixture } = $props();

  const uid = `ts${++nextId}`;

  const trimFormat = (value: number) => formatSignedDb(value, 1);
</script>

<li
  class="strip"
  role="group"
  aria-labelledby={`${uid}-name`}
  data-track-strip={track.id}
  data-track-org={String(track.org)}
  data-simulated={SIMULATED}
>
  <div class="strip__face">
    <!-- HEAD: identity -->
    <header class="strip__head" data-strip-section="head">
      <div class="strip__ident">
        <EngravedLabel text={track.id} size="sm" kind="value" tone="bright" title={`Channel ${track.id}`} />
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

    <!-- TRIM -->
    <div class="strip__section strip__section--knob" data-strip-section="trim">
      <Knob
        label="Trim"
        family="cream"
        min={TRIM_RANGE.min}
        max={TRIM_RANGE.max}
        step={TRIM_RANGE.step}
        value={track.trim}
        unit="dB"
        decimals={1}
        extremes={["−20", "+20"]}
        format={trimFormat}
      />
    </div>

    <!-- PAN -->
    <div class="strip__section strip__section--knob" data-strip-section="pan">
      <Knob
        label="Pan"
        family="bluegrey"
        min={PAN_RANGE.min}
        max={PAN_RANGE.max}
        step={PAN_RANGE.step}
        value={track.pan}
        decimals={0}
        extremes={["L", "R"]}
        format={formatPan}
      />
    </div>

    <!-- SENDS: one recessed bay, two green knobs -->
    <div class="strip__section strip__section--sends" data-strip-section="sends">
      <div class="strip__bay" role="group" aria-label={`Sends, ${track.name}`}>
        <Knob
          label="Rev send"
          family="green"
          min={SEND_RANGE.min}
          max={SEND_RANGE.max}
          step={SEND_RANGE.step}
          value={track.reverbSend}
          decimals={0}
          extremes={["OFF", "+6"]}
          format={formatSend}
        />
        <Knob
          label="Dly send"
          family="green"
          min={SEND_RANGE.min}
          max={SEND_RANGE.max}
          step={SEND_RANGE.step}
          value={track.delaySend}
          decimals={0}
          extremes={["OFF", "+6"]}
          format={formatSend}
        />
      </div>
    </div>

    <!-- LEVEL: the approved fader, 1x, 160 px travel -->
    <div class="strip__section strip__section--fader" data-strip-section="fader">
      <Fader label="Level" value={track.level} />
    </div>

    <!-- MUTE · SOLO · PEAK (the owner's order, D2.2.3) -->
    <footer class="strip__section strip__section--switches" data-strip-section="switches">
      <TactileSwitch variant="panel" label="Mute" lamp="red" engaged={track.mute} name={`Mute ${track.name}`} />
      <TactileSwitch variant="panel" label="Solo" lamp="amber" engaged={track.solo} name={`Solo ${track.name}`} />
      <div class="strip__peak" data-strip-peak>
        <EngravedLabel text="Peak" size="xs" />
        <span class="strip__peak-lamp">
          <Lamp lit={track.peak} color="red" name={`Peak, ${track.name}`} />
        </span>
      </div>
    </footer>
  </div>
</li>

<style>
  /* =======================================================================
     THE MODULE
     A fixed-width physical channel module (D2.2.1): 10rem = 160 px, inside
     the owner's 150–165 px band. It never shrinks; the bank scrolls.
     ======================================================================= */
  .strip {
    --strip-width: 10rem;
    /* the approved components, at the sizes the owner fixed for the strip */
    --knob-size: 2.5rem; /* 40 px dials; legends and value windows keep their type sizes */
    --fader-width: 4.5rem; /* the fader's approved 1x: 72 px wide, 160 px travel */
    --switch-size: 1.75rem; /* the switch's approved 1x: 28 px caps */
    --lamp-size: 0.75rem; /* 12 px glass for the peak lamp — compact but visible */

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
    padding: var(--al-space-2xs) var(--al-space-xs) var(--al-space-2xs);
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
    padding: var(--al-space-3xs) 0;
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
    gap: var(--al-space-xs);
    min-width: 0;
    min-height: 1.125rem;
  }

  /* The organisational colour tab (spec §7): a small plastic tab in a slot
     beside the name — the swatch token under a glossy top, a dark seam and
     the slot's shadow. The colour never touches the panel. */
  .strip__tab {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
    background-image:
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.38) 0%,
        rgba(255, 255, 255, 0.1) 30%,
        rgba(0, 0, 0, 0) 55%,
        rgba(0, 0, 0, 0.32) 100%
      ),
      linear-gradient(90deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.2));
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.7),
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 1px 1px rgba(0, 0, 0, 0.45);
  }

  /* --- knob sections ------------------------------------------------------ */
  .strip__section--knob {
    padding-top: var(--al-space-3xs);
  }

  /* The sends bay: a shallow recess milled into the face (the same recipe as
     the bridge's spectrum bay) holding the two green knobs side by side. */
  .strip__section--sends {
    padding: var(--al-space-3xs) 0;
  }

  .strip__bay {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: 1fr 1fr;
    gap: var(--al-space-3xs);
    min-width: 0;
    padding: var(--al-space-2xs) var(--al-space-3xs) var(--al-space-3xs);
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 72%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* --- the fader --------------------------------------------------------- */
  .strip__section--fader {
    flex: 1 0 auto;
    padding-top: var(--al-space-2xs);
    padding-bottom: var(--al-space-2xs);
  }

  /* --- mute · solo · peak -------------------------------------------------- */
  .strip__section--switches {
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--al-space-2xs);
    padding: var(--al-space-2xs) var(--al-space-3xs) var(--al-space-3xs);
  }

  /* The peak lamp is laid out like the panel switches beside it: the legend
     printed above, the lamp centred on the same line as the switch caps. */
  .strip__peak {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .strip__peak-lamp {
    display: flex;
    align-items: center;
    justify-content: center;
    /* the switch's button row (1.25 x the cap); the cap's face sits 4 px
       above the row's centre, above its own travel shadow */
    height: calc(var(--switch-size) * 1.25);
    padding-bottom: 4px;
  }
</style>
