<script lang="ts">
  import { onMount } from "svelte";
  import AppToolbar from "./components/AppToolbar.svelte";
  import ChromeBand from "./components/ChromeBand.svelte";
  import MenuBar from "./components/MenuBar.svelte";
  import MiniTransport from "./components/MiniTransport.svelte";
  import RoomNav from "./components/RoomNav.svelte";
  import DevComponentsPage from "./dev/DevComponentsPage.svelte";
  import ArrangeRoom from "./rooms/ArrangeRoom.svelte";
  import ConsoleRoom from "./rooms/ConsoleRoom.svelte";
  import MixerRoom from "./rooms/MixerRoom.svelte";
  import HomeScreen from "./screens/HomeScreen.svelte";
  import { assets } from "./lib/project/assets.svelte";
  import { autosave } from "./lib/project/store.svelte";
  import SettingsScreen from "./screens/SettingsScreen.svelte";
  import {
    HOME_HREF,
    SETTINGS_HREF,
    routeFromHash,
    routeHref,
    type AppRoute,
    type RoomId,
  } from "./lib/rooms";

  let route = $state<AppRoute>(routeFromHash(window.location.hash));

  const room = $derived<RoomId | null>(
    route.kind === "room" ? route.room : null,
  );
  /** The shell's room flag. Set to the route's kind off the rooms ("dev" on
   *  the private playground, "home" / "settings" on the Task 4.1 screens) so
   *  none of the per-room shell rules (viewport pinning, room padding) apply
   *  there and those pages can scroll normally. */
  const activeRoom = $derived(room ?? (route.kind === "dev-components" ? "dev" : route.kind));

  function syncRouteFromHash(): void {
    route = routeFromHash(window.location.hash);
  }

  /* ---------------------------------------------------------------------------
     Task 9.2 (owner) — the top bar's actions.

     Import used to live only in the Arrange band. The owner asked for it in the
     toolbar and in File, keeping the Arrange band as well; so the picker itself
     moves here, once, and every entry point calls the same function. There is
     one hidden file input in the shell now, not one per surface, and pressing
     Import from any room imports into the open project.
     --------------------------------------------------------------------------- */
  let importInput: HTMLInputElement | undefined = $state();

  function requestImport(): void {
    if (!assets.attached) {
      importNotice =
        "Import needs the browser's project storage (IndexedDB), which is not available here — nothing was imported.";
      return;
    }
    importNotice = null;
    importInput?.click();
  }

  let importNotice = $state<string | null>(null);
  let importBusy = $state(false);

  async function onImportChange(): Promise<void> {
    const files = Array.from(importInput?.files ?? []);
    if (importInput) importInput.value = "";
    if (files.length === 0 || importBusy) return;
    importBusy = true;
    importNotice = null;
    try {
      await assets.importBatch(
        files.map((f) => ({ name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) })),
      );
    } catch (e) {
      importNotice = `Import stopped: ${e instanceof Error ? e.message : String(e)} — nothing from this batch was added.`;
    } finally {
      importBusy = false;
    }
  }

  function goHome(): void {
    window.location.hash = HOME_HREF;
  }

  function openSettings(): void {
    window.location.hash = SETTINGS_HREF;
  }

  onMount(() => {
    // Normalise the address to the route's canonical hash: "#/console/" →
    // "#/console", and the empty hash of a fresh visit → "#/" (Home).
    if (window.location.hash !== routeHref(route)) {
      history.replaceState(null, "", routeHref(route));
    }

    window.addEventListener("hashchange", syncRouteFromHash);

    /* Task 9.2 (owner): File > Import stems… and File > Save claim their
       standard accelerators. The project's own undo/redo handler lives in
       lib/project/shell.ts and is left untouched — this only adds the two the
       menus promise. Ctrl/Cmd is accepted either way so a Windows and a Mac
       user get the same binding. */
    function onShortcut(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "i") {
        event.preventDefault();
        requestImport();
      } else if (key === "s") {
        event.preventDefault();
        void autosave.save();
      }
    }
    window.addEventListener("keydown", onShortcut);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromHash);
      window.removeEventListener("keydown", onShortcut);
    };
  });
</script>

<div class="app-shell" data-active-room={activeRoom} data-route={route.kind}>
  <!--
    Task 9.2 (owner) — the top bar overhaul.

    Gone from this bar: the ALLOY wordmark, the 01/02/03 tab prefixes, and the
    Settings button. The wordmark previously carried the only link to Home; Home
    is now the fourth tab in RoomNav, so removing the name does not remove the
    route. Settings moves into the Help menu rather than being deleted.

    The bar is now: the menu bar, the toolbar, and the destination tabs.
  -->
  <header class="app-header">
    <ChromeBand label="Application bar">
      <div class="app-bar">
        <MenuBar onSettings={() => openSettings()} onHome={() => goHome()} onImport={() => requestImport()} />
        <AppToolbar onImport={() => requestImport()} />
        <div class="app-nav">
          <RoomNav room={room} onHome={route.kind === "home"} />
        </div>
      </div>
    </ChromeBand>
  </header>

  <!-- The one file picker in the shell (Task 9.2): the toolbar, File > Import
       stems… and Ctrl/Cmd+I all reach it. Hidden from layout and the tab order;
       it is the platform's control, driven by requestImport(). -->
  <input
    bind:this={importInput}
    class="app-import-input"
    type="file"
    multiple
    accept=".wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave"
    tabindex="-1"
    aria-hidden="true"
    data-import-input
    onchange={onImportChange}
  />
  {#if importNotice}
    <p class="app-notice" role="status" aria-live="polite" data-import-notice>{importNotice}</p>
  {/if}

  <main class="room-host" id="main">
    {#if room === "console"}
      <ConsoleRoom />
    {:else if room === "arrange"}
      <ArrangeRoom />
    {:else if room === "mixer"}
      <MixerRoom />
    {:else if route.kind === "settings"}
      <SettingsScreen />
    {:else if route.kind === "home"}
      <HomeScreen />
    {:else}
      <DevComponentsPage />
    {/if}
  </main>

  <!-- Rendered once, outside the room switch, so the transport is never
       remounted and never moves when the room changes. -->
  <MiniTransport />
</div>

<style>
  /* The header's second column (app.css: `auto minmax(0, 1fr)`): the room
     tabs and the application link share it, pushed to the right edge as the
     tabs were alone. The tab list keeps its own wrapping. */
  /* The shell's own file input and import notice (Task 9.2). */
  .app-import-input {
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

  .app-notice {
    margin: 0.5rem 1rem 0;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--al-material-metal);
    background: var(--al-material-surface);
    color: var(--al-text-primary);
    font-size: 0.8125rem;
  }

  /*
    Task 9.3 (owner): one row, reading left to right as
    menus → tool buttons → tab buttons, as ordered. The tabs are pushed to the
    right edge of that row so the eye still ends on the destinations, and the
    whole row is a single thin line of caps rather than a grey toolbar block.
  */
  .app-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.75rem;
    width: 100%;
    min-width: 0;
  }

  .app-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
    min-width: 0;
    max-width: 100%;
  }

</style>
