<script lang="ts">
  /**
   * Persistent mini transport — Task 0.6.
   *
   * Rendered once, by App.svelte, outside every room's content, so it cannot be
   * remounted or repositioned by switching rooms.
   *
   * Phase 0: structure only. The controls are inert placeholders. They are NOT
   * wired to audio, an audio engine, the project model, or timeline playback,
   * and they do not represent that anything is playing. The visible note below
   * the controls says so, and each button is described by it, so the placeholder
   * nature is available both visually and to assistive technology.
   *
   * Play/Stop/Previous/Next are the minimum set that matches the product plan's
   * transport conventions. Extra controls (record, loop, tempo, MIX) are
   * deliberately absent: MIX is a Phase 2 Console control per plan §2.3 and is
   * not a transport control, and the rest would be invented.
   */

  /** Buttons are focusable and inert by design: a disabled control cannot be
   *  inspected with the keyboard, and this task is a structural review. */
  const CONTROLS = ["Previous", "Play", "Stop", "Next"] as const;
</script>

<footer
  class="mini-transport"
  data-mini-transport
  aria-labelledby="mini-transport-title"
>
  <p class="mini-transport__label" id="mini-transport-title">Mini transport</p>

  <div class="mini-transport__controls" role="group" aria-label="Transport controls, placeholders">
    {#each CONTROLS as control (control)}
      <button
        type="button"
        class="mini-transport__button"
        class:mini-transport__button--primary={control === "Play"}
        data-transport-control={control.toLowerCase()}
        aria-describedby="mini-transport-note"
      >
        {control}
      </button>
    {/each}
  </div>

  <p class="mini-transport__readout" data-transport-position>
    <span class="mini-transport__readout-label">Position / time</span>
    <span class="mini-transport__readout-value">00:00:00.000</span>
  </p>

  <p class="mini-transport__status" data-transport-status>
    <span class="mini-transport__status-label">Status</span>
    <span class="mini-transport__status-value">Idle — placeholder</span>
  </p>

  <p class="mini-transport__note" id="mini-transport-note">
    Placeholder controls. No audio engine is connected in Phase 0, so nothing
    plays.
  </p>
</footer>

<style>
  .mini-transport {
    /* Fixed to the viewport bottom so it cannot scroll away with room content,
       and so its position is identical in every room. Its height is declared
       once, as --mini-transport-height in app.css, where the shell reserves
       exactly that much space so the strip can never cover room content. */
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
    height: var(--mini-transport-height);
    padding: 0.3125rem 1rem;
    background: #d2d2d2;
    border-top: 2px solid #6d6d6d;
  }

  .mini-transport__label {
    flex: 0 0 auto;
    margin: 0;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mini-transport__controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .mini-transport__button {
    padding: 0.1875rem 0.625rem;
    border: 1px solid #8a8a8a;
    background: #f3f3f3;
    color: #1b1b1b;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.5;
    cursor: pointer;
  }

  .mini-transport__button:hover {
    background: #ffffff;
  }

  /* Play is emphasised as the future primary action, using only the existing
     neutral Phase 0 palette. This is not the MIX button and is not styled as a
     final control. */
  .mini-transport__button--primary {
    background: #4a4a4a;
    border-color: #1b1b1b;
    color: #ffffff;
  }

  .mini-transport__button--primary:hover {
    background: #333333;
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
    border-left: 1px solid #b5b5b5;
  }

  .mini-transport__readout-label,
  .mini-transport__status-label {
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mini-transport__readout-value {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .mini-transport__status-value {
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  /* The honesty note is the first thing to give up space when the bar narrows:
     the status readout already says "placeholder". */
  .mini-transport__note {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: #5d5d5d;
    font-size: 0.6875rem;
    line-height: 1.25;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The bar is a single non-wrapping row, so content gives way in a fixed
     order as the viewport narrows rather than being clipped: the honesty note
     first (the status readout already says "placeholder"), then the section
     label and the status readout. Controls and the position readout survive at
     every width. */
  @media (max-width: 72rem) {
    .mini-transport__note {
      display: none;
    }
  }

  @media (max-width: 60rem) {
    .mini-transport__status {
      display: none;
    }
  }

  @media (max-width: 48rem) {
    .mini-transport {
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
    }

    .mini-transport__label {
      display: none;
    }

    .mini-transport__readout {
      padding-left: 0.5rem;
    }

    .mini-transport__button {
      padding: 0.1875rem 0.4375rem;
    }
  }
</style>
