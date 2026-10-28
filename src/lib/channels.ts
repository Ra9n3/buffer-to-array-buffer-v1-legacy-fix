/**
 * Shared channel placeholders — used by the Console channel bank and the Mixer
 * channel bank, so both rooms describe the same pretend session.
 *
 * Placeholders only. No audio, no processing, no project state.
 */

export type ChannelKind = "track" | "bus" | "return";

export interface ChannelPlaceholder {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: ChannelKind;
}

/**
 * PLACEHOLDER DEFAULT ONLY — not a product requirement.
 *
 * The product plan does not fix a channel count. This matches the Arrange
 * placeholder row count so all three rooms describe the same pretend session.
 * Real channels arrive with the project model.
 */
export const PLACEHOLDER_TRACK_COUNT = 20;

/** Builds `count` track channels. The count is a parameter, never baked in. */
export function createTrackChannels(
  count: number = PLACEHOLDER_TRACK_COUNT,
): readonly ChannelPlaceholder[] {
  return Array.from({ length: count }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");
    return { id: `track-${code}`, code, name: `Track ${code}`, kind: "track" };
  });
}

/**
 * Pinned channels: the two default Return buses from product plan §8a plus the
 * bus master. Kept separate from the track count because their inclusion is
 * justified by the plan, not by the placeholder number.
 */
export const PINNED_CHANNELS: readonly ChannelPlaceholder[] = [
  { id: "return-reverb", code: "R1", name: "Reverb Return", kind: "return" },
  { id: "return-delay", code: "R2", name: "Delay Return", kind: "return" },
  { id: "bus-master", code: "BUS", name: "Bus master", kind: "bus" },
];

export const ALL_CHANNELS: readonly ChannelPlaceholder[] = [
  ...createTrackChannels(PLACEHOLDER_TRACK_COUNT),
  ...PINNED_CHANNELS,
];

export const DEFAULT_CHANNEL_SELECTION = ALL_CHANNELS[0]?.id ?? "";

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  track: "TRK",
  bus: "BUS",
  return: "RET",
};

export const CHANNEL_KIND_NAMES: Record<ChannelKind, string> = {
  track: "Standard track",
  bus: "Regular bus",
  return: "Return bus",
};
