# Alloy — data model

**Status: Task 3.2 (state foundation 3.1 + routing graph and Auto / Manual
plumbing 3.2). Describes what is in the code, not what is planned.** Source
of truth: `src/lib/project/model.ts` (shapes), `src/lib/project/session.ts`
(the approved fixture session as a project), `src/lib/project/store.svelte.ts`
(the one authoritative store), `src/lib/project/routing.ts` (the routing
graph and its validation — pure functions, §7). Where this
document and the code disagree, the code is right and this document is
stale — say so in the next task report.

Everything here is **project data as the approved UI edits it**, plus the
routing graph the references form and the rules that keep it valid (3.2).
There is no audio, no DSP, no persistence, no undo. Those arrive with their
own tasks (plan §14, Phase 3: undo / autosave 3.3; the engine later) and will
extend these shapes rather than replace them.

---

## 1. Identity and references

Every entity has a **stable, kind-prefixed id**. Ids are the only thing
anything is allowed to reference; array positions and display names are
never references (plan §5, owner 2026-11-02).

| Type | Shape | Fixture examples | Constructor / guard |
|------|-------|------------------|---------------------|
| `TrackId` | `` `track-${string}` `` | `track-01` … `track-20` | `trackId(code)` / `isTrackId(id)` |
| `ReturnBusId` | `` `return-${string}` `` | `return-room`, `return-plate`, `return-delay1` | `returnBusId(key)` / `isReturnBusId(id)` |
| `BusId` | `` `bus-${string}` `` | `bus-B1` | `busId(code)` / `isBusId(id)` |
| `ChannelId` | union of the three | — | `project.channel(id)` dispatches on the prefix |

The **printed codes** the hardware shows (`01`, `R1`, `B1`) stay display
fields (`code`) on the entity — they are what the scribble strips print,
never what the model looks up by.

`OutputRef = BusId | "master"` is a routing **destination reference**
(`MASTER_OUTPUT = "master"`). Resolving it to a name is `outputLabel(ref,
buses)` (model) or `project.outputLabel(ref)` (store). Whether a destination
is *allowed* is decided by `validateRoute` in `routing.ts` (§7) **before**
the store writes it; the only writers are `ops.setTrackOutput` and
`ops.setBusOutput`. No approved control edits an output reference yet
(owner, 3.2: no routing UI in this build), so the fixture references stand
and the Mixer's bus detail keeps printing them.

A **send** references a Return by id: `SendSlot { to: ReturnBusId | null;
level: number; mode: Mode }`. Two fixed slots per track (`SEND_SLOT_COUNT
= 2`, D2.2.9 — the 3.1 text said "four", which was wrong; corrected in 3.2),
`to: null` = the slot is unassigned, level at `SEND_RANGE.min` (OFF). `mode` is
the send's own Auto / Manual ownership (plan §5 "each send has its own
Auto/Manual"; §8 below) — `Mode` is the Task 2.8 type from
`src/lib/mixer-chain.ts`, so a send is owned exactly like a chain parameter.

---

## 2. Entities

### 2.1 `Track`

| Field | Type | Meaning / origin |
|-------|------|------------------|
| `kind` | `"track"` | discriminant of the `Channel` union |
| `id` | `TrackId` | stable id |
| `code` | `string` | printed two-digit code (`01`) |
| `type` | `"TRK"` | the strip's type print |
| `name` | `string` | the scribble-strip name |
| `org` | `OrgSwatch` | organisational colour (a flat tab, D2.2.13) |
| `familyId` | `FamilyId \| null` | instrument family (Task 2.5 classification) |
| `sourceTypeId` | `string \| null` | source type inside the family (`null` = Unspecified); **must belong to the family** |
| `role` | `RoleId` | plan §5a Role — independent of the tier |
| `priority` | `number` 1–10 | plan §5 Priority — **the stored value**; the Prominence Tier is derived (see §3) |
| `tierConfirmed` | `boolean` | the "needs confirming" lamp (Task 2.5); any tier choice confirms |
| `output` | `OutputRef` | routing destination reference (fixture: every track → `bus-B1`) |
| `channel` | `TrackChannel` | the Console strip's settings: `trim`, `pan`, `level`, `mute`, `solo`, `sends: SendSlot[SEND_SLOT_COUNT = 2]` |
| `loadedSendLevels` | `Partial<Record<ReturnBusId, number>>` | the levels the session loaded with — the ghost print behind the send knobs (D2.2.12) |
| `chain` | `ChainState` | the Task 2.8 processing chain: EQ, dynamic band, compressor, cleanup — each parameter `{ spec, value, original, mode: "auto" \| "manual" }` |
| `display` | `ChannelDisplay` | fixture-backed display facts (`peak` lamp) that must remain until an engine exists |

### 2.2 `ReturnBus` (plan §8a)

`kind: "return"`, `id`, `code` (`R1`), `type: "RET"`, `name`, `short` (the
send-menu print), `org`, `effect: ReturnEffect` (reverb / delay), `channel:
ReturnChannel { level, mute, solo }` (the strip), `chain: ReturnChainState`
(the Task 2.9 effect module: `character`, `time`, `second`, `tone`,
`bypassed`, `notes`), `output: OutputRef` (fixture: Master), `display`.

The chain **no longer carries identity** — in 2.9 `return-chain.svelte.ts`
kept `returnId` / `name` on the chain and a module-level `Map`; in 3.1 the
chain is a pure value under the entity and `return-chain.ts` has no state.

### 2.3 `Bus` (plan §5, §8)

`kind: "bus"`, `id`, `code` (`B1`), `type: "BUS"`, `name`, `org`, `channel:
BusChannel { trim, balance, level, mute, solo }`, `chain: BusChainState`
(reused EQ + compressor + `peakProtection` status, Task 2.9), `output:
OutputRef` (fixture: Master), `display`.

### 2.4 `Channel`, `Arrangement`, `Project`

```ts
type Channel = Track | ReturnBus | Bus;

interface Arrangement {           // the Arrange room's fixture-backed display data (Task 2.6)
  barCount; timeSignature; sections; tempoMarkers;
  clips: Partial<Record<TrackId, readonly ArrangeClip[]>>;   // keyed by id, not row
}

interface Project {
  id; name;
  tracks: Track[]; returns: ReturnBus[]; buses: Bus[];
  arrangement: Arrangement;
}
```

Array order **is** the approved display order (Console left→right, Arrange
top→bottom, Mixer channel order tracks · Returns · buses) but is never used
as an identity.

---

## 3. Priority and the Prominence Tier (D3.1.2)

`priority` (1–10, plan §5) is stored. The tier is **read** from it:

| Tier | Priority band | Anchor when the tier is *chosen* |
|------|---------------|----------------------------------|
| Primary | 8–10 | 9 |
| Supporting | 4–7 | 5 |
| Background | 1–3 | 2 |

`tierOfPriority(p)`, `TIER_FLOOR`, `TIER_ANCHOR`, `clampPriority(p)` live in
the model. Choosing a tier (Arrange row or Mixer identity, through
`ops.chooseTrackTier`) moves the priority to the anchor **only if the tier
changes**, and marks the track confirmed. `ops.setTrackPriority` exists for
the numeric override the plan describes; no UI uses it yet. The anchors are
a 3.1 choice the owner may change; nothing else depends on the exact
numbers. The fixture session seeds each track with its fixture tier's
anchor.

---

## 4. The store (`src/lib/project/store.svelte.ts`)

One module-level `$state` tree: `const state: Project =
$state(createSessionProject())`. It is the only project state in `src/`.

**Reads — `project`:** `id`, `name`, `tracks`, `returns`, `buses`,
`arrangement`, `channels` (Mixer order), `track(id)`, `returnBus(id)`,
`bus(id)`, `channel(id)`, `tierOf(track)`, `sendsInto(returnId)` (the live
list of tracks sending to a Return, with the slot level), `sendReturns`
(the send menu's options), `outputLabel(ref)`; routing (3.2):
`routeOf(id)` (the chain a channel takes to Master, source first),
`destinationsFor(id)` (every candidate destination — Master first, then the
buses — each with the verdict routing there would get) and
`validateRouting()` (the whole graph's verdict). All three delegate to
`routing.ts` over the live state.

**Writes — `ops`** (one per editable control the approved UI has; all
validate, clamp to the control's range and skip same-value writes; unknown
ids throw):

| Track | Return | Bus |
|-------|--------|-----|
| `setTrackTrim/Pan/Level/Mute/Solo` | `setReturnLevel/Mute/Solo` | `setBusTrim/Balance/Level/Mute/Solo` |
| `setSendTo(id, slot, ReturnBusId \| null)`, `setSendLevel(id, slot, v)`, `setSendMode(id, slot, mode)` | `setReturnBypass` | |
| `setTrackFamily` (clears a source that no longer belongs), `setTrackSourceType` (must belong) | | |
| `chooseTrackTier`, `setTrackPriority` | | |
| `setTrackOutput(id, OutputRef): RoutingVerdict` | *(none — a Return's output is fixed at Master)* | `setBusOutput(id, OutputRef): RoutingVerdict` |

The two output ops (3.2) **validate first and write second**: they call
`validateRoute(state, id, to)` on the untouched project, write `output`
only when the verdict is `ok` **and** the reference changes, and return the
verdict in every case — a rejected route leaves the project exactly as it
was, and the verdict's `message` is the text a future output field prints.
An unknown *source* id throws (like every other op); an unknown
*destination* is a verdict, not a throw, because it is a thing a user could
pick.

The Return's effect-module parameters and the chains' Auto / Manual
ownership are edited through the Task 2.8 helpers (`setParamValue`,
`setMode`, `setAllModes`, `setCharacter`) on the entity's chain objects —
those are already narrow, typed and shared, so 3.1 did not wrap them.

**Views** (memoised per id in `Map`s; getter objects **over** the entity —
derived, never a copy):

| View | Returns | Bound by |
|------|---------|----------|
| `trackStrip(id)` | `TrackStripLive` — identity, channel settings, send-slot views, `returns`, `loadedSendLevels` | `TrackStrip` (Console bank, Mixer track channel) |
| `trackMeta(id)` | `TrackMetaLive` — `familyId`, `sourceTypeId`, `tier` (get = reading, set = choose), `tierConfirmed` | `ArrangeTrackRow`, `MixerTrackStrip` identity |
| `arrangeTrackOf(id)` | `ArrangeTrack` — the row's identity shape | `ArrangeTrackRow` |
| `returnStripOf(id)` / `returnLive(id)` | the Return strip's identity / `ReturnLive` (effect params with 2.9 ownership rules, bypass, level, mute, solo) | `ReturnStrip` in both rooms |
| `busStripOf(id)` / `busLive(id)` | the bus strip's identity / `BusLive` | `BusMasterStrip` in both rooms |

Writes through a view go through `ops`; a view's send `to` setter refuses a
non-Return id.

**Not in the store:** selection (the Mixer's `selectedId` is room-local
`$state`), scroll, open panels, persistence, undo. The routing *rules* are
not in the store either — they are the pure functions of `routing.ts`, which
the store calls.

---

## 5. The session (`src/lib/project/session.ts`)

`createSessionProject()` builds a fresh `Project` from the approved
fixtures only: `TRACK_STRIPS` (Console) joined to `ARRANGE_TRACKS` by code
(Arrange classification), `RETURN_STRIPS`, `BUS_MASTERS`, the chain
constructors (`createChainState`, `createReturnChainState`,
`createBusChainState`) and the Arrange timeline data. Nothing is invented:
every number is a fixture's. Fixture reading carried over from Task 2.4:
every track's `output` is the one bus master; the bus and the Returns go to
Master. Every seeded send slot starts `mode: "auto"` (3.2) — a loaded level
is the engine's value until a hand moves it. The fixture graph is valid
(`validateGraph`: "Valid: 24 channels, every route reaches Master").

---

## 6. Binding pattern (components)

Strips and rows take their data through **optional props** and keep working
on plain fixtures (the `#/dev/components` playground): `ReturnStrip`,
`BusMasterStrip` and `ArrangeTrackRow` own a seeded fallback (`own`) behind
`model = live ?? own`; `TrackStrip` binds whatever `track` object it is
given (the store view in the rooms). Editable controls use function
bindings (`bind:value={() => model.x, (v) => (model.x = v)}`), so every
interaction writes to the store when bound. Nothing between a control and
the entity holds a copy.

---

## 7. The routing graph (`src/lib/project/routing.ts`, Task 3.2)

Pure functions — no Svelte, no state, no DOM, **no writes** (verdicts are
values; nothing in the module assigns to a project). They take a
`RoutingProject`, which a `Project` satisfies structurally and so does a
three-line test fixture (`{ tracks, returns, buses }` with `id`, `name`,
`output` and, for tracks, `channel.sends[].to`).

**Nodes** are the channels plus the one sink, Master (`RoutingNodeId =
ChannelId | "master"`). **Edges** (`routingEdges(project)`) are of two kinds
(`RoutingEdgeKind = "output" | "send"`): every track, Return and bus has
exactly one *output* edge (its `OutputRef`), and a track's assigned send
slots are *send* edges into Returns. A Return is a destination for sends
only (plan §8a) and its output is fixed at Master (owner, 3.2) — so a Return
can never sit on a loop and the cycle rule only ever bites on bus chains.
Sidechain relationships (plan §8, Phase 7) are a planned third edge kind,
validated by the same walk, and are **not** modelled.

**`validateRoute(project, source, to): RoutingVerdict`** — the rules, in the
order they are reported:

| # | Rule | `reason` |
|---|------|----------|
| 1 | the source must exist | `unknown-source` |
| 2 | the destination must be Master or an **existing** bus — a missing bus id is a dangling reference; a track or Return id is not a destination | `unknown-destination`, `destination-not-a-bus` |
| 3 | a channel cannot route into itself | `self-route` |
| 4 | a Return routes to Master only | `return-output-fixed` |
| 5 | the route must not close a loop: the destination's output chain must reach Master without meeting the source (direct `A→B→A` and indirect `A→B→C→A` alike; a chain that already loops elsewhere is reported as "already loops") | `cycle` |

A verdict is `{ ok: true, reason: null, message, path }` (message
"Routed: Kick → Master" or "Unchanged: Mix Bus → Master" when the reference
already is the destination; `path` = the source's new chain to Master) or
`{ ok: false, reason, message, path }` (message always starts "Rejected: "
— e.g. "Rejected: Mix Bus cannot route into itself", "Rejected: no bus with
id bus-B9", "Rejected: Track b is not a bus — a channel routes to a bus or
to Master", "Rejected: Bus B2 → Bus B1 → Bus B2 would loop", "Rejected:
Return room is a Return — a Return always routes to Master (plan §8a)";
`path` = the loop that would close, otherwise empty). Master is always a
valid destination for a track or a bus.

**`destinationsFor(project, source): RoutingDestination[]`** — Master first,
then every bus in project order, each `{ id, name, verdict }`. It is the
API for the output field a later task adds (owner, 3.2: offer only valid
destinations **and** explain anything still rejected — one call gives both:
filter on `verdict.ok`, print `verdict.message`).

**`validateGraph(project): RoutingVerdict`** — the same rules over a whole
project: dangling output references, outputs into non-buses, self-routes,
Return outputs, dangling send references, and a depth-first search for any
loop. For tests and for the load path Task 3.3 adds. Also exported:
`routeOf(project, id)` (chain to Master, source first — `["track-01",
"bus-B1", "master"]` in the fixture), `isRoutable(id)` (track or bus ids —
the channels whose output can be set), `routingName`, `MASTER_NAME`.

---

## 8. Auto / Manual ownership (Task 2.8 rules, plumbed through the store in 3.2)

Every owned parameter keeps **three things**: its `value`, its `original`
(the loaded baseline the engine wrote) and its `mode: Mode = "auto" |
"manual"`. That is the `ChainParam` / `CharacterParam` shape of
`src/lib/mixer-chain.ts` for the EQ, compressor, Return effect and bus
chains, and — since 3.2 — `SendSlot.mode` for a track's sends.

| Event | Value | Mode | Anything else |
|-------|-------|------|---------------|
| a hand moves a parameter (`setParamValue`; `ops.setSendLevel` on an assigned slot) | moves | **that parameter** becomes Manual | nothing — no other parameter, slot, channel or room changes |
| return-to-Auto (`setMode(param, "auto")`; `ops.setSendMode(…, "auto")`) | **stays** (D2.8, kept by the owner for 3.2 — no baseline restore) | Auto | `original` still records the baseline |
| ALL AUTO / ALL MANUAL (`setAllModes`) | stay | every parameter of that module | — |
| assigning a send (`ops.setSendTo`) | the level already set by the slot (loaded level for that Return, else `DEFAULT_SEND_LEVEL`) | Auto when the level **is** that baseline, Manual when a hand already moved it (the slot writes level then destination) | — |
| clearing a send (`setSendTo(…, null)`) | OFF | Auto | — |
| a same-value write | — | unchanged (not a turn) | — |

Because the rooms bind the **same** store objects, a parameter made Manual in
the Mixer is Manual in the Console's Return strip and stays Manual (with its
value) across room changes — the rooms re-mount, the store does not
(verified in the browser: `evidence/mixer/3.2/manual-persist.json`).
Priority ↔ Tier keeps the 3.1 anchors 9 / 5 / 2; the numeric Priority
control and BALANCE / TONE semantics are still open (§9).

---

## 9. Deferred (by design)

| Topic | Task |
|-------|------|
| A routing control (output field with `destinationsFor` filter + verdict text), and bus creation | later task (owner, 3.2: no routing UI in this build) |
| Sidechain relationships as a third routing edge kind | Phase 7 |
| Undo / redo, autosave, copy / paste | 3.3 |
| Project folder + JSON manifest (plan §11) | with persistence |
| Engine-written values (Auto parameters updating), meters, peak detection | engine tasks |
| Numeric Priority UI, BALANCE / TONE semantics (2.4 open item) | owner decision |
