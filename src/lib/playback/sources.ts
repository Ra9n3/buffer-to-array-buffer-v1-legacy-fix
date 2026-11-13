/**
 * ALLOY — imported stems as seekable playback sources (Task 8.1).
 *
 * Reuses the Task 7.4 WAV source adapter and the Task 5.1 project-owned asset
 * store. No stem is decoded whole: `openWavRenderSource` reads frame ranges through
 * Task 5.2's slice decoder. A missing stored copy is silence for that track, the
 * same MISSING condition Arrange already prints; playback never references the
 * original imported file.
 *
 * Task 11.1: playback reads the PROJECT-RATE COPY (the internal-format
 * conversion) and falls back to the original only for records that predate
 * it — the hydrate repair makes the copy, so the fallback is a legacy path,
 * not a design. The render engine checks the source's rate against the
 * render's rate itself (no resampling inside a render).
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
    // Task 11.1: the project-rate copy when there is one; the original as a
    // legacy fallback (the hydrate repair makes the copy for old records).
    const bytes = record.converted ? record.converted.bytes : record.bytes;
    try {
      sources.set(track.id, await openWavRenderSource(bytes));
    } catch {
      // A corrupt stored copy is not silently repaired; the track contributes
      // silence and the import/analysis surfaces remain the place that reports it.
    }
  }
  return sources;
}
