/**
 * Mixer room data — Task 0.5 (placeholder), Task 2.7 (the shared session).
 *
 * The Mixer shows the SAME session as the Console and Arrange, so its channel
 * list is derived from the fixtures those rooms already share rather than
 * invented here (Phase 0 printed "Track NN" placeholders; Task 2.7 retires
 * them):
 *
 *   tracks   the Console's twenty track strips (`TRACK_STRIPS`: code, name,
 *            organisational colour, trim, pan, sends, fader, mute / solo,
 *            peak) joined by code to the Arrange classification
 *            (`ARRANGE_TRACKS`: family, source type, role, Prominence Tier,
 *            `tierConfirmed`) — one source of truth per fact, nothing
 *            re-declared;
 *   returns  the Console's pinned Return strips (`RETURN_STRIPS`, R1 … R3,
 *            derived from the shared return list, Task 2.4);
 *   bus      the Console's bus master (`BUS_MASTERS`, B1 Mix Bus).
 *
 * The order is the Console bank's: tracks, then Returns, then the bus master
 * farthest right (Task 0.3 / 2.4). Plan §8a: Return buses are first-class
 * channels that can be selected and inspected like any other.
 *
 * Still only data for rendering fixtures: no audio, no DSP, no routing, no
 * classification, no project state. Tier choices and the selected channel
 * are the room's own UI state (see `MixerRoom.svelte`); a shared project
 * model is a later task.
 */

import { ARRANGE_TRACKS, type ArrangeTrack } from "./arrange";
import {
  BUS_MASTERS,
  RETURN_STRIPS,
  type BusMasterFixture,
  type ReturnStripFixture,
} from "../components/channel-strip/bus-return-fixtures";
import { TRACK_STRIPS, type TrackStripFixture } from "../components/channel-strip/track-strip-fixtures";

export type ChannelKind = "track" | "bus" | "return";

/** What the detail panel (Task 0.5, unchanged until Task 2.9) needs of a channel. */
export interface MixerChannel {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: ChannelKind;
}

/** A regular track: the Console strip and its Arrange classification, by code. */
export interface MixerTrackChannel extends MixerChannel {
  readonly kind: "track";
  readonly strip: TrackStripFixture;
  readonly arrange: ArrangeTrack;
}

export interface MixerReturnChannel extends MixerChannel {
  readonly kind: "return";
  readonly ret: ReturnStripFixture;
}

export interface MixerBusChannel extends MixerChannel {
  readonly kind: "bus";
  readonly bus: BusMasterFixture;
}

export type MixerChannelEntry = MixerTrackChannel | MixerReturnChannel | MixerBusChannel;

/** The plan's defaults for a strip the Arrange table does not know (it knows all twenty). */
function arrangeTrackFor(strip: TrackStripFixture): ArrangeTrack {
  return (
    ARRANGE_TRACKS.find((track) => track.code === strip.id) ?? {
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

export const MIXER_TRACKS: readonly MixerTrackChannel[] = TRACK_STRIPS.map((strip) => ({
  id: `track-${strip.id}`,
  code: strip.id,
  name: strip.name,
  kind: "track" as const,
  strip,
  arrange: arrangeTrackFor(strip),
}));

export const MIXER_RETURNS: readonly MixerReturnChannel[] = RETURN_STRIPS.map((ret) => ({
  id: `return-${ret.returnId}`,
  code: ret.id,
  name: ret.name,
  kind: "return" as const,
  ret,
}));

export const MIXER_BUSES: readonly MixerBusChannel[] = BUS_MASTERS.map((bus) => ({
  id: `bus-${bus.id}`,
  code: bus.id,
  name: bus.name,
  kind: "bus" as const,
  bus,
}));

/** Every channel, in the Console bank's order: tracks, Returns, bus master. */
export const MIXER_CHANNELS: readonly MixerChannelEntry[] = [...MIXER_TRACKS, ...MIXER_RETURNS, ...MIXER_BUSES];

/** Shared track count, for anything that still reads it (the three rooms describe one session). */
export const MIXER_TRACK_COUNT = MIXER_TRACKS.length;

/** Sensible initial selection: the first track, so the detail panel is populated. */
export const DEFAULT_MIXER_SELECTION = MIXER_CHANNELS[0].id;

export interface ProcessingChainStep {
  readonly step: string;
  readonly label: string;
}

/**
 * Product plan §8 chain order. Every block is bypassable in the finished
 * product; here they are labels only.
 */
export const PROCESSING_CHAIN_STEPS: readonly ProcessingChainStep[] = [
  { step: "01", label: "Input trim / gain" },
  { step: "02", label: "Cleanup / expander" },
  { step: "03", label: "Static multiband EQ" },
  { step: "04", label: "Dynamic EQ" },
  { step: "05", label: "Compressor" },
  { step: "06", label: "Panning" },
  { step: "07", label: "Channel fader" },
  { step: "08", label: "Sends + bus routing" },
] as const;

const kindLabels: Record<ChannelKind, string> = {
  track: "Track",
  bus: "Bus",
  return: "Return bus",
};

export function channelKindLabel(kind: ChannelKind): string {
  return kindLabels[kind];
}

export function findChannel(id: string): MixerChannelEntry | undefined {
  return MIXER_CHANNELS.find((channel) => channel.id === id);
}
