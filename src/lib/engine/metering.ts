/**
 * ALLOY — real-time metering (Stage 1): the detector, the ring, the set.
 *
 * Pure TypeScript, no DOM, no timers, no store: the engine calls into it from
 * `process`, so everything here obeys the engine's own rules — state in numeric
 * fields, buffers preallocated in constructors, nothing allocated per block.
 * `log10`, `sqrt` and `exp` are never called per sample: the two smoothing
 * coefficients are computed once in the constructor, and every dB conversion
 * happens at a sub-block boundary only.
 *
 * THE DETECTOR (`StereoMeter`) runs the four laws of the plan's meter face:
 *
 *   - PEAK, per channel: the max of |x| since the last sub-block boundary,
 *     emitted as dB, never below `PEAK_FLOOR_DB`.
 *   - OVER: a flag for |x| >= 1.0 anywhere in the sub-block.
 *   - VU, per channel: two cascaded one-pole smoothers over |x| (s1 fast into
 *     s2, both at `VU_TAU_SECONDS`), read as dB against `VU_REFERENCE_DBFS`
 *     after dividing by 0.9003 — the rectified-average-to-RMS ratio of a sine —
 *     so a sine whose RMS is the reference reads 0 VU. Never below
 *     `VU_FLOOR_DB`.
 *   - CORRELATION: three smoothers (ll, rr, lr) at `CORR_TAU_SECONDS`, read as
 *     lr / sqrt(ll·rr); under `ENERGY_FLOOR` on either side the answer is NaN —
 *     no signal — which `MeterReading` exposes as `null`.
 *
 * THE RING (`MeterRing`) holds `RING_CAPACITY` readings in parallel typed
 * arrays with head/count bookkeeping; `readAt(frame, out)` fills a caller's
 * reusable `MeterReading` with the newest reading whose start frame is <= the
 * asked frame, and reports false when there is none or it was overwritten.
 *
 * THE SET (`MeterSet`) builds one detector-and-ring point per project channel
 * (every track, bus and Return, plus master) from the project's own lists.
 *
 * Sub-block boundaries are aligned to each detector's own frame count (every
 * point consumes the same block lengths — a skipped point is fed zeros of the
 * same length — so that count IS the engine's frame counter, reset in the
 * constructor), which is what carries a partial sub-block across a process()
 * call whose length is not a multiple of `METER_BLOCK_FRAMES`.
 */

import type { BusId, Project, ReturnBusId, TrackId } from "../project/model";

/** One reading every 512 frames — about 10.7 ms at 48 kHz. */
export const METER_BLOCK_FRAMES = 512;
/** The VU reference: a sine whose RMS is this dBFS reads 0 VU. */
export const VU_REFERENCE_DBFS = -18;
/** The VU ballistics time constant, seconds (both cascaded poles). */
export const VU_TAU_SECONDS = 0.045;
/** The correlation smoother's time constant, seconds. */
export const CORR_TAU_SECONDS = 0.3;
/** Below this smoothed energy a channel is "no signal" and corr is null. */
export const ENERGY_FLOOR = 1e-9;
/** Emitted VU never reads lower than this, dB. */
export const VU_FLOOR_DB = -40;
/** Emitted peak never reads lower than this, dB. */
export const PEAK_FLOOR_DB = -120;
/** How many readings each ring keeps before overwriting the oldest. */
export const RING_CAPACITY = 512;

/** The rectified-average-to-RMS ratio of a sine: s2 / 0.9003 ≈ RMS. */
const SINE_RECTIFIED_TO_RMS = 0.9003;

/**
 * One meter reading, filled by `MeterRing.readAt` into a caller-supplied
 * reusable object (nothing here allocates per read). `corr` is `null` when the
 * detector saw no signal; `stampEnd` is the reading's last frame, so the
 * reading covers the half-open interval `(stampEnd - 512, stampEnd]`.
 */
export interface MeterReading {
  stampEnd: number;
  peakLDb: number;
  peakRDb: number;
  vuL: number;
  vuR: number;
  corr: number | null;
  over: boolean;
}

/** A fresh reusable reading — callers keep one and let `readAt` refill it. */
export function newMeterReading(): MeterReading {
  return { stampEnd: 0, peakLDb: 0, peakRDb: 0, vuL: 0, vuR: 0, corr: null, over: false };
}

/**
 * The fixed-capacity reading ring. Parallel typed arrays, one `push` counter:
 * reading `j` (absolute, zero-based) lives in slot `j % RING_CAPACITY` and the
 * oldest surviving reading is `pushed - count`.
 */
export class MeterRing {
  private readonly stampEndArr = new Float64Array(RING_CAPACITY);
  private readonly peakLDbArr = new Float32Array(RING_CAPACITY);
  private readonly peakRDbArr = new Float32Array(RING_CAPACITY);
  private readonly vuLArr = new Float32Array(RING_CAPACITY);
  private readonly vuRArr = new Float32Array(RING_CAPACITY);
  private readonly corrArr = new Float32Array(RING_CAPACITY);
  private readonly overArr = new Uint8Array(RING_CAPACITY);
  private pushed = 0;

  /** How many readings are still readable (never more than the capacity). */
  get count(): number {
    return Math.min(this.pushed, RING_CAPACITY);
  }

  /** Record one reading. Overwrites the oldest when the ring is full. */
  push(stampEnd: number, peakLDb: number, peakRDb: number, vuL: number, vuR: number, corr: number, over: boolean): void {
    const slot = this.pushed % RING_CAPACITY;
    this.stampEndArr[slot] = stampEnd;
    this.peakLDbArr[slot] = peakLDb;
    this.peakRDbArr[slot] = peakRDb;
    this.vuLArr[slot] = vuL;
    this.vuRArr[slot] = vuR;
    this.corrArr[slot] = corr;
    this.overArr[slot] = over ? 1 : 0;
    this.pushed++;
  }

  /**
   * Fill `out` with the newest reading whose start frame
   * (`stampEnd - METER_BLOCK_FRAMES`) is <= `frame`. False when no reading
   * qualifies — none exists, or the one that would is already overwritten.
   */
  readAt(frame: number, out: MeterReading): boolean {
    const count = this.count;
    if (count === 0) return false;
    const oldest = this.pushed - count;
    // Readings are stamped ascending, so the first one found walking back from
    // the newest is the newest whose interval starts at or before `frame`.
    for (let j = this.pushed - 1; j >= oldest; j--) {
      const slot = j % RING_CAPACITY;
      if (this.stampEndArr[slot] - METER_BLOCK_FRAMES <= frame) {
        out.stampEnd = this.stampEndArr[slot];
        out.peakLDb = this.peakLDbArr[slot];
        out.peakRDb = this.peakRDbArr[slot];
        out.vuL = this.vuLArr[slot];
        out.vuR = this.vuRArr[slot];
        const corr = this.corrArr[slot];
        out.corr = Number.isNaN(corr) ? null : corr;
        out.over = this.overArr[slot] === 1;
        return true;
      }
    }
    return false;
  }
}

/**
 * The stereo detector. All state is numeric fields; `process` may be called
 * with any block length (a partial sub-block simply carries into the next
 * call) and allocates nothing.
 */
export class StereoMeter {
  /** The VU smoothing coefficient, computed once: 1 - exp(-1 / (tau * rate)). */
  private readonly vuCoef: number;
  /** The correlation smoothing coefficient, computed once. */
  private readonly corrCoef: number;
  /** Where this detector's readings land (its own ring unless given one). */
  readonly ring: MeterRing;

  private peakL = 0;
  private peakR = 0;
  private overFlag = false;
  private s1L = 0;
  private s2L = 0;
  private s1R = 0;
  private s2R = 0;
  private ll = 0;
  private rr = 0;
  private lr = 0;
  /** Samples consumed into the current sub-block, 0 .. METER_BLOCK_FRAMES-1. */
  private subPos = 0;
  /** Total frames consumed — the stamp base, and this point's engine counter. */
  private framesSeen = 0;

  constructor(sampleRate: number, ring?: MeterRing) {
    this.vuCoef = 1 - Math.exp(-1 / (VU_TAU_SECONDS * sampleRate));
    this.corrCoef = 1 - Math.exp(-1 / (CORR_TAU_SECONDS * sampleRate));
    this.ring = ring ?? new MeterRing();
  }

  /** The linear (pre-dB) VU state of one channel — the calibration readout. */
  get vuLinearL(): number {
    return this.s2L;
  }

  /** The linear (pre-dB) VU state of the right channel. */
  get vuLinearR(): number {
    return this.s2R;
  }

  /** Frames consumed so far — the engine frame counter this point stamps from. */
  get framesProcessed(): number {
    return this.framesSeen;
  }

  /**
   * Consume one block. `stampShift` moves every emitted stamp (the master point
   * passes `-latencyFrames` so its readings line up with the audible stream
   * once the session drops the limiter's lookahead); a reading whose shifted
   * stamp would be negative is discarded — it describes frames the listener
   * never hears — while the detector state resets exactly as for any boundary.
   */
  process(block: readonly [Float32Array, Float32Array], frames: number, stampShift = 0): void {
    const left = block[0];
    const right = block[1];
    const a = this.vuCoef;
    const c = this.corrCoef;
    for (let i = 0; i < frames; i++) {
      const l = left[i];
      const r = right[i];
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > this.peakL) this.peakL = al;
      if (ar > this.peakR) this.peakR = ar;
      if (al >= 1 || ar >= 1) this.overFlag = true;
      this.s1L += a * (al - this.s1L);
      this.s2L += a * (this.s1L - this.s2L);
      this.s1R += a * (ar - this.s1R);
      this.s2R += a * (this.s1R - this.s2R);
      const ll = l * l;
      const rr = r * r;
      const lr = l * r;
      this.ll += c * (ll - this.ll);
      this.rr += c * (rr - this.rr);
      this.lr += c * (lr - this.lr);
      this.subPos++;
      this.framesSeen++;
      if (this.subPos === METER_BLOCK_FRAMES) {
        this.subPos = 0;
        this.emit(stampShift);
      }
    }
  }

  /** One sub-block boundary: convert, reset the per-sub-block state, record. */
  private emit(stampShift: number): void {
    const peakLDb = Math.max(PEAK_FLOOR_DB, 20 * Math.log10(Math.max(this.peakL, 1e-6)));
    const peakRDb = Math.max(PEAK_FLOOR_DB, 20 * Math.log10(Math.max(this.peakR, 1e-6)));
    const vuL = Math.max(VU_FLOOR_DB, 20 * Math.log10(Math.max(this.s2L / SINE_RECTIFIED_TO_RMS, 1e-12)) - VU_REFERENCE_DBFS);
    const vuR = Math.max(VU_FLOOR_DB, 20 * Math.log10(Math.max(this.s2R / SINE_RECTIFIED_TO_RMS, 1e-12)) - VU_REFERENCE_DBFS);
    const corr = this.ll < ENERGY_FLOOR || this.rr < ENERGY_FLOOR ? Number.NaN : this.lr / Math.sqrt(this.ll * this.rr);
    const over = this.overFlag;
    // The per-sub-block state resets at every boundary, kept or discarded alike.
    this.peakL = 0;
    this.peakR = 0;
    this.overFlag = false;
    const stamp = this.framesSeen + stampShift;
    if (stamp < 0) return;
    this.ring.push(stamp, peakLDb, peakRDb, vuL, vuR, corr, over);
  }
}

/** One metered point: its detector and the ring the readings land in. */
export class MeterPoint {
  readonly meter: StereoMeter;
  readonly ring: MeterRing;

  constructor(sampleRate: number) {
    this.ring = new MeterRing();
    this.meter = new StereoMeter(sampleRate, this.ring);
  }
}

/**
 * Every point of one project: a detector-and-ring per track, bus and Return,
 * plus master. Built once from the project's own channel lists, before the
 * engine that feeds it.
 */
export class MeterSet {
  readonly tracks: ReadonlyMap<TrackId, MeterPoint>;
  readonly buses: ReadonlyMap<BusId, MeterPoint>;
  readonly returns: ReadonlyMap<ReturnBusId, MeterPoint>;
  readonly master: MeterPoint;

  constructor(project: Project, sampleRate: number) {
    const tracks = new Map<TrackId, MeterPoint>();
    for (const track of project.tracks) tracks.set(track.id, new MeterPoint(sampleRate));
    this.tracks = tracks;
    const buses = new Map<BusId, MeterPoint>();
    for (const bus of project.buses) buses.set(bus.id, new MeterPoint(sampleRate));
    this.buses = buses;
    const returns = new Map<ReturnBusId, MeterPoint>();
    for (const ret of project.returns) returns.set(ret.id, new MeterPoint(sampleRate));
    this.returns = returns;
    this.master = new MeterPoint(sampleRate);
  }
}
