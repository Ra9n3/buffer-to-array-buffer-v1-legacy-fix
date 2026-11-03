/**
 * ALLOY — the channel chains, built from the project model (Task 7.1).
 *
 * The plan's §8 chain, in the order `PROCESSING_CHAIN_STEPS` engraves it, and the
 * §8a Return path, wired to the approved Task 6.1–6.3 modules:
 *
 *   TRACK:   trim → expander (when `cleanup`) → static EQ → dynamic EQ →
 *            compressor → pan → fader
 *   BUS:     trim → EQ → compressor → balance → fader
 *   RETURN:  effect (wet only) → level
 *   MASTER:  the safety limiter (see `mix-engine.ts`)
 *
 * Every module underneath is one of the approved ones and keeps its own state
 * across blocks; nothing here allocates while processing, and nothing adds gain the
 * model does not hold.
 *
 * TWO MAPPINGS deserve to be stated, because the model and the modules do not line
 * up by name (owner, 2026-11-03):
 *
 *   - the **dynamic bands carry no static gain**. Plan §8 makes the static multiband
 *     EQ block 3 and the dynamic EQ block 4, so a band that is both static and
 *     dynamic gets its gain from block 3 and its *time-varying reduction* from
 *     block 4 — feeding the same gain to both modules would apply it twice. The
 *     dynamic module's bands therefore use gain 0 and only pull down;
 *   - the Return's `second` control is **pre-delay in ms for a reverb** and
 *     **feedback in per cent for a delay** (plan §8a lists both), and the two
 *     approved modules take exactly those.
 */

import { Compressor, type CompressorCharacterId } from "../dsp/compressor";
import { Delay } from "../dsp/delay";
import { DynamicEq } from "../dsp/dynamic-eq";
import { Eq } from "../dsp/eq";
import { Expander } from "../dsp/expander";
import { Reverb, type ReverbCharacterId } from "../dsp/reverb";
import type { DspOptions } from "../dsp/params";
import type { CharacterId, CompState, EqState } from "../mixer-chain";
import type { ReturnChainState } from "../return-chain";
import type { Bus, ReturnBus, Track } from "../project/model";
import { CLEANUP_EXPANDER, DYNAMIC_BAND_GATE } from "./constants";
import { balanceGains, panGains, type PanGains } from "./pan";

const CHANNELS = 2;
const SEND_FLOOR_DB = -60;

/** A dB value as a linear gain. */
export function dbToGain(db: number): number {
  return Number.isFinite(db) ? 10 ** (db / 20) : 0;
}

/** A send or fader level: the range's bottom means OFF, everything else is its dB. */
export function levelGain(db: number): number {
  return !Number.isFinite(db) || db <= SEND_FLOOR_DB ? 0 : dbToGain(db);
}

/** The static EQ's bands, straight from the model. */
function eqBands(eq: EqState) {
  return eq.bands.map((band) => ({
    kind: band.band.kind,
    freq: band.freq.value,
    gain: band.gain.value,
    q: band.q === null ? undefined : band.q.value,
  }));
}

/** The dynamic bands: every band that carries a depth, with gain 0 (see the header). */
function dynamicBands(eq: EqState) {
  return eq.bands
    .filter((band) => band.dynamicDepthDb !== null)
    .map((band) => ({
      kind: band.band.kind,
      freq: band.freq.value,
      gain: 0,
      q: band.q === null ? undefined : band.q.value,
      depthDb: band.dynamicDepthDb as number,
      thresholdDb: DYNAMIC_BAND_GATE.thresholdDb,
      attackMs: DYNAMIC_BAND_GATE.attackMs,
      releaseMs: DYNAMIC_BAND_GATE.releaseMs,
    }));
}

/**
 * The model's compressor character names and the module's differ in one place:
 * the model prints "varimu" (Task 2.8's fixture id), the approved module's id is
 * "vari-mu" (Task 6.2). Mapped explicitly, so a renamed id is a named error rather
 * than a silently different character.
 */
export function compressorCharacterId(id: CharacterId): CompressorCharacterId {
  switch (id) {
    case "vca":
      return "vca";
    case "opto":
      return "opto";
    case "fet":
      return "fet";
    case "varimu":
      return "vari-mu";
    default:
      throw new Error(`Alloy Mix Engine: the compressor character is one of vca, opto, fet, varimu, not ${String(id)}`);
  }
}

/**
 * A reverb Return's character must be one of the module's three; the model's
 * `ReturnCharacterId` also covers the delay's labels (tape / analog / digital), which
 * the reverb module does not take — and which Task 6.3 explicitly keeps as fixture
 * text, not processing.
 */
export function reverbCharacterId(id: string): ReverbCharacterId {
  if (id === "room" || id === "hall" || id === "plate") return id;
  throw new Error(`Alloy Mix Engine: a reverb Return's character is room, hall or plate, not ${String(id)}`);
}

function compressorOf(comp: CompState, options: DspOptions): Compressor {
  return new Compressor(
    {
      character: compressorCharacterId(comp.character.value),
      thresholdDb: comp.threshold.value,
      ratio: comp.ratio.value,
      attackMs: comp.attack.value,
      releaseMs: comp.release.value,
      makeupDb: comp.makeup.value,
      bypassed: comp.bypassed,
    },
    options,
  );
}

/**
 * One track's chain — the plan's eight blocks, less the last (sends and routing),
 * which is the engine's work because it touches other channels.
 */
export class TrackChain {
  readonly trimGain: number;
  readonly faderGain: number;
  readonly pan: PanGains;
  readonly hasExpander: boolean;
  readonly hasDynamicEq: boolean;

  private readonly expander: Expander | null;
  private readonly eq: Eq;
  private readonly dynamicEq: DynamicEq | null;
  private readonly compressor: Compressor;

  constructor(track: Track, options: DspOptions) {
    const channel = track.channel;
    this.trimGain = dbToGain(channel.trim);
    this.faderGain = levelGain(channel.level);
    this.pan = panGains(channel.pan);

    this.expander = track.chain.cleanup
      ? new Expander(
          {
            thresholdDb: CLEANUP_EXPANDER.thresholdDb,
            ratio: CLEANUP_EXPANDER.ratio,
            rangeDb: CLEANUP_EXPANDER.rangeDb,
            attackMs: CLEANUP_EXPANDER.attackMs,
            releaseMs: CLEANUP_EXPANDER.releaseMs,
          },
          options,
        )
      : null;
    this.hasExpander = this.expander !== null;

    this.eq = new Eq({ bypassed: track.chain.eq.bypassed, bands: eqBands(track.chain.eq) }, options);

    const dynamic = dynamicBands(track.chain.eq);
    this.dynamicEq = dynamic.length > 0 ? new DynamicEq({ bands: dynamic }, options) : null;
    this.hasDynamicEq = this.dynamicEq !== null;

    this.compressor = compressorOf(track.chain.comp, options);
  }

  /**
   * Block 1–7 of the plan's chain, in order, in place. Pan and fader are the last
   * two: after them the signal belongs to the summing stage.
   */
  process(buffer: readonly Float32Array[], frames: number): void {
    const trim = this.trimGain;
    for (let c = 0; c < CHANNELS; c++) {
      const data = buffer[c];
      for (let i = 0; i < frames; i++) data[i] *= trim;
    }
    if (this.expander) this.expander.process(buffer, buffer, frames);
    this.eq.process(buffer, buffer, frames);
    if (this.dynamicEq) this.dynamicEq.process(buffer, buffer, frames);
    this.compressor.process(buffer, buffer, frames);

    const left = this.pan.left * this.faderGain;
    const right = this.pan.right * this.faderGain;
    const targetL = buffer[0];
    const targetR = buffer[1];
    for (let i = 0; i < frames; i++) {
      targetL[i] *= left;
      targetR[i] *= right;
    }
  }

  /** The compressor's last gain reduction, dB ≥ 0 — a readout for meters and tests. */
  get compressorReductionDb(): number {
    return this.compressor.gainReductionDb;
  }

  /** The expander's last gain reduction, dB ≥ 0 (0 when `cleanup` is off). */
  get expanderReductionDb(): number {
    return this.expander ? this.expander.gainReductionDb : 0;
  }

  reset(): void {
    if (this.expander) this.expander.reset();
    this.eq.reset();
    if (this.dynamicEq) this.dynamicEq.reset();
    this.compressor.reset();
  }
}

/** One bus's chain: the strip's trim → EQ → compressor → balance → fader. */
export class BusChain {
  readonly trimGain: number;
  readonly balance: PanGains;
  readonly faderGain: number;
  readonly hasDynamicEq = false;

  private readonly eq: Eq;
  private readonly compressor: Compressor;

  constructor(bus: Bus, options: DspOptions) {
    this.trimGain = dbToGain(bus.channel.trim);
    this.balance = balanceGains(bus.channel.balance);
    this.faderGain = levelGain(bus.channel.level);
    this.eq = new Eq({ bypassed: bus.chain.eq.bypassed, bands: eqBands(bus.chain.eq) }, options);
    this.compressor = compressorOf(bus.chain.comp, options);
  }

  /** The compressor's last gain reduction, dB ≥ 0 — a readout for meters and tests. */
  get compressorReductionDb(): number {
    return this.compressor.gainReductionDb;
  }

  /** No expander, no dynamic band and no sends: none of them is in the plan for a bus. */
  process(buffer: readonly Float32Array[], frames: number): void {
    const trim = this.trimGain;
    for (let c = 0; c < CHANNELS; c++) {
      const data = buffer[c];
      for (let i = 0; i < frames; i++) data[i] *= trim;
    }
    this.eq.process(buffer, buffer, frames);
    this.compressor.process(buffer, buffer, frames);
    const left = this.balance.left * this.faderGain;
    const right = this.balance.right * this.faderGain;
    const targetL = buffer[0];
    const targetR = buffer[1];
    for (let i = 0; i < frames; i++) {
      targetL[i] *= left;
      targetR[i] *= right;
    }
  }

  reset(): void {
    this.eq.reset();
    this.compressor.reset();
  }
}

/**
 * One Return's chain: the effect (wet only, Task 6.3) then the Return's own level.
 * A Return has no trim, no EQ, no compressor and no sends — plan §8a lists the
 * effect controls and the output level, and the console's Return rail agrees.
 */
export class ReturnChain {
  readonly kind: "reverb" | "delay";
  readonly levelGain: number;

  private readonly reverb: Reverb | null;
  private readonly delay: Delay | null;

  constructor(ret: ReturnBus, options: DspOptions) {
    const chain: ReturnChainState = ret.chain;
    this.levelGain = levelGain(ret.channel.level);
    this.kind = ret.effect;

    if (ret.effect === "reverb") {
      this.reverb = new Reverb(
        {
          character: reverbCharacterId(chain.character.value),
          decaySeconds: chain.time.value,
          preDelayMs: chain.second.value,
          tone: chain.tone.value,
          bypassed: chain.bypassed,
        },
        options,
      );
      this.delay = null;
    } else {
      this.delay = new Delay(
        {
          timeMs: chain.time.value,
          feedbackPercent: chain.second.value,
          tone: chain.tone.value,
          bypassed: chain.bypassed,
        },
        options,
      );
      this.reverb = null;
    }
  }

  process(buffer: readonly Float32Array[], frames: number): void {
    if (this.reverb) this.reverb.process(buffer, buffer, frames);
    else if (this.delay) this.delay.process(buffer, buffer, frames);
    const level = this.levelGain;
    for (let c = 0; c < CHANNELS; c++) {
      const data = buffer[c];
      for (let i = 0; i < frames; i++) data[i] *= level;
    }
  }

  /** The tail the effect may still produce after its input stops, seconds. */
  get tailSeconds(): number {
    return this.reverb ? this.reverb.tailSeconds : this.delay ? this.delay.tailSeconds : 0;
  }

  reset(): void {
    if (this.reverb) this.reverb.reset();
    if (this.delay) this.delay.reset();
  }
}
