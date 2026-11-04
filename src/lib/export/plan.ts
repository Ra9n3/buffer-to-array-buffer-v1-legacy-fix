/**
 * ALLOY — export plan, file names and folder structure (Task 8.2).
 *
 * Plan §12 asks for "predictable, collision-safe filenames and a clear folder
 * structure", and §17 leaves the exact convention to implementation. This module
 * is the one place that decides them, and it is pure (no I/O, no DOM), so the
 * convention is testable without a browser.
 *
 * STRUCTURE — one folder per export, named after the project:
 *
 *   <Project name>/
 *     <Project name> - mix.wav          the full mix
 *     Stems/01 Kick.wav                 one processed track per file
 *     Buses/01 Drums.wav                one processed bus per file
 *     export.json                       what was written, in what format, and the
 *                                       routing decisions behind each stems file
 *
 * `export.json` is the answer to plan §12's "routing/export behavior should be
 * documented carefully when bus processing contributes to the sound": each stem
 * records its output destination, its send levels and whether those Returns
 * contribute to it — so a stem imported into a DAW cannot be mistaken for the
 * complete sound of that track.
 *
 * NAMING RULES, in order:
 *   1. strip what a file system cannot hold (path separators, control characters,
 *      the Windows-reserved set) and collapse whitespace;
 *   2. never start with a dot, never end with a dot or a space (Windows);
 *   3. never use a Windows DOS device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9);
 *   4. truncate to a byte budget so the whole path stays well inside 255 bytes;
 *   5. dedupe case-insensitively (a file system may be case-insensitive), adding
 *      " (2)", " (3)" … — so two tracks called "Kick" cannot overwrite each other.
 */

import type { Bus, Project, ReturnBus, Track } from "../project/model";
import { printFormat, type ExportFormat } from "./encode";

/** Plan §12's three output types — the same vocabulary the settings already store. */
export type ExportOutput = "fullMix" | "stems" | "buses";

export const EXPORT_OUTPUTS: readonly ExportOutput[] = ["fullMix", "stems", "buses"];

export const EXPORT_OUTPUT_PRINT: Readonly<Record<ExportOutput, string>> = {
  fullMix: "Full mix",
  stems: "Processed individual stems",
  buses: "Processed buses",
};

export interface ExportSelection {
  readonly fullMix: boolean;
  readonly stems: boolean;
  readonly buses: boolean;
}

export const NO_SELECTION_MESSAGE =
  "Choose at least one output type — the full mix, the processed stems or the processed buses — before exporting.";

/** Exactly the outputs the selection asks for, in plan §12's order. */
export function selectedOutputs(selection: ExportSelection): ExportOutput[] {
  return EXPORT_OUTPUTS.filter((output) => selection[output]);
}

export type ExportFailureReason =
  | "no-selection"
  | "no-audio"
  | "project-changed"
  | "cancelled"
  | "format"
  | "write"
  | "rulebook"
  | "unknown";

/** One failed file. The export continues past it (unless it is the format or the destination). */
export interface ExportFailure {
  readonly path: string;
  readonly reason: ExportFailureReason;
  readonly message: string;
}

export type ExportJobKind = "fullMix" | "stem" | "bus";

/** One file the export will write. `relativePath` is inside the export folder. */
export interface ExportJob {
  readonly kind: ExportJobKind;
  readonly id: string;
  readonly name: string;
  /** Path inside the export folder, with "/" separators. */
  readonly relativePath: string;
  readonly output: ExportOutput;
}

export interface ExportPlan {
  readonly folder: string;
  readonly jobs: readonly ExportJob[];
  /** Human-readable lines for the UI: what was skipped, and why. */
  readonly notes: readonly string[];
  readonly manifestPath: string;
}

/* --- naming ----------------------------------------------------------------------------- */

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_NAME_BYTES = 80;

/** A file-system-safe component. Never empty: an unusable name becomes "Untitled". */
export function safeName(input: string): string {
  let name = String(input ?? "")
    .replace(ILLEGAL, "")
    .replace(/\s+/g, " ")
    .trim();
  // Windows: no trailing dot or space, and a leading dot hides the file.
  name = name.replace(/^\.+/, "").replace(/[. ]+$/, "").trim();
  if (name.length === 0) return "Untitled";
  if (DEVICE_NAMES.test(name)) name = `${name} (name)`;
  return truncateBytes(name, MAX_NAME_BYTES);
}

/** Truncate on a byte budget without splitting a multi-byte character. */
function truncateBytes(text: string, budget: number): string {
  if (Buffer.byteLength(text, "utf8") <= budget) return text;
  // The ellipsis is itself three bytes, so the text may use budget − 3.
  const room = budget - Buffer.byteLength("…", "utf8");
  let out = "";
  let bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > room) break;
    out += char;
    bytes += size;
  }
  return `${out.trimEnd()}…`;
}

/**
 * Assigns names case-insensitively, so a case-insensitive file system cannot
 * collide. Returns the unique name for `wanted` given what is already taken.
 */
export function uniqueName(wanted: string, taken: Set<string>): string {
  const base = safeName(wanted);
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = safeName(`${base} (${counter})`);
    counter++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** The full-mix file name, e.g. `My Song - mix.wav`. */
export function fullMixName(projectName: string): string {
  return `${safeName(projectName)} - mix.wav`;
}

/**
 * A track file name: the channel number keeps the session's order visible in a
 * file browser (`01 Kick.wav`), which is what a DAW import should see.
 */
export function stemName(track: Track): string {
  return `${safeName(track.code)} ${safeName(track.name)}.wav`;
}

/** A bus file name: the printed code and the name (`B1 Drums.wav`). */
export function busName(bus: Bus): string {
  return `${safeName(bus.code)} ${safeName(bus.name)}.wav`;
}

export const STEMS_FOLDER = "Stems";
export const BUSES_FOLDER = "Buses";
export const MANIFEST_FILE = "export.json";

/* --- the plan --------------------------------------------------------------------------- */

/**
 * What each output needs to exist for the job list to be non-empty: stems need
 * tracks with audio, buses need buses that actually receive something. A project
 * with no imported audio is not an error — it is a stated reason (plan §12's
 * "handle empty selections gracefully").
 */
export function planExport(project: Project, selection: ExportSelection, format: ExportFormat): ExportPlan {
  const notes: string[] = [];
  const jobs: ExportJob[] = [];
  const folder = safeName(project.name);
  const outputs = selectedOutputs(selection);

  if (outputs.length === 0) {
    return { folder, jobs, notes: [NO_SELECTION_MESSAGE], manifestPath: MANIFEST_FILE };
  }

  if (selection.fullMix) {
    jobs.push({
      kind: "fullMix",
      id: "mix",
      name: fullMixName(project.name),
      relativePath: fullMixName(project.name),
      output: "fullMix",
    });
  }

  if (selection.stems) {
    const taken = new Set<string>();
    const withAudio = project.tracks.filter((track) => track.audio !== null);
    const without = project.tracks.length - withAudio.length;
    if (project.tracks.length === 0) notes.push("No tracks in this project, so there are no stems to write.");
    else if (withAudio.length === 0) notes.push("No track has imported audio, so there are no stems to write.");
    if (without > 0 && withAudio.length > 0) {
      notes.push(`${without} ${without === 1 ? "track has" : "tracks have"} no imported audio and ${without === 1 ? "is" : "are"} left out of the stems.`);
    }
    for (const track of withAudio) {
      const name = uniqueName(stemName(track), taken);
      jobs.push({
        kind: "stem",
        id: track.id,
        name,
        relativePath: `${STEMS_FOLDER}/${name}`,
        output: "stems",
      });
    }
  }

  if (selection.buses) {
    const taken = new Set<string>();
    const fed = busesWithSignal(project);
    const empty = project.buses.length - fed.length;
    if (project.buses.length === 0) notes.push("No buses in this project, so there are no bus files to write.");
    if (empty > 0 && fed.length > 0) {
      notes.push(`${empty} ${empty === 1 ? "bus carries" : "buses carry"} nothing this project routes to and ${empty === 1 ? "is" : "are"} left out.`);
    }
    for (const bus of fed) {
      const name = uniqueName(busName(bus), taken);
      jobs.push({
        kind: "bus",
        id: bus.id,
        name,
        relativePath: `${BUSES_FOLDER}/${name}`,
        output: "buses",
      });
    }
  }

  if (jobs.length === 0) notes.push(NO_SELECTION_MESSAGE);
  notes.push(`Every file is ${printFormat(format)} — no mastering or loudness maximisation is applied.`);
  return { folder, jobs, notes, manifestPath: MANIFEST_FILE };
}

/**
 * The buses that receive audio: a bus is worth exporting when a track outputs to
 * it, or when another exportable bus has it as its destination. A bus with no
 * sources is silent by definition, and an unprocessed silent file is noise in the
 * folder, so it is left out and said so.
 */
export function busesWithSignal(project: Project): Bus[] {
  const fed = new Set<string>();
  const destinations = new Set<string>();
  for (const track of project.tracks) {
    if (track.audio === null) continue;
    if (track.output !== "master") destinations.add(track.output);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const bus of project.buses) {
      if (fed.has(bus.id)) continue;
      if (destinations.has(bus.id)) {
        fed.add(bus.id);
        if (bus.output !== "master") destinations.add(bus.output);
        changed = true;
      }
    }
  }
  // Keep the project's own order (sources first is the engine's order; file order
  // should follow the session, which is what a user reads).
  return project.buses.filter((bus) => fed.has(bus.id));
}

/** The Returns that take sends from the given tracks, for the manifest's routing notes. */
export function returnsFor(project: Project, track: Track): ReturnBus[] {
  const ids = new Set(track.channel.sends.filter((send) => send.to !== null).map((send) => send.to as string));
  return project.returns.filter((ret) => ids.has(ret.id));
}

/**
 * The routing facts stamped into `export.json` for each stem — plan §12's
 * "document carefully when bus processing contributes".
 */
export function stemRouting(project: Project, track: Track): {
  readonly output: string;
  readonly sends: readonly { readonly to: string; readonly levelDb: number; readonly inStem: false }[];
  readonly note: string;
} {
  const output = track.output === "master" ? "Master" : (project.buses.find((bus) => bus.id === track.output)?.name ?? track.output);
  const sends = track.channel.sends
    .filter((send) => send.to !== null && send.level > -60)
    .map((send) => ({
      to: project.returns.find((ret) => ret.id === send.to)?.name ?? String(send.to),
      levelDb: send.level,
      inStem: false as const,
    }));
  const parts: string[] = [`Output: ${output}.`];
  parts.push(
    "The stem is this track's own channel with its insert processing applied, then its declared route: the bus's chain is part of it, exactly as it is in the mix. Master's safety limiter is not applied to a stem (it is the sum's overs guard, not a track's processing).",
  );
  if (sends.length > 0) {
    const names = sends.map((send) => `${send.to} at ${send.levelDb} dB`).join(", ");
    parts.push(
      `Sends are not in the stem — a Return is a shared, effect-only channel, so its wet signal belongs to the full mix: ${names}.`,
    );
  } else {
    parts.push("This track has no live sends, so no Return contributes to it.");
  }
  return { output, sends, note: parts.join(" ") };
}

/** The manifest written beside the audio, so the folder explains itself. */
export interface ExportManifest {
  readonly schema: "alloy.export/1";
  readonly project: { readonly id: string; readonly name: string };
  readonly format: { readonly sampleRate: number; readonly encoding: string; readonly bitDepth: number; readonly channels: 2; readonly print: string };
  readonly outputs: readonly ExportOutput[];
  /** No mastering or loudness maximisation is applied — a stated fact (plan §12, §16). */
  readonly mastering: "none";
  readonly files: readonly {
    readonly path: string;
    readonly output: ExportOutput;
    readonly frames: number;
    readonly seconds: number;
    readonly peakDbfs: number | null;
    readonly clipped: boolean;
    readonly routing?: ReturnType<typeof stemRouting>;
  }[];
  readonly skipped: readonly string[];
}

export const EXPORT_MANIFEST_SCHEMA = "alloy.export/1";

export function buildManifest(
  project: Project,
  format: ExportFormat,
  outputs: readonly ExportOutput[],
  files: ExportManifest["files"],
  skipped: readonly string[],
): ExportManifest {
  return {
    schema: EXPORT_MANIFEST_SCHEMA,
    project: { id: project.id, name: project.name },
    format: {
      sampleRate: format.sampleRate,
      encoding: format.encoding,
      bitDepth: format.bitDepth,
      channels: 2,
      print: printFormat(format),
    },
    outputs,
    mastering: "none",
    files,
    skipped,
  };
}
