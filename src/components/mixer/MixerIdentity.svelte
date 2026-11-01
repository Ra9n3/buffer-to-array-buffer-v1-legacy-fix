<script lang="ts">
  import type { Snippet } from "svelte";
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import TactileSwitch from "../hardware/TactileSwitch.svelte";

  /**
   * ALLOY Mixer channel identity extension — Task 2.7.
   *
   * The Mixer's own section under a strip's head: what the Console strip
   * deliberately leaves out (plan §3) and the Mixer needs (plan §5a) — the
   * channel's instrument identity, its Prominence Tier and the desk's
   * channel SELECT. It is rendered INTO the approved strips through their
   * optional `identity` snippet (TrackStrip / StripModule, Task 2.7), so the
   * Mixer strips are the Console strips with one more section, not a second
   * strip design. Three rows, one height on every channel kind so the TRIM,
   * PAN, bay, fader and footer stay on the same lines across the bank:
   *
   *   row 1  a muted engraved print at the left — the track's source FAMILY,
   *          a Return's "RETURN", the bus's "BUS MASTER" — and, at the right,
   *          SEL: the approved cap-labelled TactileSwitch, its amber lamp
   *          lit on the selected channel (owner, D2.7.3). Selection is radio
   *          behaviour across the bank: pressing SEL selects this channel;
   *          pressing the lit SEL keeps it selected (a desk always has one
   *          channel in the detail panel).
   *   row 2  the bright engraved SOURCE print — the instrument name
   *          (Arrange's source type), a Return's effect — or a blank line.
   *   row 3  the owner's `control` snippet (the tracks' tier window and
   *          "needs confirmation" lamp), or a blank line of the same height.
   *
   * Family and source are printed, not chosen: the plan puts the
   * instrument-name combobox in Arrange and the Mixer (§5a), but the Mixer
   * strip is 144 px wide inside and the two windows do not fit beside the
   * controls; editing stays in Arrange (owner, D2.7.2). The prints are the
   * same data, read from the same fixture.
   *
   * Nothing here knows about audio or the project: `selected` and
   * `onselect` are the room's selection, the prints are strings.
   */
  let {
    kindPrint,
    kindTitle = null,
    sourcePrint = null,
    sourceTitle = null,
    channelName,
    selected,
    onselect,
    control = null,
  }: {
    /** Row 1, muted: the family / the channel kind. */
    kindPrint: string;
    kindTitle?: string | null;
    /** Row 2, bright: the source type / effect; null prints a blank line. */
    sourcePrint?: string | null;
    sourceTitle?: string | null;
    /** The channel's name, for the SEL switch's accessible name. */
    channelName: string;
    /** This channel is the one in the detail panel. */
    selected: boolean;
    onselect: () => void;
    /** Row 3 (the tracks' tier window and lamp); omitted = a blank line. */
    control?: Snippet | null;
  } = $props();

  // The SEL switch's own engaged state is bound so that it can be put back:
  // the approved switch toggles on every press, a desk's SELECT does not
  // unselect. The effect resyncs it whenever the room's selection moves.
  let sel = $state(false);
  $effect(() => {
    sel = selected;
  });

  function onSel(engaged: boolean): void {
    if (engaged) onselect();
    else sel = true;
  }
</script>

<div class="identity" data-mixer-identity data-selected={selected}>
  <!-- row 1 · FAMILY / kind · SEL -->
  <div class="identity__row identity__row--select">
    <span class="identity__kind" title={kindTitle ?? undefined} data-mixer-kind-print>
      <EngravedLabel text={kindPrint} size="xs" tone="muted" truncate />
    </span>
    <span class="identity__sel" data-mixer-select>
      <TactileSwitch
        variant="cap"
        label="Sel"
        lamp="amber"
        bind:engaged={sel}
        onToggle={onSel}
        name={`Select ${channelName}`}
      />
    </span>
  </div>

  <!-- row 2 · SOURCE (the instrument name) -->
  <div class="identity__row identity__row--source" data-mixer-source-print>
    {#if sourcePrint}
      <span class="identity__source" title={sourceTitle ?? undefined}>
        <EngravedLabel text={sourcePrint} size="sm" kind="value" truncate />
      </span>
    {:else}
      <span class="identity__blank" data-blank-line aria-hidden="true"></span>
    {/if}
  </div>

  <!-- row 3 · the tier window and its lamp, or a blank line -->
  <div class="identity__row identity__row--control" data-mixer-identity-control>
    {#if control}
      {@render control()}
    {:else}
      <span class="identity__blank" data-blank-line aria-hidden="true"></span>
    {/if}
  </div>
</div>

<style>
  .identity {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
  }

  .identity__row {
    display: flex;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  /* row 1: the print is centred on the switch's cap (the switch box includes
     the cap's 3 px lift, so its centre line is the cap's) */
  .identity__row--select {
    justify-content: space-between;
  }

  .identity__kind {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .identity__sel {
    flex: 0 0 auto;
    display: flex;
  }

  /* row 2: one line of the name's type */
  .identity__row--source {
    min-height: 1rem;
  }

  .identity__source {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  /* row 3: the xs scribble window's height (1.125rem) on every channel kind */
  .identity__row--control {
    min-height: 1.125rem;
  }

  .identity__blank {
    flex: 1 1 auto;
  }
</style>
