<script lang="ts">
  import { onMount } from "svelte";
  import MiniTransport from "./components/MiniTransport.svelte";
  import RoomNav from "./components/RoomNav.svelte";
  import DevComponentsPage from "./dev/DevComponentsPage.svelte";
  import ArrangeRoom from "./rooms/ArrangeRoom.svelte";
  import ConsoleRoom from "./rooms/ConsoleRoom.svelte";
  import MixerRoom from "./rooms/MixerRoom.svelte";
  import {
    routeFromHash,
    roomHref,
    type AppRoute,
    type RoomId,
  } from "./lib/rooms";

  let route = $state<AppRoute>(routeFromHash(window.location.hash));

  const room = $derived<RoomId | null>(
    route.kind === "room" ? route.room : null,
  );
  /** The shell's room flag. Set to "dev" on the private playground so none of
   *  the per-room shell rules (viewport pinning, room padding) apply there and
   *  the token page can scroll normally. */
  const activeRoom = $derived(room ?? "dev");

  function syncRouteFromHash(): void {
    route = routeFromHash(window.location.hash);
  }

  onMount(() => {
    if (route.kind === "room" && window.location.hash !== roomHref(route.room)) {
      history.replaceState(null, "", roomHref(route.room));
    }

    window.addEventListener("hashchange", syncRouteFromHash);

    return () => window.removeEventListener("hashchange", syncRouteFromHash);
  });
</script>

<div class="app-shell" data-active-room={activeRoom} data-route={route.kind}>
  <header class="app-header">
    <a class="app-brand" href={roomHref("console")}>ALLOY</a>
    <RoomNav room={room} />
  </header>

  <main class="room-host" id="main">
    {#if room === "console"}
      <ConsoleRoom />
    {:else if room === "arrange"}
      <ArrangeRoom />
    {:else if room === "mixer"}
      <MixerRoom />
    {:else}
      <DevComponentsPage />
    {/if}
  </main>

  <!-- Rendered once, outside the room switch, so the transport is never
       remounted and never moves when the room changes. -->
  <MiniTransport />
</div>
