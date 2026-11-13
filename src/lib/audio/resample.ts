/**
 * ALLOY — THE RESAMPLER — Task 11.1.
 *
 * Polyphase windowed-sinc rate conversion between the two project rates,
 * 44100 and 48000. Pure TypeScript, deterministic, Node-testable; the shell
 * runs it inside a Worker (import) and inside the export's rate stage.
 *
 * DESIGN (one page, no magic):
 *
 *   Ratio      44100/48000 = 147/160 after reduction. Downsampling
 *              48000→44100 multiplies by 147/160: L = 147 (phases), M = 160.
 *              Upsampling 44100→48000 multiplies by 160/147: L = 160 (phases),
 *              M = 147. The two phase counts are pinned here and in the tests.
 *   Kernel      Linear-phase symmetric prototype: a sinc lowpass at
 *              cutoff 0.925 × min(in, out)/2 (inside the task's 0.9–0.95),
 *              Kaiser-windowed over ±TAPS_PER_PHASE/2 input samples
 *              (64 taps/phase, inside the task's 32–64), stopband design
 *              attenuation 96 dB (β from the Kaiser formula).
 *   Phases      The kernel is precomputed once as L phase tables — one per
 *              fractional output position m/L — each normalised to unity DC
 *              gain, so a constant passes exactly at every phase.
 *
 * LATENCY — compensated exactly, and what remains is declared, not hidden:
 *
 *   FIR group delay       compensated BY CONSTRUCTION: output n is the
 *                          symmetric kernel centred on its own time n/outRate
 *                          (the per-phase table is the kernel evaluated at
 *                          the fractional offset; nothing is shifted after
 *                          the fact). Round-trip 48→44.1→48 returns an
 *                          impulse to its sample position within ±1 sample.
 *   Fractional phase       built into the phase tables (it is the phase).
 *   Lookahead              ceil(TAPS_PER_PHASE/2) input samples of buffering
 *                          while streaming — `spec.lookaheadInputSamples`;
 *                          the stream's end is zero-padded over exactly that
 *                          window, so the last ~0.7 ms fades as the kernel
 *                          runs off the end. No other delay exists anywhere.
 *
 * Streaming and whole-file produce IDENTICAL bytes: the whole-file entry is
 * one push of everything followed by one flush.
 *
 * Not lossless: like every real resampler, the transition band
 * (≈ 20.4–24.6 kHz at these rates) trades a small droop and a bounded
 * stopband for alias protection. No code or UI may call this "lossless".
 *
 * Pure: no DOM, no timers, no Math.random, no browser APIs.
 */

/* =========================================================================
   THE CONSTANTS
   ========================================================================= */

/** Taps per phase. 64, the top of the task's 32–64 band. */
export const RESAMPLER_TAPS_PER_PHASE = 64;

/** The sinc cutoff as a fraction of min(in, out)/2. 0.925, inside the task's 0.9–0.95. */
export const RESAMPLER_CUTOFF_FRACTION = 0.925;

/** The Kaiser window's design stopband attenuation, dB. */
export const RESAMPLER_ATTENUATION_DB = 96;

/** β from the Kaiser design formula for A > 50 dB: 0.1102·(A − 8.7). */
const KAISER_BETA = 0.1102 * (RESAMPLER_ATTENUATION_DB - 8.7);

/** sinc(t) = sin(πt)/(πt), 1 at 0. */
function sinc(t: number): number {
  if (t === 0) return 1;
  const x = Math.PI * t;
  return Math.sin(x) / x;
}

/** The modified Bessel function of the first kind, order 0, by series — deterministic. */
function besselI0(x: number): number {
  const half = x / 2;
  let term = 1;
  let sum = 1;
  let k = 1;
  // (x/2)^(2k)/(k!)^2 converges fast for β ≈ 9.6: 25 terms reach 1e-17
  while (k < 60) {
    term = (term * half * half) / (k * k);
    sum += term;
    if (term < 1e-17 * sum) break;
    k++;
  }
  return sum;
}

const I0_BETA = besselI0(KAISER_BETA);

/** The Kaiser window on |τ| ≤ halfWidth; 0 outside. */
function kaiser(tau: number, halfWidth: number): number {
  const a = Math.abs(tau);
  if (a >= halfWidth) return 0;
  const u = a / halfWidth;
  return besselI0(KAISER_BETA * Math.sqrt(Math.max(0, 1 - u * u))) / I0_BETA;
}

/* =========================================================================
   THE SPEC — one per direction, pinned
   ========================================================================= */

export interface ResamplerSpec {
  readonly inRate: number;
  readonly outRate: number;
  /** Upsample factor L (the phase count): 147 for 48→44.1, 160 for 44.1→48. */
  readonly up: number;
  /** Downsample factor M: 160 for 48→44.1, 147 for 44.1→48. */
  readonly down: number;
  readonly phases: number;
  readonly tapsPerPhase: number;
  /** The sinc cutoff, Hz. */
  readonly cutoffHz: number;
  /**
   * The declared buffering/lookahead: how many input samples must exist (the
   * stream pads with silence at the end) before the outputs that need them
   * can be emitted. The FIR's group delay is NOT here — it is compensated by
   * construction. No other latency exists.
   */
  readonly lookaheadInputSamples: number;
}

const SPECS = new Map<string, ResamplerSpec>();

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function buildSpec(inRate: number, outRate: number): ResamplerSpec {
  const g = gcd(inRate, outRate);
  const up = outRate / g; // L
  const down = inRate / g; // M
  const cutoffHz = RESAMPLER_CUTOFF_FRACTION * (Math.min(inRate, outRate) / 2);
  return {
    inRate,
    outRate,
    up,
    down,
    phases: up,
    tapsPerPhase: RESAMPLER_TAPS_PER_PHASE,
    cutoffHz,
    lookaheadInputSamples: Math.ceil(RESAMPLER_TAPS_PER_PHASE / 2),
  };
}

/** The spec of a direction, or null when the pair is not supported (the resampler only serves the two project rates against each other). */
export function resamplerSpec(
  inRate: number,
  outRate: number,
): ResamplerSpec | null {
  if (
    !Number.isInteger(inRate) ||
    !Number.isInteger(outRate) ||
    inRate <= 0 ||
    outRate <= 0 ||
    inRate === outRate
  )
    return null;
  // Task 11.1's scope: the two project rates against each other, nothing else.
  if (!(inRate === 44100 || inRate === 48000) || !(outRate === 44100 || outRate === 48000)) return null;
  const key = `${inRate}:${outRate}`;
  let spec = SPECS.get(key);
  if (!spec) {
    spec = buildSpec(inRate, outRate);
    SPECS.set(key, spec);
  }
  return spec;
}

/* =========================================================================
   THE PHASE TABLES
   ========================================================================= */

interface PhaseTable {
  /** Kernel values for integer offsets d = i − floor(c), d ∈ [dLo, dHi]. */
  readonly dLo: number;
  readonly dHi: number;
  readonly values: Float64Array;
}

interface Tables {
  readonly spec: ResamplerSpec;
  /** One per phase m ∈ [0, L): the kernel for outputs whose centre is m/L past an input sample. */
  readonly phases: readonly PhaseTable[];
}

const TABLES = new Map<string, Tables>();

/**
 * Builds (once per direction) the L phase tables. Phase m's output centre is
 * c = floor(c) + m/L, so the kernel is ψ(d − m/L) over integer offsets d.
 * Each table is normalised to Σ = 1: a constant input passes at exactly 1.
 */
function tablesFor(inRate: number, outRate: number): Tables {
  const key = `${inRate}:${outRate}`;
  let tables = TABLES.get(key);
  if (tables) return tables;
  const spec = resamplerSpec(inRate, outRate);
  if (!spec)
    throw new Error(
      `Alloy resampler: ${inRate}→${outRate} is not a supported pair`,
    );
  const K = RESAMPLER_TAPS_PER_PHASE;
  const half = K / 2;
  const fc = spec.cutoffHz / inRate; // cycles per input sample
  // 48000→44100: L = 147, M = 160. 44100→48000: L = 160, M = 147. Pinned in the header and in the tests.
  const phaseTables: PhaseTable[] = [];
  for (let m = 0; m < spec.up; m++) {
    const frac = m / spec.up;
    const dLo = Math.ceil(-half - frac);
    const dHi = Math.floor(half - frac);
    const values = new Float64Array(dHi - dLo + 1);
    let sum = 0;
    for (let d = dLo; d <= dHi; d++) {
      const tau = d - frac;
      const v = sinc(2 * fc * tau) * kaiser(tau, half);
      values[d - dLo] = v;
      sum += v;
    }
    // Unity DC gain per phase: a constant passes at exactly 1, every phase.
    if (sum !== 0) for (let i = 0; i < values.length; i++) values[i] /= sum;
    phaseTables.push({ dLo, dHi, values });
  }
  tables = { spec, phases: phaseTables };
  TABLES.set(key, tables);
  return tables;
}

/* =========================================================================
   OUTPUT LENGTH
   ========================================================================= */

/** ceil(inFrames · outRate / inRate): the output covers the input's duration. 4800@48k → 4410@44.1 → back to 4800 exactly. */
export function resampledFrames(
  inFrames: number,
  inRate: number,
  outRate: number,
): number {
  if (inRate === outRate) return inFrames;
  if (!Number.isSafeInteger(inFrames) || inFrames < 0)
    throw new Error(
      `Alloy resampler: the frame count is a whole, non-negative number, not ${String(inFrames)}`,
    );
  return Math.ceil((inFrames * outRate) / inRate);
}

/* =========================================================================
   ONE OUTPUT SAMPLE
   ========================================================================= */

/**
 * Output n's centre is c = n·M/L input samples. The window is
 * [c − K/2, c + K/2]; indices outside [0, inFrames) read zero (the declared
 * edge padding: the ends fade over the kernel's half-width, nowhere else).
 */
function outputSample(
  x: Float32Array,
  inFrames: number,
  phase: PhaseTable,
  floorC: number,
): number {
  let acc = 0;
  const { dLo, dHi, values } = phase;
  for (let d = dLo; d <= dHi; d++) {
    const i = floorC + d;
    if (i < 0 || i >= inFrames) continue; // edge padding: silence
    const v = x[i];
    if (v !== 0) acc += v * values[d - dLo];
  }
  return acc;
}

/* =========================================================================
   WHOLE-FILE ENTRY
   ========================================================================= */

export interface ResampleOptions {
  /** Called after every slice with 0..1. */
  readonly onProgress?: (fraction: number) => void;
  /** Frames per slice before the callback yields — deterministic chunking for progress. */
  readonly sliceFrames?: number;
}

/**
 * Resamples every channel of a whole file. Equal rates copy: the caller
 * decides whether a stage runs at all; when it is handed equal rates anyway,
 * the honest result is the input, unchanged.
 */
export function resampleChannels(
  channels: readonly Float32Array[],
  inRate: number,
  outRate: number,
  options: ResampleOptions = {},
): Float32Array[] {
  if (inRate === outRate) return channels.map((c) => c.slice());
  const spec = resamplerSpec(inRate, outRate);
  if (!spec)
    throw new Error(
      `Alloy resampler: ${inRate}→${outRate} is not a supported pair`,
    );
  const tables = tablesFor(inRate, outRate);
  const inFrames = channels.length === 0 ? 0 : channels[0].length;
  const outFrames = resampledFrames(inFrames, inRate, outRate);
  const out: Float32Array[] = channels.map(() => new Float32Array(outFrames));
  const slice = Math.max(
    1,
    options.sliceFrames ?? Math.max(1, Math.floor(inRate / 2)),
  );
  let done = 0;
  for (let n = 0; n < outFrames; n++) {
    const cNum = n * spec.down;
    const floorC = Math.floor(cNum / spec.up);
    const phase = tables.phases[cNum % spec.up];
    for (let ch = 0; ch < channels.length; ch++) {
      out[ch][n] = outputSample(channels[ch], inFrames, phase, floorC);
    }
    if (n + 1 - done >= slice || n + 1 === outFrames) {
      done = n + 1;
      options.onProgress?.(outFrames === 0 ? 1 : done / outFrames);
    }
  }
  return out;
}

/* =========================================================================
   STREAMING — chunk in, chunk out, byte-identical to the whole file
   ========================================================================= */

export interface ResamplerChunk {
  /** The converted frames; the arrays are fresh per call — the caller may keep them. */
  readonly channels: Float32Array[];
  readonly frames: number;
}

export interface StreamingResampler {
  /** Feed the next input slice. Emits every output whose window is fully covered by the input seen so far. */
  push(input: readonly Float32Array[], frames: number): ResamplerChunk;
  /** Pad the end with silence and emit the rest. The resampler is finished afterwards. */
  flush(): ResamplerChunk;
}

/** Output n reads input up to floorC(n) + dHi(phase(n)); it is covered when that index exists. Any n is valid — the phase index is always in range. */
function windowEnd(spec: ResamplerSpec, tables: Tables, n: number): number {
  const cNum = n * spec.down;
  const floorC = Math.floor(cNum / spec.up);
  const phase = tables.phases[((cNum % spec.up) + spec.up) % spec.up];
  return floorC + phase.dHi;
}

/**
 * One resampler over `channelCount` channels. `push` may be handed any slice
 * size; outputs appear as soon as their windows exist. `flush` zero-pads the
 * end over the declared lookahead and emits the remainder — the concatenation
 * of every chunk equals the whole-file entry on the same input (the tests
 * assert it sample for sample).
 */
export function createStreamingResampler(
  inRate: number,
  outRate: number,
  channelCount: number,
): StreamingResampler {
  if (channelCount < 1)
    throw new Error("Alloy resampler: at least one channel");
  if (inRate === outRate) {
    // Equal rates: the honest conversion is the input, unchanged. Each push
    // is emitted as-is; flush adds nothing.
    return {
      push(input, frames) {
        const out = Array.from(
          { length: channelCount },
          () => new Float32Array(frames),
        );
        for (let ch = 0; ch < channelCount; ch++)
          out[ch].set(input[ch].subarray(0, frames));
        return { channels: out, frames };
      },
      flush() {
        return {
          channels: Array.from(
            { length: channelCount },
            () => new Float32Array(0),
          ),
          frames: 0,
        };
      },
    };
  }
  const spec = resamplerSpec(inRate, outRate);
  if (!spec)
    throw new Error(
      `Alloy resampler: ${inRate}->${outRate} is not a supported pair`,
    );
  const tables = tablesFor(inRate, outRate);
  const history: Float32Array[] = Array.from(
    { length: channelCount },
    () => new Float32Array(0),
  );
  let inFrames = 0; // the virtual file's length so far
  let nextOut = 0; // the first output not yet emitted
  let finished = false;

  const covered = (n: number): boolean => windowEnd(spec, tables, n) < inFrames;

  /** The highest covered output, by a direct estimate then an exact correction. */
  const lastCovered = (): number => {
    const outTotal = resampledFrames(inFrames, inRate, outRate);
    let n = Math.min(
      outTotal - 1,
      Math.max(
        nextOut - 1,
        Math.floor(
          ((inFrames - 1) * spec.up - (RESAMPLER_TAPS_PER_PHASE / 2) * spec.up) /
            spec.down,
        ),
      ),
    );
    while (n >= nextOut && !covered(n)) n--;
    while (covered(n + 1)) n++;
    return n;
  };

  const emitUpTo = (last: number): ResamplerChunk => {
    if (last < nextOut)
      return {
        channels: Array.from(
          { length: channelCount },
          () => new Float32Array(0),
        ),
        frames: 0,
      };
    const frames = last - nextOut + 1;
    const out = Array.from(
      { length: channelCount },
      () => new Float32Array(frames),
    );
    for (let n = nextOut; n <= last; n++) {
      const cNum = n * spec.down;
      const floorC = Math.floor(cNum / spec.up);
      const phase = tables.phases[cNum % spec.up];
      for (let ch = 0; ch < channelCount; ch++)
        out[ch][n - nextOut] = outputSample(
          history[ch],
          inFrames,
          phase,
          floorC,
        );
    }
    nextOut = last + 1;
    return { channels: out, frames };
  };

  return {
    push(input, frames) {
      if (finished)
        throw new Error("Alloy resampler: the stream is already flushed");
      if (input.length !== channelCount)
        throw new Error(
          `Alloy resampler: ${input.length} channels were pushed, ${channelCount} were declared`,
        );
      for (let ch = 0; ch < channelCount; ch++) {
        if (input[ch].length < frames)
          throw new Error(
            `Alloy resampler: channel ${ch} holds ${input[ch].length} frames; ${frames} were pushed`,
          );
        const grown = new Float32Array(inFrames + frames);
        grown.set(history[ch]);
        grown.set(input[ch].subarray(0, frames), inFrames);
        history[ch] = grown;
      }
      inFrames += frames;
      return emitUpTo(lastCovered());
    },
    flush() {
      if (finished)
        return {
          channels: Array.from(
            { length: channelCount },
            () => new Float32Array(0),
          ),
          frames: 0,
        };
      finished = true;
      return emitUpTo(resampledFrames(inFrames, inRate, outRate) - 1);
    },
  };
}
