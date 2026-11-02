/**
 * ALLOY — APPLICATION SETTINGS — Task 4.1.
 *
 * The user's application-level preferences (they belong to the person and
 * the machine, not to a project, so they are not in the project manifest):
 *
 *   hardwareProfile  plan §11: Lite · Standard · Performance, chosen by a
 *                    benchmark (Phase 5.2) and overridable by the user in
 *                    settings. "auto" keeps the automatic choice. STORED,
 *                    NOT YET OPERATIONAL: no engine reads it in this build.
 *   export           plan §12 (v1): WAV only; the output types — full mix,
 *                    processed individual stems, processed buses — in any
 *                    combination. These are the DEFAULT SELECTION for the
 *                    export dialog that arrives with rendering; nothing is
 *                    exported in this build. The destination folder is
 *                    chosen at export time (a folder cannot be kept here).
 *   motion           accessibility: "system" follows the operating system's
 *                    reduced-motion preference (what the approved components
 *                    already honour); "reduced" forces it in this
 *                    application whatever the system says. APPLIED NOW: the
 *                    shell mirrors it onto <html data-motion>, and
 *                    lib/preferences.css turns every animation and
 *                    transition off under it.
 *   onboarding       the first-run guide on Home: pending until skipped or
 *                    finished; either is remembered. APPLIED NOW.
 *
 * One `$state` object (this module is a runes module), read through
 * `settings`, written through `settingsOps`. Persistence is the Task 3.3
 * approach: an injected storage adapter (localStorage in the shell, a map
 * in tests), one JSON document under `alloy.settings`, written on every
 * change, read once at attach. A stored document is taken field by field:
 * a missing or unrecognised value falls back to its default, so an old or
 * edited document never breaks the application and never smuggles in a
 * value no control offers. Nothing here is reported stored unless the
 * adapter returned without throwing.
 */

import type { StorageAdapter } from "./project/persistence";

export const SETTINGS_SCHEMA = "alloy.settings/1";
export const SETTINGS_KEY = "alloy.settings";

/* --- the vocabulary --------------------------------------------------- */

/** Plan §11 profiles plus the automatic choice. */
export type HardwareProfile = "auto" | "lite" | "standard" | "performance";
export const HARDWARE_PROFILES: readonly HardwareProfile[] = ["auto", "lite", "standard", "performance"];

/** Plan §11's words for each profile; "auto" is the benchmark's choice (Task 5.2: measured on this device, lazily, before the first analysis). */
export const HARDWARE_PROFILE_PRINT: Readonly<Record<HardwareProfile, { readonly name: string; readonly intent: string }>> = {
  auto: { name: "Automatic", intent: "The profile the hardware benchmark selects, measured on this computer before its first analysis." },
  lite: { name: "Lite", intent: "Lowest RAM use and conservative concurrency; a longer render time is acceptable." },
  standard: { name: "Standard", intent: "Balanced concurrency, buffering, memory use and render time." },
  performance: { name: "Performance", intent: "Higher concurrency and buffering for capable machines, to reduce render time." },
};

/** Plan §12 output types. */
export type ExportOutput = "fullMix" | "stems" | "buses";
export const EXPORT_OUTPUTS: readonly ExportOutput[] = ["fullMix", "stems", "buses"];
export const EXPORT_OUTPUT_PRINT: Readonly<Record<ExportOutput, string>> = {
  fullMix: "Full mix",
  stems: "Processed individual stems",
  buses: "Processed buses",
};
/** Plan §12: the only export format in v1. Not a preference. */
export const EXPORT_FORMAT = "WAV";

export type MotionPreference = "system" | "reduced";
export const MOTION_PREFERENCES: readonly MotionPreference[] = ["system", "reduced"];

export type OnboardingState = "pending" | "skipped" | "done";
export const ONBOARDING_STATES: readonly OnboardingState[] = ["pending", "skipped", "done"];

export interface ExportPreferences {
  fullMix: boolean;
  stems: boolean;
  buses: boolean;
}

export interface AppSettings {
  hardwareProfile: HardwareProfile;
  export: ExportPreferences;
  motion: MotionPreference;
  onboarding: OnboardingState;
}

export interface SettingsDocument extends AppSettings {
  readonly schema: typeof SETTINGS_SCHEMA;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  hardwareProfile: "auto",
  // the beginner's flow (plan, vision): press MIX, export the mix — the mix is on by default, the rest off
  export: { fullMix: true, stems: false, buses: false },
  motion: "system",
  onboarding: "pending",
};

/* --- the document ----------------------------------------------------- */

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * A settings document to settings, field by field; anything missing,
 * malformed or outside the vocabulary becomes its default. Null when the
 * text is not a settings document at all (then everything is default).
 */
export function parseSettings(text: string): AppSettings | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const doc = value as Partial<SettingsDocument>;
    if (doc.schema !== SETTINGS_SCHEMA) return null;
    const exp = (doc.export && typeof doc.export === "object" ? doc.export : {}) as Partial<ExportPreferences>;
    return {
      hardwareProfile: oneOf(HARDWARE_PROFILES, doc.hardwareProfile, DEFAULT_SETTINGS.hardwareProfile),
      export: {
        fullMix: bool(exp.fullMix, DEFAULT_SETTINGS.export.fullMix),
        stems: bool(exp.stems, DEFAULT_SETTINGS.export.stems),
        buses: bool(exp.buses, DEFAULT_SETTINGS.export.buses),
      },
      motion: oneOf(MOTION_PREFERENCES, doc.motion, DEFAULT_SETTINGS.motion),
      onboarding: oneOf(ONBOARDING_STATES, doc.onboarding, DEFAULT_SETTINGS.onboarding),
    };
  } catch {
    return null;
  }
}

export function serializeSettings(s: AppSettings): string {
  const doc: SettingsDocument = {
    schema: SETTINGS_SCHEMA,
    hardwareProfile: s.hardwareProfile,
    export: { fullMix: s.export.fullMix, stems: s.export.stems, buses: s.export.buses },
    motion: s.motion,
    onboarding: s.onboarding,
  };
  return JSON.stringify(doc);
}

/* --- the state -------------------------------------------------------- */

const state: AppSettings = $state({
  hardwareProfile: DEFAULT_SETTINGS.hardwareProfile,
  export: { ...DEFAULT_SETTINGS.export },
  motion: DEFAULT_SETTINGS.motion,
  onboarding: DEFAULT_SETTINGS.onboarding,
});

export interface SettingsStorageStatus {
  /** An adapter is attached. */
  readonly attached: boolean;
  readonly storage: string | null;
  /** The stored document was read at attach (false: nothing stored, or unreadable → defaults). */
  readonly loaded: boolean;
  /** The last write failed with this message (null: the last write succeeded, or none happened). */
  readonly error: string | null;
  readonly writes: number;
}

let storage: StorageAdapter | null = null;
let loaded = false;
let error: string | null = null;
let writes = 0;
const listeners = new Set<(s: Readonly<AppSettings>) => void>();

function persist(): void {
  if (!storage) return;
  try {
    const outcome = storage.write(SETTINGS_KEY, serializeSettings(state));
    if (outcome && typeof (outcome as Promise<void>).then === "function") {
      (outcome as Promise<void>).then(
        () => {
          writes++;
          error = null;
        },
        (e: unknown) => {
          error = e instanceof Error ? e.message : String(e);
        },
      );
      return;
    }
    writes++;
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

function changed(): void {
  persist();
  for (const l of listeners) l(state);
}

function assign(next: AppSettings): void {
  state.hardwareProfile = next.hardwareProfile;
  state.export.fullMix = next.export.fullMix;
  state.export.stems = next.export.stems;
  state.export.buses = next.export.buses;
  state.motion = next.motion;
  state.onboarding = next.onboarding;
}

/** READS — reactive in components. */
export const settings = {
  get hardwareProfile(): HardwareProfile {
    return state.hardwareProfile;
  },
  get export(): Readonly<ExportPreferences> {
    return state.export;
  },
  get motion(): MotionPreference {
    return state.motion;
  },
  get onboarding(): OnboardingState {
    return state.onboarding;
  },
  /** The guide is due: nothing has been skipped or finished yet. */
  get showGuide(): boolean {
    return state.onboarding === "pending";
  },
  get storage(): SettingsStorageStatus {
    return { attached: storage !== null, storage: storage?.name ?? null, loaded, error, writes };
  },
  /** A plain copy (tests, the debug handle). */
  snapshot(): AppSettings {
    return { hardwareProfile: state.hardwareProfile, export: { ...state.export }, motion: state.motion, onboarding: state.onboarding };
  },
  subscribe(listener: (s: Readonly<AppSettings>) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
} as const;

/** WRITES — one per control; a same-value write changes nothing and writes nothing. */
export const settingsOps = {
  setHardwareProfile(profile: HardwareProfile): void {
    if (!HARDWARE_PROFILES.includes(profile)) throw new Error(`unknown hardware profile: ${profile}`);
    if (state.hardwareProfile === profile) return;
    state.hardwareProfile = profile;
    changed();
  },
  setExportOutput(output: ExportOutput, on: boolean): void {
    if (!EXPORT_OUTPUTS.includes(output)) throw new Error(`unknown export output: ${output}`);
    if (state.export[output] === on) return;
    state.export[output] = on;
    changed();
  },
  setMotion(motion: MotionPreference): void {
    if (!MOTION_PREFERENCES.includes(motion)) throw new Error(`unknown motion preference: ${motion}`);
    if (state.motion === motion) return;
    state.motion = motion;
    changed();
  },
  /** The guide was skipped (remembered: it does not come back by itself). */
  skipGuide(): void {
    if (state.onboarding === "skipped") return;
    state.onboarding = "skipped";
    changed();
  },
  /** The guide was read to the end. */
  finishGuide(): void {
    if (state.onboarding === "done") return;
    state.onboarding = "done";
    changed();
  },
  /** Settings: show the guide again on Home. */
  showGuideAgain(): void {
    if (state.onboarding === "pending") return;
    state.onboarding = "pending";
    changed();
  },
  /** Everything back to its default (one write). */
  resetAll(): void {
    assign({ ...DEFAULT_SETTINGS, export: { ...DEFAULT_SETTINGS.export } });
    changed();
  },
} as const;

/* --- wiring ------------------------------------------------------------ */

/**
 * Attach storage: read the stored document once (defaults for whatever it
 * lacks), then write on every change. Returns whether a document was read.
 */
export function attachSettings(adapter: StorageAdapter): boolean {
  storage = adapter;
  error = null;
  writes = 0;
  loaded = false;
  let text: string | null = null;
  try {
    const value = adapter.read(SETTINGS_KEY);
    text = value && typeof (value as Promise<unknown>).then === "function" ? null : (value as string | null);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const parsed = text === null ? null : parseSettings(text);
  assign(parsed ?? { ...DEFAULT_SETTINGS, export: { ...DEFAULT_SETTINGS.export } });
  loaded = parsed !== null;
  for (const l of listeners) l(state);
  return loaded;
}

export function detachSettings(): void {
  storage = null;
  loaded = false;
  error = null;
  writes = 0;
}
