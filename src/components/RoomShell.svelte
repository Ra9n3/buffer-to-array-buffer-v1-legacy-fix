<script lang="ts">
  import type { Snippet } from "svelte";
  import type { RoomId } from "../lib/rooms";

  let {
    roomId,
    title,
    purpose,
    children,
  }: {
    roomId: RoomId;
    title: string;
    purpose: string;
    children?: Snippet;
  } = $props();
</script>

<section class="room" data-room={roomId} aria-labelledby="{roomId}-title">
  <header class="room__header">
    <p class="room__eyebrow">Room</p>
    <h1 class="room__title" id="{roomId}-title">{title}</h1>
    <p class="room__purpose">{purpose}</p>
  </header>

  <div class="room__canvas">
    {@render children?.()}
  </div>
</section>
