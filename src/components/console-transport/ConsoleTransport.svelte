<script module lang="ts">
  /** Unique per-instance id prefix, so several decks (the playground) can
   *  each describe their own controls. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY Console transport deck — Task 2.3 (plan §3 "Console room":
   * transport, status and estimated processing time, large illuminated MIX
   * button; §6 playback modes; §10 MIX button behaviour; §14 2.3), moved to
   * the foot of the room as the Console's bottom bar (Task 9.5, D9.5.1 —
   * the owner's reference console's layout: meters above, channels in the
   * middle, transport at the bottom).
   *
   * One full-width housing — the approved meter bridge's recipe, the same
   * walnut cheeks and bevelled warm-charcoal deck the channel bank already
   * wears — carrying from left to right:
   *
   *   TRANSPORT  the four keys Phase 0 fixed as the product's transport
   *              conventions (Task 0.6): PREVIOUS · PLAY · STOP · NEXT, each
   *              an approved tactile switch (cap-labelled, spec §2 variant A)
   *              printing its symbol on the cap with its word engraved
   *              beneath. PLAY and STOP latch and exclude each other; the
   *              engaged one's lamp is lit. PREVIOUS and NEXT are momentary.
   *   TIME       a display screen on the meters' cream card: H:MM:SS large,
   *              bar · beat small (owner, D2.3.3; D2.3.10–13).
   *   STATUS     the same screen: the mix state word first, then the details
   *              — listening source, hardware profile, the estimate; while
   *              processing, the stage, its progress and the time left; any
   *              warnings in red (plan §10). The listening source is text
   *              here and nowhere else (owner, D2.3.2).
   *   MIX        the dominant button, in the keys' cream with its mixing
   *              lamp beside it, at the right end (owner, D2.3.12).
   *
   * The deck's engraved legend is visually hidden (Task 9.5): the keys,
   * windows and MIX are labelled by their own print, and the bar keeps the
   * reference's hardware face; the heading stays in the DOM as the zone's
   * accessible name.
   *
   * Everything is fixture data (`transport-fixtures.ts`) or the one shared
   * transport (`live`), SIMULATED and labelled so: nothing plays, locates,
   * renders or persists beyond what the shared transport already does.
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";
  import { secondsToBars } from "../../lib/arrange-audio";
  import { transport } from "../../lib/playback/store.svelte";
  import { project } from "../../lib/project/store.svelte";
  import LampDisplay from "./LampDisplay.svelte";
  import MixButton from "./MixButton.svelte";
  import {
    formatClock,
    SIMULATED,
    stageWord,
    statusDetails,
    TRANSPORT_FIXTURE,
    type TransportFixture,
  } from "./transport-fixtures";

  let {
    fixture = TRANSPORT_FIXTURE,
    headingId = "console-transport-title",
    live = false,
  }: {
    /** The snapshot to print when not live (the playground). */
    fixture?: TransportFixture;
    /** The engraved legend's id — ConsoleRoom's zone is labelled by it. */
    headingId?: string;
    /** Task 8.1: the Console room drives the one shared transport. */
    live?: boolean;
  } = $props();

  const uid = `transport${++nextId}`;

  const playing = $derived(transport.status === "playing" || transport.status === "rendering");
  const liveFixture = $derived<TransportFixture>(buildLiveFixture());
  const view = $derived(live ? liveFixture : fixture);

  function buildLiveFixture(): TransportFixture {
    const seconds = transport.positionSeconds;
    const bars = secondsToBars(seconds, project.arrangement.tempoMarkers);
    const bar = Math.floor(bars) + 1;
    const beat = Math.min(4, Math.floor((bars % 1) * 4) + 1);
    const rendering = transport.status === "rendering";
    // Task 9.1.3: "has a mix finished?" is `mixRevision`, not `renderProgress === 1`.
    // The two used to be the same test and it could never be true: the render's own
    // completion clears `renderProgress`, so by the time the deck re-read state the
    // evidence was gone and the button fell back to "ready" — a finished mix looked
    // like an unstarted one. The old expression is kept only for a run still streaming.
    const complete = transport.mixRevision !== null
      || (transport.source === "render" && transport.renderProgress === 1);
    return {
      transport: playing ? "playing" : "stopped",
      position: { seconds, bar, beat },
      source: transport.source,
      profile: "balanced",
      mix: {
        state: rendering ? "processing" : complete ? "complete" : "ready",
        stageIndex: rendering ? 6 : undefined,
        progress: rendering ? (transport.renderProgress ?? 0) : undefined,
        completedAt: complete ? (transport.mixedAt ?? undefined) : undefined,
        warnings: transport.error ? 1 : 0,
      },
    };
  }

  /* PLAY/STOP lamps follow the shared transport when live; the playground keeps
     the approved local latch. PLAY toggles play/pause in the live room. */
  // svelte-ignore state_referenced_locally
  let playOn = $state(fixture.transport === "playing");
  // svelte-ignore state_referenced_locally
  let stopOn = $state(fixture.transport !== "playing");
  let prevOn = $state(false);
  let nextOn = $state(false);

  $effect(() => {
    if (!live) return;
    playOn = playing;
    stopOn = !playing;
  });

  function onPlay() {
    if (live) {
      transport.togglePlay();
      return;
    }
    playOn = true;
    stopOn = false;
  }

  function onStop() {
    if (live) {
      transport.stop();
      return;
    }
    stopOn = true;
    playOn = false;
  }

  function onPrev() {
    if (live) transport.seek(transport.startFrame);
    prevOn = false;
  }

  function onNext() {
    if (live) transport.seek(transport.durationFrames);
    nextOn = false;
  }

  function onMix() {
    if (live) void transport.render();
  }

  const clock = $derived(formatClock(view.position.seconds));
  const beatPrint = $derived([`Bar ${view.position.bar}`, `Beat ${view.position.beat}`]);
  const word = $derived(stageWord(view.mix));
  const details = $derived(statusDetails(view));
  const progress = $derived(view.mix.state === "processing" ? (view.mix.progress ?? 0) : null);
  const simulated = $derived(live ? undefined : SIMULATED);
  const note = $derived(live ? "Live — shared transport" : "Simulated \u2014 no engine connected");
  const timeName = $derived(`Time ${clock}, bar ${view.position.bar} beat ${view.position.beat}${simulated ? `, ${simulated}` : ""}`);
  const statusName = $derived(`Status: ${word}, ${details.join(", ")}${simulated ? `, ${simulated}` : ""}`);
</script>

<div class="transport" data-console-transport data-simulated={simulated} data-transport-state={playOn ? "playing" : "stopped"}>
  <div class="transport__cheek transport__cheek--left" aria-hidden="true"></div>

  <div class="transport__deck">
    <!-- No screw heads here or anywhere else (D2.1.9). -->

    <!-- The zone's heading. ConsoleRoom's transport <section> is labelled by
         this id. Visually hidden (Task 9.5): the keys, windows and MIX are
         labelled by their own print; the heading stays in the DOM as the
         zone's accessible name. -->
    <header class="transport__legend">
      <EngravedLabel as="h2" id={headingId} text="Transport" size="sm" />
      <EngravedLabel id={`${uid}-note`} text={note} size="xs" tone="muted" />
    </header>

    <div class="transport__body">
      <!-- TRANSPORT KEYS -->
      <div
        class="transport__keys"
        role="group"
        aria-label="Transport keys"
        aria-describedby={`${uid}-note`}
        data-transport-keys
      >
        <div class="key" data-transport-key="previous">
          <TactileSwitch variant="cap" label={"|\u25C0"} name="Previous marker" bind:engaged={prevOn} onToggle={onPrev} />
          <span class="key__word"><EngravedLabel text="Prev" size="xs" tone="muted" /></span>
        </div>
        <div class="key" data-transport-key="play">
          <TactileSwitch variant="cap" label={"\u25B6"} name="Play" bind:engaged={playOn} onToggle={onPlay} />
          <span class="key__word"><EngravedLabel text="Play" size="xs" tone="muted" /></span>
        </div>
        <div class="key" data-transport-key="stop">
          <TactileSwitch variant="cap" label={"\u25A0"} name="Stop" bind:engaged={stopOn} onToggle={onStop} />
          <span class="key__word"><EngravedLabel text="Stop" size="xs" tone="muted" /></span>
        </div>
        <div class="key" data-transport-key="next">
          <TactileSwitch variant="cap" label={"\u25B6|"} name="Next marker" bind:engaged={nextOn} onToggle={onNext} />
          <span class="key__word"><EngravedLabel text="Next" size="xs" tone="muted" /></span>
        </div>
      </div>

      <!-- TIME — the window column is one line tall, the bar's own line:
           the frame centers in it, fully inside the bar (owner, 2026-11-12,
           D9.7.4 — the seat-and-shim column used to stand the glass proud
           of the bar's top edge). The halved bar runs the windows bare — no
           floating legend (D9.6.2); the clock's own print is its label. -->
      <div class="transport__time" data-transport-time>
        <LampDisplay kind="clock" legend={null} primary={clock} secondary={beatPrint} name={timeName} />
      </div>

      <!-- STATUS — bare with the bar (D9.6.2), contained in it (D9.7.4):
           the state word is its label -->
      <div class="transport__status" data-transport-status-display>
        <LampDisplay
          kind="status"
          legend={null}
          primary={word}
          secondary={details}
          {progress}
          warning={fixture.mix.warnings > 0}
          name={statusName}
          id={`${uid}-status`}
        />
      </div>

      <!-- MIX — the label prints no "Automatic mix" line on the halved bar
           (D9.6.2): the button's own MIX face carries it, and the line under
           it was the bar's tallest print. Kept in the DOM for the
           accessibility tree, clipped out of the face. -->
      <div class="transport__mix" data-transport-mix>
        <MixButton state={view.mix.state} describedBy={`${uid}-status ${uid}-note`} onPress={live ? onMix : undefined} />
        <span class="transport__mix-note">
          <EngravedLabel text="Automatic mix" size="xs" tone="muted" />
        </span>
      </div>
    </div>
  </div>

  <div class="transport__cheek transport__cheek--right" aria-hidden="true"></div>
</div>

<style>
  /* =======================================================================
     THE HOUSING — the approved meter bridge's recipe (Task 2.1), copied
     value for value as the channel bank did (Task 2.2), so the three zones
     are one desk.
     ======================================================================= */
  .transport {
    /* --- geometry ------------------------------------------------------- */
    --b-cheek: 0.7rem; /* 0.875 × 0.8 — the room's density (D9.6.1) */
    --b-radius: 4px;
    /* --- materials, from the tokens ------------------------------------- */
    --b-wood-light: color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal));
    --b-wood: var(--al-material-wood);
    --b-wood-dark: color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess));
    --b-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: grid;
    grid-template-columns: var(--b-cheek) minmax(0, 1fr) var(--b-cheek);
    min-width: 0;
    width: 100%;
    border-radius: var(--b-radius);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the walnut end-cheeks ------------------------------------------- */
  .transport__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--b-wood);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.32) 100%),
      repeating-linear-gradient(
        93deg,
        var(--b-wood-light) 0 1px,
        var(--b-wood) 1px 3px,
        var(--b-wood-dark) 3px 4px,
        var(--b-wood) 4px 7px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .transport__cheek--left {
    border-radius: var(--b-radius) 0 0 var(--b-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .transport__cheek--right {
    border-radius: 0 var(--b-radius) var(--b-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the deck -------------------------------------------------------- */
  .transport__deck {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-2xs) var(--al-space-md);
    background-color: var(--al-material-panel);
    background-image:
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--b-trim) 1px, var(--b-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
      radial-gradient(
        120% 100% at 18% 0%,
        rgba(255, 255, 255, 0.07) 0%,
        rgba(255, 255, 255, 0.015) 38%,
        rgba(0, 0, 0, 0.22) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8);
  }

  .transport__legend {
    /* The zone's heading, kept for the accessibility tree and the zone's
       name, hidden from the bar's face (Task 9.5). */
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* =======================================================================
     THE BODY — keys, time, status, MIX, left to right; wrapping when the
     deck is narrower than the four at their fixed sizes (the status window
     is the one flexible part), never shrinking a control.
     ======================================================================= */
  .transport__body {
    --switch-size: 1.6rem; /* 25.6 px key caps — the bar's own 0.8×-then-halved
                              scale (Task 9.6, D9.6.2: the owner cut the bar's
                              height nearly in half; 40 px × 0.8 × 0.8). The
                              keys' caps read it. */
    --window-height: 2.75rem; /* 44 px: the windows' frame height — the bar is
                                 one line tall (D9.6.2) and the frame sits
                                 wholly inside it, centered (D9.7.4: the
                                 screens no longer bleed out of the bar's
                                 top). */

    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--al-space-sm) var(--al-space-lg);
    min-width: 0;
    padding: 0 var(--al-space-md);
  }

  /* --- the keys: approved switches at a transport key's size --------------- */
  .transport__keys {
    display: flex;
    flex: 0 0 auto;
    gap: var(--al-space-sm);
    align-items: flex-start;
  }

  .key {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    align-items: center;
  }

  /* the word sits under the cap, not under cap + lamp: the switch's lamp
     (0.36 of the cap) and its gap are left out of the centring */
  .key__word {
    display: flex;
    margin-right: calc(var(--switch-size) * 0.36 + var(--al-space-xs));
  }

  /* --- the windows ----------------------------------------------------------- */
  .transport__time {
    flex: 0 0 auto;
    min-width: 10rem; /* the clock's bar · beat line prints whole (D9.6.2) */
  }

  .transport__status {
    /* keys + time + this + MIX with its lamp fit a 1024 window (940 px) in
       one row at the bar's 0.8× scale; the floor came down from 14.5rem with
       the density (D9.6.1) */
    flex: 1 1 11.5rem;
    min-width: 11.5rem;
    max-width: 22.5rem;
  }

  /* --- the windows: one line tall and wholly inside the bar (D9.7.4). The
     column IS the frame — no seat, no shim, nothing that stands the glass
     proud of the bar's edges; the body's align-items: center centers the
     frame on the same line as the keys, and the frame's own height
     (44 px, under the body's line) keeps it clear of both deck edges. */
  .transport__time,
  .transport__status {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  /* --- MIX: at the right end of its row — halved with the bar (D9.6.2),
     still the one button that stands over the keys --------------------- */
  .transport__mix {
    --mix-width: 5rem;
    --mix-height: 1.9rem;

    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--al-space-2xs);
    align-items: center;
    margin-left: auto;
  }

  /* The "Automatic mix" line, clipped out of the halved bar's face and kept
     for the accessibility tree (D9.6.2) — the room's hidden-heading recipe. */
  .transport__mix-note {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
