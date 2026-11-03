/**
 * ALLOY — who passes audio, and in what order the buses are processed (Task 7.1).
 *
 * The project model gives every channel `mute` and `solo`, but **no document fixed
 * the rule** that turns those flags into audibility — so the owner chose it at the
 * 7.1 readiness gate (2026-11-03): **solo-in-place along the routing path**.
 *
 * The graph is the one `project/routing.ts` validates: every channel has one output
 * edge (to a bus or Master) and a track may have send edges into Returns. Two
 * closures are computed from the channels whose SOLO is on (and whose MUTE is not —
 * mute wins, so a muted soloed channel opens no path):
 *
 *   down = everything reachable from a soloed channel over output AND send edges
 *   up   = everything that reaches a soloed channel over output AND send edges
 *
 * Then:
 *
 *   - a channel's DRY OUTPUT passes when it is not muted and (nothing is soloed, or
 *     it is soloed, or it is downstream of a soloed channel, or upstream of one) —
 *     so soloing a track keeps the bus it feeds audible, and soloing a bus keeps the
 *     tracks that feed it audible;
 *   - a SEND passes when neither end is muted and (nothing is soloed, or the sending
 *     track is soloed, or the Return is soloed, or the track is upstream of a soloed
 *     channel) — so soloing a group keeps its send into the reverb, and soloing a
 *     Return hears the tracks that feed it WITHOUT their dry signal.
 *
 * Mute is per channel and always wins: a muted track makes no sound on either path;
 * a muted bus or Return silences its own output and nothing else. Everything is
 * computed once, when the engine is built — it is a property of the routing and the
 * flags, not of a block.
 */

import type { Bus, ChannelId, Project, ReturnBus, ReturnBusId, Track, TrackId } from "../project/model";

export interface Audibility {
  /** True when at least one unmuted channel is soloed — the closures are live. */
  readonly anySolo: boolean;
  /** Whether a channel's dry output (its post-fader signal) reaches the sum. */
  outputPasses(id: ChannelId): boolean;
  /** Whether one track's send into one Return reaches the Return's input. */
  sendPasses(track: TrackId, to: ReturnBusId): boolean;
}

const SOLOED = "soloed";

/**
 * The audibility of one project. Pure: it reads the model and returns predicates; it
 * never writes, and it allocates only here, not per block.
 */
export function computeAudibility(project: Project): Audibility {
  const tracks: readonly Track[] = project.tracks;
  const buses: readonly Bus[] = project.buses;
  const returns: readonly ReturnBus[] = project.returns;

  const muted = new Set<ChannelId>();
  const soloed = new Set<ChannelId>();
  for (const track of tracks) {
    if (track.channel.mute) muted.add(track.id);
    if (track.channel.solo && !track.channel.mute) soloed.add(track.id);
  }
  for (const bus of buses) {
    if (bus.channel.mute) muted.add(bus.id);
    if (bus.channel.solo && !bus.channel.mute) soloed.add(bus.id);
  }
  for (const ret of returns) {
    if (ret.channel.mute) muted.add(ret.id);
    if (ret.channel.solo && !ret.channel.mute) soloed.add(ret.id);
  }

  const anySolo = soloed.size > 0;

  // Forward edges: output (channel → destination) and send (track → Return).
  const forward = new Map<ChannelId, ChannelId[]>();
  const addEdge = (from: ChannelId, to: ChannelId): void => {
    const list = forward.get(from);
    if (list) list.push(to);
    else forward.set(from, [to]);
  };
  for (const track of tracks) {
    if (track.output !== "master") addEdge(track.id, track.output);
    for (const send of track.channel.sends) if (send.to !== null) addEdge(track.id, send.to);
  }
  for (const bus of buses) if (bus.output !== "master") addEdge(bus.id, bus.output);
  // A Return's output is fixed at Master (routing.ts rule 4): no forward edge.

  const downstream = new Set<ChannelId>();
  const upstream = new Set<ChannelId>();
  if (anySolo) {
    const stack: ChannelId[] = [...soloed];
    while (stack.length > 0) {
      const id = stack.pop() as ChannelId;
      for (const next of forward.get(id) ?? []) {
        if (!downstream.has(next) && !soloed.has(next)) {
          downstream.add(next);
          stack.push(next);
        }
      }
    }
    // Reverse closures: who feeds a soloed channel (outputs and sends alike).
    const reverse = new Map<ChannelId, ChannelId[]>();
    const addReverse = (from: ChannelId, to: ChannelId): void => {
      const list = reverse.get(to);
      if (list) list.push(from);
      else reverse.set(to, [from]);
    };
    for (const [from, list] of forward) for (const to of list) addReverse(from, to);
    const backStack: ChannelId[] = [...soloed];
    while (backStack.length > 0) {
      const id = backStack.pop() as ChannelId;
      for (const previous of reverse.get(id) ?? []) {
        if (!upstream.has(previous) && !soloed.has(previous)) {
          upstream.add(previous);
          backStack.push(previous);
        }
      }
    }
  }

  const outputPasses = (id: ChannelId): boolean => {
    if (muted.has(id)) return false;
    if (!anySolo) return true;
    return soloed.has(id) || downstream.has(id) || upstream.has(id);
  };

  const sendPasses = (track: TrackId, to: ReturnBusId): boolean => {
    if (muted.has(track) || muted.has(to)) return false;
    if (!anySolo) return true;
    return soloed.has(track) || soloed.has(to) || upstream.has(track);
  };

  return { anySolo, outputPasses, sendPasses };
}

/**
 * The order in which buses are processed: a bus that feeds another bus comes first,
 * so every destination sees its inputs summed exactly once. Depth to Master decides
 * it; the routing rules have already rejected loops, so the depth is finite (a
 * defensive cap keeps a malformed project from spinning).
 */
export function busProcessingOrder(project: Project): Bus[] {
  const byId = new Map<string, Bus>(project.buses.map((bus) => [bus.id, bus]));
  const depth = new Map<string, number>();
  const depthOf = (bus: Bus, seen: Set<string>): number => {
    const known = depth.get(bus.id);
    if (known !== undefined) return known;
    if (seen.has(bus.id) || seen.size > project.buses.length + 1) return 0;
    seen.add(bus.id);
    const next = bus.output === "master" ? 0 : (byId.has(bus.output) ? depthOf(byId.get(bus.output) as Bus, seen) : 0);
    seen.delete(bus.id);
    const value = 1 + next;
    depth.set(bus.id, value);
    return value;
  };
  return [...project.buses].sort((a, b) => depthOf(b, new Set()) - depthOf(a, new Set()));
}

/** Exported for the guard: the closure names as they are computed. */
export const AUDIBILITY_RULES = [SOLOED, "downstream", "upstream", "mute-wins"] as const;
