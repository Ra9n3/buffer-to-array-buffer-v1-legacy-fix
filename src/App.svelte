<script lang="ts">
  import { onMount } from "svelte";
  import MiniTransport from "./components/MiniTransport.svelte";
  import RoomNav from "./components/RoomNav.svelte";
  import ArrangeRoom from "./rooms/ArrangeRoom.svelte";
  import ConsoleRoom from "./rooms/ConsoleRoom.svelte";
  import MixerRoom from "./rooms/MixerRoom.svelte";
  import {
    roomFromHash,
    roomHref,
    type RoomId,
  } from "./lib/rooms";

  let room = $state<RoomId>(roomFromHash(window.location.hash));

  function syncRoomFromHash(): void {
    room = roomFromHash(window.location.hash);
  }

  onMount(() => {
    if (window.location.hash !== roomHref(room)) {
      history.replaceState(null, "", roomHref(room));
    }

    window.addEventListener("hashchange", syncRoomFromHash);

    return () => window.removeEventListener("hashchange", syncRoomFromHash);
  });
</script>

<div class="app-shell" data-active-room={room}>
  <header class="app-header">
    <a class="app-brand" href={roomHref("console")}>ALLOY</a>
    <RoomNav {room} />
  </header>

  <main class="room-host" id="main">
    {#if room === "console"}
      <ConsoleRoom />
    {:else if room === "arrange"}
      <ArrangeRoom />
    {:else}
      <MixerRoom />
    {/if}
  </main>

  <!-- Rendered once, outside the room switch, so the transport is never
       remounted and never moves when the room changes. -->
  <MiniTransport />
</div>
