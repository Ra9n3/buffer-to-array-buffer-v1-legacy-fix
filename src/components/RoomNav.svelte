<script lang="ts">
  import { ROOMS, roomHref, type RoomId } from "../lib/rooms";

  let { room }: { room: RoomId } = $props();
</script>

<nav class="room-nav" aria-label="Rooms">
  <ul>
    {#each ROOMS as item, index (item.id)}
      <li>
        <a
          class="room-nav__link"
          class:is-active={item.id === room}
          href={roomHref(item.id)}
          aria-current={item.id === room ? "page" : undefined}
        >
          <span class="room-nav__index">{String(index + 1).padStart(2, "0")}</span>
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
