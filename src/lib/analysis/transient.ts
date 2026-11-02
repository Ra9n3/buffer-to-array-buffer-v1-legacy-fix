/**
 * ALLOY analysis — transient activity and short-time energy change (Task 5.2).
 *
 * On the mid signal, 10 ms blocks (480 frames at 48 kHz): the block energy in
 * dB and its positive change from the previous block — the log-energy flux.
 * A block is an onset when the flux reaches `ONSET_FLUX_DB`, the block is
 * louder than `ONSET_FLOOR_DBFS` and at least `ONSET_SPACING_BLOCKS` have
 * passed since the last onset. Per 100 ms cell the largest flux is kept; the
 * onsets are kept as times. Thresholds are provisional, for Phase 6 to tune
 * against real stems. Streaming: partial blocks carry across pushes.
 */
export const BLOCK_SECONDS = 0.01;
export const ONSET_FLUX_DB = 6;
export const ONSET_FLOOR_DBFS = -60;
export const ONSET_SPACING_BLOCKS = 5; // 50 ms
export const ENERGY_FLOOR_DB = -120;

export class TransientAnalyser {
  readonly cellCount: number;
  /** Per cell: the largest positive block-to-block energy change in dB. */
  readonly fluxDb: Float32Array;
  readonly onsets: number[] = [];

  private readonly blockFrames: number;
  private readonly blocksPerCell: number;
  private blockIndex = 0;
  private blockSum = 0;
  private blockFill = 0;
  private previousDb = ENERGY_FLOOR_DB;
  private lastOnsetBlock = -Infinity;
  private fluxSum = 0;
  private fluxBlocks = 0;

  constructor(sampleRate: number, cellFrames: number, cellCount: number) {
    this.cellCount = cellCount;
    this.blockFrames = Math.round(sampleRate * BLOCK_SECONDS);
    this.blocksPerCell = Math.max(1, Math.round(cellFrames / this.blockFrames));
    this.fluxDb = new Float32Array(cellCount);
  }

  push(mid: Float32Array, count = mid.length): void {
    for (let i = 0; i < count; i++) {
      const x = mid[i];
      this.blockSum += x * x;
      if (++this.blockFill === this.blockFrames) this.closeBlock();
    }
  }

  finish(): void {
    if (this.blockFill > 0) this.closeBlock();
  }

  /** The mean flux over all blocks, in dB — a stem-wide measure of how "spiky" the energy is. */
  get meanFluxDb(): number | null {
    return this.fluxBlocks === 0 ? null : this.fluxSum / this.fluxBlocks;
  }

  private closeBlock(): void {
    const mean = this.blockSum / this.blockFill;
    const db = mean > 0 ? Math.max(ENERGY_FLOOR_DB, 10 * Math.log10(mean)) : ENERGY_FLOOR_DB;
    const flux = Math.max(0, db - this.previousDb);
    const cell = Math.min(this.cellCount - 1, Math.floor(this.blockIndex / this.blocksPerCell));
    if (cell >= 0 && flux > this.fluxDb[cell]) this.fluxDb[cell] = flux;
    this.fluxSum += flux;
    this.fluxBlocks++;
    if (flux >= ONSET_FLUX_DB && db >= ONSET_FLOOR_DBFS && this.blockIndex - this.lastOnsetBlock >= ONSET_SPACING_BLOCKS) {
      this.onsets.push(this.blockIndex * BLOCK_SECONDS);
      this.lastOnsetBlock = this.blockIndex;
    }
    this.previousDb = db;
    this.blockIndex++;
    this.blockSum = 0;
    this.blockFill = 0;
  }
}
