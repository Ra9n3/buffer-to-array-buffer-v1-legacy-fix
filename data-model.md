# Alloy — data model

**Status: Task 3.3 (state foundation 3.1 + routing graph and Auto / Manual
plumbing 3.2 + the editing layer 3.3: undo / redo, autosave foundations,
channel-settings copy / paste). Describes what is in the code, not what is
planned.** Source of truth: `src/lib/project/model.ts` (shapes),
`src/lib/project/session.ts` (the approved fixture session as a project),
`src/lib/project/store.svelte.ts` (the one authoritative store),
`src/lib/project/routing.ts` (the routing graph and its validation — pure
functions, §7), and since 3.3 `src/lib/project/fields.ts` (the field
registry), `history.ts` (undo / redo), `persistence.ts` (the manifest and
the save lifecycle), `clipboard.ts` (channel-settings copy / paste) and
`shell.ts` (the browser wiring) — §10. Where this document and the code
disagree, the code is right and this document is stale — say so in the next
task report.

Everything here is **project data as the approved UI edits it**, plus the
routing graph the references form and the rules that keep it valid (3.2),
plus the editing layer over that data (3.3). There is no audio and no DSP.
Persistence is **write-only** in this build (the manifest is saved; nothing
is loaded — owner, 3.3). The engine arrives with its own tasks (plan §14)
and will extend these shapes rather than replace them.

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
| Loading a saved manifest (restore on open, "open project", multi-project) | a load task — 3.3 writes the manifest only (owner) |
| A visible undo / redo control, an Edit menu, a copy / paste control, autosave status UI | later task (owner, 3.3: shortcuts only, store / API only) |
| Project folder + JSON manifest on disk (plan §11) | with the load task; the in-memory manifest shape is §10.3 |
| Engine-written values (Auto parameters updating), meters, peak detection | engine tasks |
| Numeric Priority UI, BALANCE / TONE semantics (2.4 open item) | owner decision |

---

## 10. The editing layer (Task 3.3)

Three foundations over the store, all in `src/lib/project/`: a **field
registry** (the one boundary everything else is defined against), **history**
(undo / redo), **persistence** (the manifest + autosave) and the **clipboard**
(channel settings between channels), wired to the browser by one **shell**.
No UI changed: undo / redo are keyboard shortcuts, autosave is silent,
copy / paste is a store API (owner decisions, D3.3.1).

### 10.1 The field registry (`fields.ts`)

Every editable leaf of the project, enumerated once from the live `$state`
tree when the store loads (channels are never added or removed in this
build): **1 076 fields** in the session — 50 per track (×20), 12 per Return
(×3), 40 on the bus.

```ts
interface FieldRef {
  path: string;        // stable, id-based: "<channelId>/<rel>", e.g. "track-03/chain/eq/lf/gain/mode"
  channel: ChannelId;
  rel: string;         // the path within the channel
  group: "identity" | "channel" | "send" | "routing" | "chain";
  copyable: boolean;   // in the copy / paste boundary (10.4)
  type: FieldType;     // {kind:"number",min,max} | {kind:"boolean"} | {kind:"enum",values,nullable} | {kind:"ref",nullable} | {kind:"text",nullable}
  label: string;       // "03 Snare Bottom · EQ LF gain"
  get(): FieldValue;   // number | boolean | string | null
  set(value: FieldValue): void;
}
```

| Channel | `rel` paths (registry order: identity, routing, channel, sends, chain) | copyable |
|---------|------------------------------------------------------------------------|----------|
| Track | `familyId`, `sourceTypeId`, `priority`, `tierConfirmed` | no |
| Track | `output` | no |
| Track | `channel/trim`, `channel/pan`, `channel/level` | **yes** |
| Track | `channel/mute`, `channel/solo` | no |
| Track | `sends/<i>/to`, `sends/<i>/level`, `sends/<i>/mode` (two slots) | no |
| Track, Bus | `chain/eq/bypassed`, `chain/eq/<lf,lmf,hmf,hf>/<freq,gain[,q]>/<value,mode>`, `chain/comp/bypassed`, `chain/comp/character/<value,mode>`, `chain/comp/<threshold,ratio,attack,release,makeup>/<value,mode>` | **yes** |
| Return | `channel/level` | **yes** |
| Return | `channel/mute`, `channel/solo` | no |
| Return | `chain/bypassed`, `chain/character/<value,mode>`, `chain/<time,second,tone>/<value,mode>` | **yes** |
| Bus | `output` | no |
| Bus | `channel/trim`, `channel/balance`, `channel/level` | **yes** |
| Bus | `channel/mute`, `channel/solo` | no |

**Not fields (never in history, never saved, never pasted):** `id`, `code`,
`kind`, `type`, `name`, `org`, `role`, `effect`, `short`, `display`
(identity and fixture facts), every `original` (the loaded baseline a Manual
parameter ghosts against — D2.8), `loadedSendLevels`, a Return's `output`
(fixed to Master, 3.2), the arrangement (fixture), and every piece of
room-local UI state (the Mixer's selection, scroll, open menus). The field
setters write the same properties the `ops` write — through them the
registry *is* the store's write surface, read generically.

`isValidValue(type, value)` is the gate for values entering from outside
(a paste, a future load): number within range and finite, boolean, enum
member (or null when nullable), string ref / text. `sameValue` is the
equality history and the clipboard use (`Object.is`).

### 10.2 History (`history.ts`) — boundaries, grouping, limits

**Model.** A diff log over the registry, not snapshots: history keeps one
baseline value per field (1 076 values); `observe()` compares every field
with its baseline and records what moved as patches `{path, before,
after}`. Nothing in the write paths changed — ops, the Task 2.8 helpers
(`setParamValue`, `setMode`, `setAllModes`, `setCharacter`), the components'
direct bypass toggles and the clipboard all write the state as before; the
**observer** in the store (its one `$effect`, inside `$effect.root`) reads
every field, so any write re-runs it after the writing block and it calls
`history.observe()` untracked.

**Boundary — what is in history:** every registered field (10.1), and
nothing else. Room-local selection, scroll, fixture text, the arrangement,
`original` values, the clipboard's held payload and autosave status are not
fields, so they can never enter an entry. A restore (undo / redo) writes
through the same setters with observation suspended (`applying`), so a
restore is never recorded as an edit.

**Grouping — what one undo step is:**

| Situation | Entry |
|-----------|-------|
| one synchronous block writes one field (`ops.setTrackLevel`) | one entry, one patch, label `"03 Snare Bottom · level"` |
| one block writes several fields (`setParamValue`: value + mode → Manual; `setTrackFamily` clearing the source; `setAllModes`) | **one entry** with all patches, label `"03 Snare Bottom · 2 settings"` (or `"N settings on M channels"`) |
| a continuous adjustment: more writes to the **same fields** (a subset of the open entry's paths) within **1 000 ms** of the entry's last change, with a clock installed | **merged** into the open entry (its `before` stays, `after` moves) — a fader drag or a knob turn is one step; a merge that lands back on the start value drops the entry |
| `history.transaction(label, fn)` (the store's paste) | one closed, labelled entry; closes the previous entry first |
| undo / redo | close the entry; move it between the stacks; no new entry |
| a same-value write, a rejected routing write, a rejected / unchanged paste, an unknown-id throw | no entry (nothing moved) |

Without a clock (Node tests) nothing coalesces — every `observe()` is its own
entry; the shell installs `performance.now`. Coalescing is deliberately
narrow (same fields, one second, open entry) so that two different controls
touched in quick succession stay two steps.

**Limits.** 200 entries (`DEFAULT_HISTORY_LIMIT`); the oldest fall off.
Rationale: an entry is a handful of patches (a paste is at most 37), so 200
entries are well under 100 kB; deeper undo than that has no UI to navigate
it yet. The baseline array costs one slot per field. A new entry or a merge
clears the redo stack (the usual linear model; branching history is not
planned).

**API.** `createHistory({fields, clock?, coalesceMs?, limit?})` →
`observe(label?, {closed?})`, `transaction(label, fn)`, `undo()`, `redo()`,
`clear()`, `canUndo`, `canRedo`, `undoLabel`, `redoLabel`, `entries`,
`redoEntries`, `revision` (bumps on record / merge / undo / redo / clear —
what autosave watches), `subscribe(listener)`, public `clock`.

### 10.3 Persistence (`persistence.ts`) — the manifest and autosave

**The manifest** is the registry serialised, nothing more:

```json
{ "schema": "alloy.project-manifest/1",
  "project": { "id": "session-fixture", "name": "…" },
  "channels": { "track-01": { "familyId": "drums", "channel/trim": 3.5, "chain/eq/hmf/gain/mode": "manual", … }, … } }
```

Every field of 10.1 by channel id and `rel` (identity and routing included —
the saved document must reproduce the project). No timestamp inside, so two
saves of the same project produce byte-identical text (that is how
"unchanged" is detected). 29 646 bytes for the session. `buildManifest`,
`serializeManifest` (stable `JSON.stringify`), `parseManifest` (schema check;
null when not a manifest), `manifestChannel` exist; **nothing applies a
manifest to the project** — loading is a later task (owner).

**Autosave lifecycle** (`createAutosave({key, serialize, revision, clock?})`;
the store creates it with `key = "alloy.project.<project id>"` and
`revision = () => history.revision`, and forwards every history event to
`notifyChange()`):

| `status.state` | meaning |
|----------------|---------|
| `clean` | nothing has changed since the project opened (nothing ever written) |
| `dirty` | the project's revision is ahead of the last saved revision; a save is `pending` after the debounce |
| `saving` | an adapter write is in flight (asynchronous adapters only) |
| `saved` | the stored text equals the project at the saved revision |
| `failed` | the last write threw; `error` carries the message; the project stays dirty |

`dirty = revision !== savedRevision` is the in-memory / last-saved
distinction. `save()` outcomes: `no-storage` (nothing attached — never
"saved"), `clean`, `unchanged` (the serialised text equals the last saved
text — e.g. an edit and its undo — so no write happens, the revision counts
as saved and `skipped` increments), `written`, `failed`. `savedRevision`,
`savedAt` and `lastSavedText` move **only** after a successful write (or an
`unchanged` match); a failure keeps the previous saved point and the error
until a write succeeds or the project returns to the stored content. Edits
that land during an asynchronous write leave the project dirty and re-arm
the timer.

**Mechanism.** Storage and scheduling are injected (`attach(adapter,
{schedule, delayMs})`): tests use `memoryStorage()` (with a `failWrites`
hook) and a manual scheduler; the shell attaches `webStorageAdapter(window.
localStorage)` with `setTimeout`, **1 000 ms** debounce from the last history
event. Writes are synchronous and tiny (≈30 kB), so autosave never contends
with editing or the rooms' sync; it only ever reads the state through the
registry. If `localStorage` is unavailable (privacy mode, disabled storage —
the lookup throws) nothing is attached: `status.storage` is `null` and the
state can be `dirty` but never `saved`. **Write-only:** the app opens the
approved fixture session on every load; the saved manifest is not read back
(owner, 3.3).

### 10.4 The clipboard (`clipboard.ts`) — the copyable boundary and compatibility

`copyChannelSettings(project, fields, id)` reads the **copyable** fields of
a channel (10.1: `channel/trim`, `channel/pan` | `channel/balance`,
`channel/level`, every `chain/*` field — bypass flags, every parameter's
value **and** mode, the character's value and mode) into

```json
{ "schema": "alloy.channel-settings/1", "kind": "track", "effect": null,
  "from": { "id": "track-01", "code": "01", "name": "Kick" },
  "settings": { "channel/trim": 3.5, "channel/pan": 0, "channel/level": -2, "chain/eq/bypassed": false, … } }
```

37 settings for a track, 10 for a Return, 37 for the bus. **Never copied:**
identity and classification (family, source type, priority, tier
confirmation), `output`, the send slots (destination, level, mode), mute,
solo — so a paste preserves the destination's identity, kind, routing and
send assignments, a Return's identity and fixed Master output, and the
chain's structure (fields are matched by `rel`; nothing is added or removed).

`pasteVerdict(project, fields, payload, destination)` decides **before
anything is written**, in this order, and the plan is applied only when the
whole payload passed:

| reason | when | message shape |
|--------|------|---------------|
| `malformed` | not a channel-settings payload (schema, kind, from, settings) | `Rejected: that is not a channel-settings payload` |
| `unknown-destination` | no channel with that id | `Rejected: no channel with id …` |
| `kind-mismatch` | track → Return, bus → track, … | `Rejected: 01 Kick is a track and R1 Room Reverb is a Return — settings paste between channels of the same kind` |
| `effect-mismatch` | reverb Return → delay Return | `Rejected: R3 Delay 1 is a delay Return and R2 Plate Reverb is a reverb Return — their chains differ` |
| `shape-mismatch` | a payload key the destination has no copyable field for | `Rejected: 03 Snare Bottom has no setting "…"` |
| `invalid-value` | a value outside the field's type / range | `Rejected: "channel/level" cannot take 99 on 04 Hi-hat` |
| ok, `changes: 0` | every setting already equal | `Unchanged: 03 Snare Bottom already has these 37 settings` |
| ok | | `Pasted 37 settings from 01 Kick onto 03 Snare Bottom (18 changed)` |

The plan holds only the fields whose value differs, sorted in registry
order; `applyPaste(plan)` writes them. The store's `clipboard.paste(id,
payload = held)` runs it inside `history.transaction("Paste settings → 03
Snare Bottom")` — **one undo step** — and returns the verdict unchanged, so a
future Edit action can print the message as it is; a rejected or unchanged
paste writes nothing and records nothing. `clipboard.held` is a plain module
variable: not project data, not in history, not saved. Pasted parameters take
the source's value **and** mode (owner, 3.3); a Manual parameter pasted onto
an Auto one becomes Manual with that value, and `original` on the destination
is untouched (D2.8 — return-to-Auto still only changes ownership).

### 10.5 The shell (`shell.ts`) — the browser wiring

`main.ts` calls `installProjectShell(window)` once after mount. It (1) gives
history `performance.now` as its clock; (2) attaches autosave to
`localStorage` (try / catch; 1 000 ms `setTimeout`); (3) listens for
`keydown`: **Ctrl / Cmd + Z = undo, Ctrl / Cmd + Shift + Z = redo, Ctrl + Y =
redo**, ignored with Alt, when another handler already prevented the event,
or when the target is a text-like input / textarea / contenteditable (the
browser's own text undo belongs to the field being typed in); the handler
`preventDefault`s so the browser's navigation undo never fires; (4) only when
the URL has `?debug`: `window.alloy = { project, ops, history, clipboard,
autosave, fields, flush }` for the console and browser evidence. The
decisions are pure functions (`shortcutAction`, `isTextEntry`,
`wantsDebugHandle`) covered without a DOM; `installProjectShell` returns an
uninstall function.

### 10.6 Cross-room behaviour

The rooms bind the same store objects (§6), so an edit from any room, a
restore, or a paste is visible in every room at once; the Mixer's selection
is its own `$state` (an id) and is not a field, so undo / redo never move it
(browser evidence: `evidence/mixer/3.3/editing.json`, step C: strip 03
undone from −13.5 to −12 dB while the detail stays on 05 Overhead L).

## 11. The project lifecycle and the settings (Task 4.1)

Phase 4's foundation over the Phase 3 state: Home lists the projects this
browser has actually stored, a project can be started empty or reopened,
the last one opened is restored at start, and a small settings document
keeps the preferences the plan names. Nothing here is audio; nothing here
changes the editing layer's rules (§10). Files: `src/lib/project/
templates.ts`, `src/lib/project/lifecycle.ts`, `src/lib/settings.svelte.ts`,
`src/lib/preferences.css`; the store's `loadProject` (§11.4); the shell
(§10.5) wires them to the browser. Decisions: `decisions-log.md` D4.1.1–D4.1.9.

### 11.1 Identity: `template`

`Project` gains `template: ProjectTemplateId` (`"session-fixture" |
"empty"`), the structure the project was built from. It travels with
`id` and `name` in the manifest's `project` block (§10.3) — **additive**:
the manifest schema is still `alloy.project-manifest/1`; a Task 3.3 manifest without
`template` still parses, and the loader treats a template-less manifest of
the fixture session's id (`session-fixture`) as the fixture session and any
other template-less manifest as unavailable (`unknown-template`). The
`session-fixture` project carries `template: "session-fixture"`; a project
started empty carries `"empty"`.

### 11.2 Templates (`templates.ts`)

A template is a function from an identity to a complete, valid `Project`:

| template          | built by                                   | contents                                                                              |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `session-fixture` | `createSessionProject()` under the saved id / name | the approved 20-track · 3-Return · 1-bus fixture session (§5)                  |
| `empty`           | `createEmptyProject(id, name)`             | **Master only** (owner, D4.1.2): `tracks: []`, `returns: []`, `buses: []`, an empty arrangement (0 bars, no sections, no tempo markers, no clips; the `4/4` label); name `Untitled project` (then `Untitled project 2`, …) |

`createTemplateProject(template, id, name)` returns `null` for an identity
the template cannot carry (the fixture session has one id,
`session-fixture`); `isEmptyProject(p)` ⇔ no tracks, Returns or buses — the
store exposes it as `project.isEmpty` and every room shows its explicit
empty state for it (§11.5). The plan's default Returns and the bus of the
fixture are **not** invented for an empty project; they arrive with the
import that creates tracks (Phase 5).

### 11.3 Storage keys and the recent index (`lifecycle.ts`)

| key                   | schema              | holds                                                                 | written by                                        |
| --------------------- | ------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| `alloy.project.<id>`  | `alloy.project-manifest/1` | the project's manifest (§10.3; now with `template`)                   | autosave (§10.3); `ensureStored` for a first copy |
| `alloy.projects`      | `alloy.projects/1`  | `{ schema, entries: [{ id, name, template, openedAt }] }`, newest first, at most **12** | `touch()` on every open / start / restore |
| `alloy.settings`      | `alloy.settings/1`  | the settings document (§11.6)                                         | the settings store on every change                |

`projectKey(id)` is the one place the project key is spelled.
`parseRecentIndex(text)` accepts only a document of that schema whose
entries have a non-empty string `id`, a string `name`, a string `openedAt`
and (if present) a string `template`; anything else in the list is dropped
entry by entry, a document that is not an index at all yields `null` (the
list is then empty — never a crash, never an invented entry). The index is
a convenience: a write failure there (`lifecycle.indexError`) never loses a
project, whose own key is written separately.

The lifecycle is pure with respect to the browser: `attach({ storage, now,
newId })` injects the `StorageAdapter` (§10.3; `null` when the browser has
none), an ISO-8601 clock and an id source; the shell gives it
`localStorage`, `Date` and `crypto.randomUUID` (ids `project-<uuid>`; the
fixture keeps `session-fixture`). Reads are synchronous — the only adapter
in this build is; an asynchronous adapter is reported as `no-storage`, not
awaited.

### 11.4 Statuses, reopening, start-empty, restore

Every listed entry is **judged against what is actually stored** each time
Home renders (`lifecycle.recent()` → `RecentView[] = { entry, status }`):

| `status.kind`  | `reason`           | meaning / what Home prints                                                        |
| -------------- | ------------------ | --------------------------------------------------------------------------------- |
| `current`      | —                  | the open project ("Open now")                                                     |
| `ready`        | —                  | a readable, matching manifest of a known template: the **Open** key is offered    |
| `unavailable`  | `no-storage`       | no storage in this browser (or an asynchronous adapter)                           |
|                | `missing`          | "No saved copy in this browser"                                                   |
|                | `damaged`          | "The saved copy is not a readable project" (not a manifest)                       |
|                | `mismatch`         | "The saved copy belongs to a different project" (manifest id ≠ entry id; or an identity the template refuses) |
|                | `unknown-template` | "The saved copy's structure is not one this build can rebuild" (no / unknown `template`, see §11.1) |
|                | `invalid`          | the rebuilt project fails the routing rules (§7) — with the rule's message        |

An unavailable entry has no Open key and is never presented as reopenable;
its reason is printed. Nothing is ever fabricated for it.

**Reopening** (owner, D4.1.1) = the entry's template rebuilt under the saved
identity + the saved values applied through the field registry's validated
setters: `isValidValue` per field type (§10.1) plus the two rules only the
project knows (an `output` must be `master` or one of its buses; a send
`to` must be `null` or one of its Returns; a `sourceTypeId` must belong to
the track's family), then `validateGraph` over the whole result. A value
that fails keeps the template's value and is reported in `skipped` (by
field path); the next save writes the corrected manifest. Only then does
the store take it (`loadProject`). `lifecycle.open(id)` returns `{ ok:
true, id, applied, skipped }` or `{ ok: false, reason, detail }` (`reason`
also `current` — the open project is never reopened over itself — or
`unknown` — not in the index); the current project is untouched by a
refusal.

What a reopened project **cannot** carry: channel structure. The manifest
holds identity and field values only (§10.3), so a reopened project is its
template with values — exactly enough for the two templates that exist
(the fixture session and the empty project). Imported projects (Phase 5)
will need the manifest to carry their tracks; the `template` field is where
that generalises. This is a documented boundary, not a loader for arbitrary
projects.

**The switch** (`install`): `loadProject(next)` → `autosave.retarget(key,
storedText)` → `touch(next)`. Before it, `ensureStored()` flushes whatever
autosave holds for the outgoing project and — for a project that was never
edited, which autosave has nothing to say about — writes its first copy
(the template's values under its identity) so that the entry Home lists
for it is one that can be reopened. Autosave's bookkeeping is not touched
by that write: its next comparison is against the same text.

`loadProject(next)` in the store replaces the one tree's contents (identity,
the three channel lists, the arrangement), forgets the per-channel views
and the clipboard (its payload was another project's), rebuilds the field
registry **in place** (same array, new entries — every importer keeps its
reference), rebinds history (`history.rebind(fields)`: stacks emptied, the
loaded values are the baseline, reported as a `clear` event — a reopened
project starts with nothing to undo) and re-arms the observer over the new
fields. `autosave.retarget(key, savedText)` cancels any pending save,
writes under the new key from now on and counts the present revision as
saved; `savedText` is what storage already holds (the manifest reopened
from, the copy written at creation, or `null` when nothing is known to be
stored so the first save writes). Both additions are backward-compatible:
no existing signature changed.

**Start empty** (`lifecycle.startEmpty()`): a fresh id from the shell
(re-drawn until it is unused), `createEmptyProject`, the manifest written
**at once** under its key, then the switch. Returns `{ ok: true, id, name,
stored, error }` — `stored: false` with the reason when storage refused or
is absent (the project is still open; Home says it could not be saved). No
edit of the previous project carries over: the previous project was flushed
and is listed as `ready`; the new one has 0 fields.

**Restore at start** (owner, D4.1.1; `lifecycle.restoreLast()`, called by
the shell before the app mounts): the newest index entry is reopened when
its saved copy is valid → `{ outcome: "restored", id, skipped }`; otherwise
the store keeps the fixture session it booted with → `{ outcome:
"fixture", id, because }` with `because` ∈ `no-storage | no-entries |
<UnavailableReason>`. Either way the open project is recorded in the index
(and given its first copy), so a fresh browser lists exactly one entry: the
fixture session, `current`. The dev fixture workflow is therefore unchanged
for a fresh visit, and always one click away from Home afterwards.

### 11.5 Empty states and routes

`project.isEmpty` (no tracks, Returns or buses) makes each room render
`EmptyProjectNotice` (`[data-empty-project=<room>]`, one line, a link back
to Home) **instead of** its channel UI — Console: the channel-bank zone
(the meter bridge and transport stay, see the limitation in the report);
Arrange: the whole room (its header is per-track); Mixer: the layout. No
room is redesigned: the notice is the Mixer detail's empty-state housing.

Routes (owner, D4.1.3): Home `#/` (also the empty hash, `#`, and anything
unrecognised — before Home existed the fallback was the Console), Settings
`#/settings`, rooms unchanged (`#/arrange`, `#/console`, `#/mixer`), the
playground `#/dev/components`. Neither Home nor Settings is a room: both are
absent from `ROOMS` and the room tabs; the wordmark is the way Home, the
header carries a Settings link beside the tabs. The shell element carries
`data-route=home|settings|room|dev-components`. Home and Settings scroll as
a page (the rooms stay pinned to the viewport).

### 11.6 The settings document (`settings.svelte.ts`, `preferences.css`)

```
alloy.settings = {
  schema: "alloy.settings/1",
  hardwareProfile: "auto" | "lite" | "standard" | "performance",   // default "auto"
  export: { fullMix: boolean, stems: boolean, buses: boolean },    // default { true, false, false }
  motion: "system" | "reduced",                                    // default "system"
  onboarding: "pending" | "skipped" | "done"                       // default "pending"
}
```

`parseSettings(text)` is field by field: anything missing, malformed or
outside the vocabulary becomes its default; a text that is not a settings
document at all yields `null` (then everything is default). The document
is written on every change (`settingsOps.setHardwareProfile / 
setExportOutput / setMotion / skipGuide / finishGuide / showGuideAgain /
resetAll`), never on attach — `alloy.settings` does not exist until the
first change. `attachSettings(adapter)` reads once and reports
`settings.storage = { attached, storage, loaded, error, writes }`;
`detachSettings()` stops all writes (tests). Without storage the settings
last for the visit and Settings says so.

**What is operational in this build and what is stored for later:**

| preference                 | stored | read by                                                                                                  | status                                                                                                        |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `hardwareProfile`          | yes    | nothing yet                                                                                              | **not yet operational** — the engine and its benchmark (plan §11, Phase 5.2) will read it; `auto` = "the profile the benchmark selects"; the Settings panel prints the plan's intents only, no invented numbers |
| `export.fullMix/stems/buses` | yes  | nothing yet                                                                                              | **not yet operational** — the default selection of the plan §12 output types for the export that arrives with rendering; format is **WAV only** (a fact printed, not a preference); the destination folder is chosen at export time (plan §12), not stored |
| `motion`                   | yes    | the shell → `<html data-motion="system|reduced">` → `preferences.css`                                     | **operational now** — `reduced` sets every animation / transition to 0.01 ms, one iteration, no delay (`!important`), on top of the components' own `prefers-reduced-motion` handling; `system` leaves the media query to decide |
| `onboarding`               | yes    | Home (shows the guide while `pending`), Settings ("Show again" → `pending`)                               | **operational now**                                                                                           |

The motion attribute is mirrored at install and on every change and removed
at uninstall; it is a `data-` attribute, not a class, so no stylesheet other
than `preferences.css` has to know about it. Keyboard access, the visible
focus ring and the semantic labels are the approved components' own; the
preference changes none of them.

### 11.7 Not in this build (by design)

Forgetting, renaming or deleting an entry; a save-status indicator;
project-level undo of a switch; more than one project open; import of
projects with their own channel structure (Phase 5); any reading of the
hardware profile or export preferences (Phase 5). Listed as approval items
in `task-reports/4.1-report.md`.
