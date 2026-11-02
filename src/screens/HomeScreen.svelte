<script lang="ts">
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import { lifecycle, type RecentView } from "../lib/project/lifecycle";
  import { project } from "../lib/project/store.svelte";
  import { TEMPLATE_LABELS } from "../lib/project/templates";
  import { roomHref } from "../lib/rooms";
  import ActionKey from "./ActionKey.svelte";
  import FirstRunGuide from "./FirstRunGuide.svelte";
  import Print from "./Print.svelte";
  import ScreenPanel from "./ScreenPanel.svelte";
  import ScreenShell from "./ScreenShell.svelte";

  /**
   * HOME — Task 4.1 (owner, D4.1.1 / D4.1.2 / D4.1.3).
   *
   * The start screen: the project that is open now, the way to start empty,
   * the recent projects as the lifecycle finds them in storage — each one
   * judged (open now · ready · unavailable, with the reason) so nothing is
   * offered that cannot be opened — and, until it is skipped or finished,
   * the first-run guide. Every action reports what it did in the status
   * line; nothing navigates away by itself (the rooms are one click away in
   * the header, and the project just opened or started is what they show).
   */

  /** Bumped after every action that changed storage, so the list is read again. */
  let version = $state(0);
  const recent = $derived.by<RecentView[]>(() => {
    void version;
    void project.id;
    return lifecycle.recent();
  });

  let notice = $state<{ readonly tone: "ok" | "warn"; readonly text: string } | null>(null);

  const summary = $derived(
    project.isEmpty
      ? "Empty: no tracks, Returns or buses yet"
      : `${count(project.tracks.length, "track")} · ${count(project.returns.length, "Return")} · ${count(project.buses.length, "bus", "buses")}`,
  );

  function count(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  function formatOpened(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function startEmpty(): void {
    const result = lifecycle.startEmpty();
    notice = result.stored
      ? { tone: "ok", text: `Started “${result.name}” — it is open now in every room.` }
      : { tone: "warn", text: `Started “${result.name}”, but it could not be saved: ${result.error ?? "unknown error"}.` };
    version++;
  }

  function open(view: RecentView): void {
    const result = lifecycle.open(view.entry.id);
    if (result.ok) {
      const kept = result.skipped.length === 0 ? "" : ` ${result.skipped.length} saved ${result.skipped.length === 1 ? "value was" : "values were"} not valid and kept the default.`;
      notice = { tone: result.skipped.length === 0 ? "ok" : "warn", text: `Opened “${project.name}” (${result.applied} saved values applied).${kept}` };
    } else {
      notice = { tone: "warn", text: `Could not open “${view.entry.name}”: ${result.detail}.` };
    }
    version++;
  }
</script>

<ScreenShell screenId="home" title="Home" purpose="Reopen a recent project or start empty. The project you open is the one every room shows.">
  <FirstRunGuide />

  <div class="home__row">
    <ScreenPanel title="Open now" id="home-current-title" hook="current">
      <div class="current" data-home-current={project.id}>
        <div class="current__name">
          <EngravedLabel text={project.name} size="md" kind="value" tone="bright" truncate />
          <EngravedLabel text={TEMPLATE_LABELS[project.template]} size="xs" tone="muted" />
        </div>
        <EngravedLabel text={summary} size="xs" tone="muted" />
        <nav class="current__rooms" aria-label="Rooms of the open project">
          <a class="current__room" href={roomHref("arrange")} data-home-room="arrange"><EngravedLabel text="Arrange" size="xs" kind="value" /></a>
          <a class="current__room" href={roomHref("console")} data-home-room="console"><EngravedLabel text="Console" size="xs" kind="value" /></a>
          <a class="current__room" href={roomHref("mixer")} data-home-room="mixer"><EngravedLabel text="Mixer" size="xs" kind="value" /></a>
        </nav>
      </div>
    </ScreenPanel>

    <ScreenPanel title="Start" id="home-start-title" note="A new project under a new name, with nothing in it: Master only. Import stems in Arrange." hook="start">
      <div class="start">
        <ActionKey label="Start empty" name="Start an empty project" hook="start-empty" onpress={startEmpty} />
      </div>
    </ScreenPanel>
  </div>

  <ScreenPanel title="Recent projects" id="home-recent-title" hook="recent">
    {#if recent.length === 0}
      <Print
        text={lifecycle.storage ? "No recent projects yet." : "Storage is not available in this browser, so recent projects cannot be kept."}
        tone="muted"
      />
      <span hidden data-home-recent-empty></span>
    {:else}
      <ul class="recent" data-home-recent>
        {#each recent as view (view.entry.id)}
          <li class="recent__row" data-home-entry={view.entry.id} data-home-entry-status={view.status.kind}>
            <div class="recent__ident">
              <EngravedLabel text={view.entry.name} size="sm" kind="value" truncate />
              <EngravedLabel text={`${TEMPLATE_LABELS[view.entry.template]} · opened ${formatOpened(view.entry.openedAt)}`} size="xs" tone="muted" truncate />
            </div>
            <div class="recent__state">
              {#if view.status.kind === "current"}
                <EngravedLabel text="Open now" size="xs" tone="bright" />
              {:else if view.status.kind === "ready"}
                <ActionKey label="Open" name={`Open ${view.entry.name}`} hook="open" onpress={() => open(view)} />
              {:else}
                <span class="recent__unavailable" data-home-unavailable={view.status.reason}>
                  <Print as="span" text={`Unavailable — ${view.status.detail.toLowerCase()}`} tone="muted" />
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </ScreenPanel>

  <!-- the status line: a readout band like the screen's header (light, dark
       print, the shell's greys), present but empty until an action reports -->
  <div class="home__status" class:is-set={notice !== null} role="status" aria-live="polite" data-home-status={notice?.tone ?? "none"}>
    {#if notice}
      <p class="home__status-text">{notice.text}</p>
    {/if}
  </div>
</ScreenShell>

<style>
  .home__row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(14rem, 1fr);
    gap: var(--al-space-lg);
    min-width: 0;
  }

  @media (max-width: 44rem) {
    .home__row {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .current {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
  }

  .current__name {
    display: flex;
    flex-wrap: wrap;
    gap: var(--al-space-2xs) var(--al-space-sm);
    align-items: baseline;
    min-width: 0;
  }

  .current__rooms {
    display: flex;
    flex-wrap: wrap;
    gap: var(--al-space-sm);
    padding-top: var(--al-space-2xs);
  }

  /* a room link: a small raised plate of the panel's metal trim, engraved */
  .current__room {
    display: inline-flex;
    align-items: center;
    padding: var(--al-space-2xs) var(--al-space-sm);
    border-radius: 2px;
    background-color: var(--al-material-surface-raised);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      0 1px 2px rgba(0, 0, 0, 0.4);
    text-decoration: none;
  }

  .current__room:hover {
    background-color: color-mix(in srgb, var(--al-material-surface-raised) 85%, var(--al-material-cream));
  }

  .start {
    display: flex;
    align-items: flex-start;
  }

  .recent {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .recent__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--al-space-md);
    align-items: center;
    min-width: 0;
    min-height: 3rem;
    padding: var(--al-space-xs) 0;
    border-bottom: 1px solid var(--al-separator);
  }

  .recent__row:last-child {
    border-bottom: 0;
  }

  .recent__ident {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-3xs);
    min-width: 0;
  }

  .recent__state {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }

  .recent__unavailable {
    display: inline-flex;
    max-width: 18rem;
    text-align: end;
  }

  .home__status {
    min-height: 1.25rem;
    min-width: 0;
  }

  .home__status.is-set {
    padding: 0.375rem 0.75rem;
    border: 1px solid #a3a3a3;
    background: #efefef;
  }

  .home__status-text {
    margin: 0;
    color: #454545;
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    overflow-wrap: break-word;
  }

  /* a warning reads as one: the shell's warning red on the band's edge only, never on the print */
  .home__status[data-home-status="warn"].is-set {
    border-color: var(--al-function-red-base);
  }
</style>
