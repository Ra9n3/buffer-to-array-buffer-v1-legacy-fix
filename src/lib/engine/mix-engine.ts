/**
 * ALLOY — the mixing engine: chains, summing, routing and the master stage
 * (Task 7.1).
 *
 * This is the audio-processing INTEGRATION layer only. It connects the approved
 * Task 6.1–6.3 modules into the plan's signal flow, sums deterministically, applies
 * the model's gains and pans, and runs the master's safety limiter. It does not
 * play, transport, export, load assets, choose parameters, or talk to the store or
 * any component (Tasks 5.x / 7.2–7.4 own those).
 *
 * SIGNAL FLOW (plan §8 / §8a), per block:
 *
 *   for each track, in project order:
 *       trim → expander? → EQ → dynamic EQ → compressor → pan → fader
 *       → each post-fader send into its Return's input
 *       → its destination (the assigned bus, or the master sum)
 *   for each bus, sources first (a bus that feeds another bus comes first):
 *       trim → EQ → compressor → balance → fader → destination
 *   for each Return:
 *       effect (wet only) → Return level → the master sum
 *   master: the safety limiter → the output block
 *
 * RULES THAT ARE DELIBERATE, and each one is tested:
 *
 *   - **Unity summing.** Nothing compensates for the number of contributors, and no
 *     stage adds gain the model does not hold; a bus's fader, trim and EQ are the
 *     only gains between it and the sum (plan §8; the 6.x "no hidden gain" rule).
 *   - **Wet-only Returns.** A Return's input is its incoming sends; its effect has
 *     no dry path (Task 6.3), so a send adds ambience and never a second dry copy.
 *   - **No feedback.** The routing rules (`validateGraph`) reject loops and the
 *     engine refuses to build on a graph they reject, so a bus can never feed
 *     itself, directly or through a chain.
 *   - **State across blocks, and one frozen state per silent channel.** A channel
 *     that passes no audio (muted, or not part of a solo path) is skipped entirely —
 *     the same "bypass freezes state" convention the 6.x modules use — so unmuting
 *     resumes exactly where it stopped instead of jumping.
 *   - **No allocation while processing.** Every buffer is sized once, in the
 *     constructor, from `maxFramesPerBlock`.
 */

import { SafetyLimiter } from "../dsp/limiter";
import { defaultCount, requireBuffers } from "../dsp/buffers";
import { DSP_SAMPLE_RATE, requireSampleRate } from "../dsp/params";
import { validateGraph } from "../project/routing";
import type { Bus, BusId, Project, ReturnBusId, Track, TrackId } from "../project/model";
import { computeAudibility, busProcessingOrder, type Audibility } from "./audibility";
import { BusChain, ReturnChain, TrackChain } from "./chains";
import { MASTER_LIMITER } from "./constants";

/** One stereo block: two channels of the project's Float32 format. */
export type StereoBlock = readonly [Float32Array, Float32Array];

export interface MixEngineOptions {
  readonly sampleRate?: number;
  /** The largest block `process` will be handed, frames. Buffers are sized once, here. */
  readonly maxFramesPerBlock?: number;
}

/** Optional monitor taps — what a bus or a Return produced this block, for meters and tests. */
export interface MixTaps {
  readonly buses?: ReadonlyMap<BusId, StereoBlock>;
  readonly returns?: ReadonlyMap<ReturnBusId, StereoBlock>;
}

/** The buffer the engine may be handed less of than it has: absent means silence. */
export type TrackInputs = ReadonlyMap<TrackId, StereoBlock>;

const CHANNELS = 2;

function zeroPair(frames: number): [Float32Array, Float32Array] {
  return [new Float32Array(frames), new Float32Array(frames)];
}

/** `destination += source · gain`, sample by sample, no allocation. */
function addInto(destination: StereoBlock, source: StereoBlock, gain: number, frames: number): void {
  for (let c = 0; c < CHANNELS; c++) {
    const to = destination[c];
    const from = source[c];
    for (let i = 0; i < frames; i++) to[i] += from[i] * gain;
  }
}

function copyInto(destination: StereoBlock, source: StereoBlock | null, frames: number): void {
  for (let c = 0; c < CHANNELS; c++) {
    const to = destination[c];
    if (source === null) to.fill(0, 0, frames);
    else to.set(source[c].subarray(0, frames));
  }
}

export class MixEngine {
  readonly sampleRate: number;
  readonly channels = CHANNELS;
  readonly maxFramesPerBlock: number;
  /** The master limiter's lookahead — the only latency in the chain (Task 6.2). */
  readonly latencyFrames: number;
  private readonly project: Project;
  private currentAudibility: Audibility;
  private readonly trackOrder: readonly Track[];
  private readonly busOrder: readonly Bus[];
  private readonly trackChains: ReadonlyMap<TrackId, TrackChain>;
  private readonly busChains: ReadonlyMap<BusId, BusChain>;
  private readonly returnChains: ReadonlyMap<ReturnBusId, ReturnChain>;

  private readonly scratch: [Float32Array, Float32Array];
  private readonly busBuffers: ReadonlyMap<BusId, StereoBlock>;
  private readonly returnBuffers: ReadonlyMap<ReturnBusId, StereoBlock>;
  private readonly masterBuffer: [Float32Array, Float32Array];
  private readonly limiter: SafetyLimiter;

  constructor(project: Project, options: MixEngineOptions = {}) {
    const verdict = validateGraph(project);
    if (!verdict.ok) {
      throw new Error(`Alloy Mix Engine: the routing graph is not playable — ${verdict.message}`);
    }
    this.project = project;
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    const maxFrames = options.maxFramesPerBlock ?? 4096;
    if (!Number.isInteger(maxFrames) || maxFrames < 1) {
      throw new Error(`Alloy Mix Engine: maxFramesPerBlock must be a whole number ≥ 1, not ${String(maxFrames)}`);
    }
    this.maxFramesPerBlock = maxFrames;

    const dspOptions = { channels: CHANNELS, sampleRate: this.sampleRate } as const;
    this.trackOrder = project.tracks;
    this.busOrder = busProcessingOrder(project);
    this.currentAudibility = computeAudibility(project);

    const trackChains = new Map<TrackId, TrackChain>();
    for (const track of project.tracks) trackChains.set(track.id, new TrackChain(track, dspOptions));
    this.trackChains = trackChains;

    const busChains = new Map<BusId, BusChain>();
    for (const bus of project.buses) busChains.set(bus.id, new BusChain(bus, dspOptions));
    this.busChains = busChains;

    const returnChains = new Map<ReturnBusId, ReturnChain>();
    for (const ret of project.returns) returnChains.set(ret.id, new ReturnChain(ret, dspOptions));
    this.returnChains = returnChains;

    this.scratch = zeroPair(maxFrames);
    const busBuffers = new Map<BusId, StereoBlock>();
    for (const bus of project.buses) busBuffers.set(bus.id, zeroPair(maxFrames));
    this.busBuffers = busBuffers;
    const returnBuffers = new Map<ReturnBusId, StereoBlock>();
    for (const ret of project.returns) returnBuffers.set(ret.id, zeroPair(maxFrames));
    this.returnBuffers = returnBuffers;
    this.masterBuffer = zeroPair(maxFrames);

    this.limiter = new SafetyLimiter({ ...MASTER_LIMITER }, dspOptions);
    this.latencyFrames = this.limiter.latencyFrames;
  }

  /** The longest tail any Return may still produce, seconds — Task 7.4's number. */
  get tailSeconds(): number {
    let longest = 0;
    for (const chain of this.returnChains.values()) longest = Math.max(longest, chain.tailSeconds);
    return longest;
  }

  /** One track's compressor reduction, dB ≥ 0 — a readout for meters and tests. */
  trackReductionDb(id: TrackId): number {
    const chain = this.trackChains.get(id);
    return chain ? chain.compressorReductionDb : 0;
  }

  /** One bus's compressor reduction, dB ≥ 0. */
  busReductionDb(id: BusId): number {
    const chain = this.busChains.get(id);
    return chain ? chain.compressorReductionDb : 0;
  }

  /** One track's expander reduction, dB ≥ 0 (0 when `cleanup` is off). */
  trackExpanderReductionDb(id: TrackId): number {
    const chain = this.trackChains.get(id);
    return chain ? chain.expanderReductionDb : 0;
  }

  /** The master limiter's current gain reduction, dB ≥ 0 — a readout, not a control. */
  get masterReductionDb(): number {
    return this.limiter.gainReductionDb;
  }

  /**
   * Process one block. `master` receives the limited sum; the inputs map may omit a
   * track (it then contributes silence). Taps, when given, receive what each bus or
   * Return produced — they never change the result.
   */
  process(trackInputs: TrackInputs, master: StereoBlock, frames?: number, taps?: MixTaps): void {
    const blockFrames = frames ?? defaultCount(master);
    requireBuffers("Alloy Mix Engine", CHANNELS, master, master, blockFrames);
    if (blockFrames > this.maxFramesPerBlock) {
      throw new Error(
        `Alloy Mix Engine: ${blockFrames} frames is more than the ${this.maxFramesPerBlock} this engine was built for`,
      );
    }
    for (const [id, block] of trackInputs) {
      if (!this.trackChains.has(id)) continue; // a track the project no longer has: ignored
      requireBuffers(`Alloy Mix Engine (track ${id})`, CHANNELS, block, block, blockFrames);
    }

    // Fresh accumulators. Sends and bus feeds from the previous block never leak.
    for (const buffer of this.busBuffers.values()) for (let c = 0; c < CHANNELS; c++) buffer[c].fill(0, 0, blockFrames);
    for (const buffer of this.returnBuffers.values()) for (let c = 0; c < CHANNELS; c++) buffer[c].fill(0, 0, blockFrames);
    for (let c = 0; c < CHANNELS; c++) this.masterBuffer[c].fill(0, 0, blockFrames);

    const scratch = this.scratch;

    // 1. Tracks, in project order.
    for (const track of this.trackOrder) {
      const sends = track.channel.sends;
      let sendActive = false;
      for (const send of sends) {
        if (send.to !== null && this.audibility.sendPasses(track.id, send.to)) sendActive = true;
      }
      const outputActive = this.audibility.outputPasses(track.id);
      // Nothing passes: the chain is skipped and its state frozen (the 6.x bypass rule).
      if (!sendActive && !outputActive) continue;

      copyInto(scratch, trackInputs.get(track.id) ?? null, blockFrames);
      const chain = this.trackChains.get(track.id) as TrackChain;
      chain.process(scratch, blockFrames);

      // Post-fader sends (plan §8a): the same post-pan signal into each Return.
      for (const send of sends) {
        if (send.to === null) continue;
        if (!this.audibility.sendPasses(track.id, send.to)) continue;
        const gain = send.level <= -60 ? 0 : 10 ** (send.level / 20);
        if (gain === 0) continue;
        const buffer = this.returnBuffers.get(send.to);
        if (buffer) addInto(buffer, scratch, gain, blockFrames);
      }

      if (outputActive) {
        const destination = track.output === "master" ? this.masterBuffer : this.busBuffers.get(track.output);
        if (destination) addInto(destination, scratch, 1, blockFrames);
      }
    }

    // 2. Buses, sources first, so a bus that feeds another is complete before use.
    for (const bus of this.busOrder) {
      const buffer = this.busBuffers.get(bus.id) as StereoBlock;
      if (!this.audibility.outputPasses(bus.id)) continue;
      const chain = this.busChains.get(bus.id) as BusChain;
      chain.process(buffer, blockFrames);
      const tap = taps?.buses?.get(bus.id);
      if (tap) copyInto(tap, buffer, blockFrames);
      const destination = bus.output === "master" ? this.masterBuffer : this.busBuffers.get(bus.output);
      if (destination && destination !== buffer) addInto(destination, buffer, 1, blockFrames);
    }

    // 3. Returns: the effect on the summed sends, then the Return's level.
    for (const ret of this.project.returns) {
      const buffer = this.returnBuffers.get(ret.id) as StereoBlock;
      if (!this.audibility.outputPasses(ret.id)) continue;
      const chain = this.returnChains.get(ret.id) as ReturnChain;
      chain.process(buffer, blockFrames);
      const tap = taps?.returns?.get(ret.id);
      if (tap) copyInto(tap, buffer, blockFrames);
      addInto(this.masterBuffer, buffer, 1, blockFrames);
    }

    // 4. The master stage: the approved safety limiter, always in circuit.
    this.limiter.process(this.masterBuffer, master, blockFrames);
  }

  /** Let the limiter's lookahead run out — the tail Task 7.4 flushes at a stop. */
  flush(master: StereoBlock, frames?: number): void {
    const blockFrames = frames ?? this.latencyFrames;
    requireBuffers("Alloy Mix Engine", CHANNELS, master, master, blockFrames);
    this.limiter.flush(master, blockFrames);
  }

  /** The solo / mute reading the last block was routed with. */
  get audibility(): Audibility {
    return this.currentAudibility;
  }

  /**
   * Re-read mute and solo after a controller changes one. Only the pass / fail routing is
   * recomputed — every chain keeps its state and no processor is rebuilt (the 7.1 lifecycle
   * rule: rebuild only when the graph itself changes).
   */
  refreshAudibility(): Audibility {
    this.currentAudibility = computeAudibility(this.project);
    return this.currentAudibility;
  }

  /** Clear every processor, accumulator and the limiter. */
  reset(): void {
    for (const chain of this.trackChains.values()) chain.reset();
    for (const chain of this.busChains.values()) chain.reset();
    for (const chain of this.returnChains.values()) chain.reset();
    for (const buffer of this.busBuffers.values()) for (let c = 0; c < CHANNELS; c++) buffer[c].fill(0);
    for (const buffer of this.returnBuffers.values()) for (let c = 0; c < CHANNELS; c++) buffer[c].fill(0);
    for (let c = 0; c < CHANNELS; c++) this.masterBuffer[c].fill(0);
    this.limiter.reset();
  }
}
