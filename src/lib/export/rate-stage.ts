/**
 * ALLOY — THE EXPORT RATE STAGE — Task 11.1.
 *
 * Between the render and the depth stage: the same resampler as the import
 * (lib/audio/resample.ts), run streaming over the render's chunks. Export
 * renders at the PROJECT's rate; when the target differs, this stage
 * converts once, then the depth stage (the WAV writer) writes it.
 *
 * The wrapper has the WavStreamWriter's own shape (begin / write / finish /
 * abort), so the exporter's three paths feed it exactly as they fed the
 * writer before — one rate stage, one depth stage, never interleaved.
 *
 * `finish` flushes the resampler's declared lookahead first (the end is
 * zero-padded over the kernel's half-width, as in the resampler's contract),
 * then patches the header with the TARGET frames the writer actually wrote.
 */

import {
  createStreamingResampler,
  resamplerSpec,
  type ResamplerChunk,
  type StreamingResampler,
} from "../audio/resample";
import { WavSinkError, WavStreamWriter, type WavWriteStats } from "./encode";

export class RateStageError extends Error {
  constructor(detail: string) {
    super(`Alloy export rate stage: ${detail}`);
    this.name = "RateStageError";
  }
}

/**
 * A writer at the TARGET rate over a writer at the project rate. When the
 * two are equal, `wrap` returns the inner writer unchanged: no stage exists,
 * nothing is converted, nothing is shifted.
 */
export class RateStageWriter {
  private readonly inner: WavStreamWriter;
  private readonly resampler: StreamingResampler | null;
  private state: "open" | "finished" | "aborted" = "open";

  private constructor(inner: WavStreamWriter, fromRate: number) {
    this.inner = inner;
    const toRate = inner.format.sampleRate;
    this.resampler =
      fromRate === toRate
        ? null
        : createStreamingResampler(fromRate, toRate, 2);
  }

  /** The writer for a render at `fromRate` into a file at the inner writer's rate. */
  static wrap(
    inner: WavStreamWriter,
    fromRate: number,
  ): WavStreamWriter | RateStageWriter {
    if (fromRate === inner.format.sampleRate) return inner;
    if (!resamplerSpec(fromRate, inner.format.sampleRate)) {
      throw new RateStageError(
        `${fromRate}→${inner.format.sampleRate} is not a supported pair`,
      );
    }
    return new RateStageWriter(inner, fromRate);
  }

  get format() {
    return this.inner.format;
  }

  get framesWritten(): number {
    return this.inner.framesWritten;
  }

  async begin(): Promise<void> {
    this.requireOpen();
    await this.inner.begin();
  }

  /** Append `frames` frames at the PROJECT rate; the stage emits what it can at the target rate. */
  async write(
    left: Float32Array,
    right: Float32Array,
    frames: number,
  ): Promise<void> {
    this.requireOpen();
    if (!this.resampler) {
      await this.inner.write(left, right, frames);
      return;
    }
    const chunk = this.resampler.push([left, right], frames);
    await this.drain(chunk);
  }

  /** Flush the declared lookahead and close. The stats are the TARGET's. */
  async finish(): Promise<WavWriteStats> {
    this.requireOpen();
    if (this.resampler) {
      const tail = this.resampler.flush();
      await this.drain(tail);
    }
    return this.inner.finish();
  }

  async abort(error: unknown): Promise<void> {
    if (this.state !== "open") return;
    this.state = "aborted";
    await this.inner.abort(error);
  }

  private async drain(chunk: ResamplerChunk): Promise<void> {
    if (chunk.frames <= 0) return;
    // The chunks are at most the resampler's own slice of the pushed block,
    // bounded by the writer's 65536-frame block.
    let at = 0;
    while (at < chunk.frames) {
      const take = Math.min(65536, chunk.frames - at);
      await this.inner.write(
        chunk.channels[0].subarray(at, at + take),
        chunk.channels[1].subarray(at, at + take),
        take,
      );
      at += take;
    }
  }

  private requireOpen(): void {
    if (this.state === "aborted")
      throw new WavSinkError("the rate stage was aborted");
    if (this.state === "finished")
      throw new WavSinkError("the rate stage is already closed");
  }
}
