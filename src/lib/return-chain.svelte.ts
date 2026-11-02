/**
 * ALLOY Mixer — the Return bus's effect-specific chain (plan §8a) — Task 2.9.
 *
 * Plan §8a names a Return's processing controls: effect character /
 * algorithm (Room, Hall or Plate for a reverb; a delay-line character for a
 * delay), decay or delay time, pre-delay, tone / damping, delay feedback,
 * Return output level and bypass — with the same selection, mute / solo,
 * bypass and Auto / Manual conventions as any channel, the Return's INPUT
 * being its incoming sends rather than a routed track output.
 *
 * ONE STATE PER RETURN, SHARED (owner, D2.9.1). The approved Return strip
 * already carries character, time, second control, tone, output level and
 * bypass; the Mixer's chain-detail panel shows the full effect module with
 * ownership and ghosts. Both must turn the same setting, so each Return's
 * chain state lives here — created from the fixture on first use, in
 * memory only, for the life of the app — and the Mixer's strip is BOUND to
 * it through `ReturnStrip`'s optional `live` (`returnLive`). The Console
 * passes nothing and keeps its approved, local behaviour. Nothing is
 * persisted, processed, routed or analysed; the output level stays on the
 * strip's fader (the Task 2.8 rule: strip-owned blocks are not duplicated
 * in the panel).
 *
 * Ownership is the Task 2.8 rule: turning a knob — on the strip or in the
 * panel — makes only that parameter Manual; returning it to Auto changes
 * ownership only; choosing a character makes the character Manual and
 * touches nothing else.
 */

import {
  DECAY_PARAM,
  DELAY_TIME_PARAM,
  FEEDBACK_PARAM,
  PREDELAY_PARAM,
  TONE_PARAM,
  type ReturnEffect,
  type ReturnParam,
  type ReturnStripFixture,
} from "../components/channel-strip/bus-return-fixtures";
import type { ReturnLive } from "../components/channel-strip/return-live";
import { TRACK_STRIPS, type ReturnId } from "../components/channel-strip/track-strip-fixtures";
import {
  chainParam,
  moduleMode,
  setParamValue,
  type ChainParam,
  type CharacterParam,
  type ExplanationNote,
  type ModuleMode,
  type ParamSpec,
  type RailBlock,
} from "./mixer-chain";

/* =========================================================================
   CHARACTERS (plan §8a: "for example Room, Hall, or Plate for reverb, and
   delay-line character for delay"; owner D2.9.4: Tape · Analogue · Digital)
   ========================================================================= */

export type ReverbCharacterId = "room" | "hall" | "plate";
export type DelayCharacterId = "tape" | "analog" | "digital";
export type ReturnCharacterId = ReverbCharacterId | DelayCharacterId;

export interface ReturnCharacter {
  readonly id: ReturnCharacterId;
  /** The spoken / select name. */
  readonly name: string;
  /** The strip window's print (the Task 2.4 window: short, upper-case). */
  readonly print: string;
}

/** Fixture selections only — no algorithm is modelled or claimed. */
export const RETURN_CHARACTERS: Readonly<Record<ReturnEffect, readonly ReturnCharacter[]>> = {
  reverb: [
    { id: "room", name: "Room", print: "ROOM" },
    { id: "hall", name: "Hall", print: "HALL" },
    { id: "plate", name: "Plate", print: "PLATE" },
  ],
  delay: [
    { id: "tape", name: "Tape echo", print: "TAPE" },
    { id: "analog", name: "Analogue", print: "ANALOG" },
    { id: "digital", name: "Digital", print: "DIGITAL" },
  ],
};

export function returnCharacter(effect: ReturnEffect, id: ReturnCharacterId): ReturnCharacter {
  return RETURN_CHARACTERS[effect].find((c) => c.id === id) ?? RETURN_CHARACTERS[effect][0];
}

/* =========================================================================
   PARAMETER SPECS — the strip's own ranges (bus-return-fixtures.ts), as the
   chain knob needs them, so strip and panel knobs agree step for step
   ========================================================================= */

function specOf(p: ReturnParam, name: string): ParamSpec {
  return {
    id: p.id,
    label: p.legend,
    name,
    taper: "linear",
    min: p.min,
    max: p.max,
    step: p.step,
    detents: 0,
    values: [],
    extremes: p.extremes,
    format: p.format,
  };
}

export const RETURN_SPECS = {
  decay: specOf(DECAY_PARAM, "Decay"),
  predelay: specOf(PREDELAY_PARAM, "Pre-delay"),
  time: specOf(DELAY_TIME_PARAM, "Delay time"),
  feedback: specOf(FEEDBACK_PARAM, "Feedback"),
  tone: specOf(TONE_PARAM, "Tone / damping"),
} as const;

/* =========================================================================
   STATE
   ========================================================================= */

export interface ReturnChainState {
  readonly returnId: ReturnId;
  readonly code: string;
  readonly name: string;
  readonly effect: ReturnEffect;
  readonly character: CharacterParam<ReturnCharacterId>;
  /** Decay (reverb) or delay time (delay). */
  readonly time: ChainParam;
  /** Pre-delay (reverb) or feedback (delay). */
  readonly second: ChainParam;
  readonly tone: ChainParam;
  /** The strip's BYPASS: the effect and tone blocks out of circuit. */
  bypassed: boolean;
  readonly notes: readonly ExplanationNote[];
}

/** One track's send into a Return — the Return's input (plan §8a), read from the track fixtures. */
export interface SendInto {
  readonly code: string;
  readonly name: string;
  /** Send level, dB (post-fader, plan §8a). */
  readonly level: number;
}

export function sendsInto(returnId: ReturnId): SendInto[] {
  const out: SendInto[] = [];
  for (const strip of TRACK_STRIPS) {
    const send = strip.sends.find((s) => s.to === returnId);
    if (send) out.push({ code: strip.id, name: strip.name, level: send.level });
  }
  return out;
}

export function returnParams(chain: ReturnChainState): ChainParam[] {
  return [chain.time, chain.second, chain.tone];
}

export function returnOwned(chain: ReturnChainState): (ChainParam | CharacterParam)[] {
  return [chain.character, ...returnParams(chain)];
}

export function returnMode(chain: ReturnChainState): ModuleMode {
  return moduleMode(returnOwned(chain).map((p) => p.mode));
}

export function setReturnCharacter(chain: ReturnChainState, id: ReturnCharacterId): void {
  chain.character.value = id;
  chain.character.mode = "manual";
}

/* =========================================================================
   THE RETURN'S RAIL (plan §8a signal path: sends → the Return's chain → Master)
   ========================================================================= */

export function returnRailBlocks(chain: ReturnChainState): RailBlock[] {
  const effectLabel = chain.effect === "reverb" ? "Reverb" : "Delay";
  const inputs = sendsInto(chain.returnId).length;
  return [
    {
      id: "sends-in",
      step: "01",
      label: "Sends in",
      engaged: inputs > 0,
      home: "panel",
      status: inputs > 0 ? `${inputs} track send${inputs === 1 ? "" : "s"} feed this Return` : "no track sends to this Return",
    },
    { id: "effect", step: "02", label: effectLabel, engaged: !chain.bypassed, home: "panel" },
    { id: "tone", step: "03", label: "Tone / damping", engaged: !chain.bypassed, home: "panel" },
    { id: "level", step: "04", label: "Return level", engaged: true, home: "strip" },
    { id: "output", step: "05", label: "Output \u2192 Master", engaged: true, home: "fixture", status: "routed to Master" },
  ];
}

/* =========================================================================
   FIXTURES — per Return: ownership, loaded values to ghost, authored notes
   ========================================================================= */

interface ReturnFixture {
  /** Parameters already Manual when the Return loads, with the value they were set from. */
  readonly manual?: Partial<{ time: number; second: number; tone: number; character: ReturnCharacterId }>;
  readonly notes: readonly ExplanationNote[];
}

const note = (module: ExplanationNote["module"], text: string): ExplanationNote => ({ module, text });

const RETURN_FIXTURES: Readonly<Record<ReturnId, ReturnFixture>> = {
  room: {
    notes: [
      note("effect", "Room character, 1.4 s decay, 12 ms pre-delay: a short space shared by the drums, guitars, piano and harmonies."),
      note("tone", "Tone \u22122: the tail sits a little darker than its sources so it stays behind them."),
      note("output", "Return at \u22126 dB: the room is felt under the kit rather than heard as an effect."),
    ],
  },
  plate: {
    manual: { tone: 2 },
    notes: [
      note("effect", "Plate character, 2.6 s decay, 30 ms pre-delay: the vocal and snare get a longer, brighter tail that starts after the word."),
      note("tone", "Tone +3, raised by hand from +2: more air on the plate for the lead vocal."),
      note("output", "Return at \u22129 dB, under the dry vocal."),
    ],
  },
  delay1: {
    manual: { time: 350 },
    notes: [
      note("effect", "Tape echo, 375 ms (set by hand from 350 ms), 35 % feedback: two or three repeats for the lead guitar, vocal and riser."),
      note("tone", "Tone \u22124: each repeat is darker than the last, as tape is."),
      note("output", "Bypassed: the delay is held in reserve; its sends stay assigned so it can be brought back with one switch."),
    ],
  },
};

const FALLBACK_FIXTURE: ReturnFixture = { notes: [] };

function createReturnChainState(ret: ReturnStripFixture): ReturnChainState {
  const fx = RETURN_FIXTURES[ret.returnId] ?? FALLBACK_FIXTURE;
  const manual = fx.manual ?? {};
  const specs = ret.effect === "reverb" ? { time: RETURN_SPECS.decay, second: RETURN_SPECS.predelay } : { time: RETURN_SPECS.time, second: RETURN_SPECS.feedback };
  const loaded = RETURN_CHARACTERS[ret.effect].find((c) => c.print === ret.character.print)?.id ?? RETURN_CHARACTERS[ret.effect][0].id;
  const character: CharacterParam<ReturnCharacterId> =
    manual.character !== undefined
      ? { value: loaded, original: manual.character, mode: "manual" }
      : { value: loaded, original: loaded, mode: "auto" };
  return {
    returnId: ret.returnId,
    code: ret.id,
    name: ret.name,
    effect: ret.effect,
    character,
    time: chainParam(specs.time, ret.time, manual.time),
    second: chainParam(specs.second, ret.second, manual.second),
    tone: chainParam(RETURN_SPECS.tone, ret.tone, manual.tone),
    bypassed: ret.bypass,
    notes: fx.notes,
  };
}

/* =========================================================================
   THE SHARED INSTANCES
   ========================================================================= */

const chains = new Map<ReturnId, ReturnChainState>();
const lives = new Map<ReturnId, ReturnLive>();

/** The one chain state of a Return, created from its fixture on first use. */
export function returnChain(ret: ReturnStripFixture): ReturnChainState {
  let chain = chains.get(ret.returnId);
  if (!chain) {
    const created = $state(createReturnChainState(ret));
    chains.set(ret.returnId, created);
    chain = created;
  }
  return chain;
}

/**
 * The strip-side view of that state: what `ReturnStrip`'s optional `live`
 * binds to. Reads go straight to the chain; writes go through the ownership
 * rule (a turned knob is Manual; a write of the same value is not a turn),
 * so a knob turned on the strip is a knob turned in the panel.
 */
export function returnLive(ret: ReturnStripFixture): ReturnLive {
  let live = lives.get(ret.returnId);
  if (!live) {
    const chain = returnChain(ret);
    live = {
      get time() {
        return chain.time.value;
      },
      set time(v: number) {
        if (v !== chain.time.value) setParamValue(chain.time, v);
      },
      get second() {
        return chain.second.value;
      },
      set second(v: number) {
        if (v !== chain.second.value) setParamValue(chain.second, v);
      },
      get tone() {
        return chain.tone.value;
      },
      set tone(v: number) {
        if (v !== chain.tone.value) setParamValue(chain.tone, v);
      },
      get bypass() {
        return chain.bypassed;
      },
      set bypass(on: boolean) {
        chain.bypassed = on;
      },
      get character() {
        const c = returnCharacter(chain.effect, chain.character.value);
        return { print: c.print, name: c.name };
      },
    };
    lives.set(ret.returnId, live);
  }
  return live;
}
