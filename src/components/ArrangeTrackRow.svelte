<script lang="ts">
  let {
    code,
    name,
    laneId,
  }: {
    code: string;
    name: string;
    laneId: string;
  } = $props();
</script>

<!-- Track-list cell for one track. A direct grid child of the Arrange grid, so
     it always shares its row with exactly one timeline lane. -->
<div
  class="arrange-track-row"
  data-arrange-region="track-row"
  data-track-code={code}
  data-lane={laneId}
>
  <p class="arrange-track-row__identity">
    <span class="arrange-track-row__code">{code}</span>
    <span class="arrange-track-row__name">{name}</span>
  </p>
  <p class="arrange-track-row__meta">
    <span class="arrange-track-row__meta-label">Instrument</span>
    <span class="arrange-track-row__meta-sep" aria-hidden="true">·</span>
    <span class="arrange-track-row__meta-label">Role</span>
  </p>
</div>

<style>
  .arrange-track-row {
    position: sticky;
    left: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.0625rem;
    min-width: 0;
    height: var(--arrange-row-height);
    padding: 0.25rem 0.5rem;
    border-right: 2px solid #8a8a8a;
    border-bottom: 1px solid #d0d0d0;
    background: #ececec;
    overflow: hidden;
  }

  .arrange-track-row__identity {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
    margin: 0;
  }

  .arrange-track-row__code {
    flex: 0 0 auto;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #5d5d5d;
  }

  .arrange-track-row__name {
    min-width: 0;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrange-track-row__meta {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #5d5d5d;
    font-size: 0.625rem;
    line-height: 1.2;
    white-space: nowrap;
  }

  .arrange-track-row__meta-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arrange-track-row__meta-sep {
    flex: 0 0 auto;
    opacity: 0.6;
  }
</style>
