/**
 * Mixer room data — Task 0.5 (placeholder), Task 2.7 (the shared session),
 * Task 3.1 (the shared project store).
 *
 * The Mixer shows the SAME session as the Console and Arrange. Up to Task
 * 2.9 its channel list was derived here from the fixture files those rooms
 * shared; since Task 3.1 the channels are the entities of the one project
 * store (`project.tracks`, `project.returns`, `project.buses` in
 * project/store.svelte.ts) and the Mixer reads them there, in the session's
 * order: tracks, then Returns, then the bus master farthest right (Task 0.3
 * / 2.4). Plan §8a: Return buses are first-class channels, selected and
 * edited like any other.
 *
 * What remains here is the Mixer's own vocabulary: the channel-kind label
 * (re-exported from the model so Task 0.5 / 2.7 imports keep working) and
 * the plan's processing-chain order (§8), which the chain rail
 * (mixer-chain.ts) is built from.
 */

export { channelKindLabel, type ChannelKind } from "./project/model";

export interface ProcessingChainStep {
  readonly step: string;
  readonly label: string;
}

/** The channel chain in the plan's order (§8) — Task 0.5's placeholder list, kept as the rail's source. */
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
