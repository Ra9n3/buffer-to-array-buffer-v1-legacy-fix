/**
 * ALLOY Mixer — the regular bus's chain (plan §8 "Bus and master path") —
 * Task 2.9.
 *
 * Plan §8: "Buses have their own channel-strip state and may receive
 * EQ/dynamics when MIX is run"; a new bus "starts flat/untouched" and gets
 * bus processing only when MIX runs; the final output stage "performs
 * safety checks and only transparent peak protection if needed. It must not
 * perform loudness maximization or mastering."
 *
 * So a bus's chain is: the strip's BUS TRIM → EQ → compressor (the same two
 * modules as a track, on the same components) → the strip's BALANCE and
 * bus fader → its output. The one pinned bus of the fixture session, B1
 * "Mix Bus", is read (Task 2.4) as the bus every track and Return sums into
 * and feeds Master directly, so its rail ends with the output stage as a
 * STATUS — peak protection not engaged — with no control (owner, D2.9.2).
 * No cleanup / expander, no dynamic band, no sends: none is in the plan for
 * a bus.
 *
 * Fixtures only: the bus's EQ and compressor values are gentle "glue" a MIX
 * run would plausibly have left — nothing is summed, measured or limited.
 */

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
  type CharacterId,
  type CompState,
  type EqBandState,
  type EqState,
  type ExplanationNote,
  type RailBlock,
} from "./mixer-chain";

export interface BusChainState {
  readonly eq: EqState;
  readonly comp: CompState;
  /** The final output stage (plan §8): transparent peak protection only if needed — here a fixture status. */
  readonly peakProtection: { readonly engaged: boolean; readonly text: string };
  readonly notes: readonly ExplanationNote[];
}

interface BusFixture {
  /** LF / LMF / HMF / HF: [frequency, gain, Q?] */
  readonly bands: Readonly<Record<"lf" | "lmf" | "hmf" | "hf", readonly [number, number, number?]>>;
  readonly character: CharacterId;
  /** threshold, ratio, attack, release, make-up */
  readonly comp: readonly [number, number, number, number, number];
  readonly gainReductionDb: number;
  readonly eqBypassed?: boolean;
  readonly compBypassed?: boolean;
  readonly peakEngaged: boolean;
  readonly peakText: string;
  readonly notes: readonly ExplanationNote[];
}

const note = (module: ExplanationNote["module"], text: string): ExplanationNote => ({ module, text });

const BUS_FIXTURES: Readonly<Record<string, BusFixture>> = {
  B1: {
    bands: { lf: [80, 0.5], lmf: [300, -1, 1], hmf: [3000, 0, 1], hf: [12000, 1] },
    character: "varimu",
    comp: [-20, 1.5, 30, 300, 0.5],
    gainReductionDb: 1,
    peakEngaged: false,
    peakText: "not engaged (the mix leaves headroom)",
    notes: [
      note("eq", "Reduced 300 Hz by 1 dB across the sum to clear the low-mid build-up of guitars, piano and pad."),
      note("eq", "Lifted 12 kHz by 1 dB for air across the whole mix; the low shelf is left almost flat."),
      note("comp", "Vari-Mu character, 1.5:1, slow: a gentle glue across the mix, about 1 dB of reduction; peaks are left alone."),
      note("peak", "Peak protection not engaged: the mix leaves headroom for a later mastering stage; nothing is maximised."),
    ],
  },
};

const FALLBACK: BusFixture = {
  bands: { lf: [80, 0], lmf: [300, 0, 1], hmf: [3000, 0, 1], hf: [12000, 0] },
  character: "vca",
  comp: [-20, 1.5, 30, 300, 0],
  gainReductionDb: 0,
  peakEngaged: false,
  peakText: "not engaged",
  notes: [note("eq", "A new bus starts flat; it receives bus processing only when MIX is run.")],
};

/** A fresh, independent chain state for the bus with this printed code, from its fixture. */
export function createBusChainState(code: string): BusChainState {
  const fx = BUS_FIXTURES[code] ?? FALLBACK;
  const bands: EqBandState[] = EQ_BANDS.map((band) => {
    const [freq, gain, q] = fx.bands[band.id];
    return {
      band,
      freq: chainParam(EQ_FREQ, freq, undefined),
      gain: chainParam(EQ_GAIN, gain, undefined),
      q: band.kind === "bell" ? chainParam(EQ_Q, q ?? 1, undefined) : null,
      dynamicDepthDb: null,
    };
  });
  const [threshold, ratio, attack, release, makeup] = fx.comp;
  return {
    eq: { bypassed: fx.eqBypassed === true, bands },
    comp: {
      bypassed: fx.compBypassed === true,
      character: { value: fx.character, original: fx.character, mode: "auto" },
      threshold: chainParam(COMP_THRESHOLD, threshold, undefined),
      ratio: chainParam(COMP_RATIO, ratio, undefined),
      attack: chainParam(COMP_ATTACK, attack, undefined),
      release: chainParam(COMP_RELEASE, release, undefined),
      makeup: chainParam(COMP_MAKEUP, makeup, undefined),
      gainReductionDb: fx.gainReductionDb,
    },
    peakProtection: { engaged: fx.peakEngaged, text: fx.peakText },
    notes: fx.notes,
  };
}

/** The bus's rail (plan §8): trim → EQ → compressor → balance → fader → output (the printed name of the bus's destination) → the final output stage. */
export function busRailBlocks(chain: BusChainState, output: string): RailBlock[] {
  return [
    { id: "trim", step: "01", label: "Bus trim", engaged: true, home: "strip" },
    { id: "eq", step: "02", label: "Static multiband EQ", engaged: !chain.eq.bypassed, home: "panel" },
    { id: "comp", step: "03", label: "Compressor", engaged: !chain.comp.bypassed, home: "panel" },
    { id: "balance", step: "04", label: "Balance", engaged: true, home: "strip" },
    { id: "fader", step: "05", label: "Bus fader", engaged: true, home: "strip" },
    { id: "output", step: "06", label: `Output \u2192 ${output}`, engaged: true, home: "fixture", status: `routed to ${output}` },
    {
      id: "peak",
      step: "07",
      label: "Peak protection",
      engaged: chain.peakProtection.engaged,
      home: "fixture",
      status: chain.peakProtection.text,
    },
  ];
}
