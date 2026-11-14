#!/usr/bin/env node
/**
 * Stage 1 — per-chunk processing cost, metering ON versus OFF.
 *
 *     node --import ./tests/register.mjs scripts/stage1-meter-stats.mjs
 *
 * The Stage 0 recipe (scripts/stage0-playback-stats.mjs) against a bounded
 * preview session, timed directly: the same project, the same sources, the same
 * 1024-frame chunk, run once WITHOUT an output (no MeterSet, the engine exactly
 * as before this stage) and once WITH one (a MeterSet registered on an output
 * with a played clock). Each session.next() is timed with performance.now; the
 * report is the mean and the max per chunk. Also prints one readCurrent()
 * reading as an end-to-end sanity check of the Step 4/5 wiring.
 */
const { createPreviewSession } = await import("../src/lib/playback/sessions.ts");
const { MeterSet, newMeterReading } = await import("../src/lib/engine/metering.ts");
const { readCurrent } = await import("../src/lib/metering/meter-bus.ts");
const { createSessionProject } = await import("../src/lib/project/session.ts");
const { LIVE_PLAYBACK_CHUNK_FRAMES } = await import("../src/lib/playback/types.ts");

const SR = 48000;
const SECONDS = 30;

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

/** A played-frames clock that stands still: readCurrent then reads the first reading. */
const stillClock = { playedFrames: () => 0 };

async function timedRun(withMeters, warmupChunks) {
  const session = createPreviewSession(
    project,
    sources,
    0,
    LIVE_PLAYBACK_CHUNK_FRAMES,
    0.05,
    withMeters ? stillClock : undefined,
  );
  let live = null;
  let count = 0;
  let total = 0;
  let max = 0;
  for (;;) {
    const startedAt = performance.now();
    const chunk = await session.next();
    const spent = performance.now() - startedAt;
    if (warmupChunks === undefined || count >= warmupChunks) {
      total += spent;
      if (spent > max) max = spent;
    }
    count++;
    // While the attempt is live (before close clears it), take one reading.
    if (live === null && withMeters && count >= 40) {
      const reading = newMeterReading();
      live = readCurrent("master", "master", reading)
        ? `peakL ${reading.peakLDb.toFixed(1)} dB, vuL ${reading.vuL.toFixed(1)}, corr ${reading.corr === null ? "-" : reading.corr.toFixed(3)}`
        : "no reading";
    }
    if (!chunk) break;
  }
  await session.close();
  const measured = warmupChunks === undefined ? count : count - Math.min(warmupChunks, count);
  return { count: measured, mean: total / measured, max, live };
}

console.log(`preview per-chunk cost: ${SECONDS} s of audio (${frames} frames) in ${LIVE_PLAYBACK_CHUNK_FRAMES}-frame chunks, direct session timing, 40-chunk warmup excluded`);
const off = await timedRun(false, 40);
console.log(`metering OFF: ${off.count} chunks, mean ${off.mean.toFixed(3)} ms, max ${off.max.toFixed(3)} ms`);
const on = await timedRun(true, 40);
console.log(`metering ON:  ${on.count} chunks, mean ${on.mean.toFixed(3)} ms, max ${on.max.toFixed(3)} ms`);
console.log(`delta:        mean ${(on.mean - off.mean).toFixed(3)} ms per chunk (${((on.mean / off.mean - 1) * 100).toFixed(1)}%)`);

// End-to-end wiring sanity, taken while the attempt was live: the registered
// attempt answers readCurrent at the played clock's position.
console.log(`readCurrent("master") mid-attempt at playedFrames 0: ${on.live}`);
