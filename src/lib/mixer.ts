/**
 * Mixer room structural data — Task 0.5.
 *
 * Placeholders only. No audio, no processing, no project state, no derived
 * values. These describe a pretend session so the Phase 0 skeleton can prove
 * its layout; Phase 3+ replaces them with real project channels.
 */

export type MixerChannelKind = "track" | "bus" | "return";

export interface MixerChannelPlaceholder {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: MixerChannelKind;
}

/**
 * PLACEHOLDER DEFAULT ONLY — not a product requirement.
 *
 * The product plan does not fix a Mixer channel count. This matches the
 * Console and Arrange placeholder counts so all three rooms describe the same
 * pretend session. Real channels arrive with the project model.
 */
export const PLACEHOLDER_TRACK_COUNT = 20;

/** Builds `count` track channels. The count is a parameter, never baked in. */
export function createMixerTracks(
  count: number = PLACEHOLDER_TRACK_COUNT,
): readonly MixerChannelPlaceholder[] {
  return Array.from({ length: count }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");
    return { id: `track-${code}`, code, name: `Track ${code}`, kind: "track" };
  });
}

/**
 * Non-track channels.
 *
 * Product plan §8a: "Version 1 starts with two default Return buses: Reverb
 * Return and Delay Return", and Return buses are "first-class channels that can
 * be selected, inspected, edited... like other channels". The bus master is
 * included because the plan's bus/master path is part of the routing model.
 *
 * Task 0.5 shows these as selectable placeholders only. Branching the detail
 * panel by channel type is explicitly Task 2.9 ("Mixer chain-type-aware detail
 * for bus and Return-bus channels"), so the panel does NOT branch yet.
 */
export const MIXER_AUX_CHANNELS: readonly MixerChannelPlaceholder[] = [
  { id: "return-reverb", code: "R1", name: "Reverb Return", kind: "return" },
  { id: "return-delay", code: "R2", name: "Delay Return", kind: "return" },
  { id: "bus-master", code: "BUS", name: "Bus master", kind: "bus" },
];

export const MIXER_CHANNELS: readonly MixerChannelPlaceholder[] = [
  ...createMixerTracks(PLACEHOLDER_TRACK_COUNT),
  ...MIXER_AUX_CHANNELS,
];

/** Default selection on room entry: the first channel. */
export const DEFAULT_MIXER_SELECTION = MIXER_CHANNELS[0]?.id ?? "";

export const MIXER_KIND_LABELS: Record<MixerChannelKind, string> = {
  track: "TRK",
  bus: "BUS",
  return: "RET",
};

export const MIXER_KIND_NAMES: Record<MixerChannelKind, string> = {
  track: "Standard track",
  bus: "Regular bus",
  return: "Return bus",
};
