/**
 * Mixer room placeholder data — Task 0.5.
 *
 * Phase 0 only: neutral placeholder channels and the processing-chain step
 * names taken from product plan §8. No audio, no DSP, no project state.
 *
 * The channel list is deliberately produced by a function with a default count
 * rather than being a hardcoded literal, so the number of placeholder tracks is
 * a parameter and does not become a permanent limit.
 */

export type ChannelKind = "track" | "bus" | "return";

export interface MixerChannel {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: ChannelKind;
}

/**
 * Default placeholder track count. Matches the 20 used by the Console bank and
 * the Arrange track list so the three rooms describe the same sized session.
 */
export const MIXER_TRACK_COUNT = 20;

export function createTrackChannels(count: number = MIXER_TRACK_COUNT): MixerChannel[] {
  return Array.from({ length: count }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");

    return {
      id: `track-${code}`,
      code,
      name: `Track ${code}`,
      kind: "track" as const,
    };
  });
}

/**
 * Bus and Return channels come last, matching the Console bank's pinned order.
 * Product plan §8a: two default Return buses (Reverb, Delay), and Return buses
 * are first-class channels that can be selected and inspected like any other.
 */
export const MIXER_BUS_AND_RETURN_CHANNELS: readonly MixerChannel[] = [
  { id: "return-1", code: "R1", name: "Reverb Return", kind: "return" },
  { id: "return-2", code: "R2", name: "Delay Return", kind: "return" },
  { id: "bus-master", code: "BUS", name: "Bus master", kind: "bus" },
];

export const MIXER_CHANNELS: readonly MixerChannel[] = [
  ...createTrackChannels(),
  ...MIXER_BUS_AND_RETURN_CHANNELS,
];

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

export function findChannel(id: string): MixerChannel | undefined {
  return MIXER_CHANNELS.find((channel) => channel.id === id);
}
