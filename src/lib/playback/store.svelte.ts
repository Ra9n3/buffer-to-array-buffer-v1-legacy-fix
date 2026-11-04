/**
 * ALLOY — the reactive shared transport (Task 8.1).
 *
 * One module-level state for Console, Arrange and Mixer. The shell attaches the
 * browser PlaybackController once; the mini transport and the Console deck read
 * this same object, so switching rooms cannot remount or reset playback.
 */

import type { PlaybackController } from "./controller";
import { initialPlaybackState, type ListeningSource, type PlaybackState } from "./types";

const state: PlaybackState = $state(initialPlaybackState(48000));
let controller: PlaybackController | null = null;
let unsubscribe: (() => void) | null = null;

export const transport = {
  get status() { return state.status; },
  get source() { return state.source; },
  get sampleRate() { return state.sampleRate; },
  get positionFrames() { return state.positionFrames; },
  get startFrame() { return state.startFrame; },
  get durationFrames() { return state.durationFrames; },
  get renderProgress() { return state.renderProgress; },
  get error() { return state.error; },
  get positionSeconds() { return state.positionFrames / state.sampleRate; },
  get durationSeconds() { return state.durationFrames / state.sampleRate; },
  get attached() { return controller !== null; },

  attach(next: PlaybackController): () => void {
    unsubscribe?.();
    controller = next;
    unsubscribe = next.subscribe((snapshot) => {
      Object.assign(state, snapshot);
    });
    return () => {
      unsubscribe?.();
      unsubscribe = null;
      controller = null;
    };
  },
  play(): Promise<void> { return controller?.play() ?? Promise.resolve(); },
  pause(): void { controller?.pause(); },
  stop(): void { controller?.stop(); },
  seek(frames: number): void { controller?.seek(frames); },
  togglePlay(): void { controller?.togglePlay(); },
  setSource(source: ListeningSource): void { controller?.setSource(source); },
  render(): Promise<void> { return controller?.render() ?? Promise.resolve(); },
  syncPosition(): void { controller?.syncPosition(); },
} as const;

/** H:MM:SS.mmm for the mini transport's existing position readout. */
export function formatTransportPosition(frames: number, sampleRate: number): string {
  const totalMs = Math.max(0, Math.round((frames / sampleRate) * 1000));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function transportStatusText(snapshot: Pick<PlaybackState, "status" | "source" | "error">): string {
  if (snapshot.status === "error") return snapshot.error ?? "Playback error";
  const source = snapshot.source.toUpperCase();
  switch (snapshot.status) {
    case "playing": return `Playing — ${source}`;
    case "rendering": return `Rendering — ${source}`;
    case "paused": return `Paused — ${source}`;
    default: return `Stopped — ${source}`;
  }
}
