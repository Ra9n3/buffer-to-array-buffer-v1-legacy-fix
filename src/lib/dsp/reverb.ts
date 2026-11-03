/**
 * ALLOY — the FDN reverb (Task 6.3).
 *
 * The Reverb Return's engine, for the Return-bus architecture of plan §8a
 * (L401–413) and the console's controls (D2.4.3 / D2.9.4). The plan defers the
 * algorithm choice (§17 L775); the owner chose it on 2026-11-03 and approved the
 * numbers in `task-reports/6.3-design-proposal.md`:
 *
 *   - an **algorithmic feedback-delay network**, order 8, Householder feedback
 *     matrix A = I − (2/N)·J — orthogonal, so the network itself neither gains
 *     nor loses energy and is stable by construction;
 *   - three **character-inspired configurations** (Room · Hall · Plate) that
 *     differ STRUCTURALLY — line spacing, input diffusion, early reflections —
 *     never by default decay alone;
 *   - DECAY is a **broadband RT60 target at TONE FLAT**: each line's loop gain
 *     is `g_i = 10^(−3·L_i/RT60)` with `L_i` its length in seconds;
 *   - TONE is a bipolar **damping** control: a one-pole low-pass with DC gain 1
 *     inside every feedback path, so it changes high-frequency decay rather
 *     than the final brightness. FLAT at 0 is the documented neutral reference
 *     and is a real filter, not "unfiltered";
 *   - PRE-DELAY is a separate integer-sample delay before the diffusers, not
 *     part of Decay;
 *   - the DECAY a configuration cannot actually produce is refused: a request below
 *     its measured floor (`REVERB_DECAY_MINIMUM_S`) is raised to that floor, and the
 *     module exposes both the request and the effective minimum (report §5.2);
 *   - the output is **wet only**: no dry-through, no signal-dependent
 *     normalisation, no make-up gain.
 *
 * These are algorithmic, character-inspired configurations. Nothing here is a
 * hardware emulation, an impulse response, or a claim of exact room simulation.
 *
 * Stereo: ONE internally coupled network. L and R keep separate excitation
 * through distinct input weightings (never a pre-summed L+R) and are read out
 * through distinct output weightings. Mono compatibility is not claimed; the
 * suite measures the fold-down and the report states it.
 */

import { defaultCount, requireBuffers } from "./buffers";
import {
  DSP_SAMPLE_RATE,
  REVERB_DECAY_S,
  REVERB_PREDELAY_MS,
  RETURN_TONE,
  requireBoolean,
  requireChannels,
  requireFinite,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/** The network's order — eight lines, one Householder mix. */
export const REVERB_ORDER = 8;

/**
 * The one fixed output constant. Not a normalisation and not signal-dependent:
 * the wet level is set by the Return's fader, and an impulse's peak is reported
 * per configuration rather than equalised away (owner, 2026-11-03).
 */
export const REVERB_WET_SCALE = 1;

/**
 * The decay calibration. The approved law `g_i = 10^(−3·L_i/RT60)` is the loop
 * gain that would give −60 dB after RT60 seconds in an undamped network; the
 * damping filter inside the loop takes a further slice of every pass, and its
 * slice is frequency-dependent, so a broadband T30 fit of a damped network reads
 * short of the undamped target. The gains are therefore computed for
 * `RT60 × CALIBRATION`, which puts the MEASURED broadband T30 at TONE FLAT on
 * the knob (report §3). It is one constant, not a tolerance: the ±15 % test is
 * unchanged, and per-band RT60 stays frequency-dependent by design.
 */
export const REVERB_DECAY_CALIBRATION = 1.315;

/**
 * The lowest DECAY a configuration can actually produce, measured rather than chosen
 * (report §5.2, sweep of 0.2 / 0.25 / 0.3 / 0.35 / 0.4 s at 44.1, 48 and 96 kHz).
 *
 * A network cannot decay faster than its own buildup: Hall's 40 ms of diffusion and
 * 48–98 ms line spacing smear the response over a time comparable with a very short
 * target, so its measured T30 plateaus at ≈ 0.335 s and a 0.2 s request is impossible.
 * Room tracks 0.2 s at 44.1 and 48 kHz but reads −17.5 % there at 96 kHz, because its
 * fixed 5 kHz neutral damping cutoff takes a larger slice of a wider band. Plate
 * tracks 0.2 s at every rate.
 *
 * Each number is the smallest value on the console's own 0.1 s DECAY grid whose
 * measured T30 stays within the approved ±15 % at that rate — not a new tolerance and
 * not an invented minimum:
 *
 *   Room   0.2 s at ≤ 48 kHz (−2.6 / −3.6 %)   0.3 s above (−11.0 % at 96 kHz)
 *   Hall   0.4 s at every rate (+2.8 / +2.1 / −5.7 %)
 *   Plate  0.2 s at every rate (+2.2 / +1.2 / −8.1 %)
 *
 * Rates between the measured 48 kHz and 96 kHz take the higher-rate value, so a floor
 * is never optimistic where it was not measured. The console's DECAY range stays
 * 0.2–10 s (D2.4.3); this is the effective minimum the module applies and the UI must
 * read.
 */
export interface ReverbDecayMinimum {
  /** The floor at 44.1 and 48 kHz, seconds. */
  readonly at48k: number;
  /** The floor above 48 kHz, seconds — the 96 kHz measurement. */
  readonly above48k: number;
}

export const REVERB_DECAY_MINIMUM_S: Readonly<Record<ReverbCharacterId, ReverbDecayMinimum>> = {
  room: { at48k: 0.2, above48k: 0.3 },
  hall: { at48k: 0.4, above48k: 0.4 },
  plate: { at48k: 0.2, above48k: 0.2 },
};

/** The rate above which the measured high-rate floors apply. */
export const REVERB_FLOOR_RATE_HZ = 48000;

/** The effective DECAY minimum for one configuration at one rate, seconds. */
export function reverbDecayMinimum(character: ReverbCharacterId, sampleRate: number): number {
  const limit = REVERB_DECAY_MINIMUM_S[requireCharacter(character)];
  return sampleRate > REVERB_FLOOR_RATE_HZ ? limit.above48k : limit.at48k;
}

export type ReverbCharacterId = "room" | "hall" | "plate";

export interface ReverbDiffuser {
  readonly ms: number;
  readonly gain: number;
}

export interface ReverbTap {
  readonly ms: number;
  readonly gain: number;
  /** Which output channel the reflection is placed in (mono sums both). */
  readonly channel: 0 | 1;
}

export interface ReverbCharacter {
  readonly id: ReverbCharacterId;
  readonly label: string;
  readonly descriptionHeading: string;
  readonly description: string;
  /** The FDN's line lengths, ms — the spacing that gives the space its size. */
  readonly linesMs: readonly number[];
  /** Input diffusion before the network — the density of the buildup. */
  readonly diffusers: readonly ReverbDiffuser[];
  /** Feed-forward early reflections; Plate has none, by design. */
  readonly early: readonly ReverbTap[];
  /** The Tone law's neutral (FLAT) cutoff, Hz — §2.4 of the proposal. */
  readonly toneHz: number;
}

/**
 * The three configurations of `task-reports/6.3-design-proposal.md` §2.2.
 * PROVISIONAL app-design numbers, approved 2026-11-03; each lives here so a
 * later tuning task moves it in one place.
 */
export const REVERB_CHARACTERS: Readonly<Record<ReverbCharacterId, ReverbCharacter>> = {
  room: {
    id: "room",
    label: "Room",
    descriptionHeading: "compact, apparent early reflections",
    description: "Short line spacing, two diffusers and six early reflections: a small space that answers quickly.",
    linesMs: [13.7, 17.3, 19.9, 23.3, 27.1, 31.7, 37.3, 41.9],
    diffusers: [
      { ms: 2.7, gain: 0.6 },
      { ms: 4.3, gain: 0.6 },
    ],
    early: [
      { ms: 4.1, gain: 0.35, channel: 0 },
      { ms: 7.3, gain: -0.28, channel: 1 },
      { ms: 11.2, gain: 0.24, channel: 0 },
      { ms: 16.9, gain: -0.2, channel: 1 },
      { ms: 22.3, gain: 0.17, channel: 0 },
      { ms: 29.1, gain: -0.13, channel: 1 },
    ],
    toneHz: 5000,
  },
  hall: {
    id: "hall",
    label: "Hall",
    descriptionHeading: "large, gradual buildup",
    description: "Long line spacing, four diffusers and four distant reflections: a big space that fills in slowly.",
    linesMs: [47.9, 53.3, 59.9, 67.1, 73.7, 79.9, 89.3, 97.7],
    diffusers: [
      { ms: 5.1, gain: 0.7 },
      { ms: 7.7, gain: 0.7 },
      { ms: 11.3, gain: 0.7 },
      { ms: 15.9, gain: 0.7 },
    ],
    early: [
      { ms: 18.2, gain: 0.16, channel: 0 },
      { ms: 25.7, gain: -0.13, channel: 1 },
      { ms: 33.4, gain: 0.11, channel: 0 },
      { ms: 44.1, gain: -0.09, channel: 1 },
    ],
    toneHz: 4000,
  },
  plate: {
    id: "plate",
    label: "Plate",
    descriptionHeading: "fast, dense, diffuse",
    description: "Six short diffusers and no early reflections: the tail arrives dense at once, with no identifiable room.",
    linesMs: [21.1, 24.7, 28.3, 31.9, 35.3, 39.7, 43.1, 47.3],
    diffusers: [
      { ms: 1.7, gain: 0.65 },
      { ms: 2.3, gain: 0.65 },
      { ms: 3.1, gain: 0.65 },
      { ms: 4.3, gain: 0.65 },
      { ms: 5.9, gain: 0.65 },
      { ms: 7.7, gain: 0.65 },
    ],
    early: [],
    toneHz: 6000,
  },
};

/** The console's order (D2.9.1: Reverb Room · Hall · Plate). */
export const REVERB_CHARACTER_ORDER: readonly ReverbCharacterId[] = ["room", "hall", "plate"];

/* --- the weightings: unit-RMS, distinct per channel, never a pre-summed L+R --- */

const WEIGHT_SCALE = 1 / Math.sqrt(REVERB_ORDER);

function weighting(signs: readonly number[]): Float64Array {
  const out = new Float64Array(REVERB_ORDER);
  for (let i = 0; i < REVERB_ORDER; i++) out[i] = signs[i] * WEIGHT_SCALE;
  return out;
}

function midOf(left: Float64Array, right: Float64Array): Float64Array {
  const out = new Float64Array(REVERB_ORDER);
  for (let i = 0; i < REVERB_ORDER; i++) out[i] = (left[i] + right[i]) / Math.SQRT2;
  return out;
}

const INPUT_WEIGHTS: readonly Float64Array[] = [
  weighting([1, 1, 1, 1, -1, -1, -1, -1]),
  weighting([1, -1, 1, -1, 1, -1, 1, -1]),
];
const OUTPUT_WEIGHTS: readonly Float64Array[] = [
  weighting([1, 1, -1, -1, 1, 1, -1, -1]),
  weighting([1, -1, -1, 1, 1, -1, -1, 1]),
];
/** Mono uses the mid of both weightings, documented as the mono rule. */
const MONO_INPUT_WEIGHTS = midOf(INPUT_WEIGHTS[0], INPUT_WEIGHTS[1]);
const MONO_OUTPUT_WEIGHTS = midOf(OUTPUT_WEIGHTS[0], OUTPUT_WEIGHTS[1]);

/**
 * The Tone law (§2.4 of the proposal): one exponential mapping with a
 * configuration-specific neutral, evaluated once per instance.
 *
 *     f_lo = f0 / 4 · f_hi = min(0.45·fs, 4·f0)
 *     fc(tone) = f_lo · (f_hi / f_lo)^((tone + 10) / 20)
 *     d = e^(−2π·fc/fs) · y[n] = (1 − d)·x[n] + d·y[n − 1]   (DC gain 1)
 */
export function dampingCoefficient(toneHz: number, tone: number, sampleRate: number): number {
  const low = toneHz / 4;
  const high = Math.min(0.45 * sampleRate, 4 * toneHz);
  const cutoff = low * (high / low) ** ((tone + 10) / 20);
  return Math.exp((-2 * Math.PI * cutoff) / sampleRate);
}

/** The cutoff the law picks, Hz — exported so the readout and the tests can name it. */
export function dampingCutoff(toneHz: number, tone: number, sampleRate: number): number {
  const low = toneHz / 4;
  const high = Math.min(0.45 * sampleRate, 4 * toneHz);
  return low * (high / low) ** ((tone + 10) / 20);
}

export interface ReverbSettings {
  readonly character?: ReverbCharacterId;
  /** DECAY — the broadband RT60 target at TONE FLAT, seconds. */
  readonly decaySeconds: number;
  /** PRE-DELAY, ms. */
  readonly preDelayMs: number;
  /** TONE / damping, −10 … +10 with FLAT at 0. */
  readonly tone: number;
  readonly bypassed?: boolean;
}

export interface NormalisedReverbSettings {
  readonly character: ReverbCharacterId;
  readonly decaySeconds: number;
  readonly preDelayMs: number;
  readonly tone: number;
  readonly bypassed: boolean;
}

function requireCharacter(id: unknown): ReverbCharacterId {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(REVERB_CHARACTERS, id)) {
    throw new Error(`Alloy Reverb: the character is one of ${REVERB_CHARACTER_ORDER.join(", ")}, not ${String(id)}`);
  }
  return id as ReverbCharacterId;
}

export function normaliseReverbSettings(settings: ReverbSettings): NormalisedReverbSettings {
  if (!settings || typeof settings !== "object") throw new Error("Alloy Reverb: settings must be an object");
  return {
    character: requireCharacter(settings.character ?? "room"),
    decaySeconds: requireInRange(requireFinite(settings.decaySeconds, "decaySeconds"), REVERB_DECAY_S, "decaySeconds"),
    preDelayMs: requireInRange(requireFinite(settings.preDelayMs, "preDelayMs"), REVERB_PREDELAY_MS, "preDelayMs"),
    tone: requireInRange(requireFinite(settings.tone, "tone"), RETURN_TONE, "tone"),
    bypassed: settings.bypassed === undefined ? false : requireBoolean(settings.bypassed, "bypassed"),
  };
}

const nextPowerOfTwo = (value: number): number => {
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

/**
 * The reverb. Everything is sized in the constructor from the actual sample
 * rate; `process` allocates nothing, keeps every line, diffuser, damping and
 * pre-delay state across blocks, and writes **wet only**.
 *
 * Bypassed, the output is silence, the incoming samples never enter the
 * network and the state is frozen — un-bypassing resumes the tail exactly where
 * it stopped (owner, 2026-11-03).
 */
export class Reverb {
  readonly settings: NormalisedReverbSettings;
  readonly character: ReverbCharacter;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** What the caller asked for, before the measured floor raised it, seconds. */
  readonly requestedDecaySeconds: number;
  /** The lowest DECAY this configuration at this rate can produce, seconds. */
  readonly minimumDecaySeconds: number;
  /** No processing latency: pre-delay and delay time are effect timing. */
  readonly latencyFrames = 0;

  private readonly lineBuffers: Float64Array[];
  private readonly lineLengths: number[];
  private readonly lineIndex: number[];
  private readonly lineGains: Float64Array;
  private readonly damping: number;
  private readonly dampingState: Float64Array;

  private readonly preDelaySamples: number;
  private readonly preDelayBuffers: Float64Array[];
  private preDelayIndex = 0;

  private readonly diffuserBuffers: Float64Array[][];
  private readonly diffuserLengths: number[];
  private readonly diffuserIndex: number[][];
  private readonly diffuserGain: number;

  private readonly earlyBuffers: Float64Array[];
  private readonly earlyMask: number;
  private readonly earlyOffsets: number[];
  private readonly earlyGains: number[];
  private readonly earlyChannels: number[];
  private earlyIndex = 0;

  private readonly excitation: Float64Array;
  private readonly lineValues: Float64Array;
  private readonly dampedValues: Float64Array;
  private readonly diffused: Float64Array;
  private readonly inputWeights: readonly Float64Array[];
  private readonly outputWeights: readonly Float64Array[];

  constructor(settings: ReverbSettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    const normalised = normaliseReverbSettings(settings);
    const minimum = reverbDecayMinimum(normalised.character, this.sampleRate);
    this.requestedDecaySeconds = normalised.decaySeconds;
    this.minimumDecaySeconds = minimum;
    // A decay the network cannot produce is raised to the measured floor rather than
    // promised: the same "clamp a finite out-of-range value" convention as the ranges,
    // applied to the effective limit. `requestedDecaySeconds` keeps the request visible.
    this.settings = normalised.decaySeconds < minimum ? { ...normalised, decaySeconds: minimum } : normalised;
    this.character = REVERB_CHARACTERS[this.settings.character];
    const rate = this.sampleRate;
    const samples = (ms: number) => Math.max(1, Math.round((ms * rate) / 1000));

    // The FDN: one line per order, each sized to its own length and gain.
    this.lineBuffers = [];
    this.lineLengths = [];
    this.lineIndex = [];
    this.lineGains = new Float64Array(REVERB_ORDER);
    for (let j = 0; j < REVERB_ORDER; j++) {
      const length = samples(this.character.linesMs[j]);
      this.lineBuffers.push(new Float64Array(length));
      this.lineLengths.push(length);
      this.lineIndex.push(0);
      // g_i = 10^(−3 · L_i / RT60), L_i in seconds — −60 dB after RT60 seconds.
      this.lineGains[j] = 10 ** ((-3 * length) / rate / (this.settings.decaySeconds * REVERB_DECAY_CALIBRATION));
    }
    this.damping = dampingCoefficient(this.character.toneHz, this.settings.tone, rate);
    this.dampingState = new Float64Array(REVERB_ORDER);

    // Pre-delay: a ring of exactly the requested length, so the delay is exact.
    this.preDelaySamples = Math.max(0, Math.round((this.settings.preDelayMs * rate) / 1000));
    this.preDelayBuffers = [];
    for (let c = 0; c < this.channels; c++) {
      this.preDelayBuffers.push(new Float64Array(Math.max(1, this.preDelaySamples)));
    }

    // Input diffusion: a Schroeder all-pass chain per channel.
    this.diffuserGain = this.character.diffusers.length > 0 ? this.character.diffusers[0].gain : 0;
    this.diffuserLengths = this.character.diffusers.map((stage) => samples(stage.ms));
    this.diffuserBuffers = [];
    this.diffuserIndex = [];
    for (let c = 0; c < this.channels; c++) {
      this.diffuserBuffers.push(this.diffuserLengths.map((length) => new Float64Array(length)));
      this.diffuserIndex.push(this.diffuserLengths.map(() => 0));
    }

    // Early reflections: a per-channel history, power-of-two so the tap reads mask.
    this.earlyOffsets = this.character.early.map((tap) => samples(tap.ms));
    this.earlyGains = this.character.early.map((tap) => tap.gain);
    this.earlyChannels = this.character.early.map((tap) => tap.channel);
    const longestTap = this.earlyOffsets.length > 0 ? Math.max(...this.earlyOffsets) : 1;
    const historyLength = nextPowerOfTwo(longestTap + 1);
    this.earlyMask = historyLength - 1;
    this.earlyBuffers = [];
    for (let c = 0; c < this.channels; c++) this.earlyBuffers.push(new Float64Array(historyLength));

    this.excitation = new Float64Array(REVERB_ORDER);
    this.lineValues = new Float64Array(REVERB_ORDER);
    this.dampedValues = new Float64Array(REVERB_ORDER);
    this.diffused = new Float64Array(this.channels);
    this.inputWeights = this.channels === 2 ? INPUT_WEIGHTS : [MONO_INPUT_WEIGHTS];
    this.outputWeights = this.channels === 2 ? OUTPUT_WEIGHTS : [MONO_OUTPUT_WEIGHTS];
  }

  /** The cutoff the current TONE setting selects, Hz — a readout, not a control. */
  get dampingHz(): number {
    return dampingCutoff(this.character.toneHz, this.settings.tone, this.sampleRate);
  }

  /**
   * How long the module may still produce output after the input stops, in
   * seconds: pre-delay plus 1.5 × the RT60 target. No cutoff inside the module —
   * Task 7.4 sizes its tail from this number.
   */
  get tailSeconds(): number {
    return this.settings.preDelayMs / 1000 + 1.5 * this.settings.decaySeconds;
  }

  process(input: readonly Float32Array[], output: readonly Float32Array[], count?: number): void {
    const frames = count === undefined ? defaultCount(input) : count;
    requireBuffers("Alloy Reverb", this.channels, input, output, frames);

    const channels = this.channels;
    if (this.settings.bypassed) {
      for (let c = 0; c < channels; c++) output[c].fill(0, 0, frames);
      return;
    }

    const order = REVERB_ORDER;
    const lineValues = this.lineValues;
    const damped = this.dampedValues;
    const excitation = this.excitation;
    const damp = this.damping;
    const oneMinusDamp = 1 - damp;
    const gains = this.lineGains;
    const lines = this.lineBuffers;
    const lengths = this.lineLengths;
    const indices = this.lineIndex;
    const dampingState = this.dampingState;
    const diffused = this.diffused;
    const diffuserGain = this.diffuserGain;
    const diffusers = this.diffuserBuffers;
    const diffuserLengths = this.diffuserLengths;
    const diffuserIndex = this.diffuserIndex;
    const stages = diffuserLengths.length;
    const preSamples = this.preDelaySamples;
    const preBuffers = this.preDelayBuffers;
    const earlyBuffers = this.earlyBuffers;
    const earlyMask = this.earlyMask;
    const earlyOffsets = this.earlyOffsets;
    const earlyGains = this.earlyGains;
    const earlyChannels = this.earlyChannels;
    const taps = earlyOffsets.length;
    const inputWeights = this.inputWeights;
    const outputWeights = this.outputWeights;

    let preIndex = this.preDelayIndex;
    let earlyIndex = this.earlyIndex;

    for (let i = 0; i < frames; i++) {
      // 1. Pre-delay, then input diffusion, per channel.
      for (let c = 0; c < channels; c++) {
        let value = input[c][i];
        if (preSamples > 0) {
          const buffer = preBuffers[c];
          const delayed = buffer[preIndex];
          buffer[preIndex] = value;
          value = delayed;
        }
        for (let k = 0; k < stages; k++) {
          const buffer = diffusers[c][k];
          const at = diffuserIndex[c][k];
          const delayed = buffer[at];
          const out = delayed - diffuserGain * value;
          buffer[at] = value + diffuserGain * out;
          value = out;
          diffuserIndex[c][k] = at + 1 === diffuserLengths[k] ? 0 : at + 1;
        }
        diffused[c] = value;
        earlyBuffers[c][earlyIndex] = value;
      }
      if (preSamples > 0) preIndex = preIndex + 1 === preSamples ? 0 : preIndex + 1;

      // 2. Excitation: distinct weightings per channel, never a pre-summed pair.
      for (let j = 0; j < order; j++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += inputWeights[c][j] * diffused[c];
        excitation[j] = sum;
      }

      // 3. The network: read, damp, mix (Householder), gain, excite, write.
      let total = 0;
      for (let j = 0; j < order; j++) {
        const y = lines[j][indices[j]];
        lineValues[j] = y;
        total += y;
      }
      let dampedTotal = 0;
      for (let j = 0; j < order; j++) {
        const z = oneMinusDamp * lineValues[j] + damp * dampingState[j];
        dampingState[j] = z;
        damped[j] = z;
        dampedTotal += z;
      }
      const householder = (2 / order) * dampedTotal;
      for (let j = 0; j < order; j++) {
        const at = indices[j];
        lines[j][at] = gains[j] * (damped[j] - householder) + excitation[j];
        indices[j] = at + 1 === lengths[j] ? 0 : at + 1;
      }

      // 4. Wet output: the line outputs through the output weightings, plus the
      // early reflections read from the diffused history.
      for (let c = 0; c < channels; c++) {
        const weights = outputWeights[c];
        let acc = 0;
        for (let j = 0; j < order; j++) acc += weights[j] * lineValues[j];
        const history = earlyBuffers[c];
        for (let t = 0; t < taps; t++) {
          if (channels === 1 || earlyChannels[t] === c) {
            acc += earlyGains[t] * history[(earlyIndex - earlyOffsets[t]) & earlyMask];
          }
        }
        output[c][i] = REVERB_WET_SCALE * acc;
      }

      earlyIndex = (earlyIndex + 1) & earlyMask;
    }

    this.preDelayIndex = preIndex;
    this.earlyIndex = earlyIndex;
  }

  /** Clear every line, diffuser, damping state, the pre-delay and the early history. */
  reset(): void {
    for (let j = 0; j < REVERB_ORDER; j++) {
      this.lineBuffers[j].fill(0);
      this.lineIndex[j] = 0;
    }
    this.dampingState.fill(0);
    for (const buffer of this.preDelayBuffers) buffer.fill(0);
    this.preDelayIndex = 0;
    for (let c = 0; c < this.channels; c++) {
      for (const buffer of this.diffuserBuffers[c]) buffer.fill(0);
      for (let k = 0; k < this.diffuserIndex[c].length; k++) this.diffuserIndex[c][k] = 0;
      this.earlyBuffers[c].fill(0);
    }
    this.earlyIndex = 0;
  }
}
