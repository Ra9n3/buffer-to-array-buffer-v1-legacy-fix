/**
 * ALLOY — the compressor and its four characters (Task 6.2).
 *
 * One engine, four documented behaviours. The plan (§8, block 5) asks for a
 * compressor "with character — VCA / Opto / FET / Vari-Mu" and D2.8.1 says
 * the console shows a CHARACTER selector without claiming any emulation, so
 * these are topology-INSPIRED characters on a shared engine:
 *
 *   id        detector  knee   progressive ratio        auto release (switch ON)
 *   vca       peak      0 dB   up to 1.5x, 40 dB span   depth, slower
 *   fet       peak      3 dB   up to 2.5x, 40 dB span   depth, faster
 *   opto      rms       9 dB   none (the knob's)        two-stage, fast then the knob
 *   vari-mu   rms      12 dB   up to 2.5x, 60 dB span   two-stage, fast then a slow tail
 *
 * What that buys, in the terms the task uses:
 *   - the KNEE WIDTH is the difference between the characters around the
 *     threshold: the hard-kneed VCA does nothing until the level reaches it,
 *     while Opto's 9 dB and Vari-Mu's 12 dB knees have already started to
 *     pull down a little on each side of it — a wider knee begins earlier
 *     and more gradually, and every character meets the same straight line
 *     at the top of its knee;
 *   - the DETECTOR is the difference on transients: peak characters catch
 *     a drum hit, the RMS characters (10 ms mean square) read the body of
 *     the sound and let the attack through;
 *   - the PROGRESSIVE ratio makes FET and Vari-Mu squeeze harder the harder
 *     they are driven, which is what their RATIO readout has to explain: the
 *     printed ratio is exact up to 10 dB over the threshold and rises above
 *     it (see `effectiveRatio` and the report);
 *   - NO SATURATION, no transformer, no tube, no optical cell: "no added saturation"
 *     is the plan's rule, and this engine adds none. A character
 *     changes the curve, the detector and the release law, nothing else.
 *
 * Every character obeys the same five controls (D2.8.3) and the same
 * timing convention (see `dynamics.ts`): ATTACK and RELEASE are one-pole
 * time constants in dB, measured to 63.2 % of a step's change.
 *
 * Auto Release is NOT in the documents — no control, no plan line, no
 * decision. The owner specified its contract on 2026-11-03 and it is
 * implemented as stated: OFF is the fixed release the RELEASE knob sets, for
 * every character (an Opto at OFF is not adaptive); ON is the
 * character-specific adaptive law in the table above. It defaults OFF, so a
 * project saved before this module existed behaves as if the switch had
 * always been there.
 */

import { copyChannels, defaultCount, requireBuffers } from "./buffers";
import {
  compressionReduction,
  dbToGain,
  EnvelopeFollower,
  LevelDetector,
  magnitudeToDb,
  timeConstant,
  type DetectorKind,
} from "./dynamics";
import {
  COMPRESSOR_MAKEUP_DB,
  COMPRESSOR_RATIO,
  COMPRESSOR_THRESHOLD_DB,
  DSP_SAMPLE_RATE,
  DYNAMICS_ATTACK_MS,
  DYNAMICS_RELEASE_MS,
  requireBoolean,
  requireChannels,
  requireFinite,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

export type CompressorCharacterId = "vca" | "opto" | "fet" | "vari-mu";

/** How the adaptive release behaves when Auto Release is ON. */
export type AutoReleaseLaw = "fixed" | "depth-slower" | "depth-faster" | "two-stage" | "two-stage-tail";

/** The documented behaviour of one character — the whole difference between the four. */
export interface CompressorCharacter {
  readonly id: CompressorCharacterId;
  /** How the console names it (D2.8.5's selector). */
  readonly label: string;
  /** The detector law, and so the linking law (peak links peaks, RMS links RMS). */
  readonly detector: DetectorKind;
  /** The soft knee's full width, dB, centred on the threshold. */
  readonly kneeDb: number;
  /** The multiple of the knob's ratio the effective ratio may reach (capped at 20:1); 1 is static. */
  readonly progressiveFactor: number;
  /** How far past the RATIO reference the ratio walks half-way to its target, dB. */
  readonly progressiveSpanDb: number;
  /** The adaptive release law used when Auto Release is ON. */
  readonly autoRelease: AutoReleaseLaw;
  /** The law's depth or level constant, dB. */
  readonly autoScaleDb: number;
  /** The law's multiplier for the two-stage and depth-faster laws. */
  readonly autoFactor: number;
  /** One line for the report and the readout. */
  readonly description: string;
}

/**
 * The four characters. Knees, coefficients and adaptive constants are
 * PROVISIONAL app-design choices (report §3), not measurements of any
 * hardware: nothing in the project fixes them, and they live here so a
 * later tuning task moves each one in a single place.
 */
export const COMPRESSOR_CHARACTERS: Readonly<Record<CompressorCharacterId, CompressorCharacter>> = {
  vca: {
    id: "vca",
    label: "VCA",
    detector: "peak",
    kneeDb: 0,
    progressiveFactor: 1.5,
    progressiveSpanDb: 40,
    autoRelease: "depth-slower",
    autoScaleDb: 6,
    autoFactor: 1,
    description: "Hard knee, peak detector, ratio that climbs gently under drive.",
  },
  fet: {
    id: "fet",
    label: "FET",
    detector: "peak",
    kneeDb: 3,
    progressiveFactor: 2.5,
    progressiveSpanDb: 40,
    autoRelease: "depth-faster",
    autoScaleDb: 6,
    autoFactor: 1,
    description: "3 dB knee, peak detector, fast and firmer the harder it is driven.",
  },
  opto: {
    id: "opto",
    label: "Opto",
    detector: "rms",
    kneeDb: 9,
    progressiveFactor: 1,
    progressiveSpanDb: 0,
    autoRelease: "two-stage",
    autoScaleDb: 6,
    autoFactor: 3,
    description: "9 dB knee, 10 ms RMS detector, recovery that starts fast and settles slow.",
  },
  "vari-mu": {
    id: "vari-mu",
    label: "Vari-Mu",
    detector: "rms",
    kneeDb: 12,
    progressiveFactor: 2.5,
    progressiveSpanDb: 60,
    autoRelease: "two-stage-tail",
    autoScaleDb: 0,
    autoFactor: 4,
    description: "12 dB knee, 10 ms RMS detector, ratio and recovery both rise with level.",
  },
};

/** The console's order (D2.8.5). */
export const COMPRESSOR_CHARACTER_ORDER: readonly CompressorCharacterId[] = ["vca", "opto", "fet", "vari-mu"];

/** The five controls plus the two switches, as stored. */
export interface CompressorSettings {
  readonly character?: CompressorCharacterId;
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  readonly makeupDb: number;
  /** OFF (the default) = the fixed RELEASE; ON = the character's adaptive law. */
  readonly autoRelease?: boolean;
  readonly bypassed?: boolean;
}

/** The same, validated and filled in. */
export interface NormalisedCompressorSettings {
  readonly character: CompressorCharacterId;
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  readonly makeupDb: number;
  readonly autoRelease: boolean;
  readonly bypassed: boolean;
}

function requireCharacter(id: unknown): CompressorCharacterId {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(COMPRESSOR_CHARACTERS, id)) {
    throw new Error(
      `Alloy Compressor: the character is one of ${COMPRESSOR_CHARACTER_ORDER.join(", ")}, not ${String(id)}`,
    );
  }
  return id as CompressorCharacterId;
}

/**
 * Validate and fill in a compressor's settings. Character changes are
 * somebody else's job: this function never substitutes a value for a
 * missing control, because the store owns the displayed value and the
 * MANUAL marker (owner, 2026-11-03).
 */
export function normaliseCompressorSettings(settings: CompressorSettings): NormalisedCompressorSettings {
  if (!settings || typeof settings !== "object") throw new Error("Alloy Compressor: settings must be an object");
  const character = requireCharacter(settings.character ?? "vca");
  const autoRelease = settings.autoRelease === undefined ? false : requireBoolean(settings.autoRelease, "autoRelease");
  const bypassed = settings.bypassed === undefined ? false : requireBoolean(settings.bypassed, "bypassed");
  return {
    character,
    thresholdDb: requireInRange(requireFinite(settings.thresholdDb, "thresholdDb"), COMPRESSOR_THRESHOLD_DB, "thresholdDb"),
    ratio: requireInRange(requireFinite(settings.ratio, "ratio"), COMPRESSOR_RATIO, "ratio"),
    attackMs: requireInRange(requireFinite(settings.attackMs, "attackMs"), DYNAMICS_ATTACK_MS, "attackMs"),
    releaseMs: requireInRange(requireFinite(settings.releaseMs, "releaseMs"), DYNAMICS_RELEASE_MS, "releaseMs"),
    makeupDb: requireInRange(requireFinite(settings.makeupDb, "makeupDb"), COMPRESSOR_MAKEUP_DB, "makeupDb"),
    autoRelease,
    bypassed,
  };
}

/**
 * The compressor. `process(input, output, count?)` writes one block, keeps
 * its detector, envelope and gain between blocks, allocates nothing per
 * sample, and honours `bypassed` by copying (state frozen, not reset).
 */
export class Compressor {
  readonly settings: NormalisedCompressorSettings;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly character: CompressorCharacter;

  private readonly detector: LevelDetector;
  private readonly envelope = new EnvelopeFollower();
  private readonly attack: number;
  private readonly release: number;
  private reductionDb = 0;
  private reductionPeak = 0;

  constructor(settings: CompressorSettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseCompressorSettings(settings);
    this.character = COMPRESSOR_CHARACTERS[this.settings.character];
    this.detector = new LevelDetector(this.character.detector, this.channels, this.sampleRate);
    this.attack = timeConstant(this.settings.attackMs, this.sampleRate);
    this.release = timeConstant(this.settings.releaseMs, this.sampleRate);
  }

  /** The linked gain reduction at the last frame processed, dB ≥ 0 — the readout. */
  get gainReductionDb(): number {
    return this.reductionDb;
  }

  /** The release coefficient for this frame — fixed at OFF, the character's law at ON. */
  private releaseCoefficient(reductionDb: number, reductionPeakDb: number): number {
    const base = this.release;
    if (!this.settings.autoRelease) return base;
    const character = this.character;
    const scale = character.autoScaleDb;
    switch (character.autoRelease) {
      case "depth-slower":
        // Deeper reduction recovers more slowly: a quick first part, a long tail.
        return base / (1 + reductionDb / scale);
      case "depth-faster": {
        // The mirror: shallow reduction recovers slowly, deep reduction springs back.
        const value = base * (1 + reductionDb / scale);
        return value > 1 ? 1 : value;
      }
      case "two-stage": {
        // Fast while the reduction is still near its peak, then the knob's own release.
        const fast = base * character.autoFactor;
        return reductionDb > 0.25 * reductionPeakDb ? (fast > 1 ? 1 : fast) : base;
      }
      case "two-stage-tail": {
        // Fast while the reduction is still most of the way down, then a long slow tail.
        const fast = base * character.autoFactor;
        return reductionDb > 0.6 * reductionPeakDb ? (fast > 1 ? 1 : fast) : base / character.autoFactor;
      }
      default:
        return base;
    }
  }

  process(input: readonly Float32Array[], output: readonly Float32Array[], count?: number): void {
    const frames = count === undefined ? defaultCount(input) : count;
    requireBuffers("Alloy Compressor", this.channels, input, output, frames);
    if (this.settings.bypassed) {
      copyChannels(this.channels, input, output, frames);
      return;
    }

    const detector = this.detector;
    const envelope = this.envelope;
    const attack = this.attack;
    const release = this.release;
    const character = this.character;
    const threshold = this.settings.thresholdDb;
    const ratio = this.settings.ratio;
    const progressive = character.progressiveSpanDb;
    const factor = character.progressiveFactor;
    const knee = character.kneeDb;
    const makeup = this.settings.makeupDb;
    const auto = this.settings.autoRelease;
    const channels = this.channels;

    let reduction = this.reductionDb;
    let peak = this.reductionPeak;

    for (let i = 0; i < frames; i++) {
      const target = magnitudeToDb(detector.level(input, i));
      const coefficient = auto ? this.releaseCoefficient(reduction, peak) : release;
      const env = envelope.step(target, attack, coefficient);
      reduction = compressionReduction(env - threshold, knee, ratio, factor, progressive);
      if (reduction > peak) peak = reduction;
      else if (reduction <= 0) peak = 0;
      const gain = makeup === 0 && reduction === 0 ? 1 : dbToGain(makeup - reduction);
      for (let c = 0; c < channels; c++) output[c][i] = input[c][i] * gain;
    }

    this.reductionDb = reduction;
    this.reductionPeak = peak;
  }

  /** Clear the carried state: a new transport position is a new start. */
  reset(): void {
    this.detector.reset();
    this.envelope.reset();
    this.reductionDb = 0;
    this.reductionPeak = 0;
  }
}

/** The settings of a class-named character: everything but the character id. */
export type CompressorModelSettings = Omit<CompressorSettings, "character">;

/**
 * The four named models. Each is the shared engine with its character fixed,
 * so code can hold `VcaCompressor` and know what it is, while the parameter
 * path holds one `Compressor` and switches `settings.character`.
 */
export class VcaCompressor extends Compressor {
  constructor(settings: CompressorModelSettings, options: DspOptions = {}) {
    super({ ...settings, character: "vca" }, options);
  }
}

export class OptoCompressor extends Compressor {
  constructor(settings: CompressorModelSettings, options: DspOptions = {}) {
    super({ ...settings, character: "opto" }, options);
  }
}

export class FetCompressor extends Compressor {
  constructor(settings: CompressorModelSettings, options: DspOptions = {}) {
    super({ ...settings, character: "fet" }, options);
  }
}

export class VariMuCompressor extends Compressor {
  constructor(settings: CompressorModelSettings, options: DspOptions = {}) {
    super({ ...settings, character: "vari-mu" }, options);
  }
}
