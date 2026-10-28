<script lang="ts">
  import type { Snippet } from "svelte";
  import type { RoomId } from "../lib/rooms";

  let {
    roomId,
    title,
    purpose,
    hideHeader = false,
    children,
  }: {
    roomId: RoomId;
    title: string;
    purpose: string;
    /**
     * Visually hide the room header. The <h1> is kept in the DOM and remains
     * the section's accessible name, so screen-reader users still get "Arrange"
     * even though the band takes no vertical space. Used by rooms where the
     * workspace itself should be the first thing on screen.
     */
    hideHeader?: boolean;
    children?: Snippet;
  } = $props();
</script>

<section class="room" data-room={roomId} aria-labelledby="{roomId}-title">
  <header class="room__header" class:is-visually-hidden={hideHeader}>
    <p class="room__eyebrow">Room</p>
    <h1 class="room__title" id="{roomId}-title">{title}</h1>
    <p class="room__purpose">{purpose}</p>
  </header>

  <div class="room__canvas">
    {@render children?.()}
  </div>
</section>
