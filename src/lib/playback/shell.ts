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
import { PlaybackController } from "./controller";
import { openProjectSources } from "./sources";
import { transport } from "./store.svelte";
import { createWebAudioOutput } from "./web-audio";

export interface PlaybackShellOptions {
  readonly assetStore: AssetStore | null;
  readonly output?: ReturnType<typeof createWebAudioOutput>;
}

export function installPlaybackShell(win: Window, options: PlaybackShellOptions): () => void {
  const output = options.output ?? createWebAudioOutput();
  const controller = new PlaybackController({
    getProject: () => project as unknown as Project,
    openSources: (current) => openProjectSources(current, options.assetStore),
    output,
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
  });
  const detach = transport.attach(controller);

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
