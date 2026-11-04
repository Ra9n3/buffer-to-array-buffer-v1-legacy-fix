/**
 * ALLOY — imported stems as seekable playback sources (Task 8.1).
 *
 * Reuses the Task 7.4 WAV source adapter and the Task 5.1 project-owned asset
 * store. No stem is decoded whole: `openWavRenderSource` reads frame ranges through
 * Task 5.2's slice decoder. A missing stored copy is silence for that track, the
 * same MISSING condition Arrange already prints; playback never references the
 * original imported file.
 */

import type { AssetStore } from "../audio/asset-store";
import { openWavRenderSource, type RenderSource } from "../engine/render";
import type { Project, TrackId } from "../project/model";

export async function openProjectSources(
  project: Project,
  store: AssetStore | null,
): Promise<ReadonlyMap<TrackId, RenderSource>> {
  const sources = new Map<TrackId, RenderSource>();
  if (!store) return sources;
  for (const track of project.tracks) {
    const audio = track.audio;
    if (!audio) continue;
    let record;
    try {
      record = await store.getAsset(audio.assetId);
    } catch {
      record = null;
    }
    if (!record || record.sha256 !== audio.sha256) continue;
    try {
      sources.set(track.id, await openWavRenderSource(record.bytes));
    } catch {
      // A corrupt stored copy is not silently repaired; the track contributes
      // silence and the import/analysis surfaces remain the place that reports it.
    }
  }
  return sources;
}
