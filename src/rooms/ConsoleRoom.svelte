<script lang="ts">
  import { onMount } from "svelte";
  import ChannelBank from "../components/ChannelBank.svelte";
  import ChannelDetailPanel from "../components/ChannelDetailPanel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import {
    ALL_CHANNELS,
    DEFAULT_CHANNEL_SELECTION,
  } from "../lib/channels";

  // Local UI state only — no shared project state, no cross-room sync.
  let selectedId = $state<string>(DEFAULT_CHANNEL_SELECTION);

  const selected = $derived(ALL_CHANNELS.find((c) => c.id === selectedId));

  let transportVisible = $state(false);

  onMount(() => {
    let frame = 0;

    const update = (): void => {
      frame = 0;
      transportVisible = window.scrollY > 24;
    };

    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  });
</script>

<RoomShell
  roomId="console"
  title="Console"
  purpose="Primary overview and automatic-mix workspace."
>
  <div class="console-room">
    <div class="console-layout" data-console-layout>
      <section
        class="console-zone console-zone--meter"
        data-console-zone="meter-bridge"
        aria-labelledby="console-meter-title"
      >
        <header class="console-zone__header">
          <p class="console-zone__eyebrow">Zone 01</p>
          <h2 class="console-zone__title" id="console-meter-title">Meter bridge</h2>
          <p class="console-zone__detail">
            Master and channel meters, spectrum, stereo correlation, and status
            information.
          </p>
        </header>
        <div class="console-zone__body" aria-hidden="true">
          <span>Meter bridge placeholder</span>
        </div>
      </section>

      <section
        class="console-zone console-zone--detail"
        data-console-zone="channel-detail"
        aria-labelledby="console-detail-title"
      >
        <header class="console-zone__header">
          <p class="console-zone__eyebrow">Zone 02</p>
          <h2 class="console-zone__title" id="console-detail-title">
            Selected channel &amp; processing chain
          </h2>
          <p class="console-zone__detail">
            The same panel the Mixer tab shows, driven by the channel bank below.
          </p>
        </header>
        <div class="console-detail">
          <ChannelDetailPanel channel={selected} />
        </div>
      </section>

      <section
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
      >
        <header class="console-zone__header">
          <p class="console-zone__eyebrow">Zone 03</p>
          <h2 class="console-zone__title" id="console-channels-title">
            Channel bank
          </h2>
          <p class="console-zone__detail">
            20 track placeholders; the first 11 fit, the rest scroll. Return
            and bus-master channels stay pinned right.
          </p>
        </header>
        <div class="console-bank">
          <ChannelBank {selectedId} onselect={(id) => (selectedId = id)} />
        </div>
      </section>
    </div>
  </div>

  <section
    class="console-zone console-transport"
    class:is-visible={transportVisible}
    data-console-zone="transport"
    data-transport-visible={transportVisible}
    aria-hidden={!transportVisible}
    aria-labelledby="console-transport-title"
  >
    <header class="console-zone__header">
      <p class="console-zone__eyebrow">Zone 04</p>
      <h2 class="console-zone__title" id="console-transport-title">Transport</h2>
      <p class="console-zone__detail">
        Reserved for transport controls and status/time information.
      </p>
    </header>
    <div class="console-zone__body" aria-hidden="true">
      <span>Transport placeholder</span>
    </div>
  </section>
</RoomShell>

<style>
  .console-room {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    min-height: calc(100dvh - 7.5rem);
    padding-bottom: 6rem;
  }

  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      minmax(6rem, 0.7fr)
      minmax(12rem, 1.6fr)
      minmax(13rem, 1.9fr);
    gap: 1rem;
    min-width: 0;
    min-height: 0;
  }

  .console-zone {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  .console-zone__header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.75rem;
    row-gap: 0.125rem;
    min-width: 0;
  }

  .console-zone__eyebrow {
    flex: 0 0 auto;
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .console-zone__title {
    flex: 0 0 auto;
    margin: 0;
    font-size: 1.0625rem;
    line-height: 1.2;
  }

  .console-zone__detail {
    flex: 1 1 18rem;
    min-width: 0;
    margin: 0;
    color: #454545;
    overflow-wrap: break-word;
  }

  .console-zone__body {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-width: 0;
    min-height: 2rem;
    padding: 0.25rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
    color: #5d5d5d;
    font-size: 0.8125rem;
    text-align: center;
  }

  .console-zone__body span {
    overflow-wrap: break-word;
  }

  .console-detail {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.25rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
  }

  .console-bank {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
  }

  .console-transport {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 30;
    min-height: 5.5rem;
    padding: 0.75rem 1rem;
    border: 0;
    border-top: 2px dashed #8a8a8a;
    background: #f1f1f1;
    transform: translateY(100%);
    visibility: hidden;
    transition:
      transform 180ms ease,
      visibility 180ms ease;
  }

  .console-transport.is-visible {
    transform: translateY(0);
    visibility: visible;
  }

  @media (max-width: 40rem) {
    .console-layout {
      grid-template-rows:
        minmax(6rem, auto)
        minmax(12rem, auto)
        minmax(13rem, auto);
    }

    .console-zone__detail {
      flex-basis: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .console-transport {
      transition: none;
    }
  }
</style>
