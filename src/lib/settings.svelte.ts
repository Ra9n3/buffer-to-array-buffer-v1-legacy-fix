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
 *                    combination, plus the dialog's remembered FORMAT
 *                    (Task 11.1): depth (32-bit float default) × rate (null
 *                    follows the project) and TPDF dither at 24-bit, off by
 *                    default. A stored document from before 11.1 keeps its
 *                    output selections and takes the format defaults.
 *   motion           accessibility: "system" follows the operating system's
 *                    reduced-motion preference (what the approved components
 *                    already honour); "reduced" forces it in this
 *                    application whatever the system says. APPLIED NOW: the
 *                    shell mirrors it onto <html data-motion>, and
 *                    lib/preferences.css turns every animation and
 *                    transition off under it.
 *   onboarding       the first-run guide on Home: pending until skipped or
 *                    finished; either is remembered. APPLIED NOW.
 *   transport        Task 10.1 — the playhead's Stop and follow preferences:
 *                    return-to-start on stop, second-stop-to-start, the
 *                    follow mode (Smooth continuous follow by default), the
 *                    trigger point (0.75), suspend-on-manual-scroll,
 *                    click-the-timeline-to-play and the stationary-while-
 *                    recording override. APPLIED NOW: the transport reads the
 *                    two Stop preferences at every Stop, and the Arrange
 *                    playhead and the toolbar's follow control read the rest.
 *                    The follow MODE here is the default every panel starts
 *                    from; each panel then keeps its own choice (§13).
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
import type { ProjectRate } from "./audio/rates";
import {
  DEFAULT_FOLLOW_MODE,
  DEFAULT_FOLLOW_TRIGGER,
  FOLLOW_MODES,
  FOLLOW_TRIGGER_POINTS,
  type FollowMode,
} from "./playback/follow";

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

/* --- Task 11.1: the export dialog's two selects and its dither switch --------------- */

/** The depth select's vocabulary (lib/export/encode.ts's ExportDepth). */
export type ExportDepthPreference = "float32" | "pcm24";
export const EXPORT_DEPTHS: readonly ExportDepthPreference[] = ["float32", "pcm24"];
export const EXPORT_DEPTH_PRINT: Readonly<Record<ExportDepthPreference, string>> = {
  float32: "32-bit float",
  pcm24: "24-bit PCM",
};

/**
 * The rate select's vocabulary. `null` follows the project's rate — the
 * default, so nothing is resampled until someone says so; a stored value is
 * the remembered choice. 44.1 and 48 are the two project rates (rates.ts).
 */
export type ExportRatePreference = ProjectRate | null;
export const EXPORT_RATES: readonly NonNullable<ExportRatePreference>[] = [44100, 48000];
export const EXPORT_RATE_PRINT: Readonly<Record<NonNullable<ExportRatePreference>, string>> = {
  44100: "44.1 kHz",
  48000: "48 kHz",
};

export type MotionPreference = "system" | "reduced";
export const MOTION_PREFERENCES: readonly MotionPreference[] = ["system", "reduced"];

export type OnboardingState = "pending" | "skipped" | "done";
export const ONBOARDING_STATES: readonly OnboardingState[] = ["pending", "skipped", "done"];

/**
 * Task 10.1: the transport & playhead preferences (the spec's §14 list, plus
 * click-to-play so §2's "unless click-to-play is enabled" is a real switch,
 * and the §10 stationary-while-recording override). The follow mode is the
 * vocabulary from lib/playback/follow.ts — one source of truth.
 */
export interface TransportPreferences {
  returnToStartOnStop: boolean;
  secondStopReturnsToStart: boolean;
  autoScrollMode: FollowMode;
  autoScrollTriggerPoint: number;
  suspendOnManualScroll: boolean;
  clickToPlay: boolean;
  stationaryWhileRecording: boolean;
}

/** The five switch-shaped preferences, the `setExportOutput` pattern. */
export type TransportSwitchKey = "returnToStartOnStop" | "secondStopReturnsToStart" | "suspendOnManualScroll" | "clickToPlay" | "stationaryWhileRecording";
export const TRANSPORT_SWITCH_KEYS: readonly TransportSwitchKey[] = ["returnToStartOnStop", "secondStopReturnsToStart", "suspendOnManualScroll", "clickToPlay", "stationaryWhileRecording"];

export interface ExportPreferences {
  fullMix: boolean;
  stems: boolean;
  buses: boolean;
  /** Task 11.1: the dialog's remembered depth (default 32-bit float). */
  depth: ExportDepthPreference;
  /** Task 11.1: the dialog's remembered rate — null follows the project (no resampling). */
  rate: ExportRatePreference;
  /** Task 11.1: TPDF at 24-bit — OFF by default, an explicit opt-in, applied once. */
  dither: boolean;
}

export interface AppSettings {
  hardwareProfile: HardwareProfile;
  export: ExportPreferences;
  motion: MotionPreference;
  onboarding: OnboardingState;
  transport: TransportPreferences;
}

export interface SettingsDocument extends AppSettings {
  readonly schema: typeof SETTINGS_SCHEMA;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  hardwareProfile: "auto",
  // the beginner's flow (plan, vision): press MIX, export the mix — the mix is on by default, the rest off
  export: {
    fullMix: true,
    stems: false,
    buses: false,
    // Task 11.1: float32, the project's own rate, no dither — the honest defaults
    depth: "float32",
    rate: null,
    dither: false,
  },
  motion: "system",
  onboarding: "pending",
  // Task 10.1 (§14): every default exactly as the spec lists it — both Stop
  // preferences off, Smooth continuous follow, 0.75, suspend on manual scroll
  // on; click-to-play and the stationary-recording override off.
  transport: {
    returnToStartOnStop: false,
    secondStopReturnsToStart: false,
    autoScrollMode: DEFAULT_FOLLOW_MODE,
    autoScrollTriggerPoint: DEFAULT_FOLLOW_TRIGGER,
    suspendOnManualScroll: true,
    clickToPlay: false,
    stationaryWhileRecording: false,
  },
};

/* --- the document ----------------------------------------------------- */

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Task 11.1: the export dialog's remembered group — depth, rate, dither. */
function exportExtras(value: unknown): Pick<ExportPreferences, "depth" | "rate" | "dither"> {
  const doc = (value && typeof value === "object" ? value : {}) as Partial<ExportPreferences>;
  const rate = doc.rate === 44100 || doc.rate === 48000 ? doc.rate : null;
  return {
    depth: oneOf(EXPORT_DEPTHS, doc.depth, DEFAULT_SETTINGS.export.depth),
    rate,
    dither: bool(doc.dither, DEFAULT_SETTINGS.export.dither),
  };
}

/** Task 10.1: the transport group, field by field, with the follow vocabulary as its bounds. */
function transportGroup(value: unknown): TransportPreferences {
  const doc = (value && typeof value === "object" ? value : {}) as Partial<TransportPreferences>;
  const trigger = typeof doc.autoScrollTriggerPoint === "number" && FOLLOW_TRIGGER_POINTS.includes(doc.autoScrollTriggerPoint)
    ? doc.autoScrollTriggerPoint
    : DEFAULT_SETTINGS.transport.autoScrollTriggerPoint;
  return {
    returnToStartOnStop: bool(doc.returnToStartOnStop, DEFAULT_SETTINGS.transport.returnToStartOnStop),
    secondStopReturnsToStart: bool(doc.secondStopReturnsToStart, DEFAULT_SETTINGS.transport.secondStopReturnsToStart),
    autoScrollMode: oneOf(FOLLOW_MODES, doc.autoScrollMode, DEFAULT_SETTINGS.transport.autoScrollMode),
    autoScrollTriggerPoint: trigger,
    suspendOnManualScroll: bool(doc.suspendOnManualScroll, DEFAULT_SETTINGS.transport.suspendOnManualScroll),
    clickToPlay: bool(doc.clickToPlay, DEFAULT_SETTINGS.transport.clickToPlay),
    stationaryWhileRecording: bool(doc.stationaryWhileRecording, DEFAULT_SETTINGS.transport.stationaryWhileRecording),
  };
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
    const extras = exportExtras(doc.export);
    return {
      hardwareProfile: oneOf(HARDWARE_PROFILES, doc.hardwareProfile, DEFAULT_SETTINGS.hardwareProfile),
      export: {
        fullMix: bool(exp.fullMix, DEFAULT_SETTINGS.export.fullMix),
        stems: bool(exp.stems, DEFAULT_SETTINGS.export.stems),
        buses: bool(exp.buses, DEFAULT_SETTINGS.export.buses),
        ...extras,
      },
      motion: oneOf(MOTION_PREFERENCES, doc.motion, DEFAULT_SETTINGS.motion),
      onboarding: oneOf(ONBOARDING_STATES, doc.onboarding, DEFAULT_SETTINGS.onboarding),
      transport: transportGroup(doc.transport),
    };
  } catch {
    return null;
  }
}

export function serializeSettings(s: AppSettings): string {
  const doc: SettingsDocument = {
    schema: SETTINGS_SCHEMA,
    hardwareProfile: s.hardwareProfile,
    export: { fullMix: s.export.fullMix, stems: s.export.stems, buses: s.export.buses, depth: s.export.depth, rate: s.export.rate, dither: s.export.dither },
    motion: s.motion,
    onboarding: s.onboarding,
    transport: { ...s.transport },
  };
  return JSON.stringify(doc);
}

/* --- the state -------------------------------------------------------- */

const state: AppSettings = $state({
  hardwareProfile: DEFAULT_SETTINGS.hardwareProfile,
  export: { ...DEFAULT_SETTINGS.export },
  motion: DEFAULT_SETTINGS.motion,
  onboarding: DEFAULT_SETTINGS.onboarding,
  transport: { ...DEFAULT_SETTINGS.transport },
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
  state.export.depth = next.export.depth;
  state.export.rate = next.export.rate;
  state.export.dither = next.export.dither;
  state.motion = next.motion;
  state.onboarding = next.onboarding;
  Object.assign(state.transport, next.transport);
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
  get transport(): Readonly<TransportPreferences> {
    return state.transport;
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
    return {
      hardwareProfile: state.hardwareProfile,
      export: { ...state.export },
      motion: state.motion,
      onboarding: state.onboarding,
      transport: { ...state.transport },
    };
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
  /* --- Task 10.1: the transport & playhead preferences, one op per control --- */
  setTransportMode(mode: FollowMode): void {
    if (!FOLLOW_MODES.includes(mode)) throw new Error(`unknown follow mode: ${mode}`);
    if (state.transport.autoScrollMode === mode) return;
    state.transport.autoScrollMode = mode;
    changed();
  },
  setTransportTriggerPoint(point: number): void {
    if (!FOLLOW_TRIGGER_POINTS.includes(point)) throw new Error(`unknown trigger point: ${point}`);
    if (state.transport.autoScrollTriggerPoint === point) return;
    state.transport.autoScrollTriggerPoint = point;
    changed();
  },
  /** The five switches, the `setExportOutput` pattern: one op, keyed by control. */
  setTransportSwitch(key: TransportSwitchKey, on: boolean): void {
    if (!TRANSPORT_SWITCH_KEYS.includes(key)) throw new Error(`unknown transport switch: ${key}`);
    if (state.transport[key] === on) return;
    state.transport[key] = on;
    changed();
  },
  /* --- Task 11.1: the export dialog's remembered choices, one op per control --- */
  setExportDepth(depth: ExportDepthPreference): void {
    if (!EXPORT_DEPTHS.includes(depth)) throw new Error(`unknown export depth: ${depth}`);
    if (state.export.depth === depth) return;
    state.export.depth = depth;
    changed();
  },
  setExportRate(rate: ExportRatePreference): void {
    if (rate !== null && rate !== 44100 && rate !== 48000) throw new Error(`unknown export rate: ${rate}`);
    if (state.export.rate === rate) return;
    state.export.rate = rate;
    changed();
  },
  setExportDither(on: boolean): void {
    if (state.export.dither === on) return;
    state.export.dither = on;
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
