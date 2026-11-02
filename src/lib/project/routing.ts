/**
 * ALLOY — the ROUTING GRAPH and its validation — Task 3.2.
 *
 * Pure functions over the project model (plan §5 "Bus creation and routing
 * interaction", §8 "Tracks route to buses or Master; buses can route to
 * other buses or Master", §8a "Track → send → Return → that Return's chain →
 * Master", §16 "buses can chain; circular routing is rejected"). No Svelte,
 * no state, no DOM: the store calls `validateRoute` BEFORE it writes an
 * output reference, so a rejected change never touches the project, and the
 * tests (tests/routing.test.mjs) exercise these functions directly.
 *
 * The graph. Nodes are the channels plus the one sink, Master. Edges are
 *   - OUTPUT edges: every track, Return and bus has exactly one output
 *     reference (`OutputRef` = a bus id or "master");
 *   - SEND edges: a track's assigned send slots feed Return buses.
 * A Return is a destination for SENDS ONLY (plan §8a: "intended to receive
 * sends rather than directly routed tracks") and its own output is fixed at
 * Master (owner, Task 3.2) — so a Return can never sit on a loop, and the
 * cycle rule only ever bites on bus chains. Sidechain relationships (plan
 * §8, Phase 7) are a planned third edge kind — a key input from another
 * channel, validated by the same walk — and are deliberately NOT modelled
 * here; `RoutingEdge` is the shape they will join.
 *
 * The rules (`validateRoute`), in the order they are reported:
 *   1. the source must exist;
 *   2. the destination must be Master or an EXISTING bus (a missing bus id
 *      is a dangling reference; a track or Return id is not a destination);
 *   3. a channel cannot route into itself;
 *   4. a Return routes to Master only;
 *   5. the route must not close a loop: walking the destination's output
 *      chain must reach Master without meeting the source.
 * `validateGraph` applies the same rules to a whole project (dangling
 * references, self-routes, Return outputs, and a depth-first search for any
 * loop), for tests and for a future load path (Task 3.3).
 *
 * Feedback. Every verdict carries a short, plain-language `message`
 * ("Rejected: Mix Bus → Drums → Mix Bus would loop") so the output field
 * that a later task adds can print it as it is (owner, Task 3.2: offer only
 * valid destinations AND explain anything the store still rejects —
 * `destinationsFor` provides both).
 */

import {
  MASTER_OUTPUT,
  isBusId,
  isReturnBusId,
  isTrackId,
  type BusId,
  type ChannelId,
  type OutputRef,
  type ReturnBusId,
  type TrackId,
} from "./model";

/* =========================================================================
   WHAT THE GRAPH NEEDS OF A PROJECT — structural, so tests can build small ones
   ========================================================================= */

export interface RoutingNode {
  readonly id: ChannelId;
  readonly name: string;
  readonly output: OutputRef;
}

export interface RoutingTrackNode extends RoutingNode {
  readonly id: TrackId;
  readonly channel: { readonly sends: readonly { readonly to: ReturnBusId | null }[] };
}

export interface RoutingReturnNode extends RoutingNode {
  readonly id: ReturnBusId;
}

export interface RoutingBusNode extends RoutingNode {
  readonly id: BusId;
}

/** A `Project` is one of these (structurally); so is a three-line test fixture. */
export interface RoutingProject {
  readonly tracks: readonly RoutingTrackNode[];
  readonly returns: readonly RoutingReturnNode[];
  readonly buses: readonly RoutingBusNode[];
}

/* =========================================================================
   EDGES AND VERDICTS
   ========================================================================= */

/** "output" = a channel's one destination; "send" = a track's send into a Return. */
export type RoutingEdgeKind = "output" | "send";

/** Every node id the graph can hold: the channels and the Master sink. */
export type RoutingNodeId = ChannelId | typeof MASTER_OUTPUT;

export interface RoutingEdge {
  readonly from: ChannelId;
  readonly to: RoutingNodeId;
  readonly kind: RoutingEdgeKind;
}

export type RoutingRejectionReason =
  | "unknown-source"
  | "unknown-destination"
  | "destination-not-a-bus"
  | "self-route"
  | "return-output-fixed"
  | "cycle";

export interface RoutingAccepted {
  readonly ok: true;
  readonly reason: null;
  /** "Routed: Kick → Mix Bus" / "Unchanged: …" */
  readonly message: string;
  /** The chain the source now takes to Master, source first. */
  readonly path: readonly RoutingNodeId[];
}

export interface RoutingRejected {
  readonly ok: false;
  readonly reason: RoutingRejectionReason;
  /** A short plain-language explanation, ready to print. */
  readonly message: string;
  /** For a cycle: the loop that would close, source first and last. Empty otherwise. */
  readonly path: readonly RoutingNodeId[];
}

export type RoutingVerdict = RoutingAccepted | RoutingRejected;

/** One candidate destination for a channel, with the verdict routing to it would get. */
export interface RoutingDestination {
  readonly id: OutputRef;
  readonly name: string;
  readonly verdict: RoutingVerdict;
}

/* =========================================================================
   LOOKUPS
   ========================================================================= */

export const MASTER_NAME = "Master";

function findNode(project: RoutingProject, id: string): RoutingNode | undefined {
  if (isTrackId(id)) return project.tracks.find((t) => t.id === id);
  if (isReturnBusId(id)) return project.returns.find((r) => r.id === id);
  if (isBusId(id)) return project.buses.find((b) => b.id === id);
  return undefined;
}

/** The printed name of a node (Master, or the channel's name; an unknown id prints as itself). */
export function routingName(project: RoutingProject, id: string): string {
  if (id === MASTER_OUTPUT) return MASTER_NAME;
  return findNode(project, id)?.name ?? id;
}

const arrow = (project: RoutingProject, path: readonly string[]): string =>
  path.map((id) => routingName(project, id)).join(" \u2192 ");

/** Tracks and buses are routable; a Return's output is fixed (plan §8a). */
export function isRoutable(id: string): id is TrackId | BusId {
  return isTrackId(id) || isBusId(id);
}

/* =========================================================================
   THE GRAPH
   ========================================================================= */

/** Every edge of the project's signal graph: outputs first, then sends, in session order. */
export function routingEdges(project: RoutingProject): RoutingEdge[] {
  const edges: RoutingEdge[] = [];
  for (const t of project.tracks) edges.push({ from: t.id, to: t.output, kind: "output" });
  for (const r of project.returns) edges.push({ from: r.id, to: r.output, kind: "output" });
  for (const b of project.buses) edges.push({ from: b.id, to: b.output, kind: "output" });
  for (const t of project.tracks) {
    for (const slot of t.channel.sends) if (slot.to !== null) edges.push({ from: t.id, to: slot.to, kind: "send" });
  }
  return edges;
}

/**
 * The output chain a channel takes towards Master, destination by
 * destination, the channel itself first: `["track-01", "bus-B1", "master"]`.
 * Stops at Master, at a dangling reference, or when a node repeats (a loop
 * in an invalid graph) — it never runs away.
 */
export function routeOf(project: RoutingProject, id: ChannelId): RoutingNodeId[] {
  const path: RoutingNodeId[] = [id];
  const seen = new Set<string>([id]);
  let node = findNode(project, id);
  while (node) {
    const next = node.output;
    path.push(next);
    if (next === MASTER_OUTPUT || seen.has(next)) break;
    seen.add(next);
    node = findNode(project, next);
  }
  return path;
}

/* =========================================================================
   VALIDATION
   ========================================================================= */

function accepted(project: RoutingProject, source: ChannelId, to: OutputRef, unchanged: boolean): RoutingAccepted {
  const tail: RoutingNodeId[] = to === MASTER_OUTPUT ? [MASTER_OUTPUT] : routeOf(project, to as BusId);
  const text = unchanged ? "Unchanged" : "Routed";
  return { ok: true, reason: null, message: `${text}: ${arrow(project, [source, to])}`, path: [source, ...tail] };
}

function rejected(reason: RoutingRejectionReason, message: string, path: readonly RoutingNodeId[] = []): RoutingRejected {
  return { ok: false, reason, message: `Rejected: ${message}`, path };
}

/**
 * Would routing `source` to `to` be valid in `project` as it stands? Pure:
 * nothing is written. The store commits only an `ok` verdict.
 */
export function validateRoute(project: RoutingProject, source: ChannelId, to: OutputRef): RoutingVerdict {
  const from = findNode(project, source);
  if (!from) return rejected("unknown-source", `no channel with id ${source}`);

  if (to !== MASTER_OUTPUT) {
    if (!isBusId(to)) {
      return rejected("destination-not-a-bus", `${routingName(project, to)} is not a bus \u2014 a channel routes to a bus or to Master`);
    }
    if (!project.buses.some((b) => b.id === to)) return rejected("unknown-destination", `no bus with id ${to}`);
  }

  if (to === source) return rejected("self-route", `${from.name} cannot route into itself`, [source, source]);

  if (isReturnBusId(source) && to !== MASTER_OUTPUT) {
    return rejected("return-output-fixed", `${from.name} is a Return \u2014 a Return always routes to Master (plan \u00a78a)`);
  }

  if (to !== MASTER_OUTPUT) {
    // Walk the destination's chain: meeting the source closes a loop.
    const walk: RoutingNodeId[] = [source];
    const seen = new Set<string>([source]);
    let cursor: RoutingNodeId = to;
    while (cursor !== MASTER_OUTPUT) {
      walk.push(cursor);
      if (cursor === source) return rejected("cycle", `${arrow(project, walk)} would loop`, walk);
      if (seen.has(cursor)) return rejected("cycle", `${arrow(project, walk)} already loops`, walk);
      seen.add(cursor);
      const node = findNode(project, cursor);
      if (!node) break; // a dangling reference further down; validateGraph reports it
      cursor = node.output;
    }
  }

  return accepted(project, source, to, from.output === to);
}

/** Every bus and Master, each with the verdict `source` would get routing to it. */
export function destinationsFor(project: RoutingProject, source: ChannelId): RoutingDestination[] {
  const candidates: OutputRef[] = [MASTER_OUTPUT, ...project.buses.map((b) => b.id)];
  return candidates.map((id) => ({ id, name: routingName(project, id), verdict: validateRoute(project, source, id) }));
}

/**
 * Is the whole graph valid? Dangling or wrong-kind references, self-routes,
 * a Return not on Master, and any loop (depth-first over output AND send
 * edges) are reported — the first problem found, in session order.
 */
export function validateGraph(project: RoutingProject): RoutingVerdict {
  const nodes: RoutingNode[] = [...project.tracks, ...project.returns, ...project.buses];
  const ids = new Set<string>(nodes.map((n) => n.id));
  const dup = nodes.find((n, i) => nodes.findIndex((m) => m.id === n.id) !== i);
  if (dup) return rejected("unknown-source", `duplicate channel id ${dup.id}`);

  for (const node of nodes) {
    const to = node.output;
    if (to === node.id) return rejected("self-route", `${node.name} cannot route into itself`, [node.id, node.id]);
    if (to !== MASTER_OUTPUT) {
      if (!isBusId(to)) return rejected("destination-not-a-bus", `${node.name} routes to ${routingName(project, to)}, which is not a bus`);
      if (!ids.has(to)) return rejected("unknown-destination", `${node.name} routes to a bus that does not exist (${to})`);
      if (isReturnBusId(node.id)) return rejected("return-output-fixed", `${node.name} is a Return \u2014 a Return always routes to Master (plan \u00a78a)`);
    }
  }
  for (const t of project.tracks) {
    for (const slot of t.channel.sends) {
      if (slot.to !== null && !ids.has(slot.to)) return rejected("unknown-destination", `${t.name} sends to a Return that does not exist (${slot.to})`);
    }
  }

  // Depth-first search over every edge; a back edge is a loop.
  const out = new Map<string, RoutingNodeId[]>();
  for (const e of routingEdges(project)) {
    const list = out.get(e.from) ?? [];
    list.push(e.to);
    out.set(e.from, list);
  }
  const state = new Map<string, "open" | "done">();
  const stack: RoutingNodeId[] = [];
  const visit = (id: RoutingNodeId): RoutingRejected | null => {
    if (id === MASTER_OUTPUT) return null;
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "open") {
      const loop = [...stack.slice(stack.indexOf(id)), id];
      return rejected("cycle", `${arrow(project, loop)} loops`, loop);
    }
    state.set(id, "open");
    stack.push(id);
    for (const next of out.get(id) ?? []) {
      const problem = visit(next);
      if (problem) return problem;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const node of nodes) {
    const problem = visit(node.id);
    if (problem) return problem;
  }
  return { ok: true, reason: null, message: `Valid: ${nodes.length} channels, every route reaches Master`, path: [] };
}
