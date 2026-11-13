/**
 * ALLOY — browser wiring for the shared transport (Task 8.1).
 *
 * The one place playback meets the window: Web Audio output, the project store,
 * the attached asset store and macrotask scheduling. Components only call the
 * reactive transport facade; they never create an AudioContext or a timer.
 */

import type { AssetStore } from "../audio/asset-store";
import type { Project } from "../project/model";
import { history, project } from "../project/store.svelte";
import { settings } from "../settings.svelte";
import { playhead } from "./playhead.svelte";
import { PlaybackController } from "./controller";
import { openProjectSources } from "./sources";
import { transport } from "./store.svelte";
import { createWebAudioOutput } from "./web-audio";
import { LIVE_PLAYBACK_CHUNK_FRAMES, LIVE_PLAYBACK_QUEUE_SECONDS } from "./types";

export interface PlaybackShellOptions {
  readonly assetStore: AssetStore | null;
  readonly output?: ReturnType<typeof createWebAudioOutput>;
}

export function installPlaybackShell(win: Window, options: PlaybackShellOptions): () => void {
  /*
   * Task 11.1: the output runs at the OPEN PROJECT's rate. A project switch
   * or a rate change (both "clear" events) rebuilds the output when the rate
   * moved — the context is created lazily on first play, so this is cheap
   * while stopped, and a rate change stops playback first.
   *
   * Stage 0: the output is created with the LIVE queue depth, and raw/preview
   * play in LIVE_PLAYBACK_CHUNK_FRAMES blocks — the controller switches the
   * queue back to the shared PLAYBACK_QUEUE_SECONDS for a render attempt.
   */
  let output = options.output ?? createWebAudioOutput({ sampleRate: project.sampleRate, queueSeconds: LIVE_PLAYBACK_QUEUE_SECONDS });
  let controller = new PlaybackController({
    getProject: () => project as unknown as Project,
    openSources: (current) => openProjectSources(current, options.assetStore),
    output,
    chunkFrames: LIVE_PLAYBACK_CHUNK_FRAMES,
    clock: {
      schedule: (fn, ms) => {
        if (typeof win.setInterval !== "function") return () => {};
        const id = win.setInterval(fn, ms);
        return () => win.clearInterval(id);
      },
      yieldBetween: () => new Promise<void>((resolve) => {
        if (typeof win.setTimeout !== "function") resolve();
        else win.setTimeout(resolve, 0);
      }),
      // Task 9.1.3: the deck prints the minute a mix was made ("Mixed — at 14:02").
      now: () => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      },
    },
    /* Task 10.1: the Stop preferences are read at every Stop, and the loop
       region is polled while playing — both live, so a change in Settings or
       a region set by a future editor applies without reinstalling. */
    stopBehaviour: () => ({
      returnToStartOnStop: settings.transport.returnToStartOnStop,
      secondStopReturnsToStart: settings.transport.secondStopReturnsToStart,
    }),
    loop: () => playhead.activeLoopRegion,
  });
  let detach = transport.attach(controller);
  const rebuildAtProjectRate = (): void => {
    const rate = project.sampleRate;
    if (rate === output.sampleRate) return;
    controller.stop();
    controller.dispose();
    // A fresh output at the project's rate. An injected test output at another
    // rate is replaced: the shell's one job is that playback runs at the rate
    // the open project names, and the context is created lazily, so a stopped
    // rebuild touches no browser API.
    output = createWebAudioOutput({ sampleRate: rate, queueSeconds: LIVE_PLAYBACK_QUEUE_SECONDS });
    controller = new PlaybackController({
      getProject: () => project as unknown as Project,
      openSources: (current) => openProjectSources(current, options.assetStore),
      output,
      chunkFrames: LIVE_PLAYBACK_CHUNK_FRAMES,
      clock: {
        schedule: (fn, ms) => {
          if (typeof win.setInterval !== "function") return () => {};
          const id = win.setInterval(fn, ms);
          return () => win.clearInterval(id);
        },
        yieldBetween: () => new Promise<void>((resolve) => {
          if (typeof win.setTimeout !== "function") resolve();
          else win.setTimeout(resolve, 0);
        }),
        now: () => {
          const d = new Date();
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        },
      },
      stopBehaviour: () => ({
        returnToStartOnStop: settings.transport.returnToStartOnStop,
        secondStopReturnsToStart: settings.transport.secondStopReturnsToStart,
      }),
      loop: () => playhead.activeLoopRegion,
    });
    detach();
    detach = transport.attach(controller);
    refresh();
  };

  /*
   * Keep the playable length current (Task 9.1). The transport must know how long the
   * session is BEFORE the first Play, because Previous/Next, the position readout and
   * the playhead's clamp all read the duration while stopped. The project store's own
   * history is the notification that the project's structure moved: an import, a
   * project switch (`loadProject`) and an undo/redo past one all `clear` it, while an
   * ordinary parameter edit only `record`s. Recomputing on the structural events keeps
   * the cost to the moments the answer can actually change.
   */
  let refreshing: Promise<void> | null = null;
  const refresh = (): void => {
    if (refreshing) return;
    refreshing = controller.refreshDuration().finally(() => {
      refreshing = null;
    });
  };
  const stopWatching = history.subscribe((event) => {
    if (event.kind !== "clear") return;
    // Task 11.1: a project switch or a rate change may have moved the rate —
    // the output follows it before anything else is recomputed.
    rebuildAtProjectRate();
    // Task 9.1.3: the same structural events mean any finished mix no longer
    // describes this project — an import, a project switch, or an undo past one.
    // A plain parameter edit is not a `clear`, and it is deliberately left alone:
    // the deck reports that case as "N manual edits since, rerun available".
    transport.clearMix();
    refresh();
  });
  // Once at install, so a reopened project has a length before anything is pressed.
  refresh();

  return () => {
    stopWatching();
    detach();
    controller.dispose();
  };
}
