/**
 * ALLOY — the approved FIXTURE SESSION as a project — Task 3.1.
 *
 * Builds the one `Project` the store opens with, from the fixture data the
 * rooms were approved on (Tasks 2.2 … 2.9), so that nothing visible changes
 * when the rooms switch from their own fixture copies to the shared store:
 *
 *   tracks    `TRACK_STRIPS` (Task 2.2: code, name, colour, trim, pan,
 *             sends, fader, MUTE, SOLO, peak) joined by code to the Arrange
 *             classification `ARRANGE_TRACKS` (Task 2.5: family, source
 *             type, role, Prominence Tier, tierConfirmed) and to the Mixer's
 *             chain fixtures (Task 2.8: `createChainState`);
 *   Returns   `RETURN_STRIPS` (Task 2.4) and the effect-module fixtures
 *             (Task 2.9: `createReturnChainState`);
 *   buses     `BUS_MASTERS` (Task 2.4) and the bus-chain fixtures (Task
 *             2.9: `createBusChainState`);
 *   arrangement  the Arrange room's bars, sections, tempo markers and
 *             waveform placeholder clips (Tasks 2.5 / 2.6).
 *
 * Still a fixture — "SIMULATED" stays printed on every strip: no file is
 * read, nothing is measured, and the routing references are the Task 2.4
 * reading of the session (every track sums into B1 "Mix Bus"; B1 and the
 * Returns feed Master). A fresh object every call: the store owns its copy.
 */

import {
  BUS_MASTERS,
  RETURN_STRIPS,
  type BusMasterFixture,
  type ReturnStripFixture,
} from "../../components/channel-strip/bus-return-fixtures";
import {
  EFFECT_RETURNS,
  SEND_RANGE,
  SEND_SLOT_COUNT,
  TRACK_STRIPS,
  type TrackStripFixture,
} from "../../components/channel-strip/track-strip-fixtures";
import { ARRANGE_BAR_COUNT, ARRANGE_TRACKS, type ArrangeTrack } from "../arrange";
import { ARRANGE_SECTIONS, ARRANGE_TEMPO_MARKERS, TIME_SIGNATURE, clipsOf } from "../arrange-timeline";
import { DEFAULT_PROJECT_RATE } from "../audio/rates";
import { createBusChainState } from "../bus-chain";
import { createChainState } from "../mixer-chain";
import { createReturnChainState } from "../return-chain";
import {
  MASTER_OUTPUT,
  TIER_ANCHOR,
  busId,
  returnBusId,
  trackId,
  type Arrangement,
  type Bus,
  type OutputRef,
  type Project,
  type ReturnBus,
  type ReturnBusId,
  type SendSlot,
  type Track,
  type TrackId,
} from "./model";

/** The Arrange classification of a strip's track, or the unset defaults Task 2.5 printed for a track without one. */
function arrangeOf(strip: TrackStripFixture): ArrangeTrack {
  return (
    ARRANGE_TRACKS.find((t) => t.code === strip.id) ?? {
      code: strip.id,
      name: strip.name,
      org: strip.org,
      familyId: null,
      sourceTypeId: null,
      role: "rhythm",
      tier: "supporting",
    }
  );
}

/**
 * The fixed send slots (D2.2.9): the loaded sends fill them in order, the
 * rest start unassigned at OFF. Every slot starts Auto — the loaded level is
 * the engine's / the session's value, nothing the user has owned yet (Task 3.2).
 */
function sendSlotsOf(strip: TrackStripFixture): SendSlot[] {
  return Array.from({ length: SEND_SLOT_COUNT }, (_, i) => {
    const send = strip.sends[i];
    return send ? { to: returnBusId(send.to), level: send.level, mode: "auto" } : { to: null, level: SEND_RANGE.min, mode: "auto" };
  });
}

function trackOf(strip: TrackStripFixture, output: OutputRef): Track {
  const meta = arrangeOf(strip);
  const loadedSendLevels: Partial<Record<ReturnBusId, number>> = {};
  for (const send of strip.sends) loadedSendLevels[returnBusId(send.to)] = send.level;
  return {
    kind: "track",
    id: trackId(strip.id),
    code: strip.id,
    type: strip.type,
    name: strip.name,
    org: strip.org,
    familyId: meta.familyId,
    sourceTypeId: meta.sourceTypeId,
    role: meta.role,
    priority: TIER_ANCHOR[meta.tier],
    tierConfirmed: meta.tierConfirmed !== false,
    output,
    channel: {
      trim: strip.trim,
      pan: strip.pan,
      level: strip.level,
      mute: strip.mute,
      solo: strip.solo,
      sends: sendSlotsOf(strip),
    },
    loadedSendLevels,
    chain: createChainState(strip.id),
    display: { peak: strip.peak },
    audio: null,
  };
}

function returnOf(ret: ReturnStripFixture): ReturnBus {
  const listed = EFFECT_RETURNS.find((r) => r.id === ret.returnId);
  return {
    kind: "return",
    id: returnBusId(ret.returnId),
    code: ret.id,
    type: ret.type,
    name: ret.name,
    short: listed?.short ?? ret.name.toUpperCase(),
    org: ret.org,
    effect: ret.effect,
    channel: { level: ret.level, mute: ret.mute, solo: ret.solo },
    chain: createReturnChainState(ret),
    output: MASTER_OUTPUT,
    display: { peak: ret.peak },
  };
}

function busOf(bus: BusMasterFixture): Bus {
  return {
    kind: "bus",
    id: busId(bus.id),
    code: bus.id,
    type: bus.type,
    name: bus.name,
    org: bus.org,
    channel: { trim: bus.trim, balance: bus.balance, level: bus.level, mute: bus.mute, solo: bus.solo },
    chain: createBusChainState(bus.id),
    output: MASTER_OUTPUT,
    display: { peak: bus.peak },
  };
}

function arrangementOf(tracks: readonly Track[]): Arrangement {
  const clips: Partial<Record<TrackId, ReturnType<typeof clipsOf>>> = {};
  for (const track of tracks) clips[track.id] = clipsOf(track.code);
  return {
    barCount: ARRANGE_BAR_COUNT,
    timeSignature: TIME_SIGNATURE,
    sections: ARRANGE_SECTIONS,
    tempoMarkers: ARRANGE_TEMPO_MARKERS,
    clips,
  };
}

export const SESSION_PROJECT_ID = "session-fixture";
export const SESSION_PROJECT_NAME = "Fixture session";

/** The approved fixture session as a fresh project. */
export function createSessionProject(): Project {
  const buses = BUS_MASTERS.map(busOf);
  // Task 2.4 reading: the one bus master is the bus every track sums into.
  const trackOutput: OutputRef = buses[0]?.id ?? MASTER_OUTPUT;
  const tracks = TRACK_STRIPS.map((strip) => trackOf(strip, trackOutput));
  const returns = RETURN_STRIPS.map(returnOf);
  return {
    id: SESSION_PROJECT_ID,
    name: SESSION_PROJECT_NAME,
    template: "session-fixture",
    // The development session's own rate (Task 11.1): 48 kHz, like every
    // project that predates the choice.
    sampleRate: DEFAULT_PROJECT_RATE,
    tracks,
    returns,
    buses,
    arrangement: arrangementOf(tracks),
  };
}
