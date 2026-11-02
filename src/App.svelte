<script lang="ts">
  import { onMount } from "svelte";
  import MiniTransport from "./components/MiniTransport.svelte";
  import RoomNav from "./components/RoomNav.svelte";
  import DevComponentsPage from "./dev/DevComponentsPage.svelte";
  import ArrangeRoom from "./rooms/ArrangeRoom.svelte";
  import ConsoleRoom from "./rooms/ConsoleRoom.svelte";
  import MixerRoom from "./rooms/MixerRoom.svelte";
  import HomeScreen from "./screens/HomeScreen.svelte";
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

  onMount(() => {
    // Normalise the address to the route's canonical hash: "#/console/" →
    // "#/console", and the empty hash of a fresh visit → "#/" (Home).
    if (window.location.hash !== routeHref(route)) {
      history.replaceState(null, "", routeHref(route));
    }

    window.addEventListener("hashchange", syncRouteFromHash);

    return () => window.removeEventListener("hashchange", syncRouteFromHash);
  });
</script>

<div class="app-shell" data-active-room={activeRoom} data-route={route.kind}>
  <header class="app-header">
    <!-- The wordmark is the way Home (Task 4.1, owner D4.1.3). -->
    <a class="app-brand" href={HOME_HREF} aria-current={route.kind === "home" ? "page" : undefined}>ALLOY</a>
    <div class="app-nav">
      <RoomNav room={room} />
      <!-- Settings is not a room: it stands beside the room tabs, in its own
           landmark, with no room index. -->
      <nav class="app-nav__application" aria-label="Application">
        <a
          class="room-nav__link app-nav__settings"
          class:is-active={route.kind === "settings"}
          href={SETTINGS_HREF}
          aria-current={route.kind === "settings" ? "page" : undefined}
          data-app-link="settings"
        >
          Settings
        </a>
      </nav>
    </div>
  </header>

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
  .app-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
    justify-content: flex-end;
    justify-self: end;
    min-width: 0;
    max-width: 100%;
  }

  .app-nav__application {
    display: flex;
    min-width: 0;
  }
</style>
