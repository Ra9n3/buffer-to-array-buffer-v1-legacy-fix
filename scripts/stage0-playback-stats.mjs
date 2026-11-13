#!/usr/bin/env node
/**
 * Stage 0, Step 6c — run live preview for the equivalent of 30 s and report
 * playbackStats(), the same function the ?debug handle exposes
 * (window.alloy.transport.playbackStats()).
 *
 *     node --import ./tests/register.mjs scripts/stage0-playback-stats.mjs
 *
 * The real PlaybackController and the real Web Audio output run against a fake
 * AudioContext whose clock advances in real time, so the queue, the lead and the
 * backpressure behave as in the browser: the run takes about as long as the
 * audio it plays. No DOM, no browser.
 */
const { PlaybackController } = await import("../src/lib/playback/controller.ts");
const { createWebAudioOutput } = await import("../src/lib/playback/web-audio.ts");
const { transport } = await import("../src/lib/playback/store.svelte.ts");
const { createSessionProject } = await import("../src/lib/project/session.ts");
const { LIVE_PLAYBACK_CHUNK_FRAMES, LIVE_PLAYBACK_QUEUE_SECONDS } = await import("../src/lib/playback/types.ts");

const SR = 48000;
const SECONDS = 30;

/** A minimal, real-time AudioContext double: the clock is the wall clock. */
class FakeAudioContext {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.state = "running";
    this._t0 = performance.now();
  }
  get currentTime() {
    return (performance.now() - this._t0) / 1000;
  }
  async resume() {}
  get destination() {
    return {};
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createBuffer(_channels, frames, _rate) {
    const data = [new Float32Array(frames), new Float32Array(frames)];
    return { getChannelData: (c) => data[c] };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      onended: null,
    };
  }
  close() {}
}

// The playback suite's preview recipe: the session fixture with one audible
// track, routed through its bus and a Return send so the engine does real work.
const project = createSessionProject();
for (const track of project.tracks) track.channel.mute = track.id !== "track-01";
const track = project.tracks.find((t) => t.id === "track-01");
track.channel.trim = 0;
track.channel.pan = 0;
track.channel.level = 0;
track.output = "bus-B1";
track.channel.sends[0].to = "return-room";
track.channel.sends[0].level = 0;

const frames = SECONDS * SR;
const sources = new Map([
  [
    "track-01",
    {
      sampleRate: SR,
      frames,
      read(frameStart, target, count) {
        for (let c = 0; c < 2; c++) {
          const channel = target[c];
          for (let i = 0; i < count; i++) {
            const at = frameStart + i;
            channel[i] = 0.35 * Math.sin((2 * Math.PI * 220 * at) / SR) + 0.1 * Math.sin((2 * Math.PI * 660 * at) / SR);
          }
        }
        return count;
      },
      close() {},
    },
  ],
]);

const output = createWebAudioOutput({
  sampleRate: SR,
  queueSeconds: LIVE_PLAYBACK_QUEUE_SECONDS,
  createContext: () => new FakeAudioContext(SR),
});
const controller = new PlaybackController({
  getProject: () => project,
  openSources: async () => sources,
  output,
  chunkFrames: LIVE_PLAYBACK_CHUNK_FRAMES,
  tailSeconds: 0.05,
  clock: {
    schedule: () => () => {},
    yieldBetween: async () => {},
    now: () => "00:00",
  },
});
const detach = transport.attach(controller);
controller.setSource("preview");

const startedAt = performance.now();
await controller.play();
const wallSeconds = (performance.now() - startedAt) / 1000;

console.log(`preview playback: ${SECONDS} s of audio (${frames} frames) in ${LIVE_PLAYBACK_CHUNK_FRAMES}-frame chunks, queue ${LIVE_PLAYBACK_QUEUE_SECONDS} s`);
console.log(`wall time: ${wallSeconds.toFixed(2)} s; transport status: ${transport.status}`);
console.log(`playbackStats(): ${JSON.stringify(transport.playbackStats())}`);

detach();
controller.dispose();
