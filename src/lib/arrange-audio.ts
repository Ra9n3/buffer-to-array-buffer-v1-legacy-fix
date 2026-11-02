/**
 * ALLOY — IMPORTED AUDIO ON THE ARRANGE TIMELINE — Task 5.1.
 *
 * The bridge between a stem's stored peaks (lib/audio/peaks.ts) and the
 * Arrange lane's clip model (lib/arrange-timeline.ts, Task 2.6): musical
 * time for a file that only knows seconds, and a clip whose waveform is the
 * file's own overview. Nothing here is fixture data; `arrange-timeline.ts`
 * stays the fixture's file.
 *
 * Time (owner D5.1.4): a project without a tempo of its own is scaled at
 * 120 bpm in 4/4 — one bar is two seconds — and every imported stem starts
 * at bar 1 (stems are exported from the same origin, plan §3). A project
 * with tempo markers (the fixture) maps seconds through its markers
 * piecewise, so an imported file lands at the right bar of the fixture's
 * tempo map too. The scale is a display scale: no file is time-stretched,
 * and 5.2's analysis works in seconds.
 */

import { ARRANGE_RULER_LABEL_INTERVAL } from "./arrange";
import { BEATS_PER_BAR, TIME_SIGNATURE, WAVE_LAYOUT, type ArrangeClip, type TempoMarker } from "./arrange-timeline";
import { peaksPath, type PeakData } from "./audio/peaks";

export const DEFAULT_TEMPO: TempoMarker = { bar: 1, bpm: 120, signature: TIME_SIGNATURE };

/** Points per bar for an audio clip's path: twice the fixture's 16, as a real overview has more to show. */
export const AUDIO_POINTS_PER_BAR = 32;

/** Seconds per bar at a tempo, in 4/4. */
export function secondsPerBar(bpm: number): number {
  return (60 / bpm) * BEATS_PER_BAR;
}

/**
 * Seconds from bar 1 → bars (fractional), piecewise through the markers:
 * each marker holds its tempo until the next marker's bar.
 */
export function secondsToBars(seconds: number, markers: readonly TempoMarker[]): number {
  const list = markers.length > 0 ? [...markers].sort((a, b) => a.bar - b.bar) : [DEFAULT_TEMPO];
  let remaining = Math.max(0, seconds);
  let bars = 0;
  for (let i = 0; i < list.length; i++) {
    const held = list[i].bpm;
    const next = list[i + 1];
    const spb = secondsPerBar(held);
    if (!next) return bars + remaining / spb;
    const span = Math.max(0, next.bar - Math.max(list[i].bar, 1));
    const spanSeconds = span * spb;
    if (remaining <= spanSeconds) return bars + remaining / spb;
    remaining -= spanSeconds;
    bars += span;
  }
  return bars;
}

export interface AudioClipInput {
  readonly trackCode: string;
  readonly peaks: PeakData;
  /** The project's tempo markers (empty → DEFAULT_TEMPO). */
  readonly tempoMarkers: readonly TempoMarker[];
}

/**
 * The lane clip of an imported stem: from bar 1, as many bars as the file
 * lasts (fractional), one real envelope per channel. A mono file draws one
 * envelope on the midline (the engine's L/R duplication is not a second
 * waveform — the lane shows the file as it is, and the row's MONO stamp
 * says why).
 */
export function audioClip(input: AudioClipInput): ArrangeClip {
  const { peaks, trackCode } = input;
  const seconds = peaks.frames / peaks.sampleRate;
  const bars = secondsToBars(seconds, input.tempoMarkers);
  const barCount = Math.max(bars, 1 / 64); // a very short file still has a visible sliver
  const pointCount = Math.max(2, Math.round(barCount * AUDIO_POINTS_PER_BAR));
  const channels: 1 | 2 = peaks.channels >= 2 ? 2 : 1;
  const layout = channels === 2 ? WAVE_LAYOUT.stereo : WAVE_LAYOUT.mono;
  return {
    clipId: `${trackCode}-audio`,
    trackCode,
    source: "audio",
    kind: "audio",
    startBar: 1,
    barCount,
    endBar: Math.max(1, Math.ceil(bars)),
    channels,
    peakCount: pointCount,
    waves: layout.map((slot, channel) => ({
      d: peaksPath(peaks.data[channel], peaks.bucketCount, pointCount, slot.centre, slot.half),
      centre: slot.centre,
    })),
    seconds,
  };
}

/** The bar count a timeline needs for stems of `seconds`: whole bars, never fewer than it had. */
export function barCountFor(seconds: number, markers: readonly TempoMarker[], existing: number): number {
  return Math.max(existing, Math.ceil(secondsToBars(seconds, markers) - 1e-9));
}

/** Ruler numerals for any bar count — the fixture's `ARRANGE_RULER_LABELS` for 56, the same rule beyond it. */
export function rulerLabels(barCount: number): readonly { readonly bar: number; readonly label: string }[] {
  return Array.from({ length: Math.ceil(Math.max(0, barCount) / ARRANGE_RULER_LABEL_INTERVAL) }, (_, index) => {
    const bar = index * ARRANGE_RULER_LABEL_INTERVAL + 1;
    return { bar, label: String(bar) };
  });
}
