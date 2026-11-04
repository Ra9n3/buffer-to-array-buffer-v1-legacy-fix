/**
 * ALLOY — browser wiring for the shared transport (Task 8.1).
 *
 * The one place playback meets the window: Web Audio output, the project store,
 * the attached asset store and macrotask scheduling. Components only call the
 * reactive transport facade; they never create an AudioContext or a timer.
 */

import type { AssetStore } from "../audio/asset-store";
import type { Project } from "../project/model";
import { project } from "../project/store.svelte";
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
    },
  });
  const detach = transport.attach(controller);
  return () => {
    detach();
    controller.dispose();
  };
}
