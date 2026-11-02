/**
 * ALLOY analysis — integrity: DC offset, clipping, non-finite samples (Task 5.2).
 *
 * Per channel, streamed: the running sum for the DC offset, runs of samples
 * at or beyond `CLIP_LEVEL` (three or more consecutive full-scale samples is
 * a flattened waveform, not a loud peak), and the count of NaN / infinite
 * float samples (which the engine treats as zero and reports — Task 5.1
 * already refuses a file that holds them, so a count here is a stored copy
 * that changed under us). Silence is judged on the level series by the
 * analyser, with the Task 5.1 rules (−80 dBFS peak, D5.1.4).
 */
export const CLIP_LEVEL = 0.9999;
export const CLIP_RUN_SAMPLES = 3;
/** A DC offset below the 24-bit noise floor is reported as none (null) rather than as −200-odd dBFS. */
export const DC_FLOOR_DBFS = -144;

export interface ChannelIntegrity {
  readonly dcOffset: number;
  readonly dcOffsetDbfs: number | null;
  readonly fullScaleSamples: number;
  readonly clippingRuns: number;
  readonly longestClippingRun: number;
  readonly nonFinite: number;
}

export class IntegrityAnalyser {
  private readonly sum: Float64Array;
  private readonly frames: Float64Array;
  private readonly fullScale: Float64Array;
  private readonly runs: Float64Array;
  private readonly longest: Float64Array;
  private readonly current: Float64Array;
  private readonly currentSign: Int8Array;
  private readonly nonFinite: Float64Array;

  constructor(readonly channels: number) {
    this.sum = new Float64Array(channels);
    this.frames = new Float64Array(channels);
    this.fullScale = new Float64Array(channels);
    this.runs = new Float64Array(channels);
    this.longest = new Float64Array(channels);
    this.current = new Float64Array(channels);
    this.currentSign = new Int8Array(channels);
    this.nonFinite = new Float64Array(channels);
  }

  /** Reads `count` samples of channel `ch`; non-finite values are counted and must already be zeroed by the decoder. */
  push(ch: number, samples: Float32Array, count: number, nonFinite: number): void {
    let sum = 0;
    let fullScale = this.fullScale[ch];
    let runs = this.runs[ch];
    let longest = this.longest[ch];
    let run = this.current[ch];
    let sign = this.currentSign[ch];
    for (let i = 0; i < count; i++) {
      const x = samples[i];
      sum += x;
      if (x >= CLIP_LEVEL || x <= -CLIP_LEVEL) {
        fullScale++;
        const s = x > 0 ? 1 : -1;
        run = s === sign ? run + 1 : 1; // a run is a flat top against one rail
        sign = s;
        if (run === CLIP_RUN_SAMPLES) runs++;
        if (run > longest) longest = run;
      } else {
        run = 0;
        sign = 0;
      }
    }
    this.sum[ch] += sum;
    this.frames[ch] += count;
    this.fullScale[ch] = fullScale;
    this.runs[ch] = runs;
    this.longest[ch] = longest;
    this.current[ch] = run;
    this.currentSign[ch] = sign;
    this.nonFinite[ch] += nonFinite;
  }

  result(): ChannelIntegrity[] {
    const out: ChannelIntegrity[] = [];
    for (let ch = 0; ch < this.channels; ch++) {
      const dc = this.frames[ch] > 0 ? this.sum[ch] / this.frames[ch] : 0;
      out.push({
        dcOffset: dc,
        dcOffsetDbfs: dc !== 0 && 20 * Math.log10(Math.abs(dc)) > DC_FLOOR_DBFS ? 20 * Math.log10(Math.abs(dc)) : null,
        fullScaleSamples: this.fullScale[ch],
        clippingRuns: this.runs[ch],
        longestClippingRun: this.longest[ch],
        nonFinite: this.nonFinite[ch],
      });
    }
    return out;
  }
}
