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
import type { Bus, BusId, ChannelId, Project, ReturnBusId, SidechainEdge, Track, TrackId } from "../project/model";
import { computeAudibility, busProcessingOrder, type Audibility } from "./audibility";
import { BusChain, ReturnChain, TrackChain, type DetectorKeys, type MaskingDynamicBand } from "./chains";
import { validateSidechains, type SidechainVerdict } from "./sidechain";
import { MASTER_LIMITER } from "./constants";

/** One stereo block: two channels of the project's Float32 format. */
export type StereoBlock = readonly [Float32Array, Float32Array];

export interface MixEngineOptions {
  readonly sampleRate?: number;
  /** The largest block `process` will be handed, frames. Buffers are sized once, here. */
  readonly maxFramesPerBlock?: number;
  /**
   * Engine-owned Dynamic EQ dips chosen by masking resolution (Task 7.3). They are
   * additive to the project model: a band that already carries `dynamicDepthDb`
   * keeps that configured depth, and an overlay never replaces it.
   */
  readonly maskingDynamicBands?: ReadonlyMap<TrackId, readonly MaskingDynamicBand[]>;
}

/** Optional monitor taps — what a track, bus or Return produced this block, for meters and tests. */
export interface MixTaps {
  readonly tracks?: ReadonlyMap<TrackId, StereoBlock>;
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

  /** The detector edges this engine runs from — validated separately from the graph. */
  private currentSidechains: SidechainVerdict;
  /**
   * One key buffer per (destination, processor), sized in the constructor. The same
   * bundle object is reused every block, so the block loop allocates nothing.
   */
  private keyBundles: ReadonlyMap<ChannelId, DetectorKeys>;

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
    for (const track of project.tracks) {
      trackChains.set(track.id, new TrackChain(track, dspOptions, options.maskingDynamicBands?.get(track.id) ?? []));
    }
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

    this.currentSidechains = validateSidechains(project);
    this.keyBundles = this.buildKeyBundles(this.currentSidechains, maxFrames);
  }

  /**
   * Allocate the key buffers a plan needs. Called from the constructor and from
   * `refreshSidechains` — never from `process`, which must not allocate.
   */
  private buildKeyBundles(verdict: SidechainVerdict, frames: number): ReadonlyMap<ChannelId, DetectorKeys> {
    const bundles = new Map<ChannelId, DetectorKeys>();
    for (const [destination, processors] of verdict.plan) {
      const bundle: { compressor?: readonly Float32Array[]; dynamicEq?: readonly Float32Array[] } = {};
      for (const processor of processors.keys()) {
        const buffer = zeroPair(frames);
        if (processor === "compressor") bundle.compressor = buffer;
        else bundle.dynamicEq = buffer;
      }
      bundles.set(destination, bundle);
    }
    return bundles;
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

  private fillKeys(trackInputs: TrackInputs, frames: number): void {
    for (const [destination, bundle] of this.keyBundles) {
      const sources = this.currentSidechains.plan.get(destination);
      if (bundle.compressor !== undefined) {
        this.fillKey(bundle.compressor, sources?.get("compressor"), trackInputs, frames);
      }
      if (bundle.dynamicEq !== undefined) {
        this.fillKey(bundle.dynamicEq, sources?.get("dynamic-eq"), trackInputs, frames);
      }
    }
  }

  /**
   * One key buffer = the source's pre-fader, post-trim input for this block.
   *
   * A source that is muted or solo-excluded delivers silence, which is the Task 7.1
   * audibility rule applied to the detector path: no signal in, no reduction out. A
   * source with no audio this block is silence for the same reason. Nothing is
   * allocated here.
   */
  private fillKey(
    key: readonly Float32Array[],
    sourceId: TrackId | undefined,
    trackInputs: TrackInputs,
    frames: number,
  ): void {
    if (sourceId === undefined) {
      this.silenceKey(key, frames);
      return;
    }
    const input = trackInputs.get(sourceId);
    const chain = this.trackChains.get(sourceId);
    if (input === undefined || chain === undefined || !this.currentAudibility.outputPasses(sourceId)) {
      this.silenceKey(key, frames);
      return;
    }
    const trim = chain.trimGain;
    for (let c = 0; c < CHANNELS; c++) {
      const from = input[c];
      const to = key[c];
      for (let i = 0; i < frames; i++) to[i] = from[i] * trim;
    }
  }

  private silenceKey(key: readonly Float32Array[], frames: number): void {
    for (let c = 0; c < CHANNELS; c++) key[c].fill(0, 0, frames);
  }

  /** The detector edges this engine is running from, including any rejected ones. */
  get sidechainVerdict(): SidechainVerdict {
    return this.currentSidechains;
  }

  /**
   * Re-read the detector edges after a controller changes one (Task 7.2). Only the key
   * plan is rebuilt — the chains, their state, the audibility rules and the audible
   * graph are untouched. Buffers are allocated here, which is why this must not be
   * called from inside `process`.
   */
  refreshSidechains(edges?: readonly SidechainEdge[]): SidechainVerdict {
    const project = edges === undefined ? this.project : { ...this.project, sidechains: edges };
    this.currentSidechains = validateSidechains(project);
    this.keyBundles = this.buildKeyBundles(this.currentSidechains, this.maxFramesPerBlock);
    return this.currentSidechains;
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

    // 0. Sidechain keys, from THIS block and before any chain runs: a key is always
    //    sample-aligned with the audio it drives and can never be a previous block's.
    this.fillKeys(trackInputs, blockFrames);

    // 1. Tracks, in project order.
    for (const track of this.trackOrder) {
      const sends = track.channel.sends;
      let sendActive = false;
      for (const send of sends) {
        if (send.to !== null && this.audibility.sendPasses(track.id, send.to)) sendActive = true;
      }
      const outputActive = this.audibility.outputPasses(track.id);
      const trackTap = taps?.tracks?.get(track.id);
      // Nothing passes: the chain is skipped and its state frozen (the 6.x bypass rule).
      if (!sendActive && !outputActive) {
        if (trackTap) copyInto(trackTap, null, blockFrames);
        continue;
      }

      copyInto(scratch, trackInputs.get(track.id) ?? null, blockFrames);
      const chain = this.trackChains.get(track.id) as TrackChain;
      chain.process(scratch, blockFrames, this.keyBundles.get(track.id));
      if (trackTap) copyInto(trackTap, scratch, blockFrames);

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
      chain.process(buffer, blockFrames, this.keyBundles.get(bus.id));
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
