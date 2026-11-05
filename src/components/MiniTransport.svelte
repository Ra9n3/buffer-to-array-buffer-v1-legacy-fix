<script lang="ts">
  /**
   * Persistent mini transport — Task 0.6 structure, Task 8.1 live wiring.
   *
   * Rendered once, by App.svelte, outside every room's content, so it cannot be
   * remounted or repositioned by switching rooms. The controls now drive the one
   * shared transport facade (lib/playback/store.svelte.ts); the playhead and
   * status are the same in Console, Arrange and Mixer.
   *
   * Play/Stop/Previous/Next remain the Phase 0 set. Play toggles play/pause,
   * Stop returns to the defined start, Previous locates to the start and Next to
   * the end of the current listening source. MIX is deliberately absent here: it
   * is the Console deck's separate render action (plan §6, D2.3.2).
   *
   * Task 9.1.1 (owner decision D9.1.2 option a) adds the listening-source
   * selector, in its own component beside the keys. It is a control, not a
   * shortcut and not a key: the four approved keys and MIX keep exactly their
   * functions. It lives here because this strip is the one surface visible in
   * every room, so RAW / PREVIEW / RENDER can be read and changed from Console,
   * Arrange and Mixer alike — including returning to RAW after MIX (plan §10).
   */
  import { formatTransportPosition, transport, transportStatusText } from "../lib/playback/store.svelte";
  import ChromeBand from "./ChromeBand.svelte";
  import ToolbarKey from "./hardware/ToolbarKey.svelte";
  import MiniTransportSource from "./MiniTransportSource.svelte";

  const CONTROLS = ["Previous", "Play", "Stop", "Next"] as const;

  const playing = $derived(transport.status === "playing" || transport.status === "rendering");
  const position = $derived(formatTransportPosition(transport.positionFrames, transport.sampleRate));
  const status = $derived(transportStatusText(transport));

  function onControl(control: (typeof CONTROLS)[number]): void {
    switch (control) {
      case "Play": transport.togglePlay(); break;
      case "Stop": transport.stop(); break;
      case "Previous": transport.seek(transport.startFrame); break;
      case "Next": transport.seek(transport.durationFrames); break;
    }
  }
</script>

<!--
  Task 9.2 (owner) — the decorative text is gone from this bar: "MINI TRANSPORT",
  "SOURCE", "POSITION / TIME", "STATUS" and the explanatory paragraph on the
  right. The controls and the live values stay exactly as they were.

  Nothing was lost from the accessible tree: the bar keeps a name via
  aria-label (below), the source selector already carries its own group label,
  and the position and status readouts keep theirs as visually-hidden labels, so
  a screen reader still hears "Position / time 00:00:00.000" and
  "Status Stopped — RAW" even though neither is printed.
-->
<!--
  Task 9.3 (owner's review): this strip is now the same hardware band as the top
  bar — warm near-black plate, lit top bevel, shaded bottom bevel, walnut cheeks
  — and its keys are the approved cream caps, not grey web buttons. The
  decorative text stayed removed (9.2): "MINI TRANSPORT", "SOURCE",
  "POSITION / TIME" and "STATUS" are not printed, and the explanatory paragraph
  is gone. The controls and the live values are unchanged in function.

  Nothing was lost from the accessible tree: the band carries an aria-label, the
  source selector has its own group label, and the position and status values
  keep visually-hidden names, so a screen reader still hears
  "Position and time 00:00:00.000" and "Status Stopped — RAW".
-->
<footer class="mini-transport" data-mini-transport aria-label="Mini transport">
  <ChromeBand label="Transport controls">
    <div class="mini-transport__row">
      <div class="mini-transport__controls" role="group" aria-label="Shared transport controls">
        {#each CONTROLS as control (control)}
          <ToolbarKey
            label={control === "Play" && playing ? "Pause" : control}
            hook={`transport-${control.toLowerCase()}`}
            size="m"
            tone={control === "Play" ? "cream" : "dark"}
            active={control === "Play" ? playing : undefined}
            onpress={() => onControl(control)}
          />
        {/each}
      </div>

      <MiniTransportSource />

      <p class="mini-transport__readout" data-transport-position>
        <span class="mini-transport__sr">Position and time</span>
        <span class="mini-transport__readout-value">{position}</span>
      </p>

      <p class="mini-transport__status" data-transport-status>
        <span class="mini-transport__sr">Status</span>
        <span class="mini-transport__status-value">{status}</span>
      </p>
    </div>
  </ChromeBand>
</footer>

<style>
  /* The strip is fixed to the viewport bottom so it cannot scroll away with room
     content; its height is declared once as --mini-transport-height in app.css,
     where the shell reserves exactly that space. The hardware itself is drawn by
     ChromeBand, so it stays identical to the top bar. */
  .mini-transport {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 25;
    width: 100%;
    min-width: 0;
    padding: 0 0.5rem 0.25rem;
    background: var(--al-material-panel);
  }

  .mini-transport__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    width: 100%;
  }

  .mini-transport__controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    /* the caps stand 3 px proud of their seats: room for the shadow */
    padding: 0.125rem 0;
  }

  .mini-transport__readout,
  .mini-transport__status {
    display: flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.375rem;
    margin: 0;
    min-width: 0;
  }

  .mini-transport__readout {
    padding-left: 0.75rem;
    border-left: 2px solid var(--al-bevel-shadow);
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.06);
  }

  /* The readouts are windows in the panel: recessed, warm cream face, dark ink —
     the meter-window material, not flat web text on grey. */
  .mini-transport__readout-value,
  .mini-transport__status-value {
    padding: 0.125rem 0.5rem;
    border-radius: 2px;
    background: color-mix(in srgb, var(--al-material-cream) 88%, var(--al-material-recess));
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.55),
      0 1px 0 rgba(255, 255, 255, 0.06);
    color: var(--al-text-on-cream);
    white-space: nowrap;
  }

  .mini-transport__readout-value {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.8125rem;
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.04em;
  }

  .mini-transport__status-value {
    font-family: var(--al-font-label);
    font-size: 0.75rem;
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* The removed labels still name their values for assistive technology. */
  .mini-transport__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    border: 0;
    white-space: nowrap;
  }

  /* Content gives way in a fixed order as the strip narrows: the status window
     first, then the readout tightens. The keys survive at every width. */
  @media (max-width: 60rem) {
    .mini-transport__status {
      display: none;
    }
  }

  @media (max-width: 48rem) {
    .mini-transport {
      padding: 0 0.25rem 0.25rem;
    }

    .mini-transport__row {
      gap: 0.5rem;
    }

    .mini-transport__readout {
      padding-left: 0.5rem;
    }
  }
</style>
