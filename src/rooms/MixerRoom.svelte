<script lang="ts">
  import RoomPlaceholder from "../components/RoomPlaceholder.svelte";
  import RoomShell from "../components/RoomShell.svelte";
</script>

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
>
  <RoomPlaceholder
    label="Mixer room"
    detail="Channel-strip and processing-chain placeholders are added in Task 0.5."
  />
</RoomShell>
