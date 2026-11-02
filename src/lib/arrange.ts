/**
 * Arrange room data — Task 0.4 structure, Task 2.5 track-list rows.
 *
 * SIMULATED fixture data. No audio, no project state, no detection, no
 * persistence: every value is a typed-in constant. The timeline constants
 * (bars, ruler, structure markers) are the Task 0.4 placeholders, untouched
 * until Task 2.6. The track rows are the Task 2.5 fixture session: the same
 * twenty tracks the Console channel bank shows (`TRACK_STRIPS`, Task 2.2 —
 * names and organisational colours taken from that list, never retyped, so
 * the two rooms describe one session, plan §5: "changes … appear
 * immediately in all rooms because they share one project model"), each
 * with a source family and source type, a role and a Prominence Tier
 * (plan §5, §5a). Four separate things, for the future rule-based engine:
 * the FAMILY organises the source choices; the SOURCE TYPE identifies the
 * track for mixing-rule lookup; the ROLE is its musical function; the TIER
 * its intended prominence; the track NAME is an editable display label and
 * never an identity; the project GENRE (later) is project-level context.
 * No rule is evaluated here.
 *
 * Task 3.1 (shared typed project model) replaces this file's track data.
 */

import { TRACK_STRIPS, type OrgSwatch } from "../components/channel-strip/track-strip-fixtures";

/* --- family and source type (plan §5: what the source is) ------------------ */

/**
 * The eleven source families (owner, Task 2.5 second follow-up, in the
 * owner's order; Percussion is a top-level family, not a subgroup of
 * Drums). A family organises the source choices: the row's FAMILY window
 * chooses one, the SOURCE TYPE window then offers that family's sources.
 * A practical mixing taxonomy, not an exhaustive instrument classification.
 */
export type FamilyId =
  | "drums"
  | "percussion"
  | "keys"
  | "strings"
  | "brass"
  | "woodwinds"
  | "synths"
  | "fx"
  | "guitar"
  | "bass"
  | "vocals";

export interface Family {
  readonly familyId: FamilyId;
  readonly label: string;
}

export const FAMILIES: readonly Family[] = [
  { familyId: "drums", label: "Drums" },
  { familyId: "percussion", label: "Percussion" },
  { familyId: "keys", label: "Keys" },
  { familyId: "strings", label: "Strings" },
  { familyId: "brass", label: "Brass" },
  { familyId: "woodwinds", label: "Woodwinds" },
  { familyId: "synths", label: "Synths" },
  { familyId: "fx", label: "FX" },
  { familyId: "guitar", label: "Guitar" },
  { familyId: "bass", label: "Bass" },
  { familyId: "vocals", label: "Vocals" },
];

/**
 * A source type: the stable identity of what a track IS for mixing-rule
 * lookup (the future engine reads `sourceTypeId` with the project genre,
 * the Role and the Prominence Tier — never the editable track name).
 * `sourceTypeId` is a stable snake_case id, `label` the user-facing print,
 * `familyId` the family that offers it.
 */
export interface SourceType {
  readonly sourceTypeId: string;
  readonly label: string;
  readonly familyId: FamilyId;
}

/**
 * The compact source catalog (owner, Task 2.5 second follow-up) — a
 * mixing-oriented list, not an instrument encyclopaedia. Conventions:
 * Synth Bass and Sub / 808 Bass live under Bass; Synth Lead, Synth Pad and
 * the other non-bass synth sources under Synths; Overheads and Room are
 * drum recordings; FX is source material, not a reverb / delay return.
 * Every family also offers "Unspecified" (no source type: `null`), see
 * `sourceOptionsOf`.
 */
export const SOURCE_TYPES: readonly SourceType[] = [
  // Drums
  { sourceTypeId: "kick", label: "Kick", familyId: "drums" },
  { sourceTypeId: "snare", label: "Snare", familyId: "drums" },
  { sourceTypeId: "hi_hat", label: "Hi-Hat", familyId: "drums" },
  { sourceTypeId: "toms", label: "Toms", familyId: "drums" },
  { sourceTypeId: "cymbals", label: "Cymbals", familyId: "drums" },
  { sourceTypeId: "overheads", label: "Overheads", familyId: "drums" },
  { sourceTypeId: "room", label: "Room", familyId: "drums" },
  { sourceTypeId: "clap", label: "Clap", familyId: "drums" },
  { sourceTypeId: "full_drum_kit", label: "Full Drum Kit", familyId: "drums" },
  // Percussion
  { sourceTypeId: "hand_drums", label: "Hand Drums", familyId: "percussion" },
  { sourceTypeId: "shaker", label: "Shaker", familyId: "percussion" },
  { sourceTypeId: "tambourine", label: "Tambourine", familyId: "percussion" },
  { sourceTypeId: "tuned_percussion", label: "Tuned Percussion", familyId: "percussion" },
  { sourceTypeId: "other_percussion", label: "Other Percussion", familyId: "percussion" },
  // Keys
  { sourceTypeId: "piano", label: "Piano", familyId: "keys" },
  { sourceTypeId: "electric_piano", label: "Electric Piano / Rhodes", familyId: "keys" },
  { sourceTypeId: "organ", label: "Organ", familyId: "keys" },
  // Strings
  { sourceTypeId: "violin", label: "Violin", familyId: "strings" },
  { sourceTypeId: "viola", label: "Viola", familyId: "strings" },
  { sourceTypeId: "cello", label: "Cello", familyId: "strings" },
  { sourceTypeId: "string_section", label: "String Section", familyId: "strings" },
  { sourceTypeId: "plucked_strings", label: "Plucked Strings", familyId: "strings" },
  // Brass
  { sourceTypeId: "trumpet", label: "Trumpet", familyId: "brass" },
  { sourceTypeId: "trombone", label: "Trombone", familyId: "brass" },
  { sourceTypeId: "french_horn", label: "French Horn", familyId: "brass" },
  { sourceTypeId: "brass_section", label: "Brass Section", familyId: "brass" },
  // Woodwinds
  { sourceTypeId: "flute", label: "Flute", familyId: "woodwinds" },
  { sourceTypeId: "clarinet", label: "Clarinet", familyId: "woodwinds" },
  { sourceTypeId: "oboe", label: "Oboe", familyId: "woodwinds" },
  { sourceTypeId: "bassoon", label: "Bassoon", familyId: "woodwinds" },
  { sourceTypeId: "saxophone", label: "Saxophone", familyId: "woodwinds" },
  { sourceTypeId: "woodwind_ensemble", label: "Woodwind Ensemble", familyId: "woodwinds" },
  // Synths
  { sourceTypeId: "synth_lead", label: "Synth Lead", familyId: "synths" },
  { sourceTypeId: "synth_pad", label: "Synth Pad", familyId: "synths" },
  { sourceTypeId: "synth_pluck", label: "Synth Pluck", familyId: "synths" },
  { sourceTypeId: "synth_arp", label: "Synth Arp / Sequence", familyId: "synths" },
  { sourceTypeId: "synth_texture", label: "Synth Texture", familyId: "synths" },
  { sourceTypeId: "other_synth", label: "Other Synth", familyId: "synths" },
  // FX
  { sourceTypeId: "impact", label: "Impact", familyId: "fx" },
  { sourceTypeId: "riser_sweep", label: "Riser / Sweep", familyId: "fx" },
  { sourceTypeId: "atmosphere", label: "Atmosphere", familyId: "fx" },
  { sourceTypeId: "other_fx", label: "Other FX", familyId: "fx" },
  // Guitar
  { sourceTypeId: "acoustic_guitar", label: "Acoustic Guitar", familyId: "guitar" },
  { sourceTypeId: "clean_electric_guitar", label: "Clean Electric Guitar", familyId: "guitar" },
  { sourceTypeId: "distorted_electric_guitar", label: "Distorted Electric Guitar", familyId: "guitar" },
  // Bass
  { sourceTypeId: "electric_bass", label: "Electric Bass", familyId: "bass" },
  { sourceTypeId: "upright_bass", label: "Acoustic / Upright Bass", familyId: "bass" },
  { sourceTypeId: "synth_bass", label: "Synth Bass", familyId: "bass" },
  { sourceTypeId: "sub_808_bass", label: "Sub / 808 Bass", familyId: "bass" },
  // Vocals
  { sourceTypeId: "lead_vocal", label: "Lead Vocal", familyId: "vocals" },
  { sourceTypeId: "backing_vocal", label: "Backing Vocal", familyId: "vocals" },
  { sourceTypeId: "vocal_double", label: "Vocal Double", familyId: "vocals" },
  { sourceTypeId: "choir", label: "Choir", familyId: "vocals" },
  { sourceTypeId: "spoken_rap_vocal", label: "Spoken / Rap Vocal", familyId: "vocals" },
];

/** The select-option id that stands for "no source type" (`sourceTypeId: null`). */
export const UNSPECIFIED_ID = "";
export const UNSPECIFIED_LABEL = "Unspecified";

/** The catalog entry for an id, or null (unspecified or unknown). */
export function sourceType(id: string | null, catalog: readonly SourceType[] = SOURCE_TYPES): SourceType | null {
  return id === null ? null : (catalog.find((s) => s.sourceTypeId === id) ?? null);
}

/** A family's source types, in catalog order. */
export function sourceTypesOf(family: FamilyId | null, catalog: readonly SourceType[] = SOURCE_TYPES): readonly SourceType[] {
  return family === null ? [] : catalog.filter((s) => s.familyId === family);
}

/**
 * Whether a source may be shown under a family: no source (`null`) always
 * may; a source only in its own family. Used when the family changes —
 * an incompatible source is cleared to Unspecified, never replaced by a
 * default (owner, second follow-up).
 */
export function isValidSource(family: FamilyId | null, id: string | null, catalog: readonly SourceType[] = SOURCE_TYPES): boolean {
  return id === null || sourceType(id, catalog)?.familyId === family;
}

/** The family label for an id, or null. */
export function familyLabel(id: FamilyId | null): string | null {
  return FAMILIES.find((f) => f.familyId === id)?.label ?? null;
}

/** The FAMILY window's options (the select speaks `{ id, name }`). */
export const FAMILY_OPTIONS: readonly { readonly id: string; readonly name: string }[] = FAMILIES.map((f) => ({ id: f.familyId, name: f.label }));

/**
 * The SOURCE TYPE window's options for a family: "Unspecified" first, then
 * the family's sources; nothing while no family is set.
 */
export function sourceOptionsOf(family: FamilyId | null, catalog: readonly SourceType[] = SOURCE_TYPES): readonly { readonly id: string; readonly name: string }[] {
  if (family === null) return [];
  return [{ id: UNSPECIFIED_ID, name: UNSPECIFIED_LABEL }, ...sourceTypesOf(family, catalog).map((s) => ({ id: s.sourceTypeId, name: s.label }))];
}

/* --- role (plan §5: the track's musical function) --------------------------- */

export type RoleId = "lead" | "rhythm" | "double" | "harmony";

export interface Role {
  /** One of the four, or null for NO_ROLE (Task 5.1). */
  readonly id: RoleId | null;
  /** The short print on the row. */
  readonly name: string;
  /** The plan's full wording, for the tooltip. */
  readonly long: string;
}

/** Plan §5 / glossary: lead/main, rhythm, stacked/double, background/harmony. */
export const ROLES: readonly Role[] = [
  { id: "lead", name: "Lead", long: "Lead / main" },
  { id: "rhythm", name: "Rhythm", long: "Rhythm" },
  { id: "double", name: "Double", long: "Stacked / double" },
  { id: "harmony", name: "Harmony", long: "Background / harmony" },
];

/**
 * Task 5.1: a track nobody has classified (an imported stem) has no role
 * yet; its print is a dash, not a guess. `id` is null so no consumer can
 * mistake it for one of the four.
 */
export const NO_ROLE: Role = { id: null, name: "\u2014", long: "Not assigned yet" };

export function role(id: RoleId | null): Role {
  if (id === null) return NO_ROLE;
  return ROLES.find((r) => r.id === id) ?? ROLES[1];
}

/* --- Prominence Tier (plan §5a: mix-conflict treatment) --------------------- */

export type ProminenceTier = "primary" | "supporting" | "background";

export interface TierOption {
  readonly id: ProminenceTier;
  readonly name: string;
}

/**
 * Three tiers, plan §5a (owner, D2.5.1). Independent of Role: the shared
 * word "Background" is a coincidence, not a link (plan §5a, glossary).
 */
export const PROMINENCE_TIERS: readonly TierOption[] = [
  { id: "primary", name: "Primary" },
  { id: "supporting", name: "Supporting" },
  { id: "background", name: "Background" },
];

/** Plan §5a: a track without a confident match defaults to Supporting. */
export const DEFAULT_TIER: ProminenceTier = "supporting";

/* --- the rows ---------------------------------------------------------------- */

export interface ArrangeTrack {
  readonly code: string;
  /** The editable display name — never the source identity. */
  readonly name: string;
  readonly org: OrgSwatch;
  /** The source family, or null: unassigned. */
  readonly familyId: FamilyId | null;
  /** A `SOURCE_TYPES` id within `familyId`, or null: Unspecified. */
  readonly sourceTypeId: string | null;
  /** The musical function, or null: not assigned yet (an imported stem, Task 5.1). */
  readonly role: RoleId | null;
  readonly tier: ProminenceTier;
  /**
   * Plan §5a: a track whose classification was only suggested keeps the
   * default tier (Supporting) and is marked "needs confirmation" until the
   * user confirms a tier. Optional — absent means confirmed — so every
   * existing fixture and consumer is unchanged (Task 2.7; the Mixer strip
   * shows the state, the Arrange row does not draw it, D2.5.1).
   */
  readonly tierConfirmed?: boolean;
}

/** Task 0.4 name, kept for anything that still imports it. */
export type ArrangeTrackPlaceholder = ArrangeTrack;

type TrackSettings = Pick<ArrangeTrack, "familyId" | "sourceTypeId" | "role" | "tier" | "tierConfirmed">;

/**
 * The fixture session's family / source type / role / tier per track, keyed
 * by the shared track id — explicitly assigned, valid pairs (fixture setup,
 * not classification). Names and colours are NOT here: they come from the
 * Console's list. A track missing from this table gets the plan's defaults:
 * no family, no source (nothing is classified for it), Rhythm, Supporting.
 * Two doubles (09 Bass Amp, 16 Vocal Double) sit on the default tier with
 * `tierConfirmed: false` — fixture setup for the plan's "needs confirmation"
 * state, which the Mixer strip shows (Task 2.7, D2.7.4).
 */
const SESSION_SETTINGS: Readonly<Record<string, TrackSettings>> = {
  "01": { familyId: "drums", sourceTypeId: "kick", role: "rhythm", tier: "primary" },
  "02": { familyId: "drums", sourceTypeId: "snare", role: "rhythm", tier: "primary" },
  "03": { familyId: "drums", sourceTypeId: "snare", role: "double", tier: "supporting" },
  "04": { familyId: "drums", sourceTypeId: "hi_hat", role: "rhythm", tier: "supporting" },
  "05": { familyId: "drums", sourceTypeId: "overheads", role: "rhythm", tier: "supporting" },
  "06": { familyId: "drums", sourceTypeId: "overheads", role: "rhythm", tier: "supporting" },
  "07": { familyId: "drums", sourceTypeId: "room", role: "rhythm", tier: "background" },
  "08": { familyId: "bass", sourceTypeId: "electric_bass", role: "rhythm", tier: "primary" },
  "09": { familyId: "bass", sourceTypeId: "electric_bass", role: "double", tier: "supporting", tierConfirmed: false },
  "10": { familyId: "guitar", sourceTypeId: "distorted_electric_guitar", role: "rhythm", tier: "supporting" },
  "11": { familyId: "guitar", sourceTypeId: "distorted_electric_guitar", role: "rhythm", tier: "supporting" },
  "12": { familyId: "guitar", sourceTypeId: "clean_electric_guitar", role: "lead", tier: "primary" },
  "13": { familyId: "keys", sourceTypeId: "piano", role: "rhythm", tier: "supporting" },
  "14": { familyId: "synths", sourceTypeId: "synth_pad", role: "harmony", tier: "background" },
  "15": { familyId: "vocals", sourceTypeId: "lead_vocal", role: "lead", tier: "primary" },
  "16": { familyId: "vocals", sourceTypeId: "vocal_double", role: "double", tier: "supporting", tierConfirmed: false },
  "17": { familyId: "vocals", sourceTypeId: "backing_vocal", role: "harmony", tier: "background" },
  "18": { familyId: "vocals", sourceTypeId: "backing_vocal", role: "harmony", tier: "background" },
  "19": { familyId: "percussion", sourceTypeId: "shaker", role: "rhythm", tier: "background" },
  "20": { familyId: "fx", sourceTypeId: "riser_sweep", role: "harmony", tier: "background" },
};

const UNSET_SETTINGS: TrackSettings = { familyId: null, sourceTypeId: null, role: "rhythm", tier: DEFAULT_TIER };

/**
 * PLACEHOLDER DEFAULT ONLY — not a product requirement.
 *
 * The product plan does not specify how many tracks Arrange shows. 20 is chosen
 * because it matches the Console channel bank so both rooms describe the same
 * pretend session, and because 20 rows overflow the visible Arrange area at
 * both review widths (1024x768 and 1920x1080), which is what makes the
 * vertical-scroll behaviour meaningful to review.
 *
 * Real track counts arrive with the project model in a later phase. Until then
 * this is a single tunable value: change it here, or pass a different count to
 * createArrangeTracks(), and every row, lane, and count label follows.
 */
export const PLACEHOLDER_TRACK_COUNT = 20;

/**
 * Builds `count` track rows: the fixture session's tracks first (the Console's
 * list, in its order, with this file's settings), then neutral "Track NN"
 * rows with the plan's defaults (no family, no source, Rhythm, Supporting)
 * if more are asked for than the session holds.
 * Kept as a factory rather than a literal array so the row count is a
 * parameter, never baked into the markup.
 */
export function createArrangeTracks(
  count: number = PLACEHOLDER_TRACK_COUNT,
): readonly ArrangeTrack[] {
  return Array.from({ length: count }, (_, index) => {
    const strip = TRACK_STRIPS[index];
    if (strip) {
      return { code: strip.id, name: strip.name, org: strip.org, ...(SESSION_SETTINGS[strip.id] ?? UNSET_SETTINGS) };
    }
    const code = String(index + 1).padStart(2, "0");
    return { code, name: `Track ${code}`, org: "neutral", ...UNSET_SETTINGS };
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

export const ARRANGE_TRACKS: readonly ArrangeTrack[] =
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
