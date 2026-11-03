// Task 7.1 — the project fixtures the engine suites build. Generated, never shipped: a
// minimal but structurally real `Project` (tracks, buses, Returns) whose chains use the
// SAME parameter specs the store uses, so the engine is exercised against production shapes.
import {
  COMP_ATTACK,
  COMP_MAKEUP,
  COMP_RATIO,
  COMP_RELEASE,
  COMP_THRESHOLD,
  EQ_BANDS,
  EQ_FREQ,
  EQ_GAIN,
  EQ_Q,
  chainParam,
} from "../src/lib/mixer-chain.ts";
import { RETURN_SPECS } from "../src/lib/return-chain.ts";

export const RATE = 48000;

const DEFAULT_BANDS = { lf: [100, 0], lmf: [500, 0], hmf: [3000, 0], hf: [10000, 0] };

function eqState(options = {}) {
  const bands = options.bands ?? DEFAULT_BANDS;
  return {
    bypassed: options.eqBypassed === true,
    bands: EQ_BANDS.map((band) => {
      const [freq, gain, q] = bands[band.id] ?? [1000, 0];
      return {
        band,
        freq: chainParam(EQ_FREQ, freq, undefined),
        gain: chainParam(EQ_GAIN, gain, undefined),
        q: band.kind === "bell" ? chainParam(EQ_Q, q ?? 1, undefined) : null,
        dynamicDepthDb: options.dynamic?.[band.id] ?? null,
      };
    }),
  };
}

function compState(options = {}) {
  const character = options.character ?? "vca";
  return {
    bypassed: options.compBypassed !== false,
    character: { value: character, original: character, mode: "auto" },
    threshold: chainParam(COMP_THRESHOLD, options.threshold ?? -20, undefined),
    ratio: chainParam(COMP_RATIO, options.ratio ?? 2, undefined),
    attack: chainParam(COMP_ATTACK, options.attack ?? 10, undefined),
    release: chainParam(COMP_RELEASE, options.release ?? 150, undefined),
    makeup: chainParam(COMP_MAKEUP, options.makeup ?? 0, undefined),
    gainReductionDb: 0,
  };
}

export function trackFixture(options) {
  const id = options.id;
  return {
    kind: "track",
    id,
    code: id.slice("track-".length),
    type: "TRK",
    name: options.name ?? id,
    org: "neutral",
    familyId: null,
    sourceTypeId: null,
    role: null,
    priority: 5,
    tierConfirmed: true,
    output: options.output ?? "master",
    channel: {
      trim: options.trim ?? 0,
      pan: options.pan ?? 0,
      level: options.level ?? 0,
      mute: options.mute === true,
      solo: options.solo === true,
      sends: (options.sends ?? []).map((send) => ({ to: send.to, level: send.level ?? 0, mode: "auto" })),
    },
    loadedSendLevels: {},
    chain: {
      cleanup: options.cleanup === true,
      eq: eqState(options),
      comp: compState(options),
      notes: [],
    },
    display: { peak: false },
    audio: null,
  };
}

export function busFixture(options) {
  const id = options.id;
  return {
    kind: "bus",
    id,
    code: id.slice("bus-".length),
    type: "BUS",
    name: options.name ?? id,
    org: "neutral",
    channel: {
      trim: options.trim ?? 0,
      balance: options.balance ?? 0,
      level: options.level ?? 0,
      mute: options.mute === true,
      solo: options.solo === true,
    },
    chain: {
      eq: eqState(options),
      comp: compState(options),
      peakProtection: { engaged: false, text: "" },
      notes: [],
    },
    output: options.output ?? "master",
    display: { peak: false },
  };
}

export function returnFixture(options) {
  const id = options.id;
  const effect = options.effect ?? "reverb";
  const character = options.character ?? (effect === "reverb" ? "plate" : "digital");
  const isReverb = effect === "reverb";
  return {
    kind: "return",
    id,
    code: id.slice("return-".length),
    type: "RET",
    name: options.name ?? id,
    short: (options.name ?? id).toUpperCase(),
    org: "neutral",
    effect,
    channel: { level: options.level ?? 0, mute: options.mute === true, solo: options.solo === true },
    chain: {
      effect,
      character: { value: character, original: character, mode: "auto" },
      time: chainParam(isReverb ? RETURN_SPECS.decay : RETURN_SPECS.time, options.time ?? (isReverb ? 2 : 500), undefined),
      second: chainParam(
        isReverb ? RETURN_SPECS.predelay : RETURN_SPECS.feedback,
        options.second ?? 0,
        undefined,
      ),
      tone: chainParam(RETURN_SPECS.tone, options.tone ?? 0, undefined),
      bypassed: options.bypassed === true,
      notes: [],
    },
    output: "master",
    display: { peak: false },
  };
}

export function projectFixture({ tracks = [], buses = [], returns = [] } = {}) {
  return {
    id: "engine-fixture",
    name: "Engine fixture",
    template: "session-fixture",
    tracks,
    returns,
    buses,
    arrangement: { barCount: 1, timeSignature: "4/4", sections: [], tempoMarkers: [], clips: {} },
  };
}

/* --- signal helpers ---------------------------------------------------------------------- */

export function dc(frames, value) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  left.fill(value);
  right.fill(value);
  return [left, right];
}

export function toneBlock(frames, hz, amplitude = 0.5, sampleRate = RATE) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const w = (2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < frames; i++) {
    const v = amplitude * Math.sin(w * i);
    left[i] = v;
    right[i] = v;
  }
  return [left, right];
}

export function peak(signal, from = 0, to = signal.length) {
  let most = 0;
  for (let i = from; i < to; i++) {
    const v = signal[i] < 0 ? -signal[i] : signal[i];
    if (v > most) most = v;
  }
  return most;
}

export function rms(signal, from = 0, to = signal.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function emptyMaster(frames) {
  return [new Float32Array(frames), new Float32Array(frames)];
}

/** A fresh StereoBlock of `frames`, for a tap. */
export function tapBlock(frames) {
  return [new Float32Array(frames), new Float32Array(frames)];
}

/** Runs one block for each listed track (value = DC amplitude), returns the master block. */
export function runBlock(engine, inputs, frames) {
  const master = emptyMaster(frames);
  engine.process(new Map(inputs), master, frames);
  return master;
}
