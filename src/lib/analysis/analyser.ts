/**
 * ALLOY analysis — the engine: one streaming pass over a stem (Task 5.2).
 *
 * `Analyser` takes the decoded channels of a stem in pushes of any length
 * and, at `finish()`, returns every measurement the plan's §7 lists for the
 * analysis engine — level and loudness, energy by band, transient activity,
 * stereo image, integrity — as whole-stem figures *and* as series on one
 * common grid of 100 ms cells (plan §7: "time-based measurements, not only
 * whole-song averages"). The pass is identical whatever the slicing: every
 * filter and window carries its state, which is what lets the profile
 * (plan §11) choose the slice size without changing a single figure.
 *
 * Nothing here alters audio or feeds playback: it measures (plan §7, §13).
 * Scalars are `number | null` — null is "not measurable" (no complete window,
 * no energy); series hold NaN where a cell has no defined value and −∞ where
 * a cell has no energy.
 */
import { dbfs, isSilentPeak, SILENCE_PEAK_DBFS } from "../audio/import-rules";
import type { WavEncoding, WavFormat } from "../audio/wav";
import { KWeighting, TruePeakDetector } from "./filters";
import { IntegrityAnalyser, type ChannelIntegrity } from "./integrity";
import { integratedLoudness, loudnessRange, lufsSeries, maxFinite, MOMENTARY_CELLS, powerDb, SHORT_TERM_CELLS, windowedPower } from "./loudness";
import { BALANCE_GROUPS, BANDS, SpectralAnalyser, type BandDef } from "./spectral";
import { balanceDbOf, correlationOf, StereoAnalyser, summariseStereo, widthDbOf, type StereoSummary } from "./stereo";
import { TransientAnalyser } from "./transient";

export const ANALYSIS_SCHEMA = "alloy.analysis/1";
/** Bump when a measurement's definition changes: stored results of older engines are re-analysed. */
export const ENGINE_VERSION = 1;
export const CELL_SECONDS = 0.1;
/** Near-silence: a stem whose peak never rises above this is flagged (the −80 dBFS rule of Task 5.1 stays the silence rule). */
export const NEAR_SILENT_PEAK_DBFS = -60;

export interface AnalysedFormat {
  readonly encoding: WavEncoding;
  readonly bitDepth: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
  readonly seconds: number;
}

export interface LevelMeasures {
  readonly samplePeakDbfs: number | null;
  readonly channelPeakDbfs: readonly (number | null)[];
  /** 4× oversampled inter-sample peak, dBTP. */
  readonly truePeakDbtp: number | null;
  readonly rmsDbfs: number | null;
  readonly channelRmsDbfs: readonly (number | null)[];
  readonly crestFactorDb: number | null;
  readonly integratedLufs: number | null;
  readonly momentaryMaxLufs: number | null;
  readonly shortTermMaxLufs: number | null;
  readonly loudnessRangeLu: number | null;
  /** Per cell: RMS of the 100 ms cell (all channels), dBFS. */
  readonly rmsDbfsCells: Float32Array;
  /** Per cell: sample peak within the cell, dBFS. */
  readonly peakDbfsCells: Float32Array;
  /** Per cell: 400 ms momentary loudness ending at the cell (NaN before the first complete window). */
  readonly momentaryLufs: Float32Array;
  /** Per cell: 3 s short-term loudness ending at the cell. */
  readonly shortTermLufs: Float32Array;
}

export interface SpectralMeasures {
  readonly bands: readonly BandDef[];
  /** Per band, per cell: mean-square level of the band in dB (0 dB = a full-scale RMS). */
  readonly bandDb: readonly Float32Array[];
  /** Per band: the mean band power over the active cells, in dB. */
  readonly bandMeanDb: readonly (number | null)[];
  /** Per cell: spectral centroid in Hz (NaN without energy). */
  readonly centroidHz: Float32Array;
  readonly centroidHzOverall: number | null;
  /** Fractions of the band energy in the low / mid / high groups (sum 1), or null without energy. */
  readonly balance: { readonly low: number; readonly mid: number; readonly high: number } | null;
}

export interface TransientMeasures {
  /** Per cell: the largest positive 10 ms log-energy change in dB. */
  readonly fluxDb: Float32Array;
  /** Per cell: crest factor of the cell (peak over RMS) in dB. */
  readonly crestDb: Float32Array;
  readonly onsetSeconds: Float32Array;
  readonly onsetCount: number;
  /** Onsets per second of active (non-silent) audio. */
  readonly onsetsPerSecond: number | null;
  readonly meanFluxDb: number | null;
}

export interface StereoMeasures extends StereoSummary {
  /** False for a mono file: the series are empty and every figure null. */
  readonly applicable: boolean;
  readonly correlation: number | null;
  readonly correlationCells: Float32Array;
  readonly balanceDbCells: Float32Array;
  readonly widthDbCells: Float32Array;
}

export interface IntegrityMeasures {
  readonly channels: readonly ChannelIntegrity[];
  readonly clipped: boolean;
  /** Cells whose true peak exceeds 0 dBTP. */
  readonly truePeakOverCells: number;
  readonly nonFinite: number;
  /** The Task 5.1 silence rule (peak ≤ −80 dBFS over the whole file). */
  readonly silent: boolean;
  readonly nearSilent: boolean;
  readonly silentCells: number;
  readonly silentFraction: number;
  readonly leadingSilenceSeconds: number;
  readonly trailingSilenceSeconds: number;
  readonly activeSeconds: number;
  /** Silent stems are measured but are not analysis targets (D5.1.4). */
  readonly analysisTarget: boolean;
}

export interface AnalysisResult {
  readonly schema: typeof ANALYSIS_SCHEMA;
  readonly engineVersion: number;
  readonly cellSeconds: number;
  readonly cellCount: number;
  readonly format: AnalysedFormat;
  readonly level: LevelMeasures;
  readonly spectral: SpectralMeasures;
  readonly transient: TransientMeasures;
  readonly stereo: StereoMeasures;
  readonly integrity: IntegrityMeasures;
}

export type AnalyserInput = Pick<WavFormat, "encoding" | "bitDepth" | "sampleRate" | "channels" | "frames">;

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

export function cellFramesFor(sampleRate: number): number {
  return Math.round(sampleRate * CELL_SECONDS);
}

export function cellCountFor(frames: number, sampleRate: number): number {
  return Math.ceil(frames / cellFramesFor(sampleRate));
}

export class Analyser {
  readonly cellFrames: number;
  readonly cellCount: number;
  private readonly channels: number;
  private readonly format: AnalyserInput;
  private frame = 0;
  private finished = false;

  // level
  private readonly peak: Float64Array;
  private readonly sumSq: Float64Array;
  private readonly cellSumSq: Float64Array[];
  private readonly cellPeak: Float64Array;
  private readonly cellTruePeak: Float64Array;
  private readonly truePeak: TruePeakDetector[];
  private readonly weighting: KWeighting[];
  private readonly cellK: Float64Array;
  private readonly cellFill: Uint32Array;
  private weighted = new Float32Array(0);
  private mid = new Float32Array(0);
  // the rest
  private readonly spectral: SpectralAnalyser;
  private readonly transient: TransientAnalyser;
  private readonly stereo: StereoAnalyser | null;
  private readonly integrity: IntegrityAnalyser;

  constructor(format: AnalyserInput) {
    if (format.encoding !== "pcm" && format.encoding !== "float") throw new Error("The analyser decodes PCM and float only");
    if (format.channels < 1 || format.channels > 2) throw new Error("The analyser takes mono or stereo");
    this.format = format;
    this.channels = format.channels;
    this.cellFrames = cellFramesFor(format.sampleRate);
    this.cellCount = cellCountFor(format.frames, format.sampleRate);
    const n = this.cellCount;
    this.peak = new Float64Array(this.channels);
    this.sumSq = new Float64Array(this.channels);
    this.cellSumSq = Array.from({ length: this.channels }, () => new Float64Array(n));
    this.cellPeak = new Float64Array(n);
    this.cellTruePeak = new Float64Array(n);
    this.truePeak = Array.from({ length: this.channels }, () => new TruePeakDetector());
    this.weighting = Array.from({ length: this.channels }, () => new KWeighting());
    this.cellK = new Float64Array(n);
    this.cellFill = new Uint32Array(n);
    this.spectral = new SpectralAnalyser(format.sampleRate, this.cellFrames, n);
    this.transient = new TransientAnalyser(format.sampleRate, this.cellFrames, n);
    this.stereo = this.channels === 2 ? new StereoAnalyser(n) : null;
    this.integrity = new IntegrityAnalyser(this.channels);
  }

  /** How many frames have been pushed. */
  get position(): number {
    return this.frame;
  }

  push(channels: readonly Float32Array[], count: number, nonFinite?: readonly number[]): void {
    if (this.finished) throw new Error("Analyser: push after finish");
    if (channels.length !== this.channels) throw new Error(`Analyser: expected ${this.channels} channel(s), got ${channels.length}`);
    if (count === 0) return;
    if (this.frame + count > this.format.frames) throw new Error("Analyser: more frames than the format declares");
    if (this.weighted.length < count) this.weighted = new Float32Array(count);
    if (this.mid.length < count) this.mid = new Float32Array(count);
    const cellFrames = this.cellFrames;

    for (let ch = 0; ch < this.channels; ch++) {
      const x = channels[ch];
      const w = this.weighted;
      this.weighting[ch].process(x, w, count);
      this.integrity.push(ch, x, count, nonFinite?.[ch] ?? 0);
      let i = 0;
      while (i < count) {
        const cell = Math.floor((this.frame + i) / cellFrames);
        const end = Math.min(count, (cell + 1) * cellFrames - this.frame);
        let peak = 0; // this channel's peak within the segment
        let sq = 0;
        let k = 0;
        for (let j = i; j < end; j++) {
          const v = x[j];
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
          sq += v * v;
          k += w[j] * w[j];
        }
        if (peak > this.cellPeak[cell]) this.cellPeak[cell] = peak; // the cell's peak is over both channels
        this.cellSumSq[ch][cell] += sq;
        this.cellK[cell] += this.channels === 1 ? 2 * k : k; // a mono stem plays on both sides (D5.1.3)
        if (ch === 0) this.cellFill[cell] += end - i;
        const tp = this.truePeak[ch].push(x.subarray(i, end), end - i);
        if (tp > this.cellTruePeak[cell]) this.cellTruePeak[cell] = tp;
        if (peak > this.peak[ch]) this.peak[ch] = peak;
        this.sumSq[ch] += sq;
        i = end;
      }
    }

    const mid = this.mid;
    if (this.channels === 2) {
      const l = channels[0];
      const r = channels[1];
      for (let i = 0; i < count; i++) mid[i] = (l[i] + r[i]) * 0.5;
      this.stereo!.push(l, r, count, this.frame, cellFrames);
    } else {
      mid.set(channels[0].subarray(0, count));
    }
    this.spectral.push(mid, count);
    this.transient.push(mid, count);
    this.frame += count;
  }

  finish(): AnalysisResult {
    if (this.finished) throw new Error("Analyser: finished twice");
    if (this.frame !== this.format.frames) throw new Error(`Analyser: ${this.frame} of ${this.format.frames} frames pushed`);
    this.finished = true;
    this.spectral.finish();
    this.transient.finish();
    const n = this.cellCount;
    const channels = this.channels;
    const { sampleRate, frames } = this.format;
    const seconds = frames / sampleRate;
    const silenceLinear = Math.pow(10, SILENCE_PEAK_DBFS / 20);

    // ---- level
    const rmsDbfsCells = new Float32Array(n);
    const peakDbfsCells = new Float32Array(n);
    const crestDb = new Float32Array(n);
    const silentCell = new Uint8Array(n);
    let silentCells = 0;
    for (let c = 0; c < n; c++) {
      let sq = 0;
      for (let ch = 0; ch < channels; ch++) sq += this.cellSumSq[ch][c];
      const fill = this.cellFill[c];
      const rms = fill > 0 ? Math.sqrt(sq / (fill * channels)) : 0;
      rmsDbfsCells[c] = dbfs(rms);
      peakDbfsCells[c] = dbfs(this.cellPeak[c]);
      crestDb[c] = rms > 0 ? dbfs(this.cellPeak[c] / rms) : Number.NaN;
      if (this.cellPeak[c] <= silenceLinear) {
        silentCell[c] = 1;
        silentCells++;
      }
    }
    const peakLinear = Math.max(0, ...this.peak);
    let totalSq = 0;
    for (let ch = 0; ch < channels; ch++) totalSq += this.sumSq[ch];
    const rmsLinear = frames > 0 ? Math.sqrt(totalSq / (frames * channels)) : 0;
    const truePeakLinear = Math.max(0, ...this.truePeak.map((d) => d.peak));
    const momentaryPower = windowedPower(this.cellK, this.cellFill, MOMENTARY_CELLS);
    const shortTermPower = windowedPower(this.cellK, this.cellFill, SHORT_TERM_CELLS);
    const momentaryLufs = lufsSeries(momentaryPower);
    const shortTermLufs = lufsSeries(shortTermPower);
    const level: LevelMeasures = {
      samplePeakDbfs: finiteOrNull(dbfs(peakLinear)),
      channelPeakDbfs: Array.from(this.peak, (p) => finiteOrNull(dbfs(p))),
      truePeakDbtp: finiteOrNull(dbfs(truePeakLinear)),
      rmsDbfs: finiteOrNull(dbfs(rmsLinear)),
      channelRmsDbfs: Array.from(this.sumSq, (sq) => finiteOrNull(dbfs(frames > 0 ? Math.sqrt(sq / frames) : 0))),
      crestFactorDb: rmsLinear > 0 && peakLinear > 0 ? dbfs(peakLinear / rmsLinear) : null,
      integratedLufs: integratedLoudness(momentaryPower),
      momentaryMaxLufs: maxFinite(momentaryLufs),
      shortTermMaxLufs: maxFinite(shortTermLufs),
      loudnessRangeLu: loudnessRange(shortTermPower),
      rmsDbfsCells,
      peakDbfsCells,
      momentaryLufs,
      shortTermLufs,
    };

    // ---- silence by cells
    let leading = 0;
    while (leading < n && silentCell[leading]) leading++;
    let trailing = 0;
    while (trailing < n - leading && silentCell[n - 1 - trailing]) trailing++;
    const secondsOfCells = (from: number, to: number) => {
      let f = 0;
      for (let c = from; c < to; c++) f += this.cellFill[c];
      return f / sampleRate;
    };
    let activeFrames = 0;
    for (let c = 0; c < n; c++) if (!silentCell[c]) activeFrames += this.cellFill[c];
    const activeSeconds = activeFrames / sampleRate;
    const isActive = (c: number) => silentCell[c] === 0;

    // ---- spectral
    const bandDb = BANDS.map((_, b) => {
      const out = new Float32Array(n);
      for (let c = 0; c < n; c++) {
        const f = this.spectral.framesInCell[c];
        out[c] = f > 0 ? powerDb(this.spectral.bandPower[b][c] / f) : Number.NaN;
      }
      return out;
    });
    // the mean band levels are taken over the cells whose frames carry energy, so the silence
    // between a sparse stem's hits does not dilute its balance — judged on the frames themselves
    // (a frame is attributed to the cell under its centre and may straddle a silent neighbour:
    // the Task 5.1 click, one sample at 0.1 s, lands in a frame whose centre is in the cell before)
    const silencePower = silenceLinear * silenceLinear;
    const spectralCell = new Uint8Array(n);
    for (let c = 0; c < n; c++) {
      const f = this.spectral.framesInCell[c];
      if (f === 0) continue;
      let total = 0;
      for (let b = 0; b < BANDS.length; b++) total += this.spectral.bandPower[b][c] / f;
      if (total > silencePower) spectralCell[c] = 1;
    }
    const bandMeanPower = BANDS.map((_, b) => {
      let sum = 0;
      let cells = 0;
      for (let c = 0; c < n; c++) {
        if (spectralCell[c] === 0) continue;
        sum += this.spectral.bandPower[b][c] / this.spectral.framesInCell[c];
        cells++;
      }
      return cells === 0 ? 0 : sum / cells;
    });
    const centroidHz = new Float32Array(n);
    let centroidNum = 0;
    let centroidDen = 0;
    for (let c = 0; c < n; c++) {
      const den = this.spectral.centroidDenominator[c];
      centroidHz[c] = den > 0 ? this.spectral.centroidNumerator[c] / den : Number.NaN;
      centroidNum += this.spectral.centroidNumerator[c];
      centroidDen += den;
    }
    const groupPower = (ids: readonly BandDef["id"][]) => ids.reduce((s, id) => s + bandMeanPower[BANDS.findIndex((b) => b.id === id)], 0);
    const low = groupPower(BALANCE_GROUPS.low);
    const midP = groupPower(BALANCE_GROUPS.mid);
    const high = groupPower(BALANCE_GROUPS.high);
    const totalBand = low + midP + high;
    const spectral: SpectralMeasures = {
      bands: BANDS,
      bandDb,
      bandMeanDb: bandMeanPower.map((p) => finiteOrNull(powerDb(p))),
      centroidHz,
      centroidHzOverall: centroidDen > 0 ? centroidNum / centroidDen : null,
      balance: totalBand > 0 ? { low: low / totalBand, mid: midP / totalBand, high: high / totalBand } : null,
    };

    // ---- transient
    const onsetSeconds = Float32Array.from(this.transient.onsets);
    const transient: TransientMeasures = {
      fluxDb: this.transient.fluxDb,
      crestDb,
      onsetSeconds,
      onsetCount: onsetSeconds.length,
      onsetsPerSecond: activeSeconds > 0 ? onsetSeconds.length / activeSeconds : null,
      meanFluxDb: this.transient.meanFluxDb,
    };

    // ---- stereo
    let stereo: StereoMeasures;
    if (this.stereo) {
      const s = this.stereo;
      const correlationCells = new Float32Array(n);
      const balanceDbCells = new Float32Array(n);
      const widthDbCells = new Float32Array(n);
      for (let c = 0; c < n; c++) {
        correlationCells[c] = correlationOf(s.sumLR[c], s.sumLL[c], s.sumRR[c]);
        balanceDbCells[c] = balanceDbOf(s.sumLL[c], s.sumRR[c]);
        widthDbCells[c] = widthDbOf(s.sumLR[c], s.sumLL[c], s.sumRR[c]);
      }
      stereo = { applicable: true, ...summariseStereo(s, isActive), correlationCells, balanceDbCells, widthDbCells };
    } else {
      stereo = {
        applicable: false,
        correlation: null,
        balanceDb: null,
        widthDb: null,
        monoLossDb: null,
        minCorrelation: null,
        fractionNegative: null,
        correlationCells: new Float32Array(0),
        balanceDbCells: new Float32Array(0),
        widthDbCells: new Float32Array(0),
      };
    }

    // ---- integrity
    const perChannel = this.integrity.result();
    let truePeakOverCells = 0;
    for (let c = 0; c < n; c++) if (this.cellTruePeak[c] > 1) truePeakOverCells++;
    const silent = isSilentPeak(peakLinear, frames);
    const integrity: IntegrityMeasures = {
      channels: perChannel,
      clipped: perChannel.some((ch) => ch.clippingRuns > 0),
      truePeakOverCells,
      nonFinite: perChannel.reduce((s, ch) => s + ch.nonFinite, 0),
      silent,
      nearSilent: frames === 0 || dbfs(peakLinear) <= NEAR_SILENT_PEAK_DBFS,
      silentCells,
      silentFraction: n === 0 ? 1 : silentCells / n,
      leadingSilenceSeconds: secondsOfCells(0, leading),
      trailingSilenceSeconds: secondsOfCells(n - trailing, n),
      activeSeconds,
      analysisTarget: !silent,
    };

    return {
      schema: ANALYSIS_SCHEMA,
      engineVersion: ENGINE_VERSION,
      cellSeconds: CELL_SECONDS,
      cellCount: n,
      format: { encoding: this.format.encoding as WavEncoding, bitDepth: this.format.bitDepth, sampleRate, channels, frames, seconds },
      level,
      spectral,
      transient,
      stereo,
      integrity,
    };
  }
}
