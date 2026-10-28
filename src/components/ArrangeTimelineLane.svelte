<script lang="ts">
  let { laneId, code }: { laneId: string; code: string } = $props();
</script>

<!-- Empty structural lane. A direct grid child of the Arrange grid: it shares
     its grid row with the matching track-list cell, so row and lane boundaries
     cannot drift apart. No waveforms or audio in Task 0.4. -->
<div
  class="arrange-lane"
  data-arrange-region="timeline-lane"
  data-lane={laneId}
  data-track-code={code}
  aria-hidden="true"
></div>

<style>
  .arrange-lane {
    height: var(--arrange-row-height);
    border-bottom: 1px solid #d0d0d0;
    background: #fbfbfb;
  }
</style>
