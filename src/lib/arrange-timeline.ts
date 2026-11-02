/**
 * SIMULATED fixture data for the Arrange timeline — Task 2.6.
 *
 * What the timeline shows above and beside the Task 2.5 track rows: musical
 * time (bars of four beats), the song's sections, the tempo track's markers,
 * and one clip or more per track with a drawn waveform placeholder. All of it
 * is fixture data or generated locally from fixture data: nothing is read
 * from audio, nothing is analysed, nothing is stored. The waveforms are
 * drawings that *look* like a stem's overview — a kick's transients, a pad's
 * swell, a vocal's phrases — so the lanes can be reviewed as the room will
 * eventually look; they are not derived from any signal (plan §14: waveform
 * peak data arrives with real audio import in Task 5.1 and replaces these).
 *
 * Geometry lives in CSS: the room's `--arrange-bar-width` is the one source
 * of horizontal scale, and every clip is positioned in bar units
 * (`startBar`, `barCount`) so the room, the lane and the header share it by
 * construction. This file knows bars and beats, never pixels.
 */

import { ARRANGE_BAR_COUNT, ARRANGE_STRUCTURE_MARKERS } from "./arrange";
import type { OrgSwatch } from "../components/channel-strip/track-strip-fixtures";

export type { OrgSwatch };

/* --- musical time ------------------------------------------------------------ */

/** The fixture session is in 4/4: four beats to the bar, printed once on the tempo track. */
export const BEATS_PER_BAR = 4;
export const TIME_SIGNATURE = "4/4";

/** Waveform resolution: four peaks per beat — a 16th-note grid, enough for a hi-hat to read as 16ths. */
export const PEAKS_PER_BEAT = 4;
export const PEAKS_PER_BAR = BEATS_PER_BAR * PEAKS_PER_BEAT;

/* --- sections (from the Task 0.4 structure markers) --------------------------- */

export interface ArrangeSection {
  readonly label: string;
  /** 1-based first bar. */
  readonly startBar: number;
  /** 1-based last bar, inclusive. */
  readonly endBar: number;
  readonly barCount: number;
}

/** The structure markers with their bar positions resolved — spans sum to the timeline (guarded in Task 0.4). */
export const ARRANGE_SECTIONS: readonly ArrangeSection[] = (() => {
  let bar = 1;
  return ARRANGE_STRUCTURE_MARKERS.map((marker) => {
    const section = { label: marker.label, startBar: bar, endBar: bar + marker.barCount - 1, barCount: marker.barCount };
    bar += marker.barCount;
    return section;
  });
})();

export function sectionAt(bar: number): ArrangeSection | null {
  return ARRANGE_SECTIONS.find((s) => bar >= s.startBar && bar <= s.endBar) ?? null;
}

/* --- tempo track --------------------------------------------------------------- */

export interface TempoMarker {
  /** 1-based bar the tempo takes effect from (on its first beat). */
  readonly bar: number;
  readonly bpm: number;
  /** Printed beside the first marker only (the session's one time signature). */
  readonly signature?: string;
}

/**
 * Fixture tempo markers (owner, 2026-11-01): a few changes rather than one
 * constant, so a marker's position and its held tempo can be reviewed against
 * the ruler — 120 through the verses and choruses, 112 for the Bridge, 120
 * again for the Solo, 104 for the Outro. Bars follow the section fixture.
 */
export const ARRANGE_TEMPO_MARKERS: readonly TempoMarker[] = [
  { bar: 1, bpm: 120, signature: TIME_SIGNATURE },
  { bar: 41, bpm: 112 },
  { bar: 45, bpm: 120 },
  { bar: 53, bpm: 104 },
];

/** The tempo in force at a bar: the last marker at or before it. */
export function tempoAt(bar: number, markers: readonly TempoMarker[] = ARRANGE_TEMPO_MARKERS): number {
  let bpm = markers[0]?.bpm ?? 120;
  for (const marker of markers) if (marker.bar <= bar) bpm = marker.bpm;
  return bpm;
}

/** The band the tempo trace is drawn across — fixture values sit inside it with room above and below. */
export const ARRANGE_TEMPO_RANGE = { min: 96, max: 128 } as const;

/**
 * The tempo track's step trace, in bar units (x = bar − 1) and a 0..1 vertical
 * fraction (0 = max tempo, 1 = min): held flat from each marker to the next,
 * stepping at the marker. One path for the band's SVG; the SVG stretches it.
 */
export function tempoTracePath(markers: readonly TempoMarker[] = ARRANGE_TEMPO_MARKERS, barCount: number = ARRANGE_BAR_COUNT): string {
  const span = ARRANGE_TEMPO_RANGE.max - ARRANGE_TEMPO_RANGE.min;
  const y = (bpm: number) => ((ARRANGE_TEMPO_RANGE.max - bpm) / span).toFixed(4);
  const parts: string[] = [];
  markers.forEach((marker, index) => {
    const x = marker.bar - 1;
    const next = markers[index + 1];
    const xEnd = next ? next.bar - 1 : barCount;
    parts.push(index === 0 ? `M${x} ${y(marker.bpm)}` : `V${y(marker.bpm)}`);
    parts.push(`H${xEnd}`);
  });
  return parts.join(" ");
}

/* --- clips and waveform placeholders ------------------------------------------- */

/**
 * The drawn character of a stem's overview. Each kind is a small deterministic
 * recipe in `peakAt` — where the hits fall in the bar, how they decay, how
 * dense the material is — so a kick, a pad and a vocal are told apart at a
 * glance, as the prompt asks. Purely visual fixture vocabulary.
 */
export type WaveKind =
  | "kick"
  | "snare"
  | "snare_bottom"
  | "hat"
  | "overhead"
  | "room"
  | "bass"
  | "rhythm_guitar"
  | "lead_guitar"
  | "piano"
  | "pad"
  | "vocal"
  | "vocal_double"
  | "harmony"
  | "shaker"
  | "riser";

export interface ClipSpec {
  readonly startBar: number;
  readonly barCount: number;
}

export interface TrackTimelineFixture {
  readonly trackCode: string;
  readonly kind: WaveKind;
  /** 1 = a mono stem drawn on the lane's midline; 2 = a stereo source drawn as two halves (Task 0.4 sized the lane for this). */
  readonly channels: 1 | 2;
  /** Overall level of the drawing, 0..1. */
  readonly level: number;
  readonly clips: readonly ClipSpec[];
}

/**
 * Where each fixture track plays (owner's session, Console `TRACK_STRIPS`
 * order). Sections: Intro 1–4, Verse 5–12, Pre-Chorus 13–16, Chorus 17–24,
 * Verse 25–32, Chorus 33–40, Bridge 41–44, Solo 45–52, Outro 53–56. The
 * drums and bass sit out the Bridge; guitars build in; the vocal is comped
 * in section-length takes; the riser swells into each chorus and the solo.
 */
export const ARRANGE_TIMELINE_FIXTURES: readonly TrackTimelineFixture[] = [
  { trackCode: "01", kind: "kick", channels: 1, level: 1, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "02", kind: "snare", channels: 1, level: 0.95, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "03", kind: "snare_bottom", channels: 1, level: 0.7, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "04", kind: "hat", channels: 1, level: 0.6, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "05", kind: "overhead", channels: 1, level: 0.75, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "06", kind: "overhead", channels: 1, level: 0.75, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "07", kind: "room", channels: 1, level: 0.6, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "08", kind: "bass", channels: 1, level: 0.85, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "09", kind: "bass", channels: 1, level: 0.75, clips: [{ startBar: 5, barCount: 36 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "10", kind: "rhythm_guitar", channels: 1, level: 0.8, clips: [{ startBar: 13, barCount: 12 }, { startBar: 29, barCount: 12 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "11", kind: "rhythm_guitar", channels: 1, level: 0.8, clips: [{ startBar: 13, barCount: 12 }, { startBar: 29, barCount: 12 }, { startBar: 45, barCount: 12 }] },
  { trackCode: "12", kind: "lead_guitar", channels: 1, level: 0.85, clips: [{ startBar: 17, barCount: 8 }, { startBar: 45, barCount: 8 }] },
  { trackCode: "13", kind: "piano", channels: 2, level: 0.8, clips: [{ startBar: 1, barCount: 16 }, { startBar: 25, barCount: 8 }, { startBar: 41, barCount: 4 }, { startBar: 53, barCount: 4 }] },
  { trackCode: "14", kind: "pad", channels: 2, level: 0.7, clips: [{ startBar: 1, barCount: 4 }, { startBar: 13, barCount: 12 }, { startBar: 33, barCount: 12 }, { startBar: 53, barCount: 4 }] },
  { trackCode: "15", kind: "vocal", channels: 1, level: 0.88, clips: [{ startBar: 5, barCount: 8 }, { startBar: 13, barCount: 12 }, { startBar: 25, barCount: 16 }, { startBar: 41, barCount: 4 }, { startBar: 53, barCount: 3 }] },
  { trackCode: "16", kind: "vocal_double", channels: 1, level: 0.7, clips: [{ startBar: 17, barCount: 8 }, { startBar: 33, barCount: 8 }] },
  { trackCode: "17", kind: "harmony", channels: 1, level: 0.52, clips: [{ startBar: 17, barCount: 8 }, { startBar: 33, barCount: 8 }, { startBar: 53, barCount: 4 }] },
  { trackCode: "18", kind: "harmony", channels: 1, level: 0.52, clips: [{ startBar: 17, barCount: 8 }, { startBar: 33, barCount: 8 }, { startBar: 53, barCount: 4 }] },
  { trackCode: "19", kind: "shaker", channels: 1, level: 0.5, clips: [{ startBar: 17, barCount: 8 }, { startBar: 33, barCount: 8 }, { startBar: 45, barCount: 8 }] },
  { trackCode: "20", kind: "riser", channels: 2, level: 0.9, clips: [{ startBar: 13, barCount: 4 }, { startBar: 29, barCount: 4 }, { startBar: 41, barCount: 4 }] },
];

/* --- the drawing ---------------------------------------------------------------- */

/** A small deterministic generator (mulberry32) — the same seed always draws the same stem. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How loud each section plays, so the overview breathes with the song. */
const SECTION_DYNAMICS: Readonly<Record<string, number>> = {
  Intro: 0.72,
  Verse: 0.82,
  "Pre-Chorus": 0.9,
  Chorus: 1,
  Bridge: 0.78,
  Solo: 0.95,
  Outro: 0.7,
};

/** Hit-then-decay shapes across the four peaks of a beat. */
const DECAY_FAST = [1, 0.42, 0.18, 0.07] as const;
const DECAY_MEDIUM = [1, 0.62, 0.38, 0.2] as const;
const DECAY_SLOW = [1, 0.84, 0.7, 0.58] as const;

/** Vocal phrasing shared by the lead, its double and the harmonies: 6 beats sung, 2 beats breath, per 2-bar pair. */
function inPhrase(bar: number, beat: number): boolean {
  const beatInPair = ((bar - 1) % 2) * BEATS_PER_BAR + beat;
  return beatInPair < 6;
}

/**
 * One peak (0..1) of a stem's overview at an absolute position: `bar`
 * (1-based), `beat` (0..3) and `sub` (0..3, the 16th within the beat). The
 * `rand` stream is advanced exactly once per call so a clip's drawing depends
 * only on its seed and position; `variant` (0 / 1, the track number's parity)
 * lets a left / right pair of the same kind differ in more than noise.
 */
function peakAt(kind: WaveKind, bar: number, beat: number, sub: number, rand: () => number, clipProgress: number, channel: number, variant: number): number {
  const r = rand();
  const onBeat = sub === 0;
  const eighth = sub === 0 || sub === 2;
  const section = sectionAt(bar)?.label ?? "Verse";
  const chorus = section === "Chorus" || section === "Solo";
  switch (kind) {
    case "kick": {
      const hit = (beat === 0 || beat === 2) && onBeat ? 1 : (bar % 2 === 0 && beat === 1 && sub === 2 ? 0.7 : 0);
      const tail = beat === 0 || beat === 2 ? DECAY_FAST[sub] : bar % 2 === 0 && beat === 1 && sub >= 2 ? DECAY_FAST[sub - 2] * 0.7 : 0;
      return Math.max(hit, tail) * (0.92 + 0.08 * r) + 0.02;
    }
    case "snare":
    case "snare_bottom": {
      const main = (beat === 1 || beat === 3) ? DECAY_MEDIUM[sub] : 0;
      const ghost = (beat === 0 || beat === 2) && sub === 2 && r > 0.5 ? 0.18 : 0;
      const body = Math.max(main * (0.9 + 0.1 * r), ghost);
      return kind === "snare" ? body + 0.02 : body * 0.85 + 0.06 + 0.04 * r;
    }
    case "hat": {
      const sixteenths = chorus;
      const strike = eighth ? (onBeat ? 0.62 : 0.46) : sixteenths ? 0.3 : 0;
      return strike * (0.85 + 0.15 * r) + 0.03;
    }
    case "overhead": {
      const crash = beat === 0 && sectionAt(bar)?.startBar === bar ? Math.max(0, 0.95 - sub * 0.12) : 0;
      const snareBleed = (beat === 1 || beat === 3) ? DECAY_MEDIUM[sub] * 0.38 : 0;
      // the right overhead (even track number) sits over the ride, the left over the hats
      const ride = variant === 1 || chorus ? (eighth ? 0.22 : 0.1) : (eighth ? 0.14 : 0.06);
      return Math.max(crash, snareBleed, ride) * (0.8 + 0.2 * r) + 0.1 + 0.04 * r;
    }
    case "room": {
      // the kit heard from the room: kick on 1 and 3, the louder snare on 2 and 4, each hit ringing out
      const drum = (beat === 0 || beat === 2 ? 0.58 : 0.86) * [1, 0.68, 0.46, 0.34][sub] * 0.6;
      return drum * (0.85 + 0.15 * r) + 0.1 + 0.03 * r;
    }
    case "bass": {
      const rest = bar % 4 === 0 && beat === 3;
      if (rest) return 0.06 + 0.04 * r;
      // a note a beat: a plucked attack settling into its sustain, a passing eighth before the bar line
      const note = onBeat ? 0.8 : [0, 0.5, 0.4, 0.34][sub];
      const passing = beat === 3 && sub === 2 ? 0.62 : 0;
      return Math.max(note, passing) * (0.84 + 0.16 * r) + 0.03;
    }
    case "rhythm_guitar": {
      const strum = eighth ? (onBeat && beat === 0 ? 0.72 : 0.56) : (chorus ? 0.44 : 0.4);
      return strum * (0.86 + 0.14 * r) + 0.05;
    }
    case "lead_guitar": {
      if (section === "Solo") {
        const position = (bar - 1) * PEAKS_PER_BAR + beat * PEAKS_PER_BEAT + sub;
        const vibrato = 0.08 * Math.sin(position * 1.7);
        const phraseGap = bar % 4 === 0 && beat === 3 ? 0.4 : 1;
        return (0.72 + vibrato) * phraseGap * (0.92 + 0.08 * r) + 0.04;
      }
      const fill = ((bar - 1) % 2 === 1 && beat >= 2) ? 0.5 * DECAY_SLOW[sub] : 0.06;
      return fill * (0.9 + 0.1 * r) + 0.02;
    }
    case "piano": {
      // chords on 1 and 3 ringing into 2 and 4, a lighter arpeggio under the verses
      const chord = (beat === 0 || beat === 2) ? DECAY_SLOW[sub] * 0.8 : [0.44, 0.38, 0.33, 0.29][sub];
      const arpeggio = section === "Verse" && eighth ? 0.12 : 0;
      const side = channel === 1 ? 0.93 : 1;
      return (chord + arpeggio) * side * (0.9 + 0.1 * r) + 0.03;
    }
    case "pad": {
      const swell = 0.4 + 0.3 * Math.sin(Math.PI * Math.min(1, Math.max(0, clipProgress)));
      const side = channel === 1 ? 0.96 : 1;
      return swell * side * (0.96 + 0.04 * r) + 0.02;
    }
    case "vocal":
    case "vocal_double":
    case "harmony": {
      if (!inPhrase(bar, beat)) return 0.03 + 0.02 * r;
      // a phrase: syllables on the eighths, each settling by its second sixteenth; the
      // phrase itself swells into its third beat and eases out of its sixth
      const beatInPair = ((bar - 1) % 2) * BEATS_PER_BAR + beat;
      const contour = [0.72, 0.9, 1, 1, 0.92, 0.78][beatInPair] ?? 1;
      const syllable = kind === "harmony" ? 0.5 + 0.08 * r : eighth ? 0.5 + 0.42 * r : 0.6 * (0.5 + 0.42 * r);
      const scale = kind === "vocal" ? 1 : kind === "vocal_double" ? 0.8 : 0.85;
      return syllable * contour * scale + 0.03;
    }
    case "shaker": {
      const strike = onBeat ? 0.5 : sub === 2 ? 0.4 : 0.32;
      return strike * (0.85 + 0.15 * r) + 0.03;
    }
    case "riser": {
      const rise = 0.1 + 0.88 * Math.pow(Math.min(1, Math.max(0, clipProgress)), 1.6);
      const side = channel === 1 ? 0.95 : 1;
      return rise * side * (0.88 + 0.12 * r);
    }
  }
}

/** The peaks of one clip channel, in order, with the section dynamics applied. */
export function clipPeaks(fixture: TrackTimelineFixture, clip: ClipSpec, channel: number): readonly number[] {
  const seed = Number(fixture.trackCode) * 7919 + clip.startBar * 131 + channel * 17;
  const rand = seeded(seed);
  const total = clip.barCount * PEAKS_PER_BAR;
  const peaks: number[] = [];
  for (let i = 0; i < total; i += 1) {
    const bar = clip.startBar + Math.floor(i / PEAKS_PER_BAR);
    const beat = Math.floor((i % PEAKS_PER_BAR) / PEAKS_PER_BEAT);
    const sub = i % PEAKS_PER_BEAT;
    const dynamics = SECTION_DYNAMICS[sectionAt(bar)?.label ?? "Verse"] ?? 0.8;
    const value = peakAt(fixture.kind, bar, beat, sub, rand, i / Math.max(1, total - 1), channel, Number(fixture.trackCode) % 2 === 0 ? 1 : 0) * fixture.level * dynamics;
    peaks.push(Math.min(1, Math.max(0, value)));
  }
  return peaks;
}

/**
 * A closed, symmetric envelope for one channel as an SVG path in a
 * `0 0 peakCount 100` view box (the lane stretches it to the clip's size,
 * `preserveAspectRatio="none"`): the upper edge left to right at
 * `centre − peak·half`, the lower edge back at `centre + peak·half`.
 */
export function wavePath(peaks: readonly number[], centre: number, half: number): string {
  if (peaks.length === 0) return "";
  const n = peaks.length;
  const upper: string[] = [];
  const lower: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = peaks[i] * half;
    upper.push(`L${i} ${(centre - a).toFixed(1)}`);
    lower.push(`L${i} ${(centre + a).toFixed(1)}`);
  }
  lower.reverse();
  return `M0 ${centre} ${upper.join(" ")} L${n - 1} ${centre} ${lower.join(" ")} Z`;
}

/** Where each channel's envelope sits in the 100-unit lane: one on the midline, or two halves. */
export const WAVE_LAYOUT = {
  mono: [{ centre: 50, half: 44 }],
  stereo: [
    { centre: 26, half: 21 },
    { centre: 74, half: 21 },
  ],
} as const;

export interface ArrangeClip {
  readonly clipId: string;
  readonly trackCode: string;
  /**
   * Where the drawing comes from (Task 5.1): `fixture` = generated from the
   * fixture above, SIMULATED; `audio` = the peaks of an imported file
   * (lib/arrange-audio.ts), real.
   */
  readonly source: "fixture" | "audio";
  /** The fixture's drawing kind, or `audio` for a clip drawn from a file's peaks. */
  readonly kind: WaveKind | "audio";
  readonly startBar: number;
  /** Bars, fractional for an audio clip (a 6.5-bar stem is 6.5 bars wide). */
  readonly barCount: number;
  /** 1-based last bar, inclusive. */
  readonly endBar: number;
  readonly channels: 1 | 2;
  readonly peakCount: number;
  /** One SVG path per channel (see `wavePath`). */
  readonly waves: readonly { readonly d: string; readonly centre: number }[];
  /** Audio clips only: the file's length. */
  readonly seconds?: number;
}

/** Builds the drawn clips of one fixture track. */
export function buildClips(fixture: TrackTimelineFixture): readonly ArrangeClip[] {
  const layout = fixture.channels === 2 ? WAVE_LAYOUT.stereo : WAVE_LAYOUT.mono;
  return fixture.clips.map((clip, index) => ({
    clipId: `${fixture.trackCode}-${index + 1}`,
    trackCode: fixture.trackCode,
    source: "fixture",
    kind: fixture.kind,
    startBar: clip.startBar,
    barCount: clip.barCount,
    endBar: clip.startBar + clip.barCount - 1,
    channels: fixture.channels,
    peakCount: clip.barCount * PEAKS_PER_BAR,
    waves: layout.map((slot, channel) => ({ d: wavePath(clipPeaks(fixture, clip, channel), slot.centre, slot.half), centre: slot.centre })),
  }));
}

/** Every fixture clip, drawn once at load; keyed by track code via `clipsOf`. */
export const ARRANGE_CLIPS: readonly ArrangeClip[] = ARRANGE_TIMELINE_FIXTURES.flatMap(buildClips);

const CLIPS_BY_TRACK: ReadonlyMap<string, readonly ArrangeClip[]> = new Map(
  ARRANGE_TIMELINE_FIXTURES.map((fixture) => [fixture.trackCode, ARRANGE_CLIPS.filter((clip) => clip.trackCode === fixture.trackCode)]),
);

/** The clips of a track, or none (tracks beyond the fixture session have empty lanes). */
export function clipsOf(trackCode: string): readonly ArrangeClip[] {
  return CLIPS_BY_TRACK.get(trackCode) ?? [];
}
