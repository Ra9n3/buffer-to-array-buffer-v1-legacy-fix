/**
 * Shared program-signal source for the meters.
 *
 * The playground has no audio engine, so meters are driven by a single
 * deterministic-ish synthetic "mix" that every component subscribes to.
 * Controls in the playground write their values back into this store, so
 * turning TRIM down really does pull the needle back.
 */

export const CHANNELS = 8;

export type Frame = {
  /** seconds since page load */
  t: number;
  /** fast per-channel program level, 0..1.15 */
  levels: number[];
  /** summed master level, 0..1.15 */
  master: number;
  running: boolean;
};

type Bus = {
  gains: number[];
  drive: number;
  master: number;
  pad: boolean;
  phantom: boolean;
  hpf: boolean;
  comp: number; // 0..1 ratio
  bypass: boolean; // EQ / dynamics out of the path
  running: boolean;
};

const state: Bus = {
  gains: Array.from({ length: CHANNELS }, (_, i) => 0.72 - i * 0.03),
  drive: 0.42,
  master: 0.8,
  pad: false,
  phantom: false,
  hpf: false,
  comp: 0.45,
  bypass: false,
  running: true,
};

const listeners = new Set<(f: Frame) => void>();
let raf = 0;
let started = false;
const t0 = performance.now();

const frame: Frame = {
  t: 0,
  levels: new Array(CHANNELS).fill(0),
  master: 0,
  running: true,
};

function compute(t: number) {
  const bpm = 96;
  const beat = (t * bpm) / 60;
  const barPhase = beat % 1;
  let sum = 0;

  for (let i = 0; i < CHANNELS; i++) {
    const slow = Math.sin(t * (1.1 + i * 0.21) + i * 1.7) * 0.5 + 0.5;
    const mid = Math.sin(t * (0.43 + i * 0.09) + i * 0.9) * 0.5 + 0.5;
    const phrase = Math.sin(t * 0.11 + i) * 0.5 + 0.5;
    const kick = Math.exp(-barPhase * 6.5) * (i % 4 === 0 ? 1 : i % 2 === 0 ? 0.5 : 0.18);
    const hat = Math.exp(-((beat * 2) % 1) * 13) * (i % 3 === 0 ? 0.55 : 0.12);

    let v = 0.1 + 0.5 * (0.62 * slow + 0.38 * mid) * (0.45 + 0.55 * phrase);
    v += 0.42 * kick + 0.2 * hat;
    v *= state.gains[i] ?? 0.7;

    // §2 hardware switches act on the path, so the meters visibly agree
    if (state.pad) v *= 0.16; // −26 dB pad in
    if (state.hpf) v *= 0.72; // low end shaved off
    if (state.phantom) v *= 1.12; // condenser headroom
    // §1 §5 dynamics: comp squashes the peaks, unless the path is bypassed
    if (!state.bypass) {
      v = v * (1 - state.comp * 0.42) + Math.max(0, v - 0.62) * 0.9 * state.comp;
    } else {
      v *= 1.06;
    }
    v *= 0.68 + state.drive * 0.75;
    // meter shimmer
    v *= 0.9 + 0.1 * Math.sin(t * 13.7 + i * 2.3);

    if (!state.running) v = 0;
    v = Math.max(0, Math.min(1.15, v));
    frame.levels[i] = v;
    sum += v;
  }

  frame.master = Math.min(1.15, (sum / CHANNELS) * 1.35 * (0.5 + state.master * 0.7));
  frame.running = state.running;
  return frame;
}

function loop(now: number) {
  frame.t = (now - t0) / 1000;
  compute(frame.t);
  listeners.forEach((cb) => cb(frame));
  raf = requestAnimationFrame(loop);
}

export function subscribe(cb: (f: Frame) => void) {
  listeners.add(cb);
  if (!started) {
    started = true;
    raf = requestAnimationFrame(loop);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      started = false;
      cancelAnimationFrame(raf);
    }
  };
}

export const bus = {
  setGain(i: number, v: number) {
    state.gains[i] = v;
  },
  set(patch: Partial<Bus>) {
    Object.assign(state, patch);
  },
  get state() {
    return state;
  },
};

/** Current frame snapshot (values update in place). */
export const currentFrame = frame;
