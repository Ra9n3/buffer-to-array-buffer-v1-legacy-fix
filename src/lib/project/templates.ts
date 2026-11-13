/**
 * ALLOY — PROJECT TEMPLATES — Task 4.1.
 *
 * The structures a project can be rebuilt from. A saved project (the
 * manifest, persistence.ts) holds identity and field values only, so
 * reopening one means: build its template, apply the saved values
 * (lifecycle.ts). Two templates exist in this build:
 *
 *   session-fixture  the approved development session (session.ts): the
 *                    twenty fixture tracks, three Returns, the Mix Bus. Its
 *                    identity is fixed (SESSION_PROJECT_ID) — there is one.
 *   empty            "Start empty" (owner, D4.1.2): no tracks, no Returns,
 *                    no buses — only the Master output exists, which is not
 *                    a channel. The plan's two default Returns (§8a) are
 *                    created by MIX / the user with the audio engine; their
 *                    parameter values are not invented here. The
 *                    arrangement is empty too: 0 bars, no sections, no
 *                    tempo markers, no clips; the time signature is the
 *                    conventional 4/4 label — nothing is drawn from it until
 *                    stems arrive (Phase 5).
 *
 * IMPORTED TRACKS (Task 5.1) are a third kind of structure: a stem the user
 * imported into either template. The manifest carries them in its `tracks`
 * block (persistence.ts) and `withImportedTracks` appends them to the
 * rebuilt template before the saved values are applied — so an imported
 * track's own settings travel like any other channel's.
 *
 * Pure: no Svelte, no storage, no ids of its own (the caller brings the id).
 */

import { SEND_RANGE, SEND_SLOT_COUNT, type OrgSwatch } from "../../components/channel-strip/track-strip-fixtures";
import { createChainState } from "../mixer-chain";
import { barCountFor, DEFAULT_TEMPO } from "../arrange-audio";
import { DEFAULT_PROJECT_RATE, type ProjectRate } from "../audio/rates";
import { audioSeconds, TIER_ANCHOR, trackId, type Arrangement, type Project, type ProjectTemplateId, type Track, type TrackAudio } from "./model";
import { SESSION_PROJECT_ID, createSessionProject } from "./session";

export const PROJECT_TEMPLATES: readonly ProjectTemplateId[] = ["session-fixture", "empty"];

export function isProjectTemplateId(value: unknown): value is ProjectTemplateId {
  return typeof value === "string" && (PROJECT_TEMPLATES as readonly string[]).includes(value);
}

/**
 * What Home prints for a template: the project's starting point, said as
 * such — never its current state. A project started empty may carry
 * imported stems (Task 5.1); its counts say what it holds now, this label
 * says only where it began (owner, 5.1 review).
 */
export const TEMPLATE_LABELS: Readonly<Record<ProjectTemplateId, string>> = {
  "session-fixture": "Started as the development session",
  empty: "Started empty",
};

export const EMPTY_PROJECT_NAME = "Untitled project";
export const EMPTY_TIME_SIGNATURE = "4/4";

/** A valid project with nothing in it: the model's own empty collections, Master only. The rate is chosen here and locked afterwards (Task 11.1). */
export function createEmptyProject(id: string, name: string = EMPTY_PROJECT_NAME, sampleRate: ProjectRate = DEFAULT_PROJECT_RATE): Project {
  return {
    id,
    name,
    template: "empty",
    sampleRate,
    tracks: [],
    returns: [],
    buses: [],
    arrangement: {
      barCount: 0,
      timeSignature: EMPTY_TIME_SIGNATURE,
      sections: [],
      tempoMarkers: [],
      clips: {},
    },
  };
}

/**
 * A fresh project of `template` under the identity a manifest recorded, or
 * null when the identity cannot belong to the template (the fixture session
 * has one id). The name is the saved one: a template has no claim on it.
 * The rate is the saved one when the manifest names it (Task 11.1); a
 * manifest that predates the field reopens at the legacy default, 48000 —
 * which is what those projects were built at.
 */
export function createTemplateProject(template: ProjectTemplateId, id: string, name: string, sampleRate: ProjectRate = DEFAULT_PROJECT_RATE): Project | null {
  if (template === "session-fixture") {
    if (id !== SESSION_PROJECT_ID) return null;
    const project = createSessionProject();
    project.name = name;
    // the fixture session's own rate is 48 kHz; a manifest that says otherwise
    // for this template is not trusted with it (the template decides).
    return { ...project, sampleRate: DEFAULT_PROJECT_RATE };
  }
  return createEmptyProject(id, name, sampleRate);
}

/** A project with no channels at all (every room shows its empty state). */
export function isEmptyProject(project: Pick<Project, "tracks" | "returns" | "buses">): boolean {
  return project.tracks.length === 0 && project.returns.length === 0 && project.buses.length === 0;
}

/* =========================================================================
   IMPORTED TRACKS (Task 5.1)
   ========================================================================= */

/** What the manifest records for an imported track — the structure the template cannot rebuild on its own. */
export interface ImportedTrackSpec {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly org: OrgSwatch;
  readonly audio: TrackAudio;
}

/**
 * A neutral chain: `createChainState` reads a fixture by printed code and
 * returns its neutral fallback for a code it has none for — the empty code
 * is one it never has, so no imported stem can inherit a fixture track's
 * EQ or compressor (an imported "01" in the empty project is not the
 * fixture's kick).
 */
export function createNeutralChainState() {
  return createChainState("");
}

/**
 * A track for an imported stem (plan §5a: nothing is known about it yet):
 * no family, no source type, no role; Supporting, unconfirmed — the tier a
 * track takes when no confident match exists; routed to Master (the empty
 * project has no bus, and the fixture's bus is the fixture's), unity
 * settings, empty sends, a neutral chain, no lamp lit. The settings are
 * fields like any track's, so the saved values apply over these.
 */
export function createImportedTrack(spec: ImportedTrackSpec): Track {
  return {
    kind: "track",
    id: spec.id as Track["id"],
    code: spec.code,
    type: "TRK",
    name: spec.name,
    org: spec.org,
    familyId: null,
    sourceTypeId: null,
    role: null,
    priority: TIER_ANCHOR.supporting,
    tierConfirmed: false,
    output: "master",
    channel: {
      trim: 0,
      pan: 0,
      level: 0,
      mute: false,
      solo: false,
      sends: Array.from({ length: SEND_SLOT_COUNT }, () => ({ to: null, level: SEND_RANGE.min, mode: "auto" as const })),
    },
    loadedSendLevels: {},
    chain: createNeutralChainState(),
    display: { peak: false },
    audio: spec.audio,
  };
}

/** The next printed code after a project's tracks: two digits while they last ("21" after the fixture, "01" in the empty project). */
export function nextTrackCode(tracks: readonly Pick<Track, "code">[]): string {
  const highest = tracks.reduce((m, t) => Math.max(m, Number.parseInt(t.code, 10) || 0), 0);
  return String(highest + 1).padStart(2, "0");
}

/** The id an imported track takes from its code — the same rule as the fixture's. */
export const importedTrackId = trackId;

/**
 * The arrangement with room for stems of these lengths (owner D5.1.4): a
 * project without tempo markers takes the default 120 bpm 4/4 scale on its
 * first import; the bar count grows to the longest stem and never shrinks.
 * Sections and clips are untouched — clips come from the peaks later.
 */
export function arrangementWithAudio(arrangement: Arrangement, tracks: readonly Pick<Track, "audio">[]): Arrangement {
  const seconds = tracks.map((t) => (t.audio ? audioSeconds(t.audio) : 0));
  const longest = seconds.reduce((m, s) => Math.max(m, s), 0);
  const tempoMarkers = arrangement.tempoMarkers.length > 0 ? arrangement.tempoMarkers : longest > 0 ? [DEFAULT_TEMPO] : arrangement.tempoMarkers;
  return {
    ...arrangement,
    tempoMarkers,
    barCount: barCountFor(longest, tempoMarkers, arrangement.barCount),
  };
}

export type ImportedTrackProblem = { readonly ok: false; readonly detail: string };

/**
 * The project with the imported tracks appended (session order: after
 * whatever the template has) and its arrangement grown for them. Refuses a
 * spec whose id or code the project already has — a damaged manifest, not
 * something to repair silently.
 */
export function withImportedTracks(project: Project, specs: readonly ImportedTrackSpec[]): Project | ImportedTrackProblem {
  const ids = new Set(project.tracks.map((t) => t.id as string));
  const codes = new Set(project.tracks.map((t) => t.code));
  const added: Track[] = [];
  for (const spec of specs) {
    if (ids.has(spec.id)) return { ok: false, detail: `imported track id ${spec.id} is already in the project` };
    if (codes.has(spec.code)) return { ok: false, detail: `imported track code ${spec.code} is already in the project` };
    ids.add(spec.id);
    codes.add(spec.code);
    added.push(createImportedTrack(spec));
  }
  const tracks = [...project.tracks, ...added];
  return { ...project, tracks, arrangement: arrangementWithAudio(project.arrangement, tracks) };
}
