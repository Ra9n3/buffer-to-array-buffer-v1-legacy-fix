<script lang="ts">
  import { project } from "../lib/project/store.svelte";
  import { HOME_HREF } from "../lib/rooms";
  import EngravedLabel from "./hardware/EngravedLabel.svelte";

  /**
   * A room's explicit empty state — Task 4.1 (owner, D4.1.2).
   *
   * Shown by the Console, Arrange and Mixer in place of their channel
   * surfaces when the open project has no channels at all (an empty project:
   * Master only). It says what the project is, why it is empty in this
   * build, and where to go — nothing is drawn that is not there.
   */
  let {
    headingId,
    room,
  }: {
    /** The id the room's section is labelled by (the zone heading the surface would have rendered). */
    headingId: string;
    room: "console" | "arrange" | "mixer";
  } = $props();

  const WHAT: Readonly<Record<typeof room, string>> = {
    console: "No channel strips to show",
    arrange: "No tracks to arrange",
    mixer: "No channels to inspect",
  };

  /* Task 5.1: where tracks come from now — the Arrange room's import band
     (the plan's §3 workflow); the other rooms point there. */
  const HOW: Readonly<Record<typeof room, string>> = {
    console: "Import stems in Arrange to add tracks.",
    arrange: "Import stems above to add tracks.",
    mixer: "Import stems in Arrange to add tracks.",
  };
</script>

<div class="empty" data-empty-project={room}>
  <EngravedLabel as="h2" id={headingId} text="Empty project" size="sm" />
  <p class="empty__text">“{project.name}” has no tracks, Returns or buses yet — {WHAT[room].toLowerCase()}. {HOW[room]}</p>
  <p class="empty__link">
    <a href={HOME_HREF} data-empty-project-home><EngravedLabel text="Home: reopen a recent project or start another" size="xs" kind="value" /></a>
  </p>
</div>

<style>
  .empty {
    --em-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    align-self: flex-start;
    min-width: 0;
    max-width: 40rem;
    padding: var(--al-space-xs) var(--al-space-md) var(--al-space-md);
    border-radius: 4px;
    background-color: var(--al-material-panel);
    background-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--em-trim) 1px, var(--em-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      0 2px 4px rgba(0, 0, 0, 0.35);
  }

  .empty__text {
    margin: 0;
    color: var(--al-text-secondary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    overflow-wrap: break-word;
  }

  .empty__link {
    margin: 0;
  }

  .empty__link a {
    text-decoration: none;
  }
</style>
