<script lang="ts">
  import ArrangeTimelineHeader from "../components/ArrangeTimelineHeader.svelte";
  import ArrangeTimelineLane from "../components/ArrangeTimelineLane.svelte";
  import ArrangeTrackRow from "../components/ArrangeTrackRow.svelte";
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { arrangeTrackOf, project, trackMeta } from "../lib/project/store.svelte";

  /* Task 3.1: the room reads the one project store — the same tracks the
     Console and Mixer read, in the session's order — and binds each row's
     family / source / tier to the store's view of its track. The
     arrangement (bars, tempo, sections, waveform placeholders) is the
     project's fixture-backed display data, read from the same store.

     Task 4.1: an empty project (no channels at all, owner D4.1.2) has no
     arrangement to show — no tracks, no bars, no markers — so the room shows
     the explicit empty state in place of the scroller and grid. */
  const tracks = $derived(project.tracks);
  const arrangement = $derived(project.arrangement);
</script>

<RoomShell
  roomId="arrange"
  title="Arrange"
  purpose="Import and organize the session."
  hideHeader
>
  <div class="arrange-room" style:--arrange-bar-count={arrangement.barCount} data-arrange-room>
    {#if project.isEmpty}
      <div class="arrange-empty">
        <EmptyProjectNotice headingId="arrange-empty-title" room="arrange" />
      </div>
    {:else}
    <!-- One scroller drives both axes. The grid inside it holds the track-list
         column and the timeline in shared grid rows, so a track row and its
         lane are the same grid row and cannot drift apart. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="arrange-scroll"
      data-arrange-scroll
      role="region"
      tabindex="0"
      aria-label="Arrange track list and timeline, scrolls vertically and horizontally"
    >
      <div class="arrange-grid" data-arrange-grid>
        <!-- The track list's header: the panel's engraved legends, laid out
             as the row's lines are, so each sits over the field it names —
             SOURCE over the source-type windows (the full print SOURCE TYPE
             is 87 px at xs and the legend's room at the 12rem list floor is
             176 − 92 − 6 = 78 px; the selector itself is still labelled
             "Source type", as INSTRUMENT stood over the name window before)
             and FAMILY over the family windows, ROLE over the role prints and
             TIER over the tier windows (Task 2.5 and its follow-ups). The
             name needs none. -->
        <div
          class="arrange-corner"
          data-arrange-region="track-list-header"
          aria-hidden="true"
        >
          <EngravedLabel text="Track list" size="sm" as="p" />
          <div class="arrange-corner__legend" data-arrange-legend>
            <div class="arrange-corner__legend-line">
              <EngravedLabel text="Source" size="xs" tone="muted" as="p" />
              <span class="arrange-corner__tier-legend">
                <EngravedLabel text="Family" size="xs" tone="muted" as="p" align="center" />
              </span>
            </div>
            <div class="arrange-corner__legend-line">
              <EngravedLabel text="Role" size="xs" tone="muted" as="p" />
              <span class="arrange-corner__tier-legend">
                <EngravedLabel text="Tier" size="xs" tone="muted" as="p" align="center" />
              </span>
            </div>
          </div>
        </div>

        <!-- The timeline's head: bar ruler, tempo track, structure markers
             (Task 0.4 order; Task 2.6 skin) — sticky at the top beside the
             corner, the same 2 px baseline. -->
        <ArrangeTimelineHeader barCount={arrangement.barCount} tempoMarkers={arrangement.tempoMarkers} />

        {#each tracks as track (track.id)}
          <ArrangeTrackRow track={arrangeTrackOf(track.id)} live={trackMeta(track.id)} laneId={`lane-${track.code}`} />
          <ArrangeTimelineLane code={track.code} laneId={`lane-${track.code}`} name={track.name} org={track.org} clips={arrangement.clips[track.id] ?? []} />
        {/each}
      </div>
    </div>
    {/if}

  </div>
</RoomShell>

<style>
  /* Task 4.1: the empty project's notice sits where the scroller would, at
     the room's own padding; the room keeps its height so nothing shifts. */
  .arrange-empty {
    display: flex;
    padding: 0.75rem;
  }

  .arrange-room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    /* Fill the room canvas exactly. The Arrange room header is visually hidden
       and the canvas is a single 1fr grid row, so the canvas already has a
       definite height tied to the viewport — no measured chrome constant is
       needed, and the workspace cannot fall short of the available space or
       push the page taller. min-height keeps it usable on very short viewports. */
    height: 100%;
    min-height: 22rem;
    /* Shared geometry. Both the track rows and the timeline lanes take their
       height from --arrange-row-height, and the timeline header spans exactly
       --arrange-timeline-width, so rows and lanes stay aligned by construction. */
    /* Row / lane height. Owner requirement: the lane must be tall enough to
       carry a stereo waveform and audio editing later, so it is sized for that
       future content rather than for the current single text label.
       5rem = 80px gives two 30px+ halves with margin between them.
       Single value — every track row and timeline lane inherits it, so
       alignment cannot be affected by changing it. */
    --arrange-row-height: 5rem;
    /* The list column: 16vw between 12rem and 15rem. Task 2.5 raised the
       floor from 10rem to 12rem (192 px, owner D2.5.3) so the skinned row's
       source/family line and role/tier line keep their room at 1024 and 768. */
    --arrange-track-list-width: clamp(12rem, 16vw, 15rem);
    /* Horizontal scale (Task 2.6): ONE bar width places every ruler mark,
       every lane grid line and every clip edge; the timeline's width is the
       bar count times it (56 × 44 px = 2464 px — Task 0.4's 2400 px rounded
       to whole bars so marks land on whole pixels). --arrange-bar-count is
       set inline from ARRANGE_BAR_COUNT. 2.75rem = 44 px: a beat is 11 px,
       the finest tick the ruler draws. */
    --arrange-bar-width: 2.75rem;
    --arrange-timeline-width: calc(var(--arrange-bar-count) * var(--arrange-bar-width));
    /* Ruler and structure bands are compact reference strips (22px).
       The tempo band is taller because it holds a real timeline (tempo values
       over bars) rather than a single label row. */
    --arrange-band-height: 1.375rem;
    --arrange-tempo-height: 2.25rem;
  }

  /* the workspace: a recessed bay in the panel holding the work surface the
     lanes sit on (Task 2.6 — the Phase 0 dashed frame and white field go);
     the browser's scrollbars take the dark scheme so they sit on the surface */
  .arrange-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--al-bevel-shadow);
    background-color: var(--al-material-surface);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
    color-scheme: dark;
  }

  .arrange-grid {
    display: grid;
    grid-template-columns: var(--arrange-track-list-width) var(--arrange-timeline-width);
    grid-template-rows: auto;
    grid-auto-rows: var(--arrange-row-height);
    width: max-content;
    min-width: 100%;
  }

  /* The corner: the list column's panel head — the same charcoal and grain
     as the rows (ArrangeTrackRow.svelte), the header baseline kept at its
     Phase 0 thickness so the first row and lane still share one top edge. */
  .arrange-corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 4;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.125rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-bottom: 2px solid rgba(0, 0, 0, 0.62);
    background-color: var(--al-material-panel);
    background-image:
      radial-gradient(
        140% 70% at 22% 0%,
        rgba(255, 255, 255, 0.06) 0%,
        rgba(255, 255, 255, 0.012) 40%,
        rgba(0, 0, 0, 0.2) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset -1px 0 0 rgba(0, 0, 0, 0.62);
  }

  /* the legends: the row's lines 2 and 3, the family and tier legends as
     wide as the row's family / tier windows (ArrangeTrackRow.svelte
     .row__family, .row__tier — 5.75rem, one column) and centred on them */
  .arrange-corner__legend {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    margin-top: 0.125rem;
  }

  .arrange-corner__legend-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .arrange-corner__tier-legend {
    flex: 0 0 5.75rem;
    min-width: 0;
  }


  @media (max-width: 40rem) {
    .arrange-room {
      /* the row's three lines need the 12rem floor even here (Task 2.5) */
      --arrange-track-list-width: 12rem;
      --arrange-row-height: 4.25rem;
    }
  }
</style>
