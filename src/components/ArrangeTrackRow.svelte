<script module lang="ts">
  /** Unique per-instance id prefix for the row's labelled name. */
  let nextId = 0;
</script>

<script lang="ts">
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import ScribbleSelect from "./hardware/ScribbleSelect.svelte";
  import { SIMULATED, orgToken } from "./channel-strip/track-strip-fixtures";
  import {
    FAMILY_OPTIONS,
    PROMINENCE_TIERS,
    SOURCE_TYPES,
    UNSPECIFIED_ID,
    isValidSource,
    role,
    sourceOptionsOf,
    type ArrangeTrack,
    type FamilyId,
    type ProminenceTier,
    type SourceType,
  } from "../lib/arrange";
  import type { TrackMetaLive } from "./arrange-row-live";
  import type { TrackAudio } from "../lib/project/model";
  import type { AudioStatus } from "../lib/project/assets.svelte";

  /**
   * ALLOY Arrange track-list row — Task 2.5 (Phase 2 skin of the Task 0.4 cell).
   *
   * A direct grid child of the Arrange grid, so it always shares its grid row
   * with exactly one timeline lane (Task 0.4; the lane is untouched until
   * Task 2.6). Three compact lines on the approved charcoal panel, divided
   * from the next row by the strips' machined rule:
   *
   *   1  the flat organisational-colour tab (D2.2.13), the track number, the
   *      engraved name (truncating, titled) — the Console strip's identity
   *      head, so a track reads the same in every room;
   *   2  the source: two scribble-window comboboxes (plan §5a) — the SOURCE
   *      TYPE at the left, printing the current source type (the stable
   *      identity the future mixing rules will read) and offering its
   *      family's sources plus "Unspecified", and the FAMILY at the right
   *      (the eleven broad categories), stacked over the tier window.
   *      Changing the family offers that family's sources; a source that is
   *      not among them is cleared to Unspecified — never replaced by a
   *      default, nothing is classified (Task 2.5 follow-ups). The track's
   *      display name is read here and never written: it is not the source;
   *   3  the role, an engraved print (plan §5: musical function, not edited
   *      here), and at the right the Prominence Tier window (plan §5a: three
   *      tiers, mix-conflict treatment). Role and tier are two unrelated axes
   *      (glossary): one is a print, the other a control, and the column
   *      header names them in order.
   *
   * State: the family, source type and tier choices are the project's —
   * since Task 3.1 the room binds the row to the shared store's view of the
   * track (`live`), so a choice here is the one the Mixer prints; without
   * `live` they are the row's own UI state, seeded from the fixture, as
   * approved in Task 2.5. Nothing is detected, persisted or routed. The org
   * colour reaches only the tab.
   */
  let {
    track,
    laneId,
    sources = SOURCE_TYPES,
    live = null,
    audio = null,
    padded = false,
    audioStatus = null,
  }: {
    track: ArrangeTrack;
    laneId: string;
    /** The source catalog; the fixture catalog unless the playground stresses it. */
    sources?: readonly SourceType[];
    /**
     * Task 3.1 (optional, default none): one object that OWNS the row's
     * family, source type and tier — the room passes the project store's
     * view of the track (`trackMeta`). Without it the row keeps those
     * settings itself, seeded from `track`, exactly as approved (the
     * component playground passes nothing).
     */
    live?: TrackMetaLive | null;
    /**
     * Task 5.1 (optional, default none): the imported stem behind the track
     * — the row prints the plan's flags after the name (MONO, SILENT) and
     * the two the project knows (PADDED: shorter than the longest stem,
     * padded at render; MISSING: the stored copy is not there). A fixture
     * track passes nothing and prints nothing; nothing else on the row
     * changes.
     */
    audio?: Pick<TrackAudio, "channels" | "silent"> | null;
    padded?: boolean;
    audioStatus?: AudioStatus | null;
  } = $props();

  const uid = `ar${++nextId}`;

  /** The stamps after the name, in a fixed order — short, muted, titled. */
  const stamps = $derived.by((): readonly { id: string; text: string; title: string }[] => {
    if (!audio) return [];
    const list: { id: string; text: string; title: string }[] = [];
    if (audio.channels === 1) list.push({ id: "mono", text: "MONO", title: "Mono stem: played on both sides" });
    if (audio.silent) list.push({ id: "silent", text: "SILENT", title: "Silent stem: kept, left out of analysis" });
    if (padded) list.push({ id: "padded", text: "PADDED", title: "Shorter than the longest stem: padded with silence to its length" });
    if (audioStatus === "missing") list.push({ id: "missing", text: "MISSING", title: "The stored copy of this stem is missing or is not the file that was imported" });
    return list;
  });

  // The row's own settings when nothing is bound (the approved Task 2.5
  // local interaction), seeded once from the fixture. Family and source type
  // are two settings with one invariant: a source is null (Unspecified) or
  // belongs to the family shown. The name (`track.name`) is read only.
  // svelte-ignore state_referenced_locally
  const own = $state<TrackMetaLive>({
    familyId: track.familyId,
    sourceTypeId: track.sourceTypeId,
    tier: track.tier,
    tierConfirmed: track.tierConfirmed !== false,
  });
  const model = $derived(live ?? own);

  const sourceOptions = $derived(sourceOptionsOf(model.familyId, sources));
  const theRole = $derived(role(track.role));
  const tierName = $derived(PROMINENCE_TIERS.find((t) => t.id === model.tier)?.name ?? model.tier);

  /** A new family: keep the source only if it belongs there, else clear it to Unspecified. */
  function chooseFamily(id: string): void {
    const family = id as FamilyId;
    if (family === model.familyId) return;
    model.familyId = family;
    // the invariant, for an owner that does not enforce it itself (the store does)
    if (!isValidSource(family, model.sourceTypeId, sources)) model.sourceTypeId = null;
  }

  /** A source from the family's list; the Unspecified option clears it. */
  function chooseSource(id: string): void {
    model.sourceTypeId = id === UNSPECIFIED_ID ? null : id;
  }

  /**
   * A tier from the three — `onchoose`, so choosing the tier already shown
   * is a choice too: the user's choice of a tier confirms a suggested one
   * (owner, Task 3.1), and the owner of the setting (the store) records that.
   */
  function chooseTier(id: string): void {
    model.tier = id as ProminenceTier;
  }
</script>

<div
  class="row"
  role="group"
  aria-labelledby={`${uid}-name`}
  data-arrange-region="track-row"
  data-track-code={track.code}
  data-lane={laneId}
  data-track-role={track.role}
  data-track-family={model.familyId}
  data-track-source-type={model.sourceTypeId}
  data-track-tier={model.tier}
  data-track-audio={audio ? "imported" : "none"}
  data-simulated={audio ? false : SIMULATED}
>
  <!-- 1 · identity: tab, number, name (Task 5.1: then the stem's stamps, if any) -->
  <div class="row__ident">
    <span class="row__tab" style:--org={orgToken(track.org)} data-org-tab={String(track.org)} aria-hidden="true"></span>
    <EngravedLabel text={track.code} size="sm" kind="value" tone="muted" title={`Track ${track.code}`} />
    <span class="row__name">
      <EngravedLabel id={`${uid}-name`} text={track.name} size="md" kind="value" tone="bright" truncate />
    </span>
    {#if stamps.length > 0}
      <span class="row__stamps" data-track-stamps={stamps.map((s) => s.id).join(" ")}>
        {#each stamps as stamp (stamp.id)}
          <span class="row__stamp" class:is-warning={stamp.id === "missing"} data-track-stamp={stamp.id} title={stamp.title}>
            <EngravedLabel text={stamp.text} size="xs" tone="muted" />
          </span>
        {/each}
      </span>
    {/if}
  </div>

  <!-- 2 · source type (the family's sources, or Unspecified) · family -->
  <div class="row__source-line">
    <span class="row__source">
      <ScribbleSelect
        label="Source type"
        context={track.name}
        options={sourceOptions}
        value={model.sourceTypeId ?? UNSPECIFIED_ID}
        onchange={chooseSource}
        disabled={model.familyId === null}
        size="sm"
        align="start"
        hook="source"
      />
    </span>
    <span class="row__family">
      <ScribbleSelect
        label="Family"
        context={track.name}
        options={FAMILY_OPTIONS}
        value={model.familyId ?? ""}
        onchange={chooseFamily}
        size="sm"
        hook="family"
      />
    </span>
  </div>

  <!-- 3 · role (print) · prominence tier (control) -->
  <div class="row__meta">
    <span class="row__role" title={`Role: ${theRole.long} \u2014 the track's musical function`} data-track-role-print>
      <EngravedLabel text={theRole.name} size="sm" />
    </span>
    <span class="row__tier">
      <ScribbleSelect
        label="Prominence tier"
        context={track.name}
        options={PROMINENCE_TIERS}
        value={model.tier}
        onchoose={chooseTier}
        size="xs"
        hook="tier"
        title={`Prominence tier, ${track.name}: ${tierName} \u2014 how the track is treated in mix conflicts`}
      />
    </span>
  </div>
</div>

<style>
  /* The cell: sticky at the left of the shared scroller (Task 0.4), the
     height every row and lane share, the Phase 0 padding (4 px 8 px — the
     Task 0.5 track-header values, as tokens). The face is the approved
     panel: charcoal with the strips' fine brushed grain; a machined rule
     above each row (the dark groove and its lit lower wall, the strip's
     section rule) and a dark seam at the right where the list meets the
     timeline. */
  .row {
    position: sticky;
    left: 0;
    z-index: 2;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--al-space-2xs);
    min-width: 0;
    height: var(--arrange-row-height);
    padding: var(--al-space-2xs) var(--al-space-sm);
    border-top: 1px solid var(--al-bevel-shadow);
    background-color: var(--al-material-panel);
    background-image: repeating-linear-gradient(
      92deg,
      rgba(255, 255, 255, 0.012) 0 1px,
      rgba(0, 0, 0, 0.012) 1px 2px
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.045),
      inset -1px 0 0 rgba(0, 0, 0, 0.62);
    user-select: none;
    -webkit-user-select: none;
  }

  /* A row with its list open paints above the rows beneath it. */
  .row:has(:global([aria-expanded="true"])) {
    z-index: 3;
  }

  /* --- 1 · identity (the strip head's name row) ---------------------------- */
  .row__ident {
    display: flex;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
    min-height: 1.125rem;
  }

  /* The organisational colour tab (spec §7): a small flat tab of the swatch
     colour beside the name — no gloss, no highlight, no shadow (D2.2.13).
     The colour never touches the panel. */
  .row__tab {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 1rem;
    border-radius: 1px;
    background-color: var(--org);
  }

  .row__name {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Task 5.1: the stem's stamps after the name — the panel's small muted
     print, never a colour (the name truncates before they do; MISSING is
     the one warning, marked by the rule under it, not by a colour on the print) */
  .row__stamps {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--al-space-2xs);
    align-items: center;
  }

  .row__stamp {
    display: inline-flex;
    padding-bottom: 1px;
  }

  .row__stamp.is-warning {
    border-bottom: 1px solid var(--al-function-red-base);
  }

  /* --- 2 · source type · family -------------------------------------------- */
  .row__source-line {
    display: flex;
    align-items: center;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  /* the source type takes the line; the family window is the tier window's
     width, stacked over it — 5.75rem (92 px) since PERCUSSION joined the
     families: the longest family word at the 11 px print needs 70.5 px of
     text room, and the 5.5rem window had 70 */
  .row__source {
    flex: 1 1 auto;
    min-width: 0;
  }

  .row__family {
    flex: 0 0 5.75rem;
    min-width: 0;
  }

  .row__source > :global(.select),
  .row__family > :global(.select) {
    width: 100%;
  }

  /* --- 3 · role · tier ------------------------------------------------------ */
  .row__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .row__role {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    line-height: 1; /* the line is the tier window's 18 px, not the page's strut */
    white-space: nowrap;
  }

  /* the tier window keeps one width whatever it prints — the family window's
     column (5.75rem) */
  .row__tier {
    flex: 0 0 5.75rem;
    min-width: 0;
  }

  .row__tier > :global(.select) {
    width: 100%;
  }

  @media (max-width: 40rem) {
    /* the compact row (Task 0.4): the three lines close up */
    .row {
      gap: 1px;
    }
  }
</style>
