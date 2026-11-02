/**
 * Mixer processing-chain detail — Task 2.8 (standard tracks only).
 *
 * The data behind the Mixer's detail panel: the plan's channel chain (§8),
 * the Auto / Manual mode every parameter carries (§8, §16, glossary), the
 * EQ and compressor parameters with their knob tapers, the EQ response
 * evaluator the graph draws from, the per-track FIXTURE states the shared
 * project store is seeded with (Task 3.1: `Track.chain`, one state per
 * track, edited through the operations below), and those operations.
 *
 * Fixtures only. Nothing here listens, analyses, recommends or processes:
 *   - every value is authored below (`FIXTURES`), one chain per standard
 *     track of the shared session;
 *   - the "original" of a parameter is the value the fixture loaded with —
 *     the plan's "original / previous setting" (§3, §10) — and the only
 *     thing that ever changes a value is the user turning a knob;
 *   - switching a parameter back to Auto changes its MODE only. There is no
 *     engine to recompute it, so nothing is reset or suggested (owner,
 *     Task 2.8 clarifications);
 *   - the response curves are computed from the control values with the
 *     textbook analog-prototype filters, so the drawn curve and the knobs
 *     can never disagree. They are the SETTINGS drawn as a curve, never a
 *     measurement of any signal;
 *   - the gain-reduction readings are fixed illustrative numbers.
 */
import { PROCESSING_CHAIN_STEPS } from "./mixer";
import type { Channel, Track } from "./project/model";

/* =========================================================================
   WHICH CHANNELS
   The standard-track chain is Task 2.8; a bus or a Return bus has a
   different chain (plan §3, §8a) and that branch is Task 2.9. The panel
   branches on this and nowhere else. Since Task 3.1 the channels are the
   shared project model's entities (project/model.ts).
   ========================================================================= */

export function supportsChainDetail(channel: Channel | undefined): channel is Track {
  return channel?.kind === "track";
}

/* =========================================================================
   AUTO / MANUAL (plan §8, §16; glossary)
   "Every parameter has Auto or Manual mode. Manual protects only that
   specific parameter from recalculation." Bypass is a separate state of a
   module (plan §3: every module can be bypassed) and never implied by it.
   ========================================================================= */

export type Mode = "auto" | "manual";
/** A module over its parameters: all Auto, all Manual, or some of each. */
export type ModuleMode = "auto" | "mixed" | "manual";

export const MODE_PRINT: Readonly<Record<ModuleMode, string>> = {
  auto: "AUTO",
  mixed: "MIXED",
  manual: "MANUAL",
};

export function moduleMode(modes: readonly Mode[]): ModuleMode {
  if (modes.length === 0) return "auto";
  const manual = modes.filter((m) => m === "manual").length;
  return manual === 0 ? "auto" : manual === modes.length ? "manual" : "mixed";
}

/* =========================================================================
   PARAMETER SPECS AND KNOB TAPERS
   The approved Knob turns in a linear range. Frequencies and times want a
   logarithmic sweep and the ratio a fixed list, so those knobs turn in
   POSITIONS (a detent index) and the parameter keeps the real value; the
   knob prints the real value through its `format` prop.
   ========================================================================= */

export type Taper = "linear" | "log" | "list";

export interface ParamSpec {
  readonly id: string;
  /** The engraved knob legend. */
  readonly label: string;
  /** The spoken / tooltip name. */
  readonly name: string;
  readonly taper: Taper;
  /** Real-value range (linear and log tapers). */
  readonly min: number;
  readonly max: number;
  /** Linear taper: the knob step in real units. */
  readonly step: number;
  /** Log taper: positions across the range. */
  readonly detents: number;
  /** List taper: the values in knob order. */
  readonly values: readonly number[];
  /** The two extreme numerals printed on the panel. */
  readonly extremes: readonly [string, string];
  readonly format: (value: number) => string;
}

const MINUS = "\u2212";

export function signedDb(value: number, decimals = 1): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
  return `${sign}${Math.abs(rounded).toFixed(decimals)} dB`;
}

export function formatHz(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${(Math.round(k * 100) / 100).toFixed(2).replace(/\.?0+$/, "")} kHz`;
  }
  return `${Math.round(value)} Hz`;
}

export function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  if (value < 1) return `${value.toFixed(1)} ms`;
  if (value < 10) return `${(Math.round(value * 10) / 10).toString()} ms`;
  return `${Math.round(value)} ms`;
}

function spec(partial: Omit<ParamSpec, "step" | "detents" | "values"> & Partial<ParamSpec>): ParamSpec {
  return { step: 1, detents: 0, values: [], ...partial };
}

export const EQ_FREQ: ParamSpec = spec({
  id: "freq",
  label: "FREQ",
  name: "Frequency",
  taper: "log",
  min: 20,
  max: 20000,
  detents: 120,
  extremes: ["20", "20k"],
  format: formatHz,
});

export const EQ_GAIN: ParamSpec = spec({
  id: "gain",
  label: "GAIN",
  name: "Gain",
  taper: "linear",
  min: -15,
  max: 15,
  step: 0.5,
  extremes: [`${MINUS}15`, "+15"],
  format: (v) => signedDb(v),
});

export const EQ_Q: ParamSpec = spec({
  id: "q",
  label: "Q",
  name: "Q",
  taper: "log",
  min: 0.3,
  max: 10,
  detents: 60,
  extremes: ["0.3", "10"],
  format: (v) => (Math.round(v * 100) / 100).toFixed(v < 1 ? 2 : 1),
});

export const COMP_THRESHOLD: ParamSpec = spec({
  id: "threshold",
  label: "THRESH",
  name: "Threshold",
  taper: "linear",
  min: -40,
  max: 0,
  step: 1,
  extremes: [`${MINUS}40`, "0"],
  format: (v) => signedDb(v, 0),
});

export const COMP_RATIO: ParamSpec = spec({
  id: "ratio",
  label: "RATIO",
  name: "Ratio",
  taper: "list",
  min: 1,
  max: 20,
  values: [1, 1.5, 2, 3, 4, 6, 8, 10, 20],
  extremes: ["1:1", "20:1"],
  format: (v) => `${v}:1`,
});

export const COMP_ATTACK: ParamSpec = spec({
  id: "attack",
  label: "ATTACK",
  name: "Attack",
  taper: "log",
  min: 0.1,
  max: 100,
  detents: 90,
  extremes: ["0.1", "100"],
  format: formatMs,
});

export const COMP_RELEASE: ParamSpec = spec({
  id: "release",
  label: "RELEASE",
  name: "Release",
  taper: "log",
  min: 10,
  max: 1000,
  detents: 80,
  extremes: ["10", "1s"],
  format: formatMs,
});

export const COMP_MAKEUP: ParamSpec = spec({
  id: "makeup",
  label: "MAKEUP",
  name: "Make-up gain",
  taper: "linear",
  min: 0,
  max: 20,
  step: 0.5,
  extremes: ["0", "+20"],
  format: (v) => signedDb(v),
});

/** The range the KNOB turns in for a spec (real units, or positions). */
export function knobRange(s: ParamSpec): { min: number; max: number; step: number } {
  switch (s.taper) {
    case "linear":
      return { min: s.min, max: s.max, step: s.step };
    case "log":
      return { min: 0, max: s.detents, step: 1 };
    case "list":
      return { min: 0, max: s.values.length - 1, step: 1 };
  }
}

/** 0 … 1 along the knob's sweep for a real value (continuous — the ghost uses it). */
export function sweepFraction(s: ParamSpec, value: number): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  switch (s.taper) {
    case "linear":
      return clamp((value - s.min) / (s.max - s.min));
    case "log":
      return clamp(Math.log(value / s.min) / Math.log(s.max / s.min));
    case "list":
      return clamp(nearestIndex(s.values, value) / Math.max(1, s.values.length - 1));
  }
}

/** The knob position for a real value. */
export function toPosition(s: ParamSpec, value: number): number {
  switch (s.taper) {
    case "linear":
      return value;
    case "log":
      return Math.round(sweepFraction(s, value) * s.detents);
    case "list":
      return nearestIndex(s.values, value);
  }
}

/** The real value at a knob position. */
export function fromPosition(s: ParamSpec, position: number): number {
  switch (s.taper) {
    case "linear":
      return Math.min(s.max, Math.max(s.min, position));
    case "log": {
      const p = Math.min(s.detents, Math.max(0, position));
      return Number((s.min * (s.max / s.min) ** (p / s.detents)).toPrecision(3));
    }
    case "list":
      return s.values[Math.min(s.values.length - 1, Math.max(0, Math.round(position)))];
  }
}

function nearestIndex(values: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
  }
  return best;
}

/* =========================================================================
   THE EQ (plan §8 block 3 "static multiband EQ"; block 4 "dynamic EQ")
   Four bands: a low shelf, two bells, a high shelf. Shelves have no Q.
   A band may carry a dynamic-EQ range (block 4): the graph shades the
   range the band's gain may move over — illustrative fixture data with no
   control of its own (owner, Task 2.8 clarifications).
   ========================================================================= */

export type BandId = "lf" | "lmf" | "hmf" | "hf";
export type BandKind = "shelf-low" | "bell" | "shelf-high";

export interface BandSpec {
  readonly id: BandId;
  readonly label: string;
  readonly name: string;
  readonly kind: BandKind;
}

export const EQ_BANDS: readonly BandSpec[] = [
  { id: "lf", label: "LF", name: "Low shelf", kind: "shelf-low" },
  { id: "lmf", label: "LMF", name: "Low-mid bell", kind: "bell" },
  { id: "hmf", label: "HMF", name: "High-mid bell", kind: "bell" },
  { id: "hf", label: "HF", name: "High shelf", kind: "shelf-high" },
];

/* =========================================================================
   THE COMPRESSOR (plan §8 block 5): "a selectable character: VCA, Opto,
   FET, or Vari-Mu" — a fixture selection here; no circuit is modelled.
   ========================================================================= */

export type CharacterId = "vca" | "opto" | "fet" | "varimu";

export const COMP_CHARACTERS: readonly { readonly id: CharacterId; readonly name: string }[] = [
  { id: "vca", name: "VCA" },
  { id: "opto", name: "Opto" },
  { id: "fet", name: "FET" },
  { id: "varimu", name: "Vari-Mu" },
];

export function characterName(id: CharacterId): string {
  return COMP_CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

/* =========================================================================
   STATE
   ========================================================================= */

export interface ChainParam {
  readonly spec: ParamSpec;
  /** The current value (real units). */
  value: number;
  /** The value the fixture loaded with — the plan's "original". */
  readonly original: number;
  mode: Mode;
}

/**
 * A character / algorithm selection with ownership. Generic over the id set
 * so the compressor's VCA / Opto / FET / Vari-Mu and a Return's Room / Hall /
 * Plate or Tape / Analogue / Digital (Task 2.9) share one shape and the one
 * ownership rule.
 */
export interface CharacterParam<Id extends string = string> {
  value: Id;
  readonly original: Id;
  mode: Mode;
}

export interface EqBandState {
  readonly band: BandSpec;
  readonly freq: ChainParam;
  readonly gain: ChainParam;
  /** Bells only; shelves have none. */
  readonly q: ChainParam | null;
  /** Block 4: how far (dB) the band's gain may be pulled down — or null. */
  readonly dynamicDepthDb: number | null;
}

export interface EqState {
  bypassed: boolean;
  readonly bands: readonly EqBandState[];
}

export interface CompState {
  bypassed: boolean;
  readonly character: CharacterParam<CharacterId>;
  readonly threshold: ChainParam;
  readonly ratio: ChainParam;
  readonly attack: ChainParam;
  readonly release: ChainParam;
  readonly makeup: ChainParam;
  /** A fixed illustrative reading, dB. */
  readonly gainReductionDb: number;
}

/** The module a note is about: the track modules, plus a Return's (effect, tone, output) and the bus output stage (peak) — Task 2.9. */
export type NoteModule = "eq" | "dyn" | "comp" | "cleanup" | "effect" | "tone" | "output" | "peak";

export interface ExplanationNote {
  readonly module: NoteModule;
  readonly text: string;
}

export const NOTE_MODULE_PRINT: Readonly<Record<NoteModule, string>> = {
  eq: "EQ",
  dyn: "DYN EQ",
  comp: "COMP",
  cleanup: "CLEANUP",
  effect: "EFFECT",
  tone: "TONE",
  output: "OUTPUT",
  peak: "PEAK",
};

/**
 * A track's processing chain. Since Task 3.1 it is a part of the track
 * entity (`Track.chain`, project/model.ts) inside the one project store, so
 * it carries no identity of its own: the track's id, code and name live on
 * the track.
 */
export interface ChainState {
  /** Block 2 in circuit (fixture flag; its controls are not part of Task 2.8). */
  readonly cleanup: boolean;
  readonly eq: EqState;
  readonly comp: CompState;
  readonly notes: readonly ExplanationNote[];
}

export function eqParams(eq: EqState): ChainParam[] {
  const out: ChainParam[] = [];
  for (const b of eq.bands) {
    out.push(b.freq, b.gain);
    if (b.q) out.push(b.q);
  }
  return out;
}

export function compParams(comp: CompState): ChainParam[] {
  return [comp.threshold, comp.ratio, comp.attack, comp.release, comp.makeup];
}

export function eqMode(eq: EqState): ModuleMode {
  return moduleMode(eqParams(eq).map((p) => p.mode));
}

export function compMode(comp: CompState): ModuleMode {
  return moduleMode([comp.character.mode, ...compParams(comp).map((p) => p.mode)]);
}

export function hasDynamicBand(eq: EqState): boolean {
  return eq.bands.some((b) => b.dynamicDepthDb !== null);
}

/* --- the edits the panel makes --------------------------------------------
   Exactly two things write a value: `setParamValue` and `setCharacter`,
   both user edits. The mode setters write the mode and nothing else.
   -------------------------------------------------------------------------- */

/** The user turned the knob: the value moves and the parameter becomes Manual. */
export function setParamValue(param: ChainParam, value: number): void {
  const r = knobRange(param.spec);
  const next = param.spec.taper === "linear" ? Math.min(r.max, Math.max(r.min, value)) : value;
  param.value = next;
  param.mode = "manual";
}

/** Mode only. The value is left exactly where it is. */
export function setMode(param: ChainParam | CharacterParam, mode: Mode): void {
  param.mode = mode;
}

/** The module's bulk control (plan §8 "Panning: Manual" style): modes only. */
export function setAllModes(params: readonly (ChainParam | CharacterParam)[], mode: Mode): void {
  for (const p of params) p.mode = mode;
}

/** The user chose a character: the selection moves and becomes Manual; nothing else changes. */
export function setCharacter(comp: CompState, id: CharacterId): void {
  comp.character.value = id;
  comp.character.mode = "manual";
}

export function paramChanged(param: ChainParam): boolean {
  return Math.abs(param.value - param.original) > 1e-9;
}

export function characterChanged(c: CharacterParam): boolean {
  return c.value !== c.original;
}

/* =========================================================================
   THE CHAIN (plan §8), from the shared step list
   ========================================================================= */

export type BlockId = "trim" | "cleanup" | "eq" | "dyneq" | "comp" | "pan" | "fader" | "sends";
/** Where the block's controls are in this build. */
export type BlockHome = "strip" | "panel" | "fixture";

export interface ChainBlock {
  readonly id: BlockId;
  readonly step: string;
  readonly label: string;
  readonly home: BlockHome;
}

const BLOCK_IDS: readonly BlockId[] = ["trim", "cleanup", "eq", "dyneq", "comp", "pan", "fader", "sends"];
const BLOCK_HOME: Readonly<Record<BlockId, BlockHome>> = {
  trim: "strip",
  cleanup: "fixture",
  eq: "panel",
  dyneq: "panel",
  comp: "panel",
  pan: "strip",
  fader: "strip",
  sends: "strip",
};

export const CHAIN_BLOCKS: readonly ChainBlock[] = PROCESSING_CHAIN_STEPS.map((step, i) => ({
  id: BLOCK_IDS[i],
  step: step.step,
  label: step.label,
  home: BLOCK_HOME[BLOCK_IDS[i]],
}));

/**
 * One lamp of the processing-chain readout, for any channel kind (Task 2.9):
 * a step, a label, whether it is in circuit, where its controls live, and —
 * for blocks that are a state rather than a module (an output, the final
 * output stage) — the status text spoken in place of "in circuit" /
 * "bypassed".
 */
export interface RailBlock {
  readonly id: string;
  readonly step: string;
  readonly label: string;
  readonly engaged: boolean;
  readonly home: BlockHome;
  readonly status?: string;
}

/** The standard track's rail: the plan §8 blocks with their live state. */
export function trackRailBlocks(chain: ChainState): RailBlock[] {
  return CHAIN_BLOCKS.map((block) => ({ ...block, engaged: blockEngaged(chain, block.id) }));
}

/** Is the block in circuit for this chain (fixture state + the bypass switches)? */
export function blockEngaged(chain: ChainState, id: BlockId): boolean {
  switch (id) {
    case "cleanup":
      return chain.cleanup;
    case "eq":
      return !chain.eq.bypassed;
    case "dyneq":
      return !chain.eq.bypassed && hasDynamicBand(chain.eq);
    case "comp":
      return !chain.comp.bypassed;
    default:
      return true;
  }
}

/* =========================================================================
   THE RESPONSE — the settings drawn as a curve
   Textbook analog-prototype biquads (RBJ cookbook) at the session rate
   (plan §16: 48 kHz), evaluated on the unit circle and summed in dB.
   ========================================================================= */

const SAMPLE_RATE = 48000;

export interface BandSetting {
  readonly kind: BandKind;
  readonly freq: number;
  readonly gain: number;
  readonly q: number;
}

function biquad(setting: BandSetting): readonly [number, number, number, number, number, number] {
  const A = 10 ** (setting.gain / 40);
  const w0 = (2 * Math.PI * setting.freq) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  if (setting.kind === "bell") {
    const alpha = sin / (2 * setting.q);
    return [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  }
  // shelves at slope S = 1: sqrt((A + 1/A)(1/S - 1) + 2) = sqrt 2
  const alpha = (sin / 2) * Math.SQRT2;
  const sq = 2 * Math.sqrt(A) * alpha;
  if (setting.kind === "shelf-low") {
    return [
      A * (A + 1 - (A - 1) * cos + sq),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - sq),
      A + 1 + (A - 1) * cos + sq,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - sq,
    ];
  }
  return [
    A * (A + 1 + (A - 1) * cos + sq),
    -2 * A * (A - 1 + (A + 1) * cos),
    A * (A + 1 + (A - 1) * cos - sq),
    A + 1 - (A - 1) * cos + sq,
    2 * (A - 1 - (A + 1) * cos),
    A + 1 - (A - 1) * cos - sq,
  ];
}

export function bandResponseDb(setting: BandSetting, frequency: number): number {
  if (Math.abs(setting.gain) < 1e-9) return 0;
  const [b0, b1, b2, a0, a1, a2] = biquad(setting);
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const c1 = Math.cos(w);
  const c2 = Math.cos(2 * w);
  const s1 = Math.sin(w);
  const s2 = Math.sin(2 * w);
  const num = (b0 + b1 * c1 + b2 * c2) ** 2 + (b1 * s1 + b2 * s2) ** 2;
  const den = (a0 + a1 * c1 + a2 * c2) ** 2 + (a1 * s1 + a2 * s2) ** 2;
  return 10 * Math.log10(num / den);
}

export function eqResponseDb(settings: readonly BandSetting[], frequency: number): number {
  let db = 0;
  for (const s of settings) db += bandResponseDb(s, frequency);
  return db;
}

/** Log-spaced frequencies across the audio band for drawing. */
export function responseFrequencies(points = 160, lo = 20, hi = 20000): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i += 1) out.push(lo * (hi / lo) ** (i / (points - 1)));
  return out;
}

const SHELF_Q = Math.SQRT1_2;

function setting(band: EqBandState, gain: number, freq = band.freq.value): BandSetting {
  return { kind: band.band.kind, freq, gain, q: band.q?.value ?? SHELF_Q };
}

/** The current controls. */
export function currentSettings(eq: EqState): BandSetting[] {
  return eq.bands.map((b) => ({ kind: b.band.kind, freq: b.freq.value, gain: b.gain.value, q: b.q?.value ?? SHELF_Q }));
}

/** The controls as the fixture loaded them. */
export function originalSettings(eq: EqState): BandSetting[] {
  return eq.bands.map((b) => ({ kind: b.band.kind, freq: b.freq.original, gain: b.gain.original, q: b.q?.original ?? SHELF_Q }));
}

/** The current controls with every dynamic band at the bottom of its range. */
export function dynamicFloorSettings(eq: EqState): BandSetting[] {
  return eq.bands.map((b) => setting(b, b.dynamicDepthDb === null ? b.gain.value : b.gain.value - b.dynamicDepthDb));
}

/* =========================================================================
   FIXTURES — one authored chain per standard track of the shared session
   ========================================================================= */

/** `[freq, gain]` for shelves, `[freq, gain, q]` for bells. */
type BandFixture = readonly [number, number] | readonly [number, number, number];

interface ChainFixture {
  readonly bands: Readonly<Record<BandId, BandFixture>>;
  /** Block 4 on one band: `[band, depth dB]`. */
  readonly dynamic?: readonly [BandId, number];
  readonly character: CharacterId;
  /** threshold, ratio, attack, release, make-up */
  readonly comp: readonly [number, number, number, number, number];
  readonly gainReductionDb: number;
  /** Parameters already Manual when the track loads, with the value they were set from. */
  readonly manual?: Readonly<Partial<Record<ManualKey, number | CharacterId>>>;
  readonly eqBypassed?: boolean;
  readonly compBypassed?: boolean;
  readonly cleanup?: boolean;
  readonly notes: readonly ExplanationNote[];
}

type ManualKey =
  | `eq.${BandId}.freq`
  | `eq.${BandId}.gain`
  | `eq.${BandId}.q`
  | "comp.character"
  | "comp.threshold"
  | "comp.ratio"
  | "comp.attack"
  | "comp.release"
  | "comp.makeup";

const note = (module: NoteModule, text: string): ExplanationNote => ({ module, text });

export const FIXTURES: Readonly<Record<string, ChainFixture>> = {
  "01": {
    bands: { lf: [60, 2.5], lmf: [300, -3, 1.2], hmf: [3500, 3, 1], hf: [10000, 0] },
    dynamic: ["lmf", 3],
    character: "fet",
    comp: [-18, 4, 10, 120, 2],
    gainReductionDb: 4.5,
    manual: { "eq.hmf.gain": 2 },
    cleanup: true,
    notes: [
      note("eq", "Lifted 60 Hz by 2.5 dB so the kick keeps its weight under the bass."),
      note("dyn", "Reduced energy around 300 Hz, up to 3 dB, only while the bass plays there."),
      note("comp", "FET character, 4:1, fast attack: the beater stays sharp while the body is held steady."),
      note("cleanup", "Expander in circuit to keep the hi-hat spill out of the kick between hits."),
    ],
  },
  "02": {
    bands: { lf: [150, 1.5], lmf: [450, -2, 1.4], hmf: [5000, 2, 0.9], hf: [12000, 1] },
    character: "vca",
    comp: [-16, 3, 5, 80, 1.5],
    gainReductionDb: 3,
    manual: { "comp.character": "opto" },
    cleanup: true,
    notes: [
      note("eq", "Reduced 450 Hz by 2 dB to take the box out of the snare."),
      note("eq", "Lifted 5 kHz by 2 dB for crack against the guitars."),
      note("comp", "VCA character, 3:1: a fast, clean grip on the hit."),
    ],
  },
  "03": {
    bands: { lf: [200, -3], lmf: [600, -1.5, 1], hmf: [4000, 1.5, 1], hf: [8000, 2] },
    character: "opto",
    comp: [-20, 2, 20, 200, 1],
    gainReductionDb: 2,
    cleanup: true,
    notes: [
      note("eq", "Reduced the low shelf by 3 dB: the bottom mic carries snare rattle, not weight."),
      note("eq", "Lifted 8 kHz by 2 dB for the wires."),
      note("comp", "Opto character, 2:1, gentle: evens the rattle without pumping."),
    ],
  },
  "04": {
    bands: { lf: [300, -4], lmf: [800, 0, 1], hmf: [6000, -3, 1.5], hf: [12000, 1] },
    dynamic: ["hmf", 3],
    character: "vca",
    comp: [-24, 2, 1, 100, 0],
    gainReductionDb: 0,
    compBypassed: true,
    notes: [
      note("eq", "Reduced the low shelf by 4 dB to keep kick and snare spill out of the hi-hat."),
      note("dyn", "Reduced energy around 6 kHz, up to 3 dB, only when the lead vocal has air there."),
      note("comp", "Compressor bypassed: the hi-hat is even enough as played."),
    ],
  },
  "05": {
    bands: { lf: [250, -2], lmf: [500, -1, 1], hmf: [3000, 0, 1], hf: [12000, 1.5] },
    character: "varimu",
    comp: [-24, 1.5, 30, 400, 1],
    gainReductionDb: 1.5,
    notes: [
      note("eq", "Reduced the low shelf by 2 dB so the overheads add cymbals, not a second kick."),
      note("eq", "Lifted 12 kHz by 1.5 dB for air across the kit."),
      note("comp", "Vari-Mu character, 1.5:1, slow: glues the kit without dulling the cymbals."),
    ],
  },
  "06": {
    bands: { lf: [250, -2], lmf: [500, -1, 1], hmf: [3000, 0, 1], hf: [12000, 1.5] },
    character: "varimu",
    comp: [-24, 1.5, 30, 400, 1],
    gainReductionDb: 1.5,
    notes: [
      note("eq", "Matched to Overhead L so the pair stays balanced."),
      note("comp", "Vari-Mu character, 1.5:1, slow, matched to Overhead L."),
    ],
  },
  "07": {
    bands: { lf: [120, -1], lmf: [400, -2, 1], hmf: [2500, 1, 1], hf: [9000, -1] },
    character: "fet",
    comp: [-30, 8, 1, 150, 6],
    gainReductionDb: 9,
    notes: [
      note("eq", "Reduced 400 Hz by 2 dB to clear the room's boxiness from under the close mics."),
      note("comp", "FET character, 8:1, fastest attack: the room is crushed on purpose and sits as a background layer."),
    ],
  },
  "08": {
    bands: { lf: [80, 2], lmf: [250, -1.5, 1.2], hmf: [1500, 1, 1], hf: [6000, -2] },
    dynamic: ["lf", 2],
    character: "vca",
    comp: [-20, 4, 15, 150, 3],
    gainReductionDb: 5,
    manual: { "eq.lf.gain": 1 },
    notes: [
      note("eq", "Lifted 80 Hz by 2 dB for weight; the lift was raised by hand from the starting 1 dB."),
      note("dyn", "The 80 Hz shelf gives back up to 2 dB while the kick hits, so the two share the bottom."),
      note("comp", "VCA character, 4:1: a steady level under the whole song."),
    ],
  },
  "09": {
    bands: { lf: [100, 0], lmf: [350, -2, 1.2], hmf: [1200, 1.5, 1], hf: [5000, -3] },
    character: "opto",
    comp: [-22, 3, 20, 200, 2],
    gainReductionDb: 3.5,
    cleanup: true,
    notes: [
      note("eq", "Reduced 350 Hz by 2 dB so the amp does not thicken what the DI already carries."),
      note("eq", "Reduced the high shelf by 3 dB to keep amp hiss out of the vocal's range."),
      note("comp", "Opto character, 3:1: smooth, a double under the DI."),
      note("cleanup", "Expander in circuit against amp noise between phrases."),
    ],
  },
  "10": {
    bands: { lf: [150, -2], lmf: [400, -1.5, 1], hmf: [3000, -3, 1.3], hf: [8000, 1] },
    dynamic: ["hmf", 3],
    character: "vca",
    comp: [-20, 3, 10, 120, 2],
    gainReductionDb: 2.5,
    notes: [
      note("eq", "Reduced the low shelf by 2 dB to keep the guitar out of the bass."),
      note("dyn", "Reduced energy around 3 kHz, up to 3 dB, to make room for the lead vocal when it sings."),
      note("comp", "VCA character, 3:1: evens the strumming."),
    ],
  },
  "11": {
    bands: { lf: [150, -2], lmf: [400, -1.5, 1], hmf: [3000, -3, 1.3], hf: [8000, 1] },
    dynamic: ["hmf", 3],
    character: "vca",
    comp: [-20, 3, 10, 120, 2],
    gainReductionDb: 2.5,
    notes: [
      note("eq", "Matched to Rhythm Gtr L so the pair stays balanced."),
      note("dyn", "Reduced energy around 3 kHz, up to 3 dB, to make room for the lead vocal when it sings."),
    ],
  },
  "12": {
    bands: { lf: [180, -1.5], lmf: [500, -1, 1], hmf: [3000, 2, 1], hf: [9000, 1] },
    character: "opto",
    comp: [-20, 3, 15, 180, 2.5],
    gainReductionDb: 4,
    manual: { "eq.hmf.freq": 2500 },
    notes: [
      note("eq", "Lifted 3 kHz by 2 dB for presence; the centre was moved by hand from 2.5 kHz."),
      note("eq", "Reduced the low shelf by 1.5 dB to keep the lead guitar out of the rhythm pair."),
      note("comp", "Opto character, 3:1: sustain for the lines."),
    ],
  },
  "13": {
    bands: { lf: [120, -1], lmf: [350, -2, 1.1], hmf: [2500, 1, 1], hf: [10000, 1] },
    dynamic: ["lmf", 2],
    character: "varimu",
    comp: [-22, 2, 25, 300, 1.5],
    gainReductionDb: 2,
    notes: [
      note("dyn", "Reduced energy around 350 Hz, up to 2 dB, when the guitars are playing there."),
      note("comp", "Vari-Mu character, 2:1, slow: the piano stays dynamic."),
    ],
  },
  "14": {
    bands: { lf: [200, -3], lmf: [500, -1.5, 1], hmf: [3000, -4, 1.2], hf: [10000, 0] },
    dynamic: ["hmf", 4],
    character: "vca",
    comp: [-20, 2, 20, 250, 1],
    gainReductionDb: 1.5,
    notes: [
      note("eq", "Reduced the low shelf by 3 dB: the pad is a background layer and gives its bottom to the bass."),
      note("dyn", "Reduced energy around 3 kHz, up to 4 dB, whenever the lead vocal sings."),
    ],
  },
  "15": {
    bands: { lf: [120, -2], lmf: [300, -1.5, 1.2], hmf: [3000, 2, 1], hf: [10000, 2] },
    character: "opto",
    comp: [-22, 3, 10, 200, 3],
    gainReductionDb: 5,
    manual: { "comp.threshold": -20 },
    cleanup: true,
    notes: [
      note("eq", "Lifted 3 kHz by 2 dB for presence; the guitars and pad yield to the vocal there."),
      note("eq", "Lifted 10 kHz by 2 dB for air."),
      note("comp", "Opto character, 3:1; the threshold was lowered by hand from \u221220 dB to \u221222 dB."),
      note("cleanup", "Expander in circuit against headphone spill between lines."),
    ],
  },
  "16": {
    bands: { lf: [150, -3], lmf: [400, -2, 1.2], hmf: [3000, 1, 1], hf: [10000, 1] },
    character: "opto",
    comp: [-20, 3, 10, 200, 2],
    gainReductionDb: 4,
    cleanup: true,
    notes: [
      note("eq", "Reduced the low shelf by 3 dB so the double thickens the lead without doubling its chest."),
      note("comp", "Opto character, 3:1, matched to the lead vocal."),
      note("cleanup", "Expander in circuit against spill between lines."),
    ],
  },
  "17": {
    bands: { lf: [180, -3], lmf: [450, -2, 1.2], hmf: [3000, -3, 1.2], hf: [10000, 1.5] },
    dynamic: ["hmf", 3],
    character: "vca",
    comp: [-18, 3, 10, 150, 2],
    gainReductionDb: 3,
    cleanup: true,
    notes: [
      note("dyn", "Reduced energy around 3 kHz, up to 3 dB, to make room for the lead vocal."),
      note("comp", "VCA character, 3:1: the harmonies sit at one level behind the lead."),
    ],
  },
  "18": {
    bands: { lf: [180, -3], lmf: [450, -2, 1.2], hmf: [3000, -3, 1.2], hf: [10000, 1.5] },
    dynamic: ["hmf", 3],
    character: "vca",
    comp: [-18, 3, 10, 150, 2],
    gainReductionDb: 3,
    cleanup: true,
    notes: [
      note("dyn", "Reduced energy around 3 kHz, up to 3 dB, to make room for the lead vocal."),
      note("comp", "VCA character, 3:1, matched to Harmony 1."),
    ],
  },
  "19": {
    bands: { lf: [400, -6], lmf: [1000, 0, 1], hmf: [6000, 1, 1], hf: [12000, 1] },
    character: "vca",
    comp: [-20, 2, 5, 80, 0],
    gainReductionDb: 0,
    compBypassed: true,
    notes: [
      note("eq", "Reduced the low shelf by 6 dB: nothing below 400 Hz belongs to a shaker."),
      note("comp", "Compressor bypassed: the shaker is even as played."),
    ],
  },
  "20": {
    bands: { lf: [100, 0], lmf: [500, 0, 1], hmf: [3000, 0, 1], hf: [10000, 0] },
    character: "vca",
    comp: [-18, 2, 20, 200, 1],
    gainReductionDb: 1,
    eqBypassed: true,
    notes: [
      note("eq", "EQ bypassed: the riser is a designed sound and is left as delivered."),
      note("comp", "VCA character, 2:1, light: keeps the peak of the sweep in hand."),
    ],
  },
};

const FALLBACK_FIXTURE: ChainFixture = {
  bands: { lf: [100, 0], lmf: [500, 0, 1], hmf: [3000, 0, 1], hf: [10000, 0] },
  character: "vca",
  comp: [-20, 2, 10, 150, 0],
  gainReductionDb: 0,
  notes: [],
};

export function chainFixtureFor(code: string): ChainFixture {
  return FIXTURES[code] ?? FALLBACK_FIXTURE;
}

function param(spec: ParamSpec, value: number, manualFrom: number | undefined): ChainParam {
  return manualFrom === undefined
    ? { spec, value, original: value, mode: "auto" }
    : { spec, value, original: manualFrom, mode: "manual" };
}

/** The same constructor for the bus and Return chains (Task 2.9). */
export const chainParam = param;

/** A fresh, independent chain state for the track with this printed code, from its fixture. */
export function createChainState(code: string): ChainState {
  const fx = chainFixtureFor(code);
  const manual = fx.manual ?? {};
  const num = (key: ManualKey): number | undefined => {
    const v = manual[key];
    return typeof v === "number" ? v : undefined;
  };

  const bands: EqBandState[] = EQ_BANDS.map((band) => {
    const [freq, gain, q] = fx.bands[band.id];
    return {
      band,
      freq: param(EQ_FREQ, freq, num(`eq.${band.id}.freq`)),
      gain: param(EQ_GAIN, gain, num(`eq.${band.id}.gain`)),
      q: band.kind === "bell" ? param(EQ_Q, q ?? 1, num(`eq.${band.id}.q`)) : null,
      dynamicDepthDb: fx.dynamic && fx.dynamic[0] === band.id ? fx.dynamic[1] : null,
    };
  });

  const [threshold, ratio, attack, release, makeup] = fx.comp;
  const characterFrom = manual["comp.character"];
  const character: CharacterParam<CharacterId> =
    typeof characterFrom === "string"
      ? { value: fx.character, original: characterFrom, mode: "manual" }
      : { value: fx.character, original: fx.character, mode: "auto" };

  return {
    cleanup: fx.cleanup === true,
    eq: { bypassed: fx.eqBypassed === true, bands },
    comp: {
      bypassed: fx.compBypassed === true,
      character,
      threshold: param(COMP_THRESHOLD, threshold, num("comp.threshold")),
      ratio: param(COMP_RATIO, ratio, num("comp.ratio")),
      attack: param(COMP_ATTACK, attack, num("comp.attack")),
      release: param(COMP_RELEASE, release, num("comp.release")),
      makeup: param(COMP_MAKEUP, makeup, num("comp.makeup")),
      gainReductionDb: fx.gainReductionDb,
    },
    notes: fx.notes,
  };
}
