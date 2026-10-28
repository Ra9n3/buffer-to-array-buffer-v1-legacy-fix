/**
 * Arrange room structural data — Task 0.4.
 *
 * Placeholders only. No audio, no project state, no derived data: these are
 * literal structural counts and labels so the Phase 0 skeleton can prove its
 * layout. Task 2.5 and Task 2.6 replace them with real session data.
 */

export interface ArrangeTrackPlaceholder {
  readonly code: string;
  readonly name: string;
}

/**
 * PLACEHOLDER DEFAULT ONLY — not a product requirement.
 *
 * The product plan does not specify how many tracks Arrange shows. 20 is chosen
 * because it matches the Console channel-bank placeholder so both rooms
 * describe the same pretend session, and because 20 rows overflow the visible
 * Arrange area at both review widths (1024x768 and 1920x1080), which is what
 * makes the vertical-scroll behaviour meaningful to review.
 *
 * Real track counts arrive with the project model in a later phase. Until then
 * this is a single tunable value: change it here, or pass a different count to
 * createArrangeTracks(), and every row, lane, and count label follows.
 */
export const PLACEHOLDER_TRACK_COUNT = 20;

/**
 * Builds `count` placeholder track rows. Kept as a factory rather than a
 * literal array so the row count is a parameter, never baked into the markup.
 */
export function createArrangeTracks(
  count: number = PLACEHOLDER_TRACK_COUNT,
): readonly ArrangeTrackPlaceholder[] {
  return Array.from({ length: count }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");
    return { code, name: `Track ${code}` };
  });
}

/** Active placeholder row count for the running app. */
export const ARRANGE_TRACK_COUNT = PLACEHOLDER_TRACK_COUNT;

/** Timeline length in bars. Drives the ruler and every marker span. */
export const ARRANGE_BAR_COUNT = 56;

/** Bars between ruler labels. */
export const ARRANGE_RULER_LABEL_INTERVAL = 4;

/** Bar numbers 1..ARRANGE_BAR_COUNT, used by the ruler and the bar grids. */
export const ARRANGE_BARS: readonly number[] = Array.from(
  { length: ARRANGE_BAR_COUNT },
  (_, index) => index + 1,
);

export const ARRANGE_TRACKS: readonly ArrangeTrackPlaceholder[] =
  createArrangeTracks(ARRANGE_TRACK_COUNT);

export interface StructureMarkerPlaceholder {
  readonly label: string;
  readonly barCount: number;
}

/**
 * Song structure markers, in the canonical order from the product plan:
 * Intro, Verse, Pre-Chorus, Chorus, Bridge, Solo, Outro. Span lengths are
 * placeholders and must sum to ARRANGE_BAR_COUNT.
 */
export const ARRANGE_STRUCTURE_MARKERS: readonly StructureMarkerPlaceholder[] = [
  { label: "Intro", barCount: 4 },
  { label: "Verse", barCount: 8 },
  { label: "Pre-Chorus", barCount: 4 },
  { label: "Chorus", barCount: 8 },
  { label: "Verse", barCount: 8 },
  { label: "Chorus", barCount: 8 },
  { label: "Bridge", barCount: 4 },
  { label: "Solo", barCount: 8 },
  { label: "Outro", barCount: 4 },
];

/** Ruler bar numbers that carry a visible label. */
export const ARRANGE_RULER_LABELS: readonly {
  readonly bar: number;
  readonly label: string;
}[] = Array.from(
  { length: Math.ceil(ARRANGE_BAR_COUNT / ARRANGE_RULER_LABEL_INTERVAL) },
  (_, index) => {
    const bar = index * ARRANGE_RULER_LABEL_INTERVAL + 1;
    return { bar, label: String(bar) };
  },
);
