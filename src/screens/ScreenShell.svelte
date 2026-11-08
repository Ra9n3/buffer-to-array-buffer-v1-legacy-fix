<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The page frame of the Home / Settings screens — Task 4.1.
   *
   * The rooms' identification band (RoomShell + app.css, at the Mixer's
   * compact sizes) over a scrolling column of panels. Not a room: no room
   * id, no viewport pinning (App sets the shell's room flag to the screen's
   * kind, so no per-room rule applies); the page scrolls when a panel
   * column is taller than the window, the mini transport staying where it
   * is.
   */
  let {
    screenId,
    title,
    purpose,
    children,
  }: {
    screenId: "home" | "settings";
    title: string;
    purpose: string;
    children?: Snippet;
  } = $props();
</script>

<section class="screen" data-screen={screenId} aria-labelledby="{screenId}-title">
  <header class="screen__header">
    <h1 class="screen__title" id="{screenId}-title">{title}</h1>
    <p class="screen__purpose">{purpose}</p>
  </header>
  <div class="screen__canvas">
    {@render children?.()}
  </div>
</section>

<style>
  .screen {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    max-width: 64rem;
    margin: 0 auto;
  }

  /* the rooms' band (app.css .room__header) at the Mixer's compact sizes */
  .screen__header {
    min-width: 0;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--al-bevel-shadow);
    background: var(--al-material-surface);
  }

  .screen__title {
    margin: 0;
    font-size: 1.0625rem;
    line-height: 1.2;
  }

  .screen__purpose {
    margin: 0.125rem 0 0;
    font-size: 0.8125rem;
    color: #454545;
    overflow-wrap: break-word;
  }

  .screen__canvas {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-lg);
    min-width: 0;
  }
</style>
