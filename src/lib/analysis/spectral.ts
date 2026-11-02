/**
 * ALLOY analysis — energy by band over time and the spectral centroid (Task 5.2).
 *
 * Measured on the mid signal (L+R)/2 — the mono sum the balance of a mix is
 * judged on — with 4096-point Hann frames every 2400 frames: two frames per
 * 100 ms cell, both carried through one complex FFT (`powerSpectraOfPair`).
 * Band power is normalised so a band reads the mean-square level in dB of
 * what falls in it (a −20 dBFS sine reads −23 dB, like its RMS), summing
 * exactly across bands by Parseval. Streaming: pushes of any length, the
 * tail completed with zeros at `finish()`, results identical to one pass.
 *
 * The six bands and the low / mid / high grouping are provisional edges for
 * the rules of Phase 6 (plan §7 "energy by frequency band over time"); the
 * glossary's own names (Sub, Low, Low-mid, Mid, High-mid, High) are kept.
 */
import { Fft, powerSpectraOfPair } from "./fft";

export const FFT_SIZE = 4096;
export const FRAME_HOP = 2400;

export interface BandDef {
  readonly id: "sub" | "low" | "low-mid" | "mid" | "high-mid" | "high";
  readonly label: string;
  readonly lowHz: number;
  readonly highHz: number;
}

export const BANDS: readonly BandDef[] = [
  { id: "sub", label: "Sub", lowHz: 20, highHz: 60 },
  { id: "low", label: "Low", lowHz: 60, highHz: 250 },
  { id: "low-mid", label: "Low-mid", lowHz: 250, highHz: 500 },
  { id: "mid", label: "Mid", lowHz: 500, highHz: 2000 },
  { id: "high-mid", label: "High-mid", lowHz: 2000, highHz: 6000 },
  { id: "high", label: "High", lowHz: 6000, highHz: 20000 },
] as const;

/** Which bands make the three-way balance. */
export const BALANCE_GROUPS = {
  low: ["sub", "low"],
  mid: ["low-mid", "mid"],
  high: ["high-mid", "high"],
} as const satisfies Record<"low" | "mid" | "high", readonly BandDef["id"][]>;

export class SpectralAnalyser {
  readonly cellCount: number;
  /** Per band: summed band power of the frames in each cell (divide by `framesInCell` for the mean). */
  readonly bandPower: Float64Array[];
  readonly centroidNumerator: Float64Array;
  readonly centroidDenominator: Float64Array;
  readonly framesInCell: Uint8Array;

  private readonly cellFrames: number;
  private readonly fft = new Fft(FFT_SIZE);
  private readonly hann = new Float64Array(FFT_SIZE);
  private readonly windowEnergy: number;
  private readonly re = new Float64Array(FFT_SIZE);
  private readonly im = new Float64Array(FFT_SIZE);
  private readonly powerA = new Float64Array(FFT_SIZE / 2 + 1);
  private readonly powerB = new Float64Array(FFT_SIZE / 2 + 1);
  private readonly binLow: Int32Array;
  private readonly binHigh: Int32Array;
  private readonly binHz: number;
  private buf = new Float64Array(0);
  private bufStart = 0;
  private bufLength = 0;
  private nextCell = 0;
  private total = 0;
  private finished = false;

  constructor(sampleRate: number, cellFrames: number, cellCount: number) {
    this.cellCount = cellCount;
    this.cellFrames = cellFrames;
    this.bandPower = BANDS.map(() => new Float64Array(cellCount));
    this.centroidNumerator = new Float64Array(cellCount);
    this.centroidDenominator = new Float64Array(cellCount);
    this.framesInCell = new Uint8Array(cellCount);
    let s2 = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
      this.hann[i] = w;
      s2 += w * w;
    }
    this.windowEnergy = s2;
    this.binHz = sampleRate / FFT_SIZE;
    this.binLow = new Int32Array(BANDS.length);
    this.binHigh = new Int32Array(BANDS.length);
    BANDS.forEach((band, b) => {
      // bins whose centre frequency lies in [lowHz, highHz)
      this.binLow[b] = Math.max(1, Math.ceil(band.lowHz / this.binHz));
      this.binHigh[b] = Math.min(FFT_SIZE / 2, Math.ceil(band.highHz / this.binHz)) - 1;
    });
  }

  push(mid: Float32Array, count = mid.length): void {
    if (this.finished) throw new Error("SpectralAnalyser: push after finish");
    this.append(mid, count);
    this.total += count;
    this.drain(false);
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.drain(true);
  }

  private append(src: Float32Array, count: number): void {
    const need = this.bufLength + count;
    if (this.buf.length < need) {
      const grown = new Float64Array(Math.max(need, this.buf.length * 2, FFT_SIZE * 4));
      grown.set(this.buf.subarray(0, this.bufLength));
      this.buf = grown;
    }
    for (let i = 0; i < count; i++) this.buf[this.bufLength + i] = src[i];
    this.bufLength += count;
  }

  private drain(flush: boolean): void {
    const cellFrames = this.cellFrames;
    while (this.nextCell < this.cellCount) {
      const k = this.nextCell;
      const startA = k * cellFrames;
      const startB = startA + FRAME_HOP;
      const endB = startB + FFT_SIZE;
      const available = this.bufStart + this.bufLength;
      if (!flush && available < endB) return;
      if (startA >= this.total) return; // a cell beyond the audio (cannot happen with a correct cellCount)
      // frame A always exists for a cell with audio; frame B only when the audio reaches its start
      this.fill(this.re, startA);
      const hasB = startB < this.total;
      if (hasB) this.fill(this.im, startB);
      else this.im.fill(0);
      powerSpectraOfPair(this.fft, this.re, this.im, this.powerA, this.powerB);
      this.accumulate(k, this.powerA);
      if (hasB) this.accumulate(k, this.powerB);
      this.nextCell++;
      // drop what no later frame needs: the next pair starts at the next cell
      const keepFrom = (k + 1) * cellFrames;
      const drop = Math.min(this.bufLength, Math.max(0, keepFrom - this.bufStart));
      if (drop > 0) {
        this.buf.copyWithin(0, drop, this.bufLength);
        this.bufLength -= drop;
        this.bufStart += drop;
      }
    }
  }

  /** Windowed frame starting at absolute index `start` into `out`, zeros past the data present. */
  private fill(out: Float64Array, start: number): void {
    const w = this.hann;
    const buf = this.buf;
    const rel = start - this.bufStart;
    const len = this.bufLength;
    for (let i = 0; i < FFT_SIZE; i++) {
      const j = rel + i;
      out[i] = j >= 0 && j < len ? buf[j] * w[i] : 0;
    }
  }

  private accumulate(cell: number, power: Float64Array): void {
    const norm = 2 / (FFT_SIZE * this.windowEnergy);
    for (let b = 0; b < BANDS.length; b++) {
      let sum = 0;
      for (let k = this.binLow[b]; k <= this.binHigh[b]; k++) sum += power[k];
      this.bandPower[b][cell] += sum * norm;
    }
    let num = 0;
    let den = 0;
    for (let k = 1; k <= FFT_SIZE / 2; k++) {
      num += k * power[k];
      den += power[k];
    }
    this.centroidNumerator[cell] += num * this.binHz;
    this.centroidDenominator[cell] += den;
    this.framesInCell[cell]++;
  }
}
