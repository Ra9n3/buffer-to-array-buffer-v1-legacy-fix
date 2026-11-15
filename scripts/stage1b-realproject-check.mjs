#!/usr/bin/env node
/**
 * Stage 1b, Step 4 — the real-project check (read-only).
 *
 *     node --import ./tests/register.mjs scripts/stage1b-realproject-check.mjs
 *
 * The app's own seeded project — the session-fixture template, loaded through
 * the same loader the app's restore path uses (createTemplateProject) — played
 * by a PlaybackController wired exactly like the app's playback shell (the
 * same chunk size, the same clock shape, the app's own openProjectSources),
 * with the listening source NEVER selected: whatever initialPlaybackState
 * returns is what plays. Two runs:
 *
 *   A. the literal fresh-install wiring — the app's own source opener with no
 *      asset store behind it (the fixture session is simulated: every track
 *      has audio: null, so the app's own store would answer the same);
 *   B. the same seeded project with a stem on every track — the audio the app
 *      would have after imports — where "produces audio" is observable.
 *
 * Nothing here mutates the project or writes any store; the only outputs are
 * the printed lines.
 */
const { PlaybackController } = await import("../src/lib/playback/controller.ts");
const { openProjectSources } = await import("../src/lib/playback/sources.ts");
const { LIVE_PLAYBACK_CHUNK_FRAMES, initialPlaybackState } = await import("../src/lib/playback/types.ts");
const { readCurrent } = await import("../src/lib/metering/meter-bus.ts");
const { newMeterReading } = await import("../src/lib/engine/metering.ts");
const { createTemplateProject } = await import("../src/lib/project/templates.ts");
const { SESSION_PROJECT_ID } = await import("../src/lib/project/session.ts");

const SR = 48000;
const SECONDS = 3;

/** The seeded project, through the app's own restore-path loader. */
const project = createTemplateProject("session-fixture", SESSION_PROJECT_ID, "Fixture Session");

// The default the whole check stands on: nobody selects a source anywhere in
// this script, so whatever initialPlaybackState returns is what plays.
console.log(`initialPlaybackState default source: ${initialPlaybackState(SR).source}`);

/** The suite's output double (autoOutput shape) plus the played-frames clock. */
function makeOutput() {
  const chunks = [];
  const state = { position: 0, meterSample: null };
  return {
    sampleRate: SR,
    chunks,
    state,
    begin(startFrame) {
      state.position = startFrame;
      chunks.length = 0;
    },
    async write(chunk) {
      chunks.push({
        startFrame: chunk.startFrame,
        frames: chunk.frames,
        channels: [
          Float32Array.from(chunk.channels[0].subarray(0, chunk.frames)),
          Float32Array.from(chunk.channels[1].subarray(0, chunk.frames)),
        ],
      });
      state.position = chunk.startFrame + chunk.frames;
      // While the attempt is live: one master reading, as proof the PREVIEW
      // engine path ran (a raw attempt never registers a meter set).
      if (state.meterSample === null && chunks.length >= 20) {
        const reading = newMeterReading();
        state.meterSample = readCurrent("master", "master", reading)
          ? `peakL ${reading.peakLDb.toFixed(1)} dB, vuL ${reading.vuL.toFixed(1)}, corr ${reading.corr === null ? "-" : reading.corr.toFixed(3)}`
          : "no reading yet";
      }
    },
    positionFrames() {
      return state.position;
    },
    playedFrames() {
      return state.position;
    },
    setQueueSeconds() {},
    async drain() {},
    stop() {},
  };
}

const clock = {
  schedule: () => () => {},
  yieldBetween: async () => {},
  now: () => "14:02",
};

function peakOf(chunks) {
  let peak = 0;
  for (const chunk of chunks) {
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < chunk.frames; i++) {
        const v = Math.abs(chunk.channels[c][i]);
        if (v > peak) peak = v;
      }
    }
  }
  return peak;
}

/** One synthesized stem per track — the audio the app would have after imports. */
function stemFor(index) {
  const hz = 110 * Math.pow(2, (index % 12) / 12);
  return {
    sampleRate: SR,
    frames: SECONDS * SR,
    read(frameStart, target, count) {
      for (let c = 0; c < 2; c++) {
        const channel = target[c];
        for (let i = 0; i < count; i++) {
          const at = frameStart + i;
          channel[i] = 0.3 * Math.sin((2 * Math.PI * hz * at) / SR);
        }
      }
      return count;
    },
    close() {},
  };
}

/* --- A. the literal fresh-install wiring ---------------------------------- */

const outputA = makeOutput();
const controllerA = new PlaybackController({
  getProject: () => project,
  openSources: (current) => openProjectSources(current, null),
  output: outputA,
  chunkFrames: LIVE_PLAYBACK_CHUNK_FRAMES,
  clock,
});
let errorA = null;
try {
  await controllerA.play();
} catch (error) {
  errorA = error;
}
{
  const state = controllerA.getState();
  console.log(
    `A (app's own source opener, no assets): source=${state.source} status=${state.status} ` +
      `duration=${state.durationFrames} chunks=${outputA.chunks.length} peak=${peakOf(outputA.chunks).toFixed(4)} ` +
      `error=${errorA === null ? "none" : errorA.message}`,
  );
  controllerA.dispose();
}

/* --- B. the same seeded project, a stem on every track --------------------- */

const stems = new Map(project.tracks.map((track, index) => [track.id, stemFor(index)]));
const outputB = makeOutput();
const controllerB = new PlaybackController({
  getProject: () => project,
  openSources: async () => stems,
  output: outputB,
  chunkFrames: LIVE_PLAYBACK_CHUNK_FRAMES,
  clock,
});
const before = controllerB.getState();
let errorB = null;
try {
  await controllerB.play();
} catch (error) {
  errorB = error;
}
{
  const state = controllerB.getState();
  const audible = peakOf(outputB.chunks);
  console.log(
    `B (a stem per track): source before=${before.source} after=${state.source} ` +
      `duration=${state.durationFrames} chunks=${outputB.chunks.length} peak=${audible.toFixed(4)} ` +
      `status=${state.status} stoppedAt=${state.stoppedPosition} error=${errorB === null ? "none" : errorB.message}`,
  );
  console.log(
    `   mid-attempt readCurrent("master") at chunk 20: ${outputB.state.meterSample ?? "not reached"}`,
  );
  console.log(
    audible > 0.01
      ? "   verdict: the preview session started, produced audio and ended at the natural end, without error"
      : `   verdict: the preview session ran without error, but master stayed silent (peak ${audible.toFixed(4)}) — see the fixture's own solo/mute state`,
  );
  controllerB.dispose();
}
