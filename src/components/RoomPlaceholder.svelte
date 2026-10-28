<script lang="ts">
  let {
    label,
    detail,
  }: {
    label: string;
    detail: string;
  } = $props();
</script>

<div class="room-placeholder">
  <p class="room-placeholder__label">{label}</p>
  <p class="room-placeholder__detail">{detail}</p>
</div>
