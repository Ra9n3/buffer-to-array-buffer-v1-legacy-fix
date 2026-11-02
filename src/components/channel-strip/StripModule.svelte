<script module lang="ts">
  /** Unique per-instance id prefix for the module's labelled regions. */
  let nextId = 0;
</script>
<script lang="ts">
  import type { Snippet } from "svelte";
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import Fader from "../hardware/Fader.svelte";
  import Lamp from "../hardware/Lamp.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import { SIMULATED, orgToken, type OrgSwatch } from "./track-strip-fixtures";
  import type { PinnedType } from "./bus-return-fixtures";

  /**
   * ALLOY Console pinned channel module — Task 2.4.
   *
   * The physical module the pinned strips are built on: the Task 2.2 track
   * strip's chassis — the same 10rem width, panel face, bevel and seam, the
   * same identity head (number, type, organisational tab, engraved name),
   * the same six sections divided by the same machined rules, the approved
   * Fader in the fifth and the MUTE · SOLO · PEAK footer in the sixth — so
   * that a Return strip or the bus master lines up control for control with
   * the twenty track strips beside it (prompt: match the established
   * styling, sizing, spacing and control alignment). The approved
   * `TrackStrip` is not changed and not extended: its CSS values are copied
   * here value for value, the way the bank copied the bridge's housing
   * (D2.2.5), and its file hash stays pinned by the guards.
   *
   * What differs between a track, a Return and the bus master is what sits
   * in the two knob sections and the bay. Those come in as snippets from the
   * strip that owns the module (`ReturnStrip`, `BusMasterStrip`); a module
   * given no bay renders a blank panel there instead — an unpopulated slot
   * that keeps the fader and the footer on the tracks' lines by absorbing
   * the height (owner, D2.4.4).
   *
   * Fixtures only (SIMULATED): the controls keep their approved behaviour.
   * Since Task 3.1 the fader, MUTE and SOLO are bindable, so the strip that
   * owns the module can bind them to the project store's view of its
   * channel (the knobs in the snippets already are); a caller that passes
   * plain values gets the Task 2.4 local behaviour unchanged.
   *
   * `identity` (Task 2.7, optional, default none): the same optional section
   * under the head that the track strip has — a room's own content (the
   * Mixer's channel identity print and controls), rendered between the head
   * and the first knob, divided by the same machined rule. Without it the
   * module is exactly the approved Task 2.4 module: the Console passes
   * nothing and renders byte-for-byte the same.
   */
  let {
    id,
    type,
    typeTitle,
    name,
    org,
    kind,
    hook,
    sectionA,
    sectionB,
    identity = null,
    bay = null,
    baySection = "bay",
    bayLabel = "",
    faderLabel,
    faderValue = $bindable(0),
    mute = $bindable(false),
    solo = $bindable(false),
    peak,
    knobA,
    knobB,
  }: {
    /** Channel code printed top-left (R1, B1). */
    id: string;
    /** Channel type printed top-right. */
    type: PinnedType;
    /** The type's long name, for the type print's title. */
    typeTitle: string;
    name: string;
    org: OrgSwatch;
    kind: "return" | "bus";
    /** Value of the strip's `data-pinned-strip` hook. */
    hook: string;
    /** `data-strip-section` names of the two knob sections. */
    sectionA: string;
    sectionB: string;
    /** The optional identity extension under the head (Task 2.7); omitted = none. */
    identity?: Snippet | null;
    /** The bay's content; omitted = a blank panel of the bay's place. */
    bay?: Snippet | null;
    baySection?: string;
    bayLabel?: string;
    faderLabel: string;
    /** Fader, MUTE and SOLO are bindable (Task 3.1): a caller that binds them owns them; a plain value still draws as before. */
    faderValue?: number;
    mute?: boolean;
    solo?: boolean;
    peak: boolean;
    knobA: Snippet;
    knobB: Snippet;
  } = $props();

  const uid = `pm${++nextId}`;
</script>

<li
  class="module"
  role="group"
  aria-labelledby={`${uid}-name`}
  data-pinned-strip={hook}
  data-pinned-kind={kind}
  data-simulated={SIMULATED}
>
  <div class="module__face">
    <!-- HEAD: identity -->
    <header class="module__head" data-strip-section="head">
      <div class="module__ident">
        <EngravedLabel text={id} size="sm" kind="value" tone="bright" title={`Channel ${id}`} />
        <EngravedLabel text={type} size="xs" tone="muted" title={typeTitle} />
      </div>
      <div class="module__name-row">
        <span class="module__tab" style:--org={orgToken(org)} data-org-tab={String(org)} aria-hidden="true"></span>
        <EngravedLabel id={`${uid}-name`} text={name} size="sm" kind="value" truncate />
      </div>
    </header>

    {#if identity}
      <!-- IDENTITY EXTENSION (Task 2.7): the room's own section under the head;
           absent in the Console -->
      <div class="module__section module__section--identity" data-strip-section="identity">
        {@render identity()}
      </div>
    {/if}

    <!-- first knob -->
    <div class="module__section module__section--knob" data-strip-section={sectionA}>
      {@render knobA()}
    </div>

    <!-- second knob -->
    <div class="module__section module__section--knob" data-strip-section={sectionB}>
      {@render knobB()}
    </div>

    <!-- the bay, or a blank panel in its place -->
    {#if bay}
      <div class="module__section module__section--bay" data-strip-section={baySection}>
        <div class="module__bay" role="group" aria-label={bayLabel}>
          {@render bay()}
        </div>
      </div>
    {:else}
      <div class="module__section module__section--blank" data-strip-section="blank" data-blank-panel></div>
    {/if}

    <!-- the approved fader, 1x, 160 px travel -->
    <div class="module__section module__section--fader" data-strip-section="fader">
      <Fader label={faderLabel} bind:value={faderValue} />
    </div>

    <!-- MUTE · SOLO · PEAK (the track strips' order, D2.2.3) -->
    <footer class="module__section module__section--switches" data-strip-section="switches">
      <TactileSwitch variant="panel" label="Mute" lamp="red" bind:engaged={mute} name={`Mute ${name}`} />
      <TactileSwitch variant="panel" label="Solo" lamp="amber" bind:engaged={solo} name={`Solo ${name}`} />
      <div class="module__peak" data-strip-peak>
        <EngravedLabel text="Peak" size="xs" />
        <span class="module__peak-lamp">
          <Lamp lit={peak} color="red" name={`Peak, ${name}`} />
        </span>
      </div>
    </footer>
  </div>
</li>

<style>
  /* =======================================================================
     THE MODULE — the track strip's chassis (TrackStrip.svelte, Task 2.2),
     value for value: a fixed-width physical module (D2.2.1), 10rem = 160 px,
     that never shrinks.
     ======================================================================= */
  .module {
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
  .module__face {
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
  .module__section {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: center;
    min-width: 0;
    padding: var(--al-space-3xs) 0;
  }

  .module__section + .module__section,
  .module__head + .module__section {
    /* a machined division line: the dark groove and its lit lower wall */
    border-top: 1px solid var(--al-bevel-shadow);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }

  /* --- the head ---------------------------------------------------------- */
  .module__head {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
    padding: var(--al-space-3xs) var(--al-space-3xs) var(--al-space-2xs);
  }

  .module__ident {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-2xs);
    min-width: 0;
  }

  .module__name-row {
    display: flex;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    min-height: 1.125rem;
  }

  /* The organisational colour tab (spec §7): a small flat tab of the swatch
     colour beside the name — no gloss, no highlight, no shadow (D2.2.13).
     The colour never touches the panel. */
  .module__tab {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }

  /* --- the optional identity extension (Task 2.7; the track strip's values) */
  .module__section--identity {
    flex-direction: column;
    align-items: stretch;
    padding: var(--al-space-2xs) var(--al-space-3xs);
  }

  /* --- knob sections ------------------------------------------------------ */
  .module__section--knob {
    padding-top: var(--al-space-3xs);
  }

  /* The bay: the track strip's sends bay — a shallow recess milled into the
     face holding two slots side by side — with this module's own content. */
  .module__section--bay {
    padding: var(--al-space-3xs) 0;
  }

  .module__bay {
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

  /* A blank panel where a bay would be: nothing is milled into it. It takes
     whatever height the row gives the module, so the fader below it stands
     on the same line as the faders of the modules beside it. */
  .module__section--blank {
    flex: 1 1 auto;
    padding: var(--al-space-3xs) 0;
  }

  /* --- the fader --------------------------------------------------------- */
  .module__section--fader {
    flex: 1 0 auto;
    padding-top: var(--al-space-2xs);
    padding-bottom: var(--al-space-2xs);
  }

  /* With a blank panel absorbing the slack, the fader section keeps its own
     height only. */
  .module__section--blank ~ .module__section--fader {
    flex: 0 0 auto;
  }

  /* --- mute · solo · peak -------------------------------------------------- */
  .module__section--switches {
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--al-space-2xs);
    padding: var(--al-space-2xs) var(--al-space-3xs) var(--al-space-3xs);
  }

  /* The peak lamp is laid out like the panel switches beside it: the legend
     printed above, the lamp centred on the same line as the switch caps. */
  .module__peak {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .module__peak-lamp {
    display: flex;
    align-items: center;
    justify-content: center;
    /* the switch's button row (1.25 x the cap); the cap's face sits 4 px
       above the row's centre, above its own travel shadow */
    height: calc(var(--switch-size) * 1.25);
    padding-bottom: 4px;
  }
</style>
