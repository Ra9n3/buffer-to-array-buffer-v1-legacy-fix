/**
 * ALLOY — sidechain routing: the detector-signal path (Task 7.2).
 *
 * The plan's §8 asks for sidechain-triggered processing and defers the routing
 * question to Phase 7; `data-model.md` §7 called it "a planned third edge kind …
 * not modelled". This module is that edge kind, validated **separately** from the
 * audible graph:
 *
 *   source : a TRACK. The key is taken **pre-fader and post-trim** (owner,
 *            2026-11-03): fader, pan, sends and the source's own dynamics never
 *            change the key, and because the tap is the track's input block the
 *            key is available before any chain runs.
 *   destination : a track or a bus (owner, 2026-11-03). A Return has no compressor
 *            and no dynamic EQ, so it is rejected rather than ignored.
 *   processor : "compressor" or "dynamic-eq" — the detector each module already
 *            owns. With no edge, both detect from their own input, exactly as
 *            before this task.
 *
 * The key is a DETECTOR signal only: nothing here adds audio to any channel, and
 * nothing in the audible path is duplicated, re-routed or delayed.
 *
 * Availability (owner, 2026-11-03): the key follows the Task 7.1 audibility rules.
 * A muted or solo-excluded source delivers silence, so its destination's detector
 * sees no signal and applies no reduction. An edge that cannot be honoured — an
 * unknown source, a missing destination, a self-sidechain, a Return, a second edge
 * for the same detector — is **reported and dropped**, and the processor falls back
 * to its own input. Nothing is ever silently connected.
 *
 * Cycles: because the tap is the source's raw input and never another chain's
 * output, a key can never depend on processing. Two tracks may therefore key each
 * other without any feedback path or ordering ambiguity, and no cycle rule is
 * needed; the only degenerate case, a channel keying itself, is rejected.
 */
import type { ChannelId, Project, SidechainEdge, SidechainProcessor, TrackId } from "../project/model";

/** The detectors that can be keyed. */
export const SIDECHAIN_PROCESSORS: readonly SidechainProcessor[] = ["compressor", "dynamic-eq"];

/** Why an edge was dropped. Each reason is named, never inferred from silence. */
export type SidechainProblemReason =
  | "malformed"
  | "unknown-source"
  | "unknown-destination"
  | "source-not-a-track"
  | "self-sidechain"
  | "unsupported-destination"
  | "duplicate-assignment";

export interface SidechainProblem {
  readonly edge: SidechainEdge;
  readonly reason: SidechainProblemReason;
  /** A sentence naming the offender, for the report and the caller's diagnostics. */
  readonly message: string;
}

/** destination → processor → source track, for the edges that can be honoured. */
export type SidechainPlan = ReadonlyMap<ChannelId, ReadonlyMap<SidechainProcessor, TrackId>>;

export interface SidechainVerdict {
  /** True when every declared edge was honoured. */
  readonly ok: boolean;
  /** The honoured edges, in model order. */
  readonly edges: readonly SidechainEdge[];
  readonly plan: SidechainPlan;
  /** The dropped edges, with the reason. Never empty when `ok` is false. */
  readonly problems: readonly SidechainProblem[];
}

const emptyPlan: SidechainPlan = new Map();

function sidechainOf(project: Project): readonly SidechainEdge[] {
  return project.sidechains ?? [];
}

/**
 * Validate the declared detector edges and build the plan the engine runs from.
 *
 * Unlike `validateGraph`, this does not throw: a broken detector edge must not stop
 * a project from playing, it must stop that one processor from being keyed. The
 * caller sees every rejection in `problems`.
 */
export function validateSidechains(project: Project): SidechainVerdict {
  const edges = sidechainOf(project);
  if (edges.length === 0) return { ok: true, edges: [], plan: emptyPlan, problems: [] };

  const trackIds = new Set<string>(project.tracks.map((track) => track.id));
  const busIds = new Set<string>(project.buses.map((bus) => bus.id));
  const returnIds = new Set<string>(project.returns.map((ret) => ret.id));

  const plan = new Map<ChannelId, Map<SidechainProcessor, TrackId>>();
  const honoured: SidechainEdge[] = [];
  const problems: SidechainProblem[] = [];

  const reject = (edge: SidechainEdge, reason: SidechainProblemReason, message: string): void => {
    problems.push({ edge, reason, message });
  };

  for (const edge of edges) {
    if (
      typeof edge !== "object" ||
      edge === null ||
      typeof edge.source !== "string" ||
      typeof edge.destination !== "string" ||
      !SIDECHAIN_PROCESSORS.includes(edge.processor)
    ) {
      reject(edge, "malformed", `Alloy Sidechain: a malformed edge was ignored — ${JSON.stringify(edge)}`);
      continue;
    }
    if (!trackIds.has(edge.source)) {
      reject(
        edge,
        "unknown-source",
        `Alloy Sidechain: ${edge.destination}'s ${edge.processor} key refers to "${edge.source}", which is not a track`,
      );
      continue;
    }
    if (!busIds.has(edge.destination) && !trackIds.has(edge.destination) && !returnIds.has(edge.destination)) {
      reject(
        edge,
        "unknown-destination",
        `Alloy Sidechain: a key from ${edge.source} names "${edge.destination}", which is not a channel`,
      );
      continue;
    }
    if (returnIds.has(edge.destination)) {
      reject(
        edge,
        "unsupported-destination",
        `Alloy Sidechain: ${edge.destination} is a Return and has no ${edge.processor} to key`,
      );
      continue;
    }
    if (edge.source === edge.destination) {
      reject(edge, "self-sidechain", `Alloy Sidechain: ${edge.destination} cannot key itself`);
      continue;
    }
    const keyed = plan.get(edge.destination);
    if (keyed?.has(edge.processor)) {
      reject(
        edge,
        "duplicate-assignment",
        `Alloy Sidechain: ${edge.destination}'s ${edge.processor} already listens to ${keyed.get(edge.processor) as string}; the later edge was ignored`,
      );
      continue;
    }
    if (keyed === undefined) plan.set(edge.destination, new Map([[edge.processor, edge.source]]));
    else keyed.set(edge.processor, edge.source);
    honoured.push(edge);
  }

  return { ok: problems.length === 0, edges: honoured, plan, problems };
}

/** The source tracks a destination listens to, for introspection and the tests. */
export function sidechainSourceOf(
  verdict: SidechainVerdict,
  destination: ChannelId,
  processor: SidechainProcessor,
): TrackId | undefined {
  return verdict.plan.get(destination)?.get(processor);
}
