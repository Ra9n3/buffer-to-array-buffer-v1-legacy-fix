/**
 * ALLOY — masking resolution (Task 7.3).
 *
 * Detection is kept separate from resolution. `measureMaskingSources` reuses the
 * Task 5.2 `SpectralAnalyser` and the Task 7.1 engine to build frequency-and-time
 * evidence for dry tracks and for the wet contribution of each existing post-fader
 * send. `detectMaskingConflicts` turns that evidence into explainable conflicts.
 * `resolveMaskingConflicts` chooses Auto-only EQ / Dynamic EQ / send moves, and
 * `resolveMaskingAudio` re-measures before any compressor escalation.
 *
 * No new DSP, routing model, Return destination, or sidechain tap is introduced.
 * Existing configured Dynamic EQ depths are never replaced; the masking overlay is
 * additive only where `dynamicDepthDb` is null.
 * A Return is still effect-only and outputs to Master; wet masking is attributed to
 * the track that sent it, because the shared Return output alone cannot say which
 * send produced a tail. The attribution pass runs the same approved ReturnChain on
 * each send in isolation (the effects are linear and static during a render), which
 * is superposition, not a new effect algorithm.
 */

import { BANDS, SpectralAnalyser, type BandDef } from "../analysis/spectral";
import { CELL_SECONDS, cellFramesFor } from "../analysis/analyser";
import { DSP_SAMPLE_RATE, EQ_FREQUENCY_HZ, EQ_GAIN_DB, EQ_Q, requireInRange } from "../dsp/params";
import type { DspOptions } from "../dsp/params";
import { EQ_BANDS, type BandId, type ChainParam, type EqBandState, type EqState, type Mode } from "../mixer-chain";
import type { Project, ReturnBusId, SidechainEdge, Track, TrackId } from "../project/model";
import { computeAudibility } from "./audibility";
import { ReturnChain, type MaskingDynamicBand } from "./chains";
import { MixEngine, type StereoBlock, type MixEngineOptions } from "./mix-engine";
import { validateSidechains, type SidechainVerdict } from "./sidechain";

export type MaskingSourceKind = "dry" | "wet";

export interface MaskingAudioTrack {
  readonly channels: StereoBlock;
  readonly frames: number;
}

export type MaskingAudioInputs = ReadonlyMap<TrackId, MaskingAudioTrack>;

export interface MaskingSourceMeasurement {
  readonly id: string;
  readonly trackId: TrackId;
  readonly kind: MaskingSourceKind;
  readonly returnId: ReturnBusId | null;
  readonly priority: number;
  /** Per band, per cell: mean-square band level in dBFS, −Infinity when silent. */
  readonly bandDb: readonly Float32Array[];
  /** Per band, per cell: fraction of the source's total energy in that band. */
  readonly bandShare: readonly Float32Array[];
}

export interface MaskingMeasurement {
  readonly sampleRate: number;
  readonly cellSeconds: number;
  readonly cellCount: number;
  readonly frames: number;
  readonly sources: readonly MaskingSourceMeasurement[];
}

export interface MaskingMeasureOptions extends MixEngineOptions {
  /** Extra silence analysed after the last input so wet tails are included. Defaults to the engine's tail. */
  readonly tailSeconds?: number;
}

export interface MaskingDetectionConfig {
  /** Band energy below this is treated as silence. Provisional, configurable. */
  readonly energyFloorDb: number;
  /** A band must carry at least this fraction of a source's energy to be salient. */
  readonly minBandShare: number;
  /** The yielding source must be no more than this many dB below the protected source. */
  readonly maskingWindowDb: number;
  /** Conflict cells / shorter active run at or above this are persistent. */
  readonly persistentRatio: number;
  readonly persistentMinCells: number;
  readonly intermittentMinCells: number;
}

export const DEFAULT_MASKING_DETECTION: MaskingDetectionConfig = {
  energyFloorDb: -60,
  minBandShare: 0.05,
  maskingWindowDb: 12,
  persistentRatio: 0.6,
  persistentMinCells: 3,
  intermittentMinCells: 2,
};

export type MaskingPersistence = "persistent" | "intermittent";

export interface MaskingInterval {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly cells: number;
}

export interface MaskingConflict {
  readonly id: string;
  readonly band: BandDef;
  readonly protectedSource: MaskingSourceMeasurement;
  readonly yieldingSource: MaskingSourceMeasurement;
  readonly persistence: MaskingPersistence;
  readonly intervals: readonly MaskingInterval[];
  readonly conflictCells: number;
  readonly protectedActiveCells: number;
  readonly yieldingActiveCells: number;
  readonly overlapRatio: number;
  readonly protectedMeanDb: number;
  readonly yieldingMeanDb: number;
  /** Yielding minus protected, dB. Positive means the lower-priority source is louder. */
  readonly excessDb: number;
  readonly priorityDifference: number;
}

export interface MaskingCutLedger {
  readonly totalEqCutDb: number;
  readonly eqBands: ReadonlyMap<BandId, number>;
  readonly sends: ReadonlyMap<ReturnBusId, number>;
}

interface MutableMaskingCutLedger {
  totalEqCutDb: number;
  eqBands: Map<BandId, number>;
  sends: Map<ReturnBusId, number>;
}

export interface MaskingResolutionConfig {
  readonly detection: MaskingDetectionConfig;
  /** Desired extra separation after a cut, dB. Provisional. */
  readonly targetSeparationDb: number;
  readonly maxCutPerConflictDb: number;
  readonly minCutDb: number;
  /** Cumulative masking-applied EQ reduction per track, dB. Provisional safety limit. */
  readonly cumulativeCutLimitDb: number;
  readonly maxSendCutDb: number;
  /** Remaining excess required before compressor escalation, dB. */
  readonly escalationThresholdDb: number;
  readonly maxCompThresholdShiftDb: number;
}

export const DEFAULT_MASKING_RESOLUTION: MaskingResolutionConfig = {
  detection: DEFAULT_MASKING_DETECTION,
  targetSeparationDb: 3,
  maxCutPerConflictDb: 3,
  minCutDb: 0.25,
  cumulativeCutLimitDb: 6,
  maxSendCutDb: 6,
  escalationThresholdDb: 1.5,
  maxCompThresholdShiftDb: 6,
};

export type MaskingActionKind = "static-eq" | "dynamic-eq" | "send" | "compressor" | "skipped";

export interface MaskingAction {
  readonly kind: MaskingActionKind;
  readonly conflictId: string;
  readonly trackId: TrackId;
  readonly bandId: BandId | null;
  readonly returnId: ReturnBusId | null;
  readonly cutDb: number;
  readonly reason: string;
}

export interface MaskingResolution {
  readonly project: Project;
  readonly dynamicBands: ReadonlyMap<TrackId, readonly MaskingDynamicBand[]>;
  readonly actions: readonly MaskingAction[];
  readonly ledger: ReadonlyMap<TrackId, MaskingCutLedger>;
  readonly sidechainVerdict: SidechainVerdict;
}

export interface MaskingAudioResolution extends MaskingResolution {
  readonly measurement: MaskingMeasurement;
  readonly conflicts: readonly MaskingConflict[];
  readonly postEqConflicts: readonly MaskingConflict[];
  readonly finalConflicts: readonly MaskingConflict[];
}

function zeroPair(frames: number): [Float32Array, Float32Array] {
  return [new Float32Array(frames), new Float32Array(frames)];
}

function midOf(buffer: StereoBlock, out: Float32Array, frames: number): void {
  const left = buffer[0];
  const right = buffer[1];
  for (let i = 0; i < frames; i++) out[i] = (left[i] + right[i]) * 0.5;
}

function bandDbOf(analyser: SpectralAnalyser): { bandDb: Float32Array[]; bandShare: Float32Array[] } {
  const bandDb = BANDS.map(() => new Float32Array(analyser.cellCount));
  const bandShare = BANDS.map(() => new Float32Array(analyser.cellCount));
  for (let cell = 0; cell < analyser.cellCount; cell++) {
    const frames = analyser.framesInCell[cell];
    let total = 0;
    const powers: number[] = [];
    for (let b = 0; b < BANDS.length; b++) {
      const power = frames > 0 ? analyser.bandPower[b][cell] / frames : 0;
      powers.push(power);
      total += power;
    }
    for (let b = 0; b < BANDS.length; b++) {
      bandDb[b][cell] = powers[b] > 0 ? 10 * Math.log10(powers[b]) : -Infinity;
      bandShare[b][cell] = total > 0 ? powers[b] / total : 0;
    }
  }
  return { bandDb, bandShare };
}

/**
 * Measure dry track outputs and per-send wet contributions on the Task 5.2 grid.
 * The dry tap is post-fader; a wet source is the sending track's post-fader signal
 * times the send gain, passed through the same ReturnChain settings in isolation.
 */
export function measureMaskingSources(
  project: Project,
  inputs: MaskingAudioInputs,
  options: MaskingMeasureOptions = {},
): MaskingMeasurement {
  const sampleRate = options.sampleRate ?? DSP_SAMPLE_RATE;
  const maxFrames = options.maxFramesPerBlock ?? 4096;
  const engine = new MixEngine(project, { ...options, sampleRate, maxFramesPerBlock: maxFrames });
  const audibility = computeAudibility(project);
  const dspOptions: DspOptions = { channels: 2, sampleRate };

  let inputFrames = 0;
  for (const input of inputs.values()) inputFrames = Math.max(inputFrames, input.frames);
  const tailSeconds = options.tailSeconds ?? engine.tailSeconds;
  const tailFrames = Math.max(0, Math.ceil(tailSeconds * sampleRate));
  const totalFrames = inputFrames + tailFrames;
  const cellFrames = cellFramesFor(sampleRate);
  const cellCount = Math.ceil(totalFrames / cellFrames);

  interface SourceRunner {
    readonly source: Omit<MaskingSourceMeasurement, "bandDb" | "bandShare">;
    readonly analyser: SpectralAnalyser;
    readonly trackId: TrackId;
    readonly returnId: ReturnBusId | null;
    readonly sendGain: number;
    readonly wetChain: ReturnChain | null;
  }

  const runners: SourceRunner[] = [];
  for (const track of project.tracks) {
    runners.push({
      source: { id: track.id, trackId: track.id, kind: "dry", returnId: null, priority: track.priority },
      analyser: new SpectralAnalyser(sampleRate, cellFrames, cellCount),
      trackId: track.id,
      returnId: null,
      sendGain: 0,
      wetChain: null,
    });
    for (const send of track.channel.sends) {
      if (send.to === null || send.level <= -60) continue;
      const ret = project.returns.find((candidate) => candidate.id === send.to);
      if (!ret || !audibility.sendPasses(track.id, ret.id)) continue;
      runners.push({
        source: {
          id: `${track.id}>${ret.id}`,
          trackId: track.id,
          kind: "wet",
          returnId: ret.id,
          priority: track.priority,
        },
        analyser: new SpectralAnalyser(sampleRate, cellFrames, cellCount),
        trackId: track.id,
        returnId: ret.id,
        sendGain: 10 ** (send.level / 20),
        wetChain: new ReturnChain(ret, dspOptions),
      });
    }
  }

  const inputBlocks = new Map<TrackId, StereoBlock>();
  const trackTaps = new Map<TrackId, StereoBlock>();
  for (const track of project.tracks) {
    inputBlocks.set(track.id, zeroPair(maxFrames));
    trackTaps.set(track.id, zeroPair(maxFrames));
  }
  const master = zeroPair(maxFrames);
  const sendScratch = zeroPair(maxFrames);
  const mid = new Float32Array(maxFrames);

  for (let offset = 0; offset < totalFrames; offset += maxFrames) {
    const blockFrames = Math.min(maxFrames, totalFrames - offset);
    for (const track of project.tracks) {
      const input = inputs.get(track.id);
      const block = inputBlocks.get(track.id) as StereoBlock;
      if (!input || offset >= input.frames) {
        block[0].fill(0, 0, blockFrames);
        block[1].fill(0, 0, blockFrames);
        continue;
      }
      const count = Math.min(blockFrames, input.frames - offset);
      for (let c = 0; c < 2; c++) {
        block[c].set(input.channels[c].subarray(offset, offset + count), 0);
        if (count < blockFrames) block[c].fill(0, count, blockFrames);
      }
    }

    engine.process(inputBlocks, master, blockFrames, { tracks: trackTaps });

    for (const runner of runners) {
      const tap = trackTaps.get(runner.trackId) as StereoBlock;
      if (runner.source.kind === "dry") {
        if (audibility.outputPasses(runner.trackId)) midOf(tap, mid, blockFrames);
        else mid.fill(0, 0, blockFrames);
      } else {
        const chain = runner.wetChain as ReturnChain;
        for (let c = 0; c < 2; c++) {
          const from = tap[c];
          const to = sendScratch[c];
          for (let i = 0; i < blockFrames; i++) to[i] = from[i] * runner.sendGain;
        }
        chain.process(sendScratch, blockFrames);
        midOf(sendScratch, mid, blockFrames);
      }
      runner.analyser.push(mid, blockFrames);
    }
  }

  const sources: MaskingSourceMeasurement[] = [];
  for (const runner of runners) {
    runner.analyser.finish();
    const { bandDb, bandShare } = bandDbOf(runner.analyser);
    sources.push({ ...runner.source, bandDb, bandShare });
  }

  return { sampleRate, cellSeconds: CELL_SECONDS, cellCount, frames: totalFrames, sources };
}

function isActive(source: MaskingSourceMeasurement, band: number, cell: number, config: MaskingDetectionConfig): boolean {
  return source.bandDb[band][cell] > config.energyFloorDb && source.bandShare[band][cell] >= config.minBandShare;
}

function intervalsOf(cells: readonly number[], cellSeconds: number): MaskingInterval[] {
  const out: MaskingInterval[] = [];
  let start = -1;
  let previous = -1;
  for (const cell of cells) {
    if (start < 0) {
      start = cell;
      previous = cell;
      continue;
    }
    if (cell === previous + 1) {
      previous = cell;
      continue;
    }
    out.push({ startSeconds: start * cellSeconds, endSeconds: (previous + 1) * cellSeconds, cells: previous - start + 1 });
    start = cell;
    previous = cell;
  }
  if (start >= 0) out.push({ startSeconds: start * cellSeconds, endSeconds: (previous + 1) * cellSeconds, cells: previous - start + 1 });
  return out;
}

function meanDb(source: MaskingSourceMeasurement, band: number, cells: readonly number[]): number {
  if (cells.length === 0) return -Infinity;
  let power = 0;
  for (const cell of cells) {
    const db = source.bandDb[band][cell];
    if (Number.isFinite(db)) power += 10 ** (db / 10);
  }
  return power > 0 ? 10 * Math.log10(power / cells.length) : -Infinity;
}

/** Detect meaningful frequency-and-time conflicts; ordinary spectral overlap alone is not enough. */
export function detectMaskingConflicts(
  measurement: MaskingMeasurement,
  config: MaskingDetectionConfig = DEFAULT_MASKING_DETECTION,
): MaskingConflict[] {
  const conflicts: MaskingConflict[] = [];
  const sources = measurement.sources;
  for (let a = 0; a < sources.length; a++) {
    for (let b = a + 1; b < sources.length; b++) {
      const first = sources[a];
      const second = sources[b];
      if (first.trackId === second.trackId) continue;
      const protectedSource = first.priority >= second.priority ? first : second;
      const yieldingSource = protectedSource === first ? second : first;
      if (protectedSource.priority === yieldingSource.priority) continue;

      for (let band = 0; band < BANDS.length; band++) {
        const conflictCells: number[] = [];
        let protectedActive = 0;
        let yieldingActive = 0;
        for (let cell = 0; cell < measurement.cellCount; cell++) {
          const pActive = isActive(protectedSource, band, cell, config);
          const yActive = isActive(yieldingSource, band, cell, config);
          if (pActive) protectedActive++;
          if (yActive) yieldingActive++;
          if (!pActive || !yActive) continue;
          const pDb = protectedSource.bandDb[band][cell];
          const yDb = yieldingSource.bandDb[band][cell];
          if (yDb >= pDb - config.maskingWindowDb) conflictCells.push(cell);
        }
        if (conflictCells.length < config.intermittentMinCells) continue;
        const longerActive = Math.max(protectedActive, yieldingActive);
        const overlapRatio = longerActive > 0 ? conflictCells.length / longerActive : 0;
        const persistence: MaskingPersistence =
          overlapRatio >= config.persistentRatio && conflictCells.length >= config.persistentMinCells
            ? "persistent"
            : "intermittent";
        const protectedMeanDb = meanDb(protectedSource, band, conflictCells);
        const yieldingMeanDb = meanDb(yieldingSource, band, conflictCells);
        conflicts.push({
          id: `${protectedSource.id}|${yieldingSource.id}|${BANDS[band].id}`,
          band: BANDS[band],
          protectedSource,
          yieldingSource,
          persistence,
          intervals: intervalsOf(conflictCells, measurement.cellSeconds),
          conflictCells: conflictCells.length,
          protectedActiveCells: protectedActive,
          yieldingActiveCells: yieldingActive,
          overlapRatio,
          protectedMeanDb,
          yieldingMeanDb,
          excessDb: yieldingMeanDb - protectedMeanDb,
          priorityDifference: protectedSource.priority - yieldingSource.priority,
        });
      }
    }
  }
  return conflicts.sort((left, right) => {
    if (right.protectedSource.priority !== left.protectedSource.priority) return right.protectedSource.priority - left.protectedSource.priority;
    if (left.yieldingSource.priority !== right.yieldingSource.priority) return left.yieldingSource.priority - right.yieldingSource.priority;
    if (left.band.lowHz !== right.band.lowHz) return left.band.lowHz - right.band.lowHz;
    return left.id.localeCompare(right.id);
  });
}

function emptyLedger(): MutableMaskingCutLedger {
  return { totalEqCutDb: 0, eqBands: new Map(), sends: new Map() };
}

function cloneLedger(ledger: ReadonlyMap<TrackId, MaskingCutLedger>): Map<TrackId, MutableMaskingCutLedger> {
  const out = new Map<TrackId, MutableMaskingCutLedger>();
  for (const [trackId, entry] of ledger) {
    out.set(trackId, { totalEqCutDb: entry.totalEqCutDb, eqBands: new Map(entry.eqBands), sends: new Map(entry.sends) });
  }
  return out;
}

function cloneParam(param: ChainParam): ChainParam {
  return { spec: param.spec, value: param.value, original: param.original, mode: param.mode };
}

function cloneEqBand(band: EqBandState): EqBandState {
  return {
    band: band.band,
    freq: cloneParam(band.freq),
    gain: cloneParam(band.gain),
    q: band.q === null ? null : cloneParam(band.q),
    dynamicDepthDb: band.dynamicDepthDb,
  };
}

function cloneTrack(track: Track): Track {
  return {
    ...track,
    channel: { ...track.channel, sends: track.channel.sends.map((send) => ({ ...send })) },
    chain: {
      ...track.chain,
      eq: { ...track.chain.eq, bands: track.chain.eq.bands.map(cloneEqBand) },
      comp: {
        ...track.chain.comp,
        character: { ...track.chain.comp.character },
        threshold: cloneParam(track.chain.comp.threshold),
        ratio: cloneParam(track.chain.comp.ratio),
        attack: cloneParam(track.chain.comp.attack),
        release: cloneParam(track.chain.comp.release),
        makeup: cloneParam(track.chain.comp.makeup),
      },
    },
  };
}

function cloneProject(project: Project): Project {
  return { ...project, tracks: project.tracks.map(cloneTrack), sidechains: [...(project.sidechains ?? [])] };
}

function preferredBandId(band: BandDef): BandId {
  const centre = Math.sqrt(band.lowHz * band.highHz);
  if (centre < 250) return "lf";
  if (centre < 1200) return "lmf";
  if (centre < 6000) return "hmf";
  return "hf";
}

function bandCentre(band: BandDef): number {
  return Math.sqrt(band.lowHz * band.highHz);
}

function selectEqBand(eq: EqState, band: BandDef): EqBandState | null {
  const preferred = preferredBandId(band);
  const centre = bandCentre(band);
  const ordered = [...eq.bands].sort((left, right) => {
    const leftPreferred = left.band.id === preferred ? 0 : 1;
    const rightPreferred = right.band.id === preferred ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    return Math.abs(left.freq.value - centre) - Math.abs(right.freq.value - centre);
  });
  return ordered.find((candidate) => {
    if (candidate.gain.mode !== "auto") return false;
    // A Manual frequency is protected: only use it when it already sits in the region.
    if (candidate.freq.mode === "manual") {
      return candidate.freq.value >= band.lowHz && candidate.freq.value <= band.highHz;
    }
    return true;
  }) ?? null;
}

/** Retune only Auto frequency/Q toward the detected region; Manual values are left alone. */
function tuneEqBand(eqBand: EqBandState, band: BandDef): void {
  if (eqBand.freq.mode === "auto") {
    eqBand.freq.value = requireInRange(bandCentre(band), EQ_FREQUENCY_HZ, "masking EQ frequency");
  }
  if (eqBand.q !== null && eqBand.q.mode === "auto") {
    const width = Math.max(1, band.highHz - band.lowHz);
    eqBand.q.value = requireInRange(bandCentre(band) / width, EQ_Q, "masking EQ Q");
  }
}

function desiredCutDb(conflict: MaskingConflict, config: MaskingResolutionConfig): number {
  const desired = conflict.excessDb + config.targetSeparationDb;
  return Math.min(config.maxCutPerConflictDb, Math.max(0, desired));
}

function addSidechain(edges: SidechainEdge[], edge: SidechainEdge): boolean {
  if (edges.some((existing) => existing.destination === edge.destination && existing.processor === edge.processor)) return false;
  edges.push(edge);
  return true;
}

function ledgerOf(ledger: Map<TrackId, MutableMaskingCutLedger>, trackId: TrackId): MutableMaskingCutLedger {
  let entry = ledger.get(trackId);
  if (!entry) {
    entry = emptyLedger();
    ledger.set(trackId, entry);
  }
  return entry;
}

/** Apply priority-ordered, Auto-only masking moves. Manual parameters are never written. */
export function resolveMaskingConflicts(
  project: Project,
  conflicts: readonly MaskingConflict[],
  config: MaskingResolutionConfig = DEFAULT_MASKING_RESOLUTION,
  previousLedger: ReadonlyMap<TrackId, MaskingCutLedger> = new Map(),
): MaskingResolution {
  const next = cloneProject(project);
  const edges: SidechainEdge[] = [...(next.sidechains ?? [])];
  const dynamicBands = new Map<TrackId, MaskingDynamicBand[]>();
  const ledger = cloneLedger(previousLedger);
  const actions: MaskingAction[] = [];
  const tracks = new Map(next.tracks.map((track) => [track.id, track]));

  const ordered = [...conflicts].sort((left, right) => {
    if (right.protectedSource.priority !== left.protectedSource.priority) return right.protectedSource.priority - left.protectedSource.priority;
    if (left.yieldingSource.priority !== right.yieldingSource.priority) return left.yieldingSource.priority - right.yieldingSource.priority;
    if (left.band.lowHz !== right.band.lowHz) return left.band.lowHz - right.band.lowHz;
    return left.id.localeCompare(right.id);
  });

  for (const conflict of ordered) {
    const track = tracks.get(conflict.yieldingSource.trackId);
    if (!track) continue;
    const entry = ledgerOf(ledger, track.id);
    const requested = desiredCutDb(conflict, config);

    if (conflict.yieldingSource.kind === "wet" && conflict.yieldingSource.returnId !== null) {
      const send = track.channel.sends.find((candidate) => candidate.to === conflict.yieldingSource.returnId);
      if (!send) continue;
      if (send.mode !== "auto") {
        actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: null, returnId: send.to, cutDb: 0, reason: "send is Manual" });
        continue;
      }
      const already = entry.sends.get(send.to as ReturnBusId) ?? 0;
      const available = Math.max(0, config.maxSendCutDb - already);
      // An intermittent wet tail has no Return dynamics to key; scale the send move by
      // the measured duty cycle instead of applying the full persistent cut.
      const duty = conflict.persistence === "persistent" ? 1 : Math.max(0, Math.min(1, conflict.overlapRatio));
      const cut = Math.min(requested * duty, available, Math.max(0, send.level - -60));
      if (cut < config.minCutDb) {
        actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: null, returnId: send.to, cutDb: 0, reason: "send cut budget exhausted or too small" });
        continue;
      }
      send.level -= cut;
      entry.sends.set(send.to as ReturnBusId, already + cut);
      actions.push({ kind: "send", conflictId: conflict.id, trackId: track.id, bandId: null, returnId: send.to, cutDb: cut, reason: `${conflict.persistence} wet conflict; lower-priority send yields` });
      continue;
    }

    const eqBand = selectEqBand(track.chain.eq, conflict.band);
    if (!eqBand || track.chain.eq.bypassed) {
      actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: null, returnId: null, cutDb: 0, reason: "no Auto EQ band available" });
      continue;
    }
    const alreadyEq = entry.eqBands.get(eqBand.band.id) ?? 0;
    const available = Math.max(0, config.cumulativeCutLimitDb - entry.totalEqCutDb);
    const bandAvailable = Math.max(0, config.cumulativeCutLimitDb - alreadyEq);
    const gainAvailable = Math.max(0, eqBand.gain.value - EQ_GAIN_DB.min);
    const cut = Math.min(requested, available, bandAvailable, gainAvailable);

    if (conflict.persistence === "persistent") {
      if (cut < config.minCutDb) {
        actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: eqBand.band.id, returnId: null, cutDb: 0, reason: "cumulative EQ cut safety or too small" });
        continue;
      }
      tuneEqBand(eqBand, conflict.band);
      eqBand.gain.value = requireInRange(eqBand.gain.value - cut, EQ_GAIN_DB, "masking EQ gain");
      entry.totalEqCutDb += cut;
      entry.eqBands.set(eqBand.band.id, alreadyEq + cut);
      actions.push({ kind: "static-eq", conflictId: conflict.id, trackId: track.id, bandId: eqBand.band.id, returnId: null, cutDb: cut, reason: "persistent conflict; proportional static EQ cut on lower-priority track" });
      continue;
    }

    const depth = Math.min(requested, available, bandAvailable, EQ_GAIN_DB.max);
    if (depth < config.minCutDb) {
      actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: eqBand.band.id, returnId: null, cutDb: 0, reason: "cumulative EQ cut safety or too small" });
      continue;
    }
    tuneEqBand(eqBand, conflict.band);
    // A configured depth belongs to the project, not to masking: never resize it.
    // This path can only add the external key, so the attenuation it can actually
    // deliver is the configured depth (or the new overlay when the band had none).
    // Report/ledger that *effective* depth, not the requested one — otherwise a
    // 1 dB configured band would be credited with a 3 dB request it cannot apply.
    // If more attenuation is still required, only re-measurement + compressor
    // escalation remains (persistent conflicts can also use static EQ).
    const configuredDepthDb = eqBand.dynamicDepthDb;
    const effectiveDepthDb = configuredDepthDb ?? depth;
    // A configured depth is project-owned: do not resize it, and do not key it if
    // doing so would apply less than the minimum useful cut or exceed the remaining
    // masking cut budget. The depth itself is left untouched either way.
    if (configuredDepthDb !== null && (configuredDepthDb < config.minCutDb || configuredDepthDb > Math.min(available, bandAvailable))) {
      actions.push({ kind: "skipped", conflictId: conflict.id, trackId: track.id, bandId: eqBand.band.id, returnId: null, cutDb: 0, reason: `configured Dynamic EQ depth ${configuredDepthDb.toFixed(2)} dB is outside the remaining masking cut budget; depth preserved` });
      continue;
    }
    if (configuredDepthDb === null) {
      const list = dynamicBands.get(track.id) ?? [];
      list.push({ bandId: eqBand.band.id, depthDb: depth });
      dynamicBands.set(track.id, list);
    }
    const keyed = addSidechain(edges, {
      source: conflict.protectedSource.trackId,
      destination: track.id,
      processor: "dynamic-eq",
    });
    entry.totalEqCutDb += effectiveDepthDb;
    entry.eqBands.set(eqBand.band.id, alreadyEq + effectiveDepthDb);
    actions.push({
      kind: "dynamic-eq",
      conflictId: conflict.id,
      trackId: track.id,
      bandId: eqBand.band.id,
      returnId: null,
      cutDb: effectiveDepthDb,
      reason: configuredDepthDb === null
        ? (keyed ? "intermittent conflict; external-key Dynamic EQ dip" : "intermittent conflict; existing Dynamic EQ key preserved")
        : `intermittent conflict; external key uses configured ${effectiveDepthDb.toFixed(2)} dB depth (requested ${depth.toFixed(2)} dB; depth preserved)`,
    });
  }

  const resolved: Project = { ...next, sidechains: edges };
  return { project: resolved, dynamicBands, actions, ledger, sidechainVerdict: validateSidechains(resolved) };
}

function hasSidechain(project: Project, destination: TrackId, processor: SidechainEdge["processor"]): boolean {
  return (project.sidechains ?? []).some((edge) => edge.destination === destination && edge.processor === processor);
}

/** Re-measure after EQ, then escalate to external-key compression only for remaining meaningful conflict. */
export function resolveMaskingAudio(
  project: Project,
  inputs: MaskingAudioInputs,
  config: MaskingResolutionConfig = DEFAULT_MASKING_RESOLUTION,
  options: MaskingMeasureOptions = {},
  previousLedger: ReadonlyMap<TrackId, MaskingCutLedger> = new Map(),
): MaskingAudioResolution {
  const measurement = measureMaskingSources(project, inputs, options);
  const conflicts = detectMaskingConflicts(measurement, config.detection);
  const resolution = resolveMaskingConflicts(project, conflicts, config, previousLedger);
  const postMeasurement = measureMaskingSources(resolution.project, inputs, {
    ...options,
    maskingDynamicBands: resolution.dynamicBands,
  });
  const postEqConflicts = detectMaskingConflicts(postMeasurement, config.detection);

  const escalated = cloneProject(resolution.project);
  const edges: SidechainEdge[] = [...(escalated.sidechains ?? [])];
  const actions: MaskingAction[] = [...resolution.actions];
  const tracks = new Map(escalated.tracks.map((track) => [track.id, track]));
  const eqActions = new Set(resolution.actions.filter((action) => action.kind === "static-eq" || action.kind === "dynamic-eq").map((action) => action.conflictId));

  for (const conflict of postEqConflicts) {
    if (!eqActions.has(conflict.id)) continue;
    if (conflict.excessDb + config.targetSeparationDb < config.escalationThresholdDb) continue;
    const track = tracks.get(conflict.yieldingSource.trackId);
    if (!track || track.chain.comp.bypassed) continue;
    if (hasSidechain(escalated, track.id, "compressor")) continue;
    const shift = Math.min(config.maxCompThresholdShiftDb, Math.max(0, conflict.excessDb + config.targetSeparationDb));
    if (track.chain.comp.threshold.mode === "auto") {
      track.chain.comp.threshold.value = requireInRange(track.chain.comp.threshold.value - shift, { min: -40, max: 0 }, "masking compressor threshold");
    }
    if (track.chain.comp.ratio.mode === "auto") {
      track.chain.comp.ratio.value = Math.max(track.chain.comp.ratio.value, 2);
    }
    addSidechain(edges, { source: conflict.protectedSource.trackId, destination: track.id, processor: "compressor" });
    actions.push({ kind: "compressor", conflictId: conflict.id, trackId: track.id, bandId: null, returnId: null, cutDb: shift, reason: "meaningful conflict remains after EQ re-measurement; external-key compression" });
  }
  const finalProject: Project = { ...escalated, sidechains: edges };

  const finalMeasurement = measureMaskingSources(finalProject, inputs, { ...options, maskingDynamicBands: resolution.dynamicBands });
  const finalConflicts = detectMaskingConflicts(finalMeasurement, config.detection);

  return {
    project: finalProject,
    dynamicBands: resolution.dynamicBands,
    actions,
    ledger: resolution.ledger,
    sidechainVerdict: validateSidechains(finalProject),
    measurement,
    conflicts,
    postEqConflicts,
    finalConflicts,
  };
}

/** Exported for guards/tests: the EQ band ids this layer may choose among. */
export const MASKING_EQ_BAND_IDS: readonly BandId[] = EQ_BANDS.map((band) => band.id);
/** Exported for guards/tests: Q range reused from the approved EQ. */
export const MASKING_Q_RANGE = EQ_Q;
/** Exported for guards/tests: ownership modes this layer respects. */
export const MASKING_MODES: readonly Mode[] = ["auto", "manual"];
