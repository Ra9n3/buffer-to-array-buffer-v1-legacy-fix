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
| `hardwareProfile`          | yes    | `hardware.svelte.ts` → the analysis queue (Task 5.2, §13.5)                                               | **operational since Task 5.2** — `auto` = the profile the benchmark selects (Standard until a benchmark has run); `lite` / `standard` / `performance` override the measurement (`hardware.profile.source: "override"`) and size the engine's slices; the Settings panel prints the plan's intents only, no invented numbers |
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

## 12. Imported audio: assets, peaks and the import pipeline (Task 5.1)

Phase 5's first step over the approved Phase 4 state: real stems come in
through the Arrange room, are judged by the plan's rules (§11 of the plan,
L497–515), copied into project-owned browser storage, fingerprinted,
reduced to bounded waveform peaks and appended to the open project as
tracks. Nothing here plays, analyses or processes audio — no Web Audio, no
DSP, no analysis values (Phase 5.2+). Files: `src/lib/audio/wav.ts`,
`src/lib/audio/import-rules.ts`, `src/lib/audio/peaks.ts`,
`src/lib/audio/asset-store.ts`, `src/lib/arrange-audio.ts`,
`src/lib/project/import.ts`, `src/lib/project/assets.svelte.ts`,
`src/components/ArrangeImportBand.svelte`. Decisions: `decisions-log.md`
D5.1.1–D5.1.12.

### 12.1 The model: `Track.audio` and a nullable role

```ts
interface TrackAudio {
  assetId: string;        // "asset-<uuid>" — the key of the copy and its peaks in the asset store
  fileName: string;       // the file as chosen ("vocal lead.wav"); the track's name is its stem
  sha256: string;         // SHA-256 of the copied bytes; the peaks carry the same fingerprint
  bytes: number;          // size of the copy
  encoding: "pcm" | "float";
  bitDepth: 24 | 32;      // 24-bit PCM or 32-bit float — the plan's two formats
  sampleRate: 48000;      // the only accepted rate
  channels: 1 | 2;        // mono is accepted and flagged; duplicated L/R by the engine later
  frames: number;         // length in sample frames (seconds = frames / sampleRate)
  peakDbfs: number | null;// the sample peak of the file; null when silent
  silent: boolean;        // peak ≤ −80 dBFS: kept, flagged, left out of analysis
  importedAt: string;     // ISO time from the shell's clock
}
```

`Track.audio` is `TrackAudio | null`; every fixture track is `null`, so the
fixture session, its manifest and every approved behaviour are unchanged.
An imported track has no fixture identity to invent, so `Track.role` became
`RoleId | null` (`NO_ROLE` prints "—" / "Not assigned yet" in the rows, the
Mixer identity and the Console) and its `family` / `sourceTypeId` start
empty; tier is `supporting` (the default of D2.5.x); `org` is `neutral`.
The imported track's channel chain is the neutral `createChainState("")`
(no fixture bays pre-filled), its output is Master, its sends `null`.
`TrackAudio` is identity and metadata only — never samples (guarded: no
`Float32Array` / `ArrayBuffer` / `Blob` in `model.ts`).

### 12.2 The format rules (`import-rules.ts`) — the plan's, exactly

| rule                                    | outcome                                   | line printed (then the stamp)                                                                                                    |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| not a WAV (MP3 / FLAC / AIFF / Ogg / text / empty) | `unsupported` → **REFUSED**           | "This is an MP3 file, not a WAV file; re-export the stem as a 48 kHz WAV, 24-bit or 32-bit float"                                |
| WAV, compressed (ADPCM, µ-law, …)       | `unsupported` → **REFUSED**                | "… — a compressed WAV; re-export …"                                                                                              |
| WAV, not 24-bit PCM / 32-bit float      | `unsupported` → **REFUSED**                | "44.1 kHz · 16-bit PCM · stereo — ALLOY takes 24-bit PCM or 32-bit float; re-export …"                                           |
| WAV, not 48 kHz                         | `unsupported` → **REFUSED**                | "… — ALLOY works at 48 kHz and does not resample; re-export …"                                                                   |
| more than two channels                  | `unsupported` → **REFUSED**                | "… — a stem is mono or stereo; re-export it as mono or stereo"                                                                   |
| truncated / damaged header / data       | `corrupt` → **UNREADABLE**                 | "The file ends before its audio data does (3,456,000 bytes announced, 1,151,529 present) — the file is truncated"                 |
| float data with NaN / ±Infinity         | `corrupt` → **UNREADABLE**                 | "1 sample is not a number — the float data is damaged"                                                                          |
| the browser could not read / store it   | `failed` → **FAILED**                      | "could not be read: …" · "could not be stored: …" · "could not be fingerprinted: …"                                              |
| mono                                    | `added` + flag `mono` → **MONO** stamp      | "… · mono · played on both sides"                                                                                               |
| silent (peak ≤ −80 dBFS, `SILENCE_PEAK_DBFS`) | `added` + flag `silent` → **SILENT**  | "… · silent — kept, left out of analysis"                                                                                       |
| shorter than 1 s (`SHORT_SECONDS`)      | `added` + flag `short`                     | "… · very short — processed as one buffer"                                                                                      |
| shorter than the longest stem           | `added` + flag `padded` → **PADDED** stamp  | "… · shorter than the longest stem — padded to 0:12.0"                                                                          |

An accepted line reads `m:ss.s · 48 kHz · 24-bit PCM · stereo` followed by
its flags. The rules are constants, not a list a caller can widen:
`ACCEPTED_SAMPLE_RATE = 48000`, `ACCEPTED_FORMATS = ["24-bit PCM", "32-bit
float"]`, `MAX_CHANNELS = 2`. Nothing is resampled or converted. The format
is judged (`judgeFormat`) **before** any sample is read; `wav.ts`'s sample
reader is a general reader used by the peak pass and the tests, never a
gate. "Padded" is computed at render (the room compares each stem with the
longest) and in the report at import; no silence is written anywhere.

### 12.3 The copy (`asset-store.ts`) — IndexedDB `alloy`

One `AssetStore` interface (`name`, `put`, `getAsset`, `getPeaks`, `list`,
`remove`), two implementations: `memoryAssetStore()` for the node tests
and `indexedDbAssetStore(indexedDB)` for the browser — database **`alloy`**,
version 1, object stores **`assets`** and **`peaks`**, both keyed by
`assetId` (owner, 2026-11-02). `put(asset, peaks)` writes both records in
one transaction. *(Task 5.2 raised the database to version 2 by adding the
`analysis` store, §13.4; `assets` and `peaks` and their records are
untouched, and a version-1 database upgrades in place with its stems.)*

```ts
interface AssetRecord { assetId; projectId; fileName; mimeType; size; sha256; format: AssetFormat; importedAt; bytes: Blob }
interface PeaksRecord { assetId; sha256; peaks: PeakData }
```

The copy is the file's bytes, untouched (evidence: `blobSize === size`
and an in-browser SHA-256 of the stored Blob equals `TrackAudio.sha256`
for every stem). IndexedDB is reached in `asset-store.ts` and handed over
by the shell only (`const idb = win.indexedDB; return idb ?
indexedDbAssetStore(idb) : null;`); every other module receives the store.
Without IndexedDB (`assets.attached === false`) the band refuses the import
with one line and nothing is added; a reopened project's imported tracks
print **MISSING**.

### 12.4 The peaks (`peaks.ts`) — bounded, from the samples, under the fingerprint

```ts
interface PeakData {
  schema: "alloy.peaks/1"; sampleRate; channels; frames;
  framesPerBucket: 960; perSecond: 50; bucketCount;   // ceil(frames / 960)
  data: Int8Array[];      // one per channel, 2 × bucketCount: [min₀, max₀, min₁, max₁, …] in 1/127
  channelPeak: number[]; peak: number; nonFinite: number;
}
```

`computePeaks(bytes, format)` walks the data chunk in slices (480 000
frames at a time, never one allocation of the whole file), through the
24-bit / float reader, and keeps the signed min / max of each 20 ms bucket
scaled to Int8 — 2 bytes per bucket per channel: a 5-minute stereo stem is
≈ 60 kB, a 12 s one 2 400 B (evidence), whatever the file's size; the PCM
is never kept. Non-finite float samples are counted (`nonFinite`) and make
the file `corrupt`. `peaksPath()` turns a channel into one SVG path (the
lane draws it); `isPeakData()` validates a record read back. The peaks are
stored under the asset's `sha256`; on reopen a record whose fingerprint
differs from `TrackAudio.sha256` counts as missing.

### 12.5 The pipeline (`import.ts`, `assets.svelte.ts`)

`importFiles(sources, ctx)` — pure of the browser (`ctx` carries the
store, the id source, the clock, `yieldBetween` and `onProgress`) — for
each file in batch order: read → `inspectWav` → `judgeFormat` →
`computePeaks` → `sha256Hex` → `store.put` → `createImportedTrack`. A
file that fails any step gets its line and **nothing else happens for it**
(no record, no track); the batch continues. After the batch the longest
accepted length is known, so the shorter stems' lines gain `padded`. The
result is `{ projectId, lines, stems, added, refused }` with `lines` in
batch order.

`assets` (module-level `$state`, a `.svelte.ts` store beside `project`):

| member                                   | does                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attach(store, { newId, now, yieldBetween? })` / `detach()` | the shell attaches the IndexedDB store before the lifecycle attaches and detaches it after `lifecycle.detach()`; the tests attach the memory store                                              |
| `attached`, `storeName`                  | `false` / `null` without IndexedDB                                                                                                                                                                             |
| `statusOf(trackId)`                      | `"pending" \| "ready" \| "missing"` for an imported track of the open project; `null` for a fixture track                                                                                                     |
| `hydrate()`                              | after every project switch (`install()` ends `void assets.hydrate()`): clears the status map, reads each imported track's peaks (awaited one at a time; abandoned if the project changes mid-way), sets the track's clip from them, marks `ready` / `missing` |
| `importBatch(sources, onProgress)`       | the pipeline against the open project; the accepted stems appended **in one structural change** (`appendTracks(tracks, arrangement)` → the registry grows by 50 fields per track, history is rebound), their clips set from the peaks just computed; throws when detached; if the project switched during the read the copies stay stored under the old project id and the lines say "stored, not added" |

Tracks are appended with the next free code after the project's last
(`nextTrackCode`: the fixture's 21, 22, …; an empty project's 01, 02, …)
and `track-<code>` ids; the stem name is the file name without `.wav`.
Imported tracks sit in the session's order after the existing ones.

### 12.6 The timeline (`arrange-audio.ts`, `arrange-timeline.ts`)

An empty project has no tempo; the first imported stem gives the
arrangement `DEFAULT_TEMPO = { bar: 1, bpm: 120, signature: "4/4" }`
(owner, 2026-11-02) and `barCount = ceil(longest stem in bars)`; the
fixture keeps its markers and 56 bars (a 12 s stem is 6 bars there too).
Every stem starts at bar 1. An imported clip is `{ clipId: "<code>-audio",
source: "audio", kind: "audio", startBar: 1, barCount, channels, seconds,
waves }` with its waveform drawn from the stored peaks at 32 points a bar;
fixture clips carry `source: "fixture"` and are drawn as before. The lane
prints `data-clip-source`, the header's ruler numerals come from
`rulerLabels(barCount)` and its sections from the project (none for an
imported project), and a row with audio is `data-simulated="false"` with
the stamps **MONO · SILENT · PADDED · MISSING** (MISSING = the warning).

### 12.7 Persistence and the lifecycle

The manifest (`alloy.project-manifest/1`, §10.3) gains an **optional**
`tracks` block — `[{ id, code, name, org, audio: TrackAudio }]` — written
only when the project has imported tracks; the fixture's and an empty
project's manifests are byte-for-byte what Task 4.1 wrote. Reopening =
template + imported tracks (`withImportedTracks`, validated field by field
by `isTrackAudio`; a duplicate id / code or a bad block → `damaged`) +
saved values (D4.1.1); then `hydrate()` brings the waveforms back from the
store. Imported tracks' 50 fields each are in the registry, so their
Console / Mixer values autosave and reopen like the fixture's. Import is
**not undoable** (the history is rebound by the structural change, D5.1.4);
the clips are UI state, not fields. The asset records carry `projectId` but
the store is one per browser: the project's structure is what binds an
asset to a project, and a project switch clears the status map and the
band's report, so nothing of one project shows under another (evidence:
a new empty project after an import has no tracks, no statuses, no
report; reopening the imported project brings all five back `ready`).

### 12.7a Home after an import

Home's counts line is the project's state ("2 tracks · 0 Returns · 0
buses"); the template label beside the name and in the recent list is the
project's **starting point, said as such** — `TEMPLATE_LABELS` is
"Started empty" / "Started as the development session" (owner, 5.1 review,
D5.1.13) — so a project started empty that now carries stems is never
called empty. The `template` field itself is unchanged (§11.1).

### 12.8 Not in this build (by design)

Playback, analysis, the hardware benchmark *(both arrived with Task 5.2,
§13)*, EQ / compression / reverb /
delay, rendering; drag-and-drop import; removing an imported track or its
copy; renaming; import of projects; an undo of an import; any text other
than the band's line and the row's stamp for a validation result. Listed
as approval items in `task-reports/5.1-report.md`.

## 13. The analysis engine, its results and the hardware profile (Task 5.2)

Phase 5's second step on the approved Task 5.1 state: the measurements the
plan's §7 lists for the analysis engine (L295–335 — level and loudness,
energy by band, transient activity, stereo image, integrity, "time-based
measurements, not only whole-song averages"), computed over the stems Task
5.1 stored, kept with them, and the benchmark-based hardware profile and
time-estimate logic of plan §11 (L463–481 — "measured, not promised").
Owner decisions (`ask_user`, 2026-11-02, D5.2.1–D5.2.3): analysis runs
**automatically in the background** — after an import and as a catch-up
when a project opens, queued one stem at a time, yielding between slices;
the benchmark is **lazy** — measured once before the first analysis of a
session and cached in `localStorage` under **`alloy.benchmark`** for 30
days, re-measured when the engine version changes; the Settings panel's
note was corrected (it no longer says "not yet operational"). No room
reads a result yet; the debug handle (`?debug`) exposes everything and the
Console's status band / the rules of Phase 6 are the readers to come.

Modules — the engine is pure TypeScript with no browser API in it
(`src/lib/analysis/`): `fft.ts` (a radix-2 complex FFT, two real frames
per transform), `filters.ts` (BS.1770 K-weighting biquads, the true-peak
interpolator), `loudness.ts` (gates, windows, loudness range), `spectral.ts`
(frames, bands, centroid), `transient.ts`, `stereo.ts`, `integrity.ts`,
`decode.ts` (reading a stored copy by frame range), `analyser.ts` (the
one-pass `Analyser` and the result record), `analyse.ts` (the sliced,
yielding, abortable driver), `profiles.ts`, `benchmark.ts`. The project
side: `src/lib/project/hardware.svelte.ts` (the benchmark cache and the
profile in use), `src/lib/project/analysis.svelte.ts` (the queue), the
`analysis` store in `src/lib/audio/asset-store.ts`, and three hand-overs
(`assets.svelte.ts` → `afterImport`, `lifecycle.ts` → `analysis.hydrate()`,
`shell.ts` → the wiring).

### 13.1 One streaming pass, one common grid

`Analyser` takes a stem's decoded channels in pushes of any length and at
`finish()` returns `AnalysisResult`: every figure as a whole-stem scalar
*and* as a series on one grid of **100 ms cells** (`CELL_SECONDS 0.1`,
4 800 frames at 48 kHz; `cellCount = ceil(frames / 4800)`, the last cell
may be partial). Every filter, window and block carries its state across
pushes, so the slicing never changes a figure — `analyse-engine.test.mjs`
holds a busy stereo stem and a mono one to byte-identical results under
one pass, 100 ms slices and 0.7 s slices; that is what lets the hardware
profile choose the slice length (§13.5) without touching the measurement.

The driver `analyseSource(source, { sliceFrames, yieldBetween, signal,
onProgress })` reads the stored copy through a `ByteSource` (`decode.ts`:
the Blob's `.slice`, the header out of the first 64 kB with Task 5.1's
`inspectWav(head, size)`, then samples by frame range — the file is never
whole in memory), decodes 24-bit PCM / 32-bit float exactly as Task 5.1
does (no resampling, no conversion, D5.1.3), yields between slices
(`yieldBetween`, a macrotask in the browser so the page paints), reports
`onProgress(fraction)` per slice and stops at `signal.aborted` with
`AnalysisAborted`. `DEFAULT_SLICE_SECONDS 5`. A copy that is not a WAV, is
truncated or has a bad header is an error with Task 5.1's reason, never a
partial result. A mono stem's channel is measured as itself for the
per-channel figures and counted on both sides for loudness (it plays
duplicated on L/R, D5.1.3); its stereo image is "not applicable".

**Conventions:** scalars are `number | null`, null meaning *not
measurable* (no complete window, no energy, nothing on one side); series
are `Float32Array`s of `cellCount` entries holding **−∞** where a cell has
no energy and **NaN** where a figure is undefined (a correlation with one
side silent, a crest with no RMS). Levels are dBFS re full scale
(`dbfs(1) = 0`), loudness in LUFS / LU, times in seconds.

### 13.2 The record — `alloy.analysis/1`

```ts
AnalysisResult = {
  schema: "alloy.analysis/1", engineVersion: 1, cellSeconds: 0.1, cellCount,
  format: { encoding, bitDepth, sampleRate, channels, frames, seconds },      // echoed from the copy's header
  level: {
    samplePeakDbfs, channelPeakDbfs[], truePeakDbtp, rmsDbfs, channelRmsDbfs[], crestFactorDb,
    integratedLufs, momentaryMaxLufs, shortTermMaxLufs, loudnessRangeLu,
    rmsDbfsCells, peakDbfsCells, momentaryLufs, shortTermLufs               // Float32Array per cell
  },
  spectral: {
    bands: BandDef[6], bandDb: Float32Array[6] (per band, per cell), bandMeanDb[6],
    centroidHz (per cell), centroidHzOverall, balance: { low, mid, high } | null
  },
  transient: { fluxDb, crestDb (per cell), onsetSeconds: Float32Array, onsetCount, onsetsPerSecond, meanFluxDb },
  stereo: {
    applicable, correlation, balanceDb, widthDb, monoLossDb, minCorrelation, fractionNegative,
    correlationCells, balanceDbCells, widthDbCells                           // per cell; empty for mono
  },
  integrity: {
    channels: [{ dcOffset, dcOffsetDbfs, fullScaleSamples, clippingRuns, longestClippingRun, nonFinite }],
    clipped, truePeakOverCells, nonFinite, silent, nearSilent, silentCells, silentFraction,
    leadingSilenceSeconds, trailingSilenceSeconds, activeSeconds, analysisTarget
  }
}
```

`ENGINE_VERSION` is bumped when a measurement's *definition* changes;
stored results of an older engine are measured again (§13.4). The
`analysis.svelte.ts` test holds a record through a store round-trip and the
browser evidence holds the typed arrays through IndexedDB's structured
clone (`Float32Array` in, `Float32Array` out).

### 13.3 The measurements, category by category (plan §7)

**Level and loudness** (`filters.ts`, `loudness.ts`). Sample peak per
channel and overall; **true peak** by 4× oversampling (`TRUE_PEAK_OVERSAMPLING
4`, a Blackman-windowed sinc split into four phases of 12 taps,
`TRUE_PEAK_TAPS 12`, each normalised to unit DC gain) — the four phases sit
between the samples (±1/8, ±3/8), so the detector also takes the sample
itself: a true-peak reading is never below the sample peak (the Task 5.1
click, a lone full-scale sample, read −0.24 dBTP in the first browser run
and reads 0.00 now; the 12 kHz tone sampled at 45° still reads its ≈ 3 dB
of inter-sample peak within 0.25 dB). RMS overall and per channel; crest
factor = peak / RMS in dB. Loudness per **ITU-R BS.1770-4**: the published
K-weighting (pre-filter + RLB biquads at 48 kHz; +0.69 dB at 1 kHz, which
is the −0.691 offset's reason), momentary = 400 ms = `MOMENTARY_CELLS 4`,
short-term = 3 s = `SHORT_TERM_CELLS 30` (sliding over the cell powers;
cells before the first complete window are −∞), integrated with the −70
LUFS absolute and −10 LU relative gates, loudness range per EBU Tech 3342
(short-term blocks, −70 absolute / −20 LU relative gate, 10th–95th
percentile spread). Calibration held by test: a 0 dBFS 997 Hz sine in one
channel reads −3.01 LUFS, in both channels at −20 dBFS reads −20.0 LUFS; a
mono stem reads +3 dB over the same signal in one channel of a stereo
file (it plays on both sides).

**Energy by band over time** (`fft.ts`, `spectral.ts`). 4 096-point Hann
frames (`FFT_SIZE 4096`), hop 2 400 (`FRAME_HOP 2400`, two frames per cell),
two real frames per complex transform, Parseval normalisation (band dB =
dB of the band's RMS re full scale: a −20 dBFS tone reads −23 dB in its
band). The spectrum is the **mid signal's** ((L+R)/2; a mono stem's own
channel), so anti-phase content has none — said as such in the tests.
Bands: Sub 20–60 · Low 60–250 · Low-mid 250–500 · Mid 500–2 000 · High-mid
2 000–6 000 · High 6 000–20 000 Hz; `bandDb` per band per cell, `bandMeanDb`
as the mean over the cells whose frames carry energy (so the silence
between a sparse stem's hits does not dilute its balance; judged on the
frames themselves, since a frame is attributed to the cell under its
centre — the Task 5.1 click's one sample lands in a frame centred in the
cell before it), the spectral centroid per cell and overall, and the
three-way `balance` as energy fractions (low = Sub + Low, mid = Low-mid +
Mid, high = High-mid + High), null for a stem with no energy. The Hann main
lobe spans ±23 Hz, so a 40 Hz tone leaks a little (≈ −56 dB) into Low —
measured, not hidden.

**Transient activity and short-time energy change** (`transient.ts`). On
the mid signal, 10 ms blocks (`BLOCK_SECONDS 0.01`, 480 frames): block
energy in dB (floor `ENERGY_FLOOR_DB −120`) and the positive change from
the previous block — the log-energy flux. A block is an **onset** when the
flux reaches `ONSET_FLUX_DB 6`, the block is above `ONSET_FLOOR_DBFS −60`
and `ONSET_SPACING_BLOCKS 5` (50 ms) have passed since the last. Per cell
the largest flux (`fluxDb`) and the cell's crest (`crestDb`, peak over RMS);
`onsetSeconds` as times, `onsetCount`, `onsetsPerSecond` over the active
seconds, `meanFluxDb`. A steady tone that starts at t = 0 has one onset
(its start) — the engine says what it measured. Thresholds are
provisional, for Phase 6 to tune against real stems (D5.2.8).

**Stereo image** (`stereo.ts`). Per cell the engine keeps Σ L·R, Σ L² and
Σ R²; from them the Pearson **correlation** (the meter of D2.1.4), the
left/right energy **balance** in dB, the **width** as side-to-mid energy in
dB and the **mono loss** (the fold-down's level against the two channels'
energy). Whole-stem figures from the sums, plus `minCorrelation` and
`fractionNegative` over the cells with energy. Dual mono: +1 / 0 dB / no
side energy (width null) / no loss; anti-phase: −1 and total cancellation;
one side silent: correlation and balance null (the channel levels say so).
A mono stem: `applicable: false`, every figure null, empty series — never a
fictitious correlation of 1.

**Integrity** (`integrity.ts` and the analyser). Per channel the DC offset
(the mean; in dBFS with a floor of `DC_FLOOR_DBFS −144`, below which it is
reported as none), runs of samples at or beyond `CLIP_LEVEL 0.9999` of the
same sign (`CLIP_RUN_SAMPLES 3`: three or more consecutive full-scale
samples is a flattened waveform, not a loud peak — a sine that touches
0 dBFS is not clipped, a square wave is, a float stem over 1.0 is), the
count of non-finite float samples (treated as zero and counted; Task 5.1
refuses such files, so a count here is a stored copy that changed).
`truePeakOverCells` counts the cells whose true peak passes 0 dBTP.
Silence keeps Task 5.1's rule: a stem whose peak never rises above
`SILENCE_PEAK_DBFS −80` is `silent` and **not an analysis target**
(`analysisTarget false`, D5.1.4 — it is still measured, so the record
exists and says so); `nearSilent` is a peak at or under `NEAR_SILENT_PEAK_DBFS
−60` (a target, flagged); a cell is silent when its peak is at or under
−80 dBFS, giving `silentCells`, `silentFraction`, the leading and trailing
silence in seconds and `activeSeconds`. The copy's format is echoed.

**Edge cases held by test:** digital silence (every figure null, −∞
series, not a target); a mono float stem; a 0.3 s click (a peak and an
RMS but no complete loudness window, so no LUFS — null, not a guess); a
left-only stem; anti-phase; a copy that is missing, swapped, truncated or
not a WAV.

### 13.4 Storage — the `analysis` store, IndexedDB `alloy` version 2

```ts
interface AnalysisRecord { assetId; projectId; sha256; engineVersion; analysedAt; elapsedMs; result: AnalysisResult }
```

`ASSET_DB_VERSION 2`: `onupgradeneeded` adds the object store **`analysis`**
(keyed by `assetId`, index `projectId`) and leaves `assets` and `peaks` as
they are — a version-1 database upgrades in place with its stems
(evidence: five assets and five peaks before, the same five plus five
analysis records after). `AssetStore` gains `putAnalysis(record)` and
`getAnalysis(assetId)`; `remove(assetId)` deletes the analysis with the
copy and the peaks. One record per asset, overwritten on re-analysis. The
record carries the stem's **SHA-256** and the **engine version**: a stored
result is valid for a track only when `record.sha256 === track.audio.sha256`,
`record.engineVersion === ENGINE_VERSION` and `result.schema ===
"alloy.analysis/1"`; anything else is measured again. The manifest
(`alloy.project-manifest/1`) is **unchanged** — no analysis figure is in
`localStorage` (evidence: the saved project text mentions none).

### 13.5 The hardware profile and the benchmark (`profiles.ts`, `benchmark.ts`, `hardware.svelte.ts`)

Plan §11's Lite / Standard / Performance are intents, never promises. What
a profile changes in this task is the **slice length** of the chunked pass:

| profile       | `sliceSeconds` | chosen when (provisional, D5.2.5)                                                   |
| ------------- | -------------- | ------------------------------------------------------------------------------------ |
| `lite`        | 2              | measured throughput below 25× real time                                              |
| `standard`    | 5              | otherwise — and **before any benchmark has run** (`UNMEASURED_PROFILE`)              |
| `performance` | 10             | throughput ≥ 100× and, where the browser reports them, ≥ 4 cores and ≥ 4 GB memory  |

The figures are identical under every profile (§13.1; the browser evidence
re-measures the kick under Lite and compares the whole result). The
**benchmark** runs the real engine over a deterministic synthetic stem —
`BENCHMARK_WORKLOAD_SECONDS 4` of 24-bit PCM stereo with tones, noise and
clicks, so the decode is measured too — and reports the throughput as
seconds of audio per wall-clock second:

```
alloy.benchmark = { schema: "alloy.benchmark/1", engineVersion, measuredAt, workloadSeconds,
                    elapsedMs, throughput, profile, cores, memoryGb }
```

`hardware.attach({ storage, now, nowMs, clock, cores, memoryGb, yieldBetween })`
reads the cache once; `parseBenchmark` accepts a record only from this
engine version, with this machine's core count, measured within
`BENCHMARK_MAX_AGE_MS` (30 days) and not more than a minute in the future.
`hardware.ensure()` returns the cached record or runs the workload once
(concurrent callers share the run), writes the cache and counts `runs`;
`hardware.invalidate()` forgets it. The benchmark is **lazy**: the queue
calls `ensure()` before the first stem it actually analyses — after the
copy is known to exist, so a missing stem never costs a measurement.
`hardware.profile = { id, source: "override" | "benchmark" | "unmeasured",
settings }`: a Settings choice other than Automatic overrides the
measurement; Automatic follows the benchmark; before one, Standard.
`cores` / `memoryGb` are `navigator.hardwareConcurrency` / `deviceMemory`
read in the shell only, null where a browser does not report them.

**The estimate:** `estimateSeconds(workSeconds, record) = ceil(workSeconds /
throughput × ESTIMATE_MARGIN 1.25)`; **null without a measurement** — no
number nobody measured (plan §11; the shell test "no measurement, no
estimate"). `analysis.estimate = { workSeconds, seconds, profile, basis:
"benchmark" | "unmeasured" }` sums the queue (the running stem's remainder
by its progress).

### 13.6 The queue (`analysis.svelte.ts`) and the lifecycle

Statuses per imported track: `pending` (reading the store) · `queued` ·
`analysing` (with `progress`) · `ready` (result in hand; `stored: false`
with the reason when the write was refused) · `missing` (no copy, or not
the manifest's copy) · `failed` (the engine or the copy was unreadable,
with the reason). `analysis.attach(assetStore, { now, clock, yieldBetween })`
— the clock is **injected** (no project module reads `performance.now` or
`Date.now`; the editing guard holds that). `hydrate()` — called by
`lifecycle.install()` after `assets.hydrate()` — reads every imported
track's record, keeps the valid ones as `ready` without re-measuring and
queues the rest; reads are awaited one at a time with the project id
checked after each, so a switch mid-way stops cleanly. `enqueue(ids)`
(called by `assets.svelte.ts` after an import through `afterImport`) skips
what is ready, queued or running; `reanalyse(id)` forces a run; the
worker runs **one stem at a time** (`current`, `queued`), yielding between
slices. A project switch or `detach()` bumps the generation and aborts the
run in flight: its result is dropped and never written under the next
project. `statusOf / entryOf / resultOf / summary / estimate` are the
readers. The debug handle (`?debug`) exposes `window.alloy.analysis` and
`window.alloy.hardware`; `uninstall()` detaches `lifecycle → analysis →
assets → hardware → settings`.

Measured in the browser (`evidence/analysis/5.2/analysis-5.2.json`,
headless Chromium, 2 cores / 2 GB reported): the five Task 5.1 stems
(39.6 s of audio) analysed in ≈ 0.6 s after a 4 s-workload benchmark of
≈ 70–110 ms (throughput 35–60×, profile Standard); the analysis sample
peaks equal Task 5.1's `peakDbfs` for every stem; reload → all five
`ready` from the store with no run; a stale record (engine version 99) is
measured again and a deleted copy is `missing` without a benchmark run; a
cache 31 days old is ignored at boot and renewed by the next analysis.

### 13.7 Not in this build (by design)

Reading a result in any room (the Console's PROCESSING band stays its
fixture), the rules that act on measurements (Phase 6), any processing of
audio (the Tasks 6.1–6.3 DSP modules are isolated and wired to nothing —
§14), playback or rendering; a worker thread (the pass yields on the main thread
— D5.2.10); removing or pruning analysis records with an asset lifecycle
(Task 5.1's open item); re-tuning the provisional thresholds (profiles,
onsets, near-silence) against real devices and stems; the time estimate
shown to the user (plan §11's "estimate before commit" is logic only until
a room prints it).

## 14. The DSP modules — Custom EQ and Dynamic EQ (Task 6.1)

Phase 6's first step: the plan's §8 blocks 3 — "static multiband EQ" — and 4
— "Dynamic EQ for time-varying conflicts or tonal control" — as **isolated,
reusable TypeScript DSP**, tested on their own. Nothing routes audio through
them yet (Task 7.1 assembles the channel chain), no room or store reads them,
no masking logic chooses a band or a key (Task 7.3), and no other EQ type
exists. The documents behind the contract: plan §8 (the chain, the masking
paragraphs L347–385) and §11 (chunking and continuity, L483–487); D2.8.3 /
D2.8.4 (the chain's parameter specs and the four-band EQ); D5.1.1 / D5.1.3
(48 kHz, no conversion); the Task 5.2 conventions (streaming state, null /
−∞ honesty, one constant for one provisional number). `architecture.md` and
`module-contract.md` do not exist in this repository — every task since 0.1
has recorded that — so **this section is the modules' contract**, as §13 is
the engine's.

### 14.1 The boundary, the format and the conventions (`src/lib/dsp/`)

| file | what |
| --- | --- |
| `src/lib/dsp/params.ts` | the documented ranges in one place, and the validation rules (`requireFinite`, `requireInRange`, `requireSampleRate`, `requireChannels`, `DspOptions`) |
| `src/lib/dsp/biquad.ts` | `FilterKind` (`bell` · `shelf-low` · `shelf-high`), the RBJ design at the session rate (`bandCoefficients`, `bandPass` / `lowPass` / `highPassCoefficients`, `magnitudeDb`) and `BiquadSection` — five coefficients, two state variables, `process` for a block and `step` for one sample |
| `src/lib/dsp/buffers.ts` | the buffer contract both modules share: one `Float32Array` per channel, mono or stereo, in place allowed, a named error for every mismatch |
| `src/lib/dsp/eq.ts` | the Custom EQ: the four documented bands, settings, `process`, `reset`, `responseDbAt` |
| `src/lib/dsp/dynamic-eq.ts` | the Dynamic EQ: the same bands plus a depth, a detector, a key input and the reduction reading |

**Audio.** One `Float32Array` per channel, mono or stereo, at the session rate
(48 kHz — the one rate Task 5.1 admits; `sampleRate` is an option so a test
and a later native port can ask for another, and a band at or above Nyquist is
refused). No interleaving, no clipping, no scaling, no dither, no resampling.
`output` may be the same arrays as `input`. Samples are assumed **finite**:
sanitising belongs where the bytes are read (Task 5.1 / 5.2 count non-finite
samples as integrity findings), not in every filter of a render.

**State.** Every section, detector, envelope and indicator carries across
`process` calls. No branch in either module depends on a block boundary, so
one pass and bounded chunks of it produce **bit-identical** samples — the
property plan §11's chunked render (Task 7.4) will lean on. Both suites hold
one pass against blocks of 1, 7, mixed and 1 000 frames.

**Allocation.** Sections, coefficient arrays, envelopes, thresholds and the
reduction reading are built in the constructor. Neither `process` allocates:
no `new`, no array literal, no `slice` / `map` / `subarray` in either path
(the guard checks the two method bodies).

**Determinism.** No clock, no randomness, no browser API, no import from
outside `src/lib/dsp/`; the design is pure arithmetic, so the same settings
and the same samples always give the same samples.

**Validation (the project's own rule).** A value that is not a finite number
is a caller bug and **throws**. A finite value outside a documented range is
**clamped**, as the console's controls already clamp (`fromPosition` /
`setParamValue`, D2.8.3). An unknown kind, an empty or over-long band list, a
channel count other than 1 or 2, a non-boolean bypass, a sample rate that
cannot hold the band (at or above Nyquist) **throw** with the module's name
in the message. `normaliseEqSettings` / `normaliseDynamicEqSettings` return
the clamped setting as a plain object, so what a module will do can be
printed before it is built.

### 14.2 One design, one section (`biquad.ts`)

The three kinds are the documents' (D2.8.4): a **low shelf**, two **bells**
with Q, a **high shelf**. The design is the RBJ audio-EQ cookbook prototype at
the session rate — `A = 10^(gain/40)`, `ω₀ = 2πf/fs`, shelves at slope
`S = 1` — and every section is stored **normalised to `a0 = 1`** as
`[b0, b1, b2, a1, a2]`, the same arithmetic `mixer-chain.ts` draws the Mixer's
curve from. A test runs an impulse through the module and compares the
measured response with `eqResponseDb` (the graph's own function) at eight
frequencies, within 0.05 dB: **the curve and the filter cannot disagree.**

A 0 dB band is set to the exact identity `[1, 0, 0, 0, 0]`, so a neutral band
passes its input through bit for bit rather than through arithmetic that
happens to cancel. The section is transposed direct form II (the analysis
engine's `Biquad`, §13, so the two runners agree); `process` filters a block,
`step` one sample, both on the same coefficients and state.

### 14.3 The Custom EQ (`eq.ts`)

The four console bands by their Task 2.8 ids — `lf` (low shelf) · `lmf`
(bell) · `hmf` (bell) · `hf` (high shelf) — one to four in processing order.

```ts
EqBandSetting  = { kind: "bell" | "shelf-low" | "shelf-high",
                   freq: 20 … 20000 Hz, gain: −15 … +15 dB, q?: 0.3 … 10 }
EqSettings     = { bypassed?: boolean, bands: EqBandSetting[1..4] }
new Eq(settings, { channels?: 1 | 2, sampleRate?: 48000 })
  .process(input: Float32Array[], output: Float32Array[], count?)   // in place allowed
  .reset()
  .responseDbAt(hertz): number                                      // 0 dB while bypassed
  .settings / .channels / .sampleRate / .bandCount
```

`q` is the bell's; a shelf ignores it and uses the slope-1 prototype's
`√½`. The default Q of a bell that names none is 1 (the Mixer's `q ?? 1`).
Every channel has its **own** filter state and the same coefficients, and
nothing in one channel reads another: stereo is processed consistently and
independently. `neutralEqSettings()` is the four documented bands at 0 dB —
exactly flat, the module's "switched in, doing nothing" state. Bypassed, the
module copies its input and touches no state; `responseDbAt` is 0.

Held by test: the drawn curve against the impulse response; a bell's gain at
its centre and only its skirt away from it; frequency moving the peak; Q
setting the width (the half-gain width scales as 1/Q); the shelves' half-gain
corner and untouched far side; neutral and bypassed transparency, bit for
bit; stereo independence and no crosstalk; chunk invariance; determinism and
`reset`; in-place equals out-of-place; the clamps and the throws; a 15 dB
high-Q boost over noise staying finite and bounded.

### 14.4 The Dynamic EQ (`dynamic-eq.ts`)

A dynamic band is an EQ band that can travel **downward** from its static
GAIN by up to `depthDb` — `dynamicDepthDb` is "how far (dB) the band's gain
may be pulled down" (D2.8.4) — so a track can yield space only while it is
needed (plan §8's "sidechain-triggered dynamic EQ dip … only reduced when
needed"). Nothing boosts.

```ts
DynamicEqBandSetting = EqBandSetting & {
  depthDb: 0 … 15,        thresholdDb: −40 … 0 dBFS,
  attackMs: 0.1 … 100,    releaseMs: 10 … 1000 }
DynamicEqSettings    = { bypassed?: boolean, bands: DynamicEqBandSetting[1..4] }
new DynamicEq(settings, { channels?: 1 | 2, sampleRate?: 48000 })
  .process(input, output, count?, key?: Float32Array[])   // key = the sidechain, when there is one
  .reset()  .responseDbAt(hertz)  .gainReductionDb: Float64Array (per band, live)
```

**Detection — two intended uses, one module** (owner, 2026-11-03): with no
`key` the band watches **the signal entering the module**; with a `key` it
watches **the key only**, and the channel it filters is untouched by its own
level. Which track is the key is Task 7.2 / 7.3's routing question — this
module only defines what to do with one.

**The detector is frequency-selective**: the key is band-limited to the band
the module is working on — a bell's **band-pass** at FREQ/Q, a low shelf's
**low-pass** and a high shelf's **high-pass** at the corner (Q = √½). Its
output is squared and **linked across channels by the peak** (the loudest
channel's squared sample), so a transient on one side dips both and the
stereo image does not shift. A one-pole envelope in the **power** domain
follows it with the band's attack when it rises and its release when it
falls; the envelope is compared with `10^(threshold/10)`.

**The law is full depth** (owner, 2026-11-03): at or above the threshold the
band's gain is `gain − depthDb`, below it `gain`; the amount does not depend
on how far over the threshold the key is. Attack and release shape the move.
Two provisional constants keep that law from clicking:

- `DETECTOR_SWITCH_SLEW_MS = 2` — the indicator itself moves on a 2 ms
  one-pole, so a binary crossing becomes a ramp (a 15 dB step would be a
  click). It is short enough that the documented attack still dominates.
- `GAIN_REDESIGN_STEP_DB = 0.01` — the section is redesigned only when the
  gain has moved by 0.01 dB, per sample, into the section's own coefficient
  array. A steady band pays no trigonometry; a moving one is exact to a
  hundredth of a dB.

`gainReductionDb[band]` is `blend × depth`: exactly the nominal reduction the
band has applied. A band with `depthDb: 0` is a static band (no detector, no
envelope) and is bit-identical to the Custom EQ's band. Bypassed, the module
copies its input and runs nothing.

Held by test: below the threshold the output is **bit-identical to the static
EQ** and the reduction is 0; above it the band reaches its full depth and the
audio is that much quieter at the band; a key 3 dB over the threshold and one
30 dB over it settle to the same reduction; attack and release move the dip
over their documented times, never past the depth and never negative; a key
outside the band does not trigger it and one inside does; the shelves listen
on their own side; self-detection, a key replacing it, and a silent key
ignoring a loud program; one linked gain across stereo; chunk invariance with
a key; determinism and `reset`; bypass; `depthDb: 0` as the static EQ; the
clamps, the throws and bad keys; a 15 dB deep high-Q band over noise with a
slam of a key staying finite and bounded.

### 14.5 The decisions this task took

The owner's three answers (2026-11-03, asked before any code was written,
because the plan names the dynamic block but fixes no detector): **a key when
supplied, the program otherwise**; **a band-limited peak-power detector with
the chain's ranges**; **full depth, 0–15 dB, downward only**. Recorded with
the reasoning in `task-reports/6.1-report.md`; the decisions log was left
untouched on the task's instruction, so the log entry is the owner's when
this is approved.

Provisional numbers, each in one constant: the dynamic detector's
**threshold / attack / release ranges reuse the chain's documented specs**
(D2.8.3) because no document gives this block its own; the **depth range is
the EQ's ±15 dB**, the only scale the project has for a band's gain; the
**2 ms switch slew** and the **0.01 dB redesign step** are this task's, named
as provisional in the source and here; a shelf's detector is **one-sided at
the corner**, the closest band limit a shelf has.

### 14.6 Not in this build (by design)

The channel chain and its order (Task 7.1), send / return and sidechain
plumbing (7.2), masking resolution — which band, which track, which key, how
deep (7.3), chunked rendering and recovery (7.4); the compressor characters,
the expander and the safety limiter (6.2); any UI, store field, persistence
or Auto / Manual wiring for these parameters (the project model keeps its
Task 2.8 chain as it is); other EQ types (high-pass, low-pass, notch); and
any automatic choice of frequency, gain, depth or threshold — the rulebook's
work, not the DSP's.

_(Task 6.2 has since built the compressor characters, the expander and the safety
limiter — their contract is §15.)_

## 15. The dynamics modules — compressor, expander and safety limiter (Task 6.2)

Phase 6's second step: the plan's §8 block 5 — "compressor with character — VCA /
Opto / FET / Vari-Mu" — block 2's "Cleanup / expander where justified by the track
and rules", and the output stage of L371 — "safety checks and transparent peak
protection only" — as **isolated, reusable TypeScript DSP**, tested on their own.
Nothing routes audio through them yet (Task 7.1 assembles the channel chain), no
room or store reads them, no sidechain or masking logic chooses their settings
(Task 7.3), and no renderer compensates their latency (Task 7.4).

**What the documents do not say — and this section therefore does.** The plan names
the four characters and the expander without fixing how either behaves: it gives
no knee width, no detector, no ratio law, no expander parameter set, and it defers
"exact headroom and peak-safety defaults" to a later decision (§17, L770–771). No
document mentions "Auto Release" at all — not the plan, not the decisions log, not
the glossary, not the console (which has five knobs and no switch). Those four gaps
were put to the owner before any code was written (2026-11-03), and the answers are
the contract recorded below: topology-inspired characters on a shared engine, no
added saturation, a five-control expander with a 6 dB knee and a RANGE clamp, a
5 ms sample-peak brickwall at −1 dBFS by default, and maximum-channel linking.
Everything marked **PROVISIONAL** is an app-design choice of this task, not a
hardware measurement and not a number any document establishes.

### 15.1 The files, the shared engine and the conventions

| file | what |
| --- | --- |
| `src/lib/dsp/params.ts` | the ranges in one place: `COMPRESSOR_*` (D2.8.3's own specs), `DYNAMICS_ATTACK_MS` / `DYNAMICS_RELEASE_MS` (the chain's, shared), `EXPANDER_*`, `LIMITER_CEILING_DB`, and `requireBoolean` for the switches |
| `src/lib/dsp/dynamics.ts` | the engine all three share: `LevelDetector` (peak or 10 ms RMS, linked by the maximum channel), `EnvelopeFollower` (one-pole in dB), `timeConstant`, `magnitudeToDb`, `dbToGain`, `kneeReduction`, `effectiveRatio`, `compressionReduction`, `expansionReduction` |
| `src/lib/dsp/compressor.ts` | `Compressor` and the four named models `VcaCompressor`, `OptoCompressor`, `FetCompressor`, `VariMuCompressor`, the `COMPRESSOR_CHARACTERS` table and `normaliseCompressorSettings` |
| `src/lib/dsp/expander.ts` | `Expander`, `EXPANDER_KNEE_DB`, `ExpanderSettings`, `normaliseExpanderSettings` |
| `src/lib/dsp/limiter.ts` | `SafetyLimiter`, `LIMITER_LOOKAHEAD_MS`, the default ceiling and release, `normaliseLimiterSettings`, `process` / `flush` / `reset` |

**Audio, state, allocation, determinism, validation.** Exactly §14.1's rules: one
`Float32Array` per channel, mono or stereo, at 48 kHz, in place allowed, samples
assumed finite, no per-sample allocation in any `process` (the guard checks the
three method bodies), state carried across blocks so any block split is
bit-identical to one pass, no clock and no randomness, a non-finite value throws, a
finite out-of-range one clamps, and a non-boolean switch throws. Each module
reports its gain reduction (`gainReductionDb`, dB ≥ 0) and `reset()` clears it.

**One engine, so the three cannot drift.** The dB conversion, the knee, the
envelope and the linking live in `src/lib/dsp/dynamics.ts` and nowhere else. A
second copy of "what a decibel is" would be a second set of bugs.

### 15.2 The linking convention and the timing convention

**Linking — the app's maximum-channel convention.** One gain envelope per module,
derived from a single linked level, applied identically to both channels. The
linked level is the **greater** channel's, never the sum and never a per-channel
gain: a summed detector over-reads a correlated centre (and would over-compress
it), and a per-channel gain moves the stereo image. The detector's kind follows the
character, and the linking follows the detector: peak characters (`VCA`, `FET`)
measure each channel's **peak magnitude** and take the greater; RMS characters
(`Opto`, `Vari-Mu`) measure each channel's **RMS** and take the greater. Forcing
peak detection on an RMS character would erase the character. The expander detects
`max(|L|, |R|)`; the limiter detects `max(|L|, |R|)`. There is no user-facing
linking control in this build — width, balance and "stereo link" percentages are
not part of the console the documents describe. This is the app's convention, not a
claim about how any hardware links its channels.

**Timing — one convention, stated in its domain.** ATTACK and RELEASE are one-pole
time constants applied to the **level envelope in dB**: the coefficient is
`1 − e^(−1/(τ·fs))`, so a step of level reaches **63.2 %** (1 − 1/e) of its change
after exactly τ. That is what the readouts mean, for every character and every
module here, and it is measured that way in the suites (a step across the
threshold, because that is where the reduction and the envelope travel the same
distance). Where a character's curve is not proportional to the envelope — a wide
knee, a progressive ratio, a RANGE clamp — the observed gain moves on a different
curve than the envelope; the time constant still describes the envelope, and the
report states the observed difference for each case. RATIO is likewise defined
precisely: **the reduction at and up to 10 dB over the threshold is the knob's own
ratio to the last decimal**, and above that the progressive characters walk toward
a higher ratio (§15.3).

### 15.3 The compressor and its four characters

Five controls, D2.8.3's: THRESH −40 … 0 dB (1 dB steps on the console), RATIO
1 … 20 (the printed list is 1:1, 1.5:1, 2:1, 3:1, 4:1, 6:1, 10:1, 20:1), ATTACK
0.1 – 100 ms (log), RELEASE 10 – 1000 ms (log), MAKEUP 0 … +20 dB (0.5 dB steps).
Character is D2.8.5's selector, in the console's order: **VCA · Opto · FET ·
Vari-Mu**.

| character | detector | knee | curve above the threshold | Auto Release ON |
| --- | --- | --- | --- | --- |
| VCA | peak | 0 dB (hard) | the knob's ratio, walking to 1.5× the knob's distance above unity (40 dB span) | deeper reduction recovers more slowly |
| Opto | 10 ms RMS | 9 dB | the knob's ratio, static | two-stage: fast while the reduction is near its peak, then the knob's release |
| FET | peak | 3 dB | walking to 2.5× (40 dB span) | the mirror: deep reduction springs back faster |
| Vari-Mu | 10 ms RMS | 12 dB | walking to 2.5× (60 dB span) | two-stage: fast, then a tail four times slower |

**The static curve.** With `over` = level − threshold, `W` = knee width, `a` = 1 −
1/ratio:

```
over ≤ −W/2       0
|over| < W/2      a · (over + W/2)² / (2W)      the knee
over ≥ W/2        a · over                      the line
```

continuous in value at both knee edges, exactly the line at the knee's top, and
exactly zero at the bottom edge. A wide knee therefore **starts earlier** — Opto
and Vari-Mu pull a little down at and even below the threshold where the hard-kneed
VCA does nothing — and every character meets the same line at the top of its knee.
The RATIO readout is exact on that line (§15.2); at the threshold the knee reads
`a·W/8` dB.

**The progressive ratio** (VCA, FET, Vari-Mu; Opto is static):

```
target = min(20, 1 + (ratio − 1) · factor)
r(over) = ratio + (target − ratio) · (over − 10) / ((over − 10) + span)     over > 10 dB
```

integrated into the reduction above the reference, so the curve is continuous in
value and slope there and never turns back (its slope stays below 1 — a louder
input never comes out quieter; the suite sweeps every character and ratio to check
it). The target is scaled **above unity**, not the ratio itself, so 1:1 stays
exactly neutral for every character however hard it is driven. No reduction may
push an effective ratio past 20:1.

**What the characters are, and are not.** They are topology-inspired presets on one
shared engine: a curve, a detector and a release law. They are **not** hardware
emulations and are not described as any (D2.8.1). There is **no added saturation** —
no tanh, no clipper, no transformer — which is the plan's rule and why "FET" here
means a fast peak character, not a circuit.

### 15.4 Auto Release — the owner's one new control

No document defines it; the owner specified its contract on 2026-11-03 and it is
implemented exactly so:

- **OFF (the default)** — the fixed release the RELEASE knob sets, for every
  character, Opto included. An Opto with the switch off is not adaptive.
- **ON** — that character's own adaptive law, the last column of §15.3.
- **It is a switch, not a number**: a non-boolean throws; the default is OFF, so a
  project saved before the control existed renders as if it had always been there.
- **It never rewrites anything**: a character change preserves every displayed
  value and the Manual ownership of each parameter. `normaliseCompressorSettings`
  passes the caller's numbers through and fills in only the switches' defaults.

### 15.5 The expander

A smooth **downward** expander — not a gate, no gate mode, no mute. Five controls,
as the owner specified, and no sixth (there is **no Hold** and no hysteresis
control):

| control | range | meaning |
| --- | --- | --- |
| THRESHOLD | −60 … 0 dBFS (**PROVISIONAL**) | where the knee is centred |
| RATIO | 1:1, 1.5:1, 2:1, 3:1, 4:1 | how steeply quiet material is turned down |
| ATTACK | 0.1 – 100 ms | the **opening** time: attenuation removed as the level rises |
| RELEASE | 10 – 1000 ms | the **closing** time: attenuation added as the level falls |
| RANGE | 0 … 40 dB (**PROVISIONAL**) | the most it may pull a signal down |

**The law**, in dB, with `below` = threshold − level and `a` = 1 − 1/ratio, a fixed
**6 dB knee** (PROVISIONAL):

```
reduction = min(RANGE, knee(below))
knee(below) = 0                                below ≤ −3 dB
            = a · (below + 3)² / 12            |below| < 3 dB
            = a · below                        below ≥ +3 dB
```

continuous at both edges, exactly zero at and above the knee's top (threshold +
3 dB), and clamped at RANGE. **Ratio 1:1 and RANGE 0 dB are both exactly no
attenuation** — two neutral states, both bit-exact. The maximum range is a
capability, not a default: the module does nothing until it is asked. Timing is
§15.2's convention: ATTACK opens, RELEASE closes.

**What it must not do.** It must not treat all sub-threshold material as noise:
RANGE bounds the pull-down and there is no mute, so a 60 dB-under signal with the
largest range is still present, just 40 dB down. It must not flutter: with no hold
and no hysteresis the gain follows the level smoothly through the threshold, which
the suite checks frame by frame. And it must be neutral unless it is asked to
work — bypassed, ratio 1, or range 0.

### 15.6 The safety limiter

The output stage: **transparent peak protection only** (plan §8 L371, L397). A
sample-peak brickwall with lookahead.

| property | value |
| --- | --- |
| CEILING | −12 … 0 dBFS (**PROVISIONAL**), default **−1 dBFS** |
| lookahead | **5 ms** of the actual sample rate, rounded to whole frames |
| RELEASE | 10 – 1000 ms (**PROVISIONAL**), default 50 ms |
| latency | `latencyFrames` — the module's real delay, public and exact |
| gain | ≤ 1 at every frame: no make-up, no normalisation, no LUFS, no boost |

**The ceiling is a sample-peak ceiling.** `ceilingAmplitude` (`10^(dB/20)`) is the
limit every output sample obeys; it is **not** a true-peak (dBTP) guarantee, and
between-sample peaks can still exceed it. True-peak limiting is deferred: D5.2.6's
4× oversampled analyser is a measurement, and 4× detection alone is not a limiter.
The default −1 dBFS is a **safety margin** for the accidental over — not a
mastering-headroom policy and not a loudness target, which the plan explicitly
rules out (§8 L397: no LUFS target).

**How the ceiling is kept.** Detection is `max(|L|, |R|)`; one stereo-linked gain
envelope applies to both channels. A sample that arrives over the ceiling needs
`target = ceiling / peak` at the frame it is due out, `latencyFrames` later, so the
module ramps its scheduled gain from the gain it is applying now down to `target`
across the lookahead — every sample still in flight has a gain that already
accounts for it. The applied gain is `min(scheduled, release-recovered)`, so a
scheduled reduction always wins and **the release can never compromise the
ceiling**. The release only ever moves the gain up, measured as §15.2's one-pole in
the linear-gain domain.

**Compensation, not trimming.** The module reports `latencyFrames` and exposes
`flush(output, count = latencyFrames)`. A renderer drops that many leading frames
of the module's output and calls `flush` after the last block, so the take keeps
its length and its tail — the residual audio really is written out, never zeroed
and never cut blind. Bypassed, the limiter still delays by the same
`latencyFrames` at unity gain, so toggling it never moves a render's alignment.

### 15.7 The decisions this task took

Recorded with their reasoning in `task-reports/6.2-report.md`; the decisions log was
left untouched on the task's instruction, so the log entry is the owner's when this
is approved.

The **owner's four answers** (2026-11-03, asked before any code was written, because
no document fixes any of it): four topology-inspired characters on a shared engine
with **no added saturation**; a smooth five-control downward expander with a 6 dB
knee, ATTACK opening and RELEASE closing, no Hold, and maximum-channel linking; a
5 ms lookahead **sample-peak** brickwall, ceiling −12 … 0 dBFS default −1, release
that can never break the ceiling, real latency reported and flushed rather than
trimmed, true-peak deferred; and one maximum-channel linking convention with no
user-facing control.

**Provisional numbers, each in one constant**: the four knee widths (0 / 3 / 9 /
12 dB), the progressive factors and spans (1.5 / 2.5 / 2.5, 40 / 40 / 60 dB), the
RMS window (10 ms), the four Auto Release laws and their constants, the expander's
threshold / ratio / range set and its 6 dB knee, the limiter's ceiling range,
default and release range, and the 5 ms lookahead. The compressor's own five ranges
are not provisional — they are D2.8.3's.

### 15.8 Not in this build (by design)

The channel chain and its order (Task 7.1), where the compressor sits and where the
expander sits; sidechain routing, key inputs and masking-driven settings (7.2,
7.3); chunked rendering and latency compensation (7.4) — the modules report what the
renderer needs, they do not wire it; any UI, store field, persistence or Auto /
Manual wiring for these parameters (the console keeps its five red knobs and gains
no switch from this task); true-peak limiting; a user-facing stereo-link control;
and any automatic choice of threshold, ratio, timing or range — the rulebook's work,
not the DSP's.


## 16. The Return effects — reverb and delay (Task 6.3)

Phase 6's third step: the plan's §8a Return buses (L395–415) — "Room / Hall / Plate"
on one Return, "Tape / Analog / Digital" delay on another — as **isolated, reusable
TypeScript DSP**, tested on their own. Nothing routes audio through them yet (Task
7.1 assembles the chain and its sends), no store or UI reads them, and no renderer
sizes a tail from them (Task 7.4). The plan explicitly defers the algorithm choice
(§17, L775); **no document fixed one**, so the readiness gate for this task asked
instead of coding, and the owner chose the algorithm and approved the numbers in
`task-reports/6.3-design-proposal.md` (2026-11-03). Everything marked **PROVISIONAL**
below is an app-design number of this task: not a hardware measurement, not an
impulse response, and not a claim of an exact room.

`Tape`, `Analog` and `Digital` remain **fixture labels** in
`channel-strip/bus-return-fixtures.ts`. There is no tape emulation, no wow/flutter,
no saturation, no modulation and no mode switching: the delay module does not even
read the label.

### 16.1 The files and the conventions

| file | what |
| --- | --- |
| `src/lib/dsp/params.ts` | the five Return ranges in one place: `REVERB_DECAY_S` (0.2–10 s), `REVERB_PREDELAY_MS` (0–200 ms), `DELAY_TIME_MS` (20–2000 ms), `DELAY_FEEDBACK_PERCENT` (0–90 %), `RETURN_TONE` (−10…+10) — the console's own ranges (D2.4.3) |
| `src/lib/dsp/reverb.ts` | `Reverb`, the order-8 Householder FDN, `REVERB_CHARACTERS` / `REVERB_CHARACTER_ORDER`, `dampingCoefficient` / `dampingCutoff`, `normaliseReverbSettings`, `REVERB_WET_SCALE`, `REVERB_DECAY_CALIBRATION` |
| `src/lib/dsp/delay.ts` | `Delay`, `delayDampingCoefficient` / `delayDampingCutoff`, `feedbackGain`, `delayRepeats`, `delayTailSeconds`, `normaliseDelaySettings`, `DELAY_WET_SCALE`, `DELAY_TONE_HZ` |

**Audio, state, allocation, determinism, validation.** Exactly §14.1/§15.1’s
rules: one `Float32Array` per channel, mono or stereo, 48 kHz (44.1 and 96 supported
and tested), in place allowed, samples assumed finite, no per-sample allocation in
`process` (every buffer is sized in the constructor), state carried across blocks so
any block split is bit-identical to one pass, no clock and no randomness, a
non-finite value throws, a finite out-of-range one **clamps**, a non-boolean switch
throws, and the buffer shapes are checked by the shared `requireBuffers`.

### 16.2 The shared boundary rules

**Wet only, one fixed scale.** Neither module has a dry path, a mix control, a
signal-dependent normalisation, a make-up gain or a separate wet-output filter.
`REVERB_WET_SCALE` and `DELAY_WET_SCALE` are both 1 and are not loudness or energy
promises: the Return’s fader sets the wet level, and an impulse’s peak is reported
per configuration instead of being equalised away.

**Parameters at construction.** The settings are read once, in the constructor, and
a change is a new module. There is **no smoothing, no crossfade and no live
parameter change**: for the delay that means a new TIME is a new module with its own
exact integer delay and empty state, not a pitch glide or a hidden reset. The
parameter-change policy is therefore "re-instantiate", and the report says so.

**Bypass.** The output is silence, the input never enters the network or the line,
and every element of state is **frozen**, so un-bypassing resumes the tail exactly
where it stopped. **Reset** clears every line, diffuser, damping state, pre-delay
ring and early-reflection history.

**Latency.** Both report `latencyFrames = 0`: pre-delay and delay time are effect
timing, not look-ahead, so a host or renderer has nothing to compensate.

**Tail contract.** `Reverb.tailSeconds = preDelay + 1.5 · decay` and
`Delay.tailSeconds = repeats · time` with `repeats = ceil(60 / (−20·log10 g))` and one
repeat at g = 0. Neither module cuts its own tail; Task 7.4 sizes from these
numbers. The delay’s number counts the loop gain alone, so it is a deliberate
**upper bound** — the in-loop one-pole takes a further slice, and the measured −60 dB
point comes earlier (90 % at 250 ms: 66 repeats promised, about 38 measured).

### 16.3 The reverb network

One algorithmic **feedback-delay network**, order 8, shared by the three
configurations (owner, 2026-11-03):

- **Feedback matrix**: Householder, `A = I − (2/N)·J`, i.e. `y_i = x_i − 0.25·Σx`.
  Orthogonal, so the network itself neither gains nor loses energy: it is stable by
  construction and the decay is set by the line gains below, not by the matrix.
- **Line gains**: `g_i = 10^(−3 · L_i / (RT60 · CALIBRATION))` with `L_i` the line’s
  length in seconds — the gain that gives −60 dB after RT60, computed for
  `RT60 × 1.315` so that the **measured broadband T30 at TONE FLAT lands on the
  knob**. The calibration is one constant, not a tolerance: the ±15 % test is
  unchanged and per-band RT60 stays frequency-dependent by design (§16.6).
- **Pre-delay**: an integer ring of exactly `round(ms · fs / 1000)` samples **before**
  the diffusers, so the whole wet signal — including the early reflections — is
  shifted by that amount and nothing leaks through before it.
- **Input diffusion**: a Schroeder all-pass chain per channel, unique to each
  configuration, which sets the density of the buildup.
- **Early reflections**: feed-forward taps read from a power-of-two history of the
  diffused signal; distinct per configuration, and none on Plate by design.
- **Output**: four weightings (÷√8), so L and R keep separate excitation through
  distinct input weightings and are read out through distinct output weightings:
  `wL = [+,+,+,+,−,−,−,−]`, `wR = [+,−,+,−,+,−,+,−]`,
  `vL = [+,+,−,−,+,+,−,−]`, `vR = [+,−,−,+,+,−,−,+]`; mono uses `wM = vM = (wL + wR)/√2`.
  L+R is **never** pre-summed: one network, two weightings.

### 16.4 The three configurations (PROVISIONAL, approved 2026-11-03)

They differ **structurally** — spacing, diffusion, early reflections — never by
default decay or by an allowed range. All numbers are milliseconds.

| | lines (8) | diffusers | early reflections | TONE f0 | DECAY minimum |
| --- | --- | --- | --- | --- | --- |
| **Room** | 13.7, 17.3, 19.9, 23.3, 27.1, 31.7, 37.3, 41.9 | 2 at 0.60: 2.7, 4.3 | 6 taps, 4.1–29.1, alternating channels | 5 kHz | 0.2 s at ≤ 48 kHz, **0.3 s above** |
| **Hall** | 47.9, 53.3, 59.9, 67.1, 73.7, 79.9, 89.3, 97.7 | 2 at 0.70: 5.1, 7.7, 11.3, 15.9 | 4 taps, 18.2–44.1 | 4 kHz | **0.4 s at every rate** |
| **Plate** | 21.1, 24.7, 28.3, 31.9, 35.3, 39.7, 43.1, 47.3 | 6 at 0.65: 1.7 … 7.7 | none | 6 kHz | 0.2 s at every rate |

"Character-inspired" is literal: Room answers quickly with early reflections, Hall
is the largest and slowest to build, Plate is dense and diffused with no early
reflections. No configuration claims to reproduce a specific room, plate or hardware.

### 16.5 TONE — damping inside the loops

TONE is a bipolar **damping** control, not a brightness control on the output, and
not "0 = unfiltered, +10 = filter again". In both modules a one-pole low-pass with
**DC gain 1** sits inside the feedback path:

```
f_lo = f0 / 4          f_hi = min(0.45·fs, 4·f0)
fc(tone) = f_lo · (f_hi / f_lo)^((tone + 10) / 20)
d = e^(−2π·fc/fs)      y[n] = (1 − d)·x[n] + d·y[n − 1]
```

FLAT (0) is the geometric centre of the range and is a real filter — the documented
neutral reference (f0: Room 5 kHz, Hall 4 kHz, Plate and Delay 6 kHz), never
"unfiltered". Because the filter is in the loop it changes **high-frequency decay**
rather than the final timbre, and in the delay it leaves the first repeat
bit-identical to the input.

**Known consequence, reported not patched:** the law gives `fc = f0` at FLAT only
when `4·f0 ≤ 0.45·fs`. The limit is **exposed**, not hidden: each module's
`dampingHz` getter returns the cutoff it actually applies, and the suite asserts the
clamped values. Room and Hall hit their f0 exactly at every rate; **Plate**
selects 5 692 Hz at 48 kHz and 5 456 Hz at 44.1 kHz (clamped `f_hi`) and reaches
6 000 Hz only at 96 kHz. The delay has the same 6 kHz law and the same clamping.
Changing the law is a design decision that has not been taken.

### 16.6 What DECAY measures

DECAY is the **broadband RT60 target at TONE FLAT**: the whole signal’s T30, fitted
over −5 … −35 dB by Schroeder backward integration of L²+R². Measured with
`REVERB_DECAY_CALIBRATION = 1.315`, deviations from the knob:

| character | 0.5 s (44.1 / 48 / 96 k) | 1.5 s | 4 s | 10 s |
| --- | --- | --- | --- | --- |
| Room | +3.2 / +1.7 / −4.5 % | +8.0 / +7.7 / +5.0 % | +9.6 / +9.6 / +7.4 % | +10.2 / +10.0 / +8.1 % |
| Hall | −3.3 / −4.3 / **−14.6** % | +4.1 / +3.4 / −4.2 % | +9.7 / +9.5 / +6.4 % | +11.7 / +11.9 / +10.0 % |
| Plate | +4.6 / +4.2 / −1.7 % | +11.1 / +11.1 / +8.4 % | +13.1 / +12.9 / +11.3 % | **+14.5** / +14.5 / +13.2 % |

Every cell of 0.5–10 s at all three rates is inside ±15 %, and the suite asserts
that grid. The residual is **not** flat across the range: the in-loop damping takes a
frequency-dependent slice of every pass, so short decays read short and long decays
long. The ±15 % acceptance is therefore met with little margin at two corners
(Hall 96 kHz / 0.5 s at −14.6 %, Plate 10 s at +14.5 %) — stated in the report
rather than smoothed over.

### 16.6a The achievable minimum — measured, then enforced

A network cannot decay faster than its own buildup, so the console's 0.2 s DECAY
minimum is not attainable by every configuration at every rate. Swept at
0.2 / 0.25 / 0.3 / 0.35 / 0.4 s and three rates (report §5.2), measured broadband
T30 against the knob:

| character | 0.2 s | 0.25 s | 0.3 s | 0.35 s | 0.4 s |
| --- | --- | --- | --- | --- | --- |
| Room @ 44.1/48 k | −2.6 / −3.6 % | −1.5 / −2.5 % | −0.1 / −1.0 % | 0.0 / −0.5 % | +1.3 / +0.1 % |
| Room @ 96 k | **−17.5 %** | −14.7 % | −11.0 % | −9.0 % | −7.6 % |
| Hall @ 44.1/48 k | **+67.5 / +67.9 %** | +37.7 / +37.8 % | +20.1 / +19.7 % | +9.3 / +8.7 % | +2.8 / +2.1 % |
| Hall @ 96 k | **+68.1 %** | +36.2 % | +16.0 % | +2.9 % | −5.7 % |
| Plate @ 44.1/48 k | +2.2 / +1.2 % | −1.5 / −1.9 % | −0.8 / −1.0 % | +0.6 / +0.5 % | +1.8 / +1.7 % |
| Plate @ 96 k | −8.1 % | −11.5 % | −10.7 % | −7.7 % | −5.8 % |

The **measured minimum** is therefore the smallest value on the console's own 0.1 s
DECAY grid whose measured T30 stays inside the approved ±15 % **at that rate**:

- **Room** 0.2 s at 44.1/48 kHz — its fixed 5 kHz neutral damping cutoff takes a
  larger slice of the wider band at 96 kHz, costing the very short decays — and
  **0.3 s above 48 kHz**.
- **Hall 0.4 s at every rate** — 40 ms of diffusion and 48–98 ms line spacing smear
  the response over ≈ 0.335 s, so no shorter tail exists; 0.3 s still reads +20 % and
  the console's next step, 0.4 s, reads +2.8 / +2.1 / −5.7 %.
- **Plate 0.2 s at every rate** — it tracks the console minimum within ±8 % even at
  96 kHz.

`REVERB_DECAY_MINIMUM_S` and `reverbDecayMinimum(character, sampleRate)` expose this;
rates between the measured 48 kHz and 96 kHz take the higher-rate value, so a floor is
never optimistic where it was not measured. The **module enforces it**: a request
below the floor is raised to it (the same "clamp a finite out-of-range value"
convention as the ranges), `requestedDecaySeconds` keeps the original request
visible, `minimumDecaySeconds` reports the limit, and `tailSeconds` follows the
**effective** decay — Hall at 0.2 s therefore reports a 0.6 s tail, not 0.3 s. The
console's DECAY range itself is unchanged (0.2–10 s, D2.4.3): the effective minimum is
what a UI must read, and no control was added or changed here.

The pre-floor measurements above are kept as evidence, not as accepted behaviour:
every one of those settings is now unreachable through the module.

### 16.7 The delay

A **single delay line per channel** — no cross-feedback, no ping-pong, no input
summing, so a signal on one channel never appears on the other.

- **TIME** is `round(ms · fs / 1000)` **whole samples**, and there is no
  fractional-sample interpolation. Integer timing is not claimed to be universally
  artefact-free; it is exact, and a changed time is a new module (§16.2).
- **FEEDBACK** is the loop’s linear gain, `g = percent / 100`:
  `write = in + LP(g · read)`, with the read taken before the write. The output is
  the line itself, so the **first repeat is the input, unfiltered and at unity**;
  only the repeats that pass through the loop are damped and scaled. At 0 % there is
  exactly one repeat.
- **Loop filter**: TONE’s one-pole (§16.5), inside the loop only. DC gain 1 with
  g ≤ 0.9 keeps the loop bounded — a constant input accumulates to at most
  `1/(1 − g)`, and the suite checks the 90 % case over ten seconds.

### 16.8 Stereo

**Reverb**: one internally coupled network, two distinct input weightings and two
distinct output weightings (§16.3); mono builds its own weightings. L+R is never
pre-summed, and **mono compatibility is not claimed** — the suite measures the
fold-down and the report states what it found.
**Delay**: fully independent channels.

### 16.9 The decisions this task took

Recorded with their reasoning in `task-reports/6.3-report.md`; the decisions log was
left untouched on the task’s instruction, so its entry is the owner’s when this is
approved.

The **owner’s answers** (2026-11-03, asked at the readiness gate because no document
fixed any of it): one shared algorithmic FDN in three structurally distinct
configurations; DECAY as a broadband RT60 target at TONE FLAT; pre-delay separate
and before the diffusers; TONE as in-loop damping with a documented neutral
reference, not "unfiltered"; wet-only output with one fixed scale and no make-up;
bypass freezing state and tails; parameters fixed at construction, no smoothing, no
live TIME change; a delay line with integer timing, no cross-feedback and no
tape processing.

**Provisional numbers, each in one constant**: the three configurations’ line
lengths, diffuser lengths and coefficients, early-reflection taps and gains, the
three f0 values, the geometric TONE law, `REVERB_WET_SCALE` / `DELAY_WET_SCALE`,
`REVERB_DECAY_CALIBRATION` (provisional, as the review requires), the tail formulas
and the 6 kHz delay f0. The per-configuration **DECAY minimum is not provisional in
the same sense**: it is a measurement of the approved structure, and it moves only if
the structure moves.

### 16.10 Not in this build (by design)

Routing, sends and Return-chain assembly (7.1); the console’s UI, store fields and
persistence for these parameters (it keeps its existing eight controls and gains no
new one); chunked rendering, tail scheduling and latency compensation (7.4); any
sidechain, masking or automatic parameter choice; tempo sync, ping-pong,
modulation, wow/flutter, saturation, tape emulation and extra modes; convolution,
impulse responses or IR assets; a separate wet-output filter; and any
mono-compatibility or hardware-emulation claim.

## 17. The mixer engine — channel chain, summing and bus processing (Task 7.1)

Task 7.1 fixes the approved DSP modules (6.1–6.3) into one signal flow. It adds no new
DSP: every filter, dynamics law and effect is the reviewed module of §14–§16, driven
from the project model. The layer lives in `src/lib/engine/` and is the **only** code
outside `src/lib/dsp/` that imports those modules.

### 17.1 The files

| File | Responsibility |
| --- | --- |
| `engine/pan.ts` | `PAN_CENTRE_DB` (−3.01), `panGains()` (constant-power), `balanceGains()` (bus balance) |
| `engine/constants.ts` | the two provisional control values (dynamic-EQ gate, cleanup expander) and the master limiter's settings |
| `engine/audibility.ts` | `computeAudibility()` — mute and solo-in-place as pass/fail rules; `busProcessingOrder()` |
| `engine/chains.ts` | `TrackChain`, `BusChain`, `ReturnChain` — each block through its modules, in order |
| `engine/mix-engine.ts` | `MixEngine` — graph validation, buffers, the block loop, taps, `reset()`, `flush()`, tail and latency |

### 17.2 The channel chain

One track, one block, in this order — the eight steps of `PROCESSING_CHAIN_STEPS`
(`src/lib/mixer.ts`), with no step skipped and no step reordered:

| Step | Control | Module | Note |
| --- | --- | --- | --- |
| 01 | TRIM `−24…+24 dB` | gain | before everything, so it drives the detector too |
| 02 | CLEANUP (expander) | `Expander` | **in circuit only when `channel.cleanup` is set**; otherwise skipped, state frozen |
| 03 | static EQ, 4 bands | `Eq` | the 4-band console EQ of §14 |
| 04 | dynamic EQ, 4 bands | `DynamicEq` | band depth from `dynamicDepthDb`; a band at 0 dB depth is bypassed |
| 05 | COMPRESSOR | `Compressor` | character from `CharacterId`; bypass freezes state |
| 06 | PAN | `panGains()` | post-compressor, pre-fader |
| 07 | FADER `−60…+6 dB` | gain | `−60` is silence, not a very small gain |
| 08 | SENDS + ROUTING | — | see §17.5 |

Two consequences are deliberate. **TRIM is audio gain, not a detector offset**: it
changes the level the compressor sees, which is what the plan's step 01 means. **Dynamic
bands are built with static `gain` 0 dB** and only their depth, because the band's static
gain already happened at step 03 — otherwise a static and a dynamic setting would be
multiplied twice.

A bus is narrower, because a bus has no pan and no sends (plan §7):

| Step | Control | Module |
| --- | --- | --- |
| 01 | TRIM | gain |
| 02 | static EQ | `Eq` |
| 03 | COMPRESSOR | `Compressor` |
| 04 | BALANCE | `balanceGains()` |
| 05 | FADER | gain |

A Return has no fader in the ordinary sense: its chain is **effect → level**, where the
level is the Return fader (`−60…0 dB`) applied to the effect's *wet* output. There is no
dry path anywhere in a Return (§16.2).

### 17.3 PAN, BALANCE and the −3.01 dB centre

PAN is the approved constant-power law: `θ = (pan + 100)/200 · π/2`, `L = cos θ`,
`R = sin θ`. Centre is −3.01 dB per side, hard positions are unity on one side and
exactly zero on the other, and `L² + R² = 1` throughout — so a mono source keeps its
power as it moves. `PAN_CENTRE_DB` is exported for display.

BALANCE is **not** the same function, and the difference is deliberate: a balance on a
stereo bus sits at a default that must be neutral. Applying the pan law to it would drop
every centred bus by 3.01 dB — a gain the model does not hold, and a direct disagreement
with the same material routed straight to Master. `balanceGains()` therefore reads like a
console balance: unity on both sides at the centre, and moving it attenuates the opposite
side linearly, never boosting either side. **Approved** (owner, 2026-11-03;
`decisions-log.md` D7.1.2): strict identity with the pan law was considered and declined,
because a control at its default must be neutral.

### 17.4 Mute and solo — solo-in-place

`computeAudibility()` turns the model's flags into pass/fail predicates, recomputed only
when asked (§17.8):

- **Mute wins.** A muted channel passes nothing — not to its bus, not to its sends.
- **Solo is in place.** With any channel soloed, a path passes only if it lies on the
  routing path of a soloed object. A soloed track keeps its own bus (the bus is not
  silently bypassed); a soloed bus passes its children; a soloed Return hears its
  feeders' sends but no track's dry signal.
- A skipped path is **frozen, not reset** — that is the bypass rule of 6.1–6.3, and it is
  what makes unmuting resume rather than jump.

### 17.5 Summing, routing and the bus order

Summing is plain addition in Float32 at every node, with **no compensation for the number
of contributors**: two tracks at −6 dB sum to −6 dB + 6 dB, and a bus's level is the sum
of what reached it. Buses are processed **sources first** (`busProcessingOrder()` sorts
the graph), so a bus feeding another bus is finished before its consumer reads it, and a
signal reaches the Master exactly once. Sends are **post-fader and post-pan** (step 08).
A Return's output is fixed to Master (§7, rule 4) — a Return does not pass through a
bus, and the `bus-chain.ts` header that claimed otherwise was corrected in Task 6.4
(`decisions-log.md` D7.1.3).

The engine **refuses to build** on a graph `validateGraph()` rejects — a missing bus, a
cycle, a Return routed to a bus, a send to a Return that does not exist — and the error
carries the routing verdict's own reason. Nothing is guessed at runtime, because an
invalid graph is a bug in the store, not a condition to survive.

### 17.6 The Master

The Master is not a project entity (§7): it is the sum of everything that reaches it,
through the safety limiter of §15.6, at a fixed −1 dBFS ceiling with no fader. The
limiter is **always in circuit**, so the engine reports its 5 ms lookahead as
`latencyFrames` — the only latency in the chain.

### 17.7 Lifecycle — state, blocks, reset

Processors are built **once** from the project model, in the constructor. State carries
across blocks: chunked processing is sample-identical to a single pass, and the tests
assert that rather than assume it. The block loop allocates nothing; every buffer it
needs is sized in the constructor from `maxFramesPerBlock` (default 4096), and a larger
block is a named error instead of a reallocation. `reset()` clears every module, the
accumulators and the limiter. `flush(target, frames)` runs the tail out with no input, for
a renderer that must not cut it. `tailSeconds` is the longest Return tail.

### 17.8 Controls that change without a rebuild

Mute and solo are read when the engine is built. `refreshAudibility()` re-reads them after
a controller changes one: it recomputes only the pass/fail routing, and **no chain is
rebuilt and no state is lost**. Rebuilding is reserved for a change of the graph itself,
which is a new `MixEngine`.

### 17.9 Not in this build (by design)

The console's UI and store wiring for any of this; sidechain routing (7.2); masking
resolution (7.3); chunked rendering, tail scheduling and latency compensation (7.4);
transport, playback and export; and any change to the approved DSP algorithms.

## 18. Sidechain routing — the detector-signal path (Task 7.2)

An external key lets one track drive another channel's **detector** without touching
the audio either of them carries. It is a third kind of edge, but a *detector* edge:
it is validated separately from the audible graph and it never carries audio.

### 18.1 The model

`model.ts` gains two types and one optional field (owner, 2026-11-03):

```ts
export type SidechainProcessor = "compressor" | "dynamic-eq";

export interface SidechainEdge {
  readonly source: TrackId;        // the key: a track's pre-fader signal
  readonly destination: ChannelId; // a track or a bus
  readonly processor: SidechainProcessor;
}

interface Project { …; readonly sidechains?: readonly SidechainEdge[]; }
```

The field is **optional** so a project stored before 7.2 loads unchanged; absent means
"no sidechain", never "unknown". Wiring the field to the store, the UI or persistence
is not part of this task (§18.6).

### 18.2 The signal path

| Property | Contract |
| --- | --- |
| Tap point | **pre-fader, post-trim** (owner, 2026-11-03): the source track's input block × its TRIM |
| Destination | a track's compressor / dynamic EQ, or a bus's compressor |
| Source | a track only |
| What it drives | the detector, and only the detector |
| What it processes | the destination's own audio, unchanged |
| Audible effect of the edge | none — no audio is added, duplicated or re-routed |

Because the tap is the source's **input**, a key is computed from the same block's raw
audio before any chain runs. That single decision gives the task's timing guarantees for
free: the key is sample-aligned with the audio it drives, it never depends on another
chain's output, it is never a previous block's data, and it cannot add latency or create
a processing cycle.

### 18.3 How the keys reach the detectors

`engine/sidechain.ts` validates the declared edges and builds a plan
(`destination → processor → source track`). `MixEngine` allocates one key buffer per
planned detector in the constructor, fills every buffer at the top of each block, and
hands the bundle to the chain:

```ts
trackChain.process(scratch, frames, keys);   // keys = { compressor?, dynamicEq? }
```

Inside the chains, an absent key is self-detection exactly as before:

```ts
if (this.dynamicEq) this.dynamicEq.process(buffer, buffer, frames, keys?.dynamicEq);
this.compressor.process(buffer, buffer, frames, keys?.compressor);
```

`Compressor.process` gained the optional fourth parameter this task needed, on the
Dynamic EQ's exact contract (owner, 2026-11-03): `key` present → the detector reads the
key; `key` absent → it reads the module's input. Nothing else in the compressor changed;
the audio path, the characters, the knee, the progressive ratio and the release laws are
untouched, and with no key the output is bit-identical to 6.2.

### 18.4 Validation — separate from the audible graph

`validateSidechains(project)` never throws and never repairs. Unlike `validateGraph`,
a broken detector edge must not stop a project from playing; it must stop that one
detector from being keyed. Every rejection is returned with a reason and a message:

| Reason | When |
| --- | --- |
| `malformed` | the edge is not a `{source, destination, processor}` shape |
| `unknown-source` | the source is not a track in the project |
| `unknown-destination` | the destination is not a channel in the project |
| `source-not-a-track` | reserved: sources are tracks only |
| `unsupported-destination` | the destination is a Return, which has no compressor or dynamic EQ |
| `self-sidechain` | source and destination are the same channel |
| `duplicate-assignment` | a second edge for the same destination and processor (the first wins) |

A rejected edge is dropped, so the processor falls back to its own input — the audio is
never silently connected, because nothing is connected at all.

**Cycles need no rule here.** With a pre-fader tap, a key never depends on processing, so
two tracks may key each other with no feedback path and no ordering ambiguity. The only
degenerate case — a channel keying itself — is rejected above.

### 18.5 Availability, mute and solo

The key follows the Task 7.1 audibility rules (owner, 2026-11-03):

- a source that is **muted** or **solo-excluded** delivers silence, so the destination's
  detector sees no signal and applies no reduction;
- a source with **no audio in the block** is silence for the same reason;
- an **unavailable or invalid** source means self-detection plus a reported problem.

Availability is the source track's own output predicate. A key therefore passes while
the source is audible in the session, even if the bus it feeds is turned down — the key
follows the source, not the source's monitoring path.

### 18.6 Lifecycle and scope

- Buffers are sized once, in the constructor; `process()` allocates nothing (asserted by
  a test and by the guard).
- `refreshSidechains(edges?)` re-validates and rebuilds the plan after a controller
  changes an assignment. Chains, their state and the audible graph are untouched;
  allocation happens here, never in the block loop.
- `engine.latencyFrames` is unchanged by sidechains — the detector tap is not in the
  audible path.
- **Not in this build (by design):** UI controls, store fields, persistence and clipboard
  support for `Project.sidechains`; Return destinations and non-track sources; key
  filtering, weighting, lookahead or a key-level control; masking (7.3); rendering and
  tail handling (7.4).

## 19. Masking resolution — frequency/time conflicts, priority and wet tails (Task 7.3)

Phase 7's third step: the plan's §8 masking paragraphs and §8a wet-tail rule, built
on the Task 5.2 spectral grid, the Task 6.1 EQ / Dynamic EQ, the Task 6.2 compressor,
and the Task 7.1–7.2 engine / sidechain path. It is an **engine layer only**: no UI,
store op, persistence field, transport, export, new DSP algorithm, new routing edge
kind, or Task 7.4 bounded-render orchestration is added. `architecture.md` and
`module-contract.md` still do not exist; this section is the implemented contract.

### 19.1 The files

| file | what |
| --- | --- |
| `src/lib/engine/masking.ts` | measurement, detection, resolution, re-measurement and escalation |
| `src/lib/engine/chains.ts` | one additive integration: `MaskingDynamicBand` overlay on a band with no configured `dynamicDepthDb` |
| `src/lib/engine/mix-engine.ts` | two additive integrations: optional `MixTaps.tracks`, and `MixEngineOptions.maskingDynamicBands` |
| `tests/masking.test.mjs` | 15 synthetic-measurement and controlled-audio tests |
| `scripts/check-masking-structure.mjs` | the 7.3 structural guard (`npm run check:masking`) |

### 19.2 Measurement — reuse the 5.2 grid, attribute wet sends

`measureMaskingSources(project, inputs, options)` runs the existing `MixEngine` in
blocks and feeds the existing `SpectralAnalyser` (`BANDS`, `CELL_SECONDS`,
`cellFramesFor`) on the same 100 ms grid. It measures:

- **dry sources**: each track's post-fader tap (`MixTaps.tracks`), gated by the
  Task 7.1 audibility rules;
- **wet sources**: each active post-fader send, attributed to its sending track as
  `trackId>returnId`. The send signal is the track tap × send gain, passed through
  the same approved `ReturnChain` settings in isolation. The Return effects are
  linear and static during a render, so this is superposition, not a new effect or
  routing model. A shared Return output alone cannot say which send produced a tail.

The measurement analyses `tailSeconds` of silence after the last input so reverb and
delay tails participate. A wet source inherits the sending track's Priority; a Return
Bus is never treated as an ordinary track and never becomes a sidechain destination.

### 19.3 Detection — meaningful overlap, not mere spectral overlap

`detectMaskingConflicts(measurement, config)` compares sources from different tracks.
The higher-Priority source is protected; equal Priority is reported nowhere as an
arbitrary cut. A band cell is a conflict only when both sources are above
`energyFloorDb`, the band carries at least `minBandShare` of each source's energy,
and the yielding source is no more than `maskingWindowDb` below the protected source.
Contiguous conflict cells become intervals. `persistent` means the conflict occupies
at least `persistentRatio` of the longer active run and at least `persistentMinCells`;
otherwise a conflict with at least `intermittentMinCells` is `intermittent`.

A conflict carries the two contributors, the affected `BandDef`, the time intervals,
active/conflict cell counts, mean band levels, `excessDb` (yielding minus protected),
and the Priority difference. Role is not read.

### 19.4 Resolution — Auto-only, priority-ordered, cumulative-safe

`resolveMaskingConflicts(project, conflicts, config, previousLedger)` clones the
project and writes only Auto parameters:

- persistent dry conflict → proportional static EQ cut on the lower-priority track;
- intermittent dry conflict → engine-owned Dynamic EQ dip keyed by the protected
  track through the existing `Project.sidechains` / `validateSidechains` path;
- wet conflict → proportional send reduction on the lower-priority sending track
  (persistent uses the full requested cut; intermittent scales by measured duty
  cycle because a Return has no dynamics to key).

Manual EQ gain/frequency/Q, Manual sends, and Manual compressor parameters are never
written. A configured `dynamicDepthDb` is preserved; the masking overlay is additive
only on bands whose depth is `null`. Existing sidechain assignments are preserved;
invalid edges keep the Task 7.2 fallback and are exposed in `sidechainVerdict`.

The cumulative ledger tracks masking-applied EQ reduction per track and per band,
and send reduction per Return. `cumulativeCutLimitDb` (default **6 dB**) prevents
repeated small cuts from hollowing a track. The limit is deterministic, configurable,
and carried across reruns through `previousLedger`.

### 19.5 Re-measurement and escalation

`resolveMaskingAudio` measures, detects, resolves, then **re-measures** the resolved
project with the Dynamic EQ overlays. Compressor escalation is considered only for
conflicts that received an EQ move and still have meaningful remaining excess
(`escalationThresholdDb`). It adds an external-key compressor edge and may lower an
Auto threshold / raise an Auto ratio; a bypassed compressor or an existing compressor
key is not overridden. A final measurement reports the remaining conflicts.

### 19.6 Provisional defaults (D7.3.1)

No universal masking threshold is claimed. The defaults are conservative, configurable
starting points in `DEFAULT_MASKING_DETECTION` / `DEFAULT_MASKING_RESOLUTION`:
`energyFloorDb -60`, `minBandShare 0.05`, `maskingWindowDb 12`, `persistentRatio 0.6`,
`persistentMinCells 3`, `intermittentMinCells 2`, `targetSeparationDb 3`,
`maxCutPerConflictDb 3`, `minCutDb 0.25`, `cumulativeCutLimitDb 6`, `maxSendCutDb 6`,
`escalationThresholdDb 1.5`, `maxCompThresholdShiftDb 6`. They reuse the 5.2 grid and
the 6.x ranges; they are not genre rules and remain tunable.

### 19.7 Not in this build (by design)

UI/store/persistence/clipboard wiring for masking results or engine-owned Dynamic EQ
overlays; per-section priority; genre rulebook precedence; Return-bus dynamics or
Return sidechain destinations; new effect algorithms; bounded-chunk rendering, state
continuity and recovery (Task 7.4); WAV export; native Tauri/Rust.

## 20. Bounded-chunk rendering — streaming sources, state continuity and recovery (Task 7.4)

Phase 7's fourth step: plan §11's bounded chunk processing and §15's single-pass
versus chunked comparison, built over the Task 7.1 `MixEngine` without changing the
signal path or any DSP algorithm. It is an **engine layer only**: no UI, transport,
store op, persistence field, WAV export dialog, native code, or new dependency.
`architecture.md` and `module-contract.md` still do not exist; this section is the
implemented contract.

### 20.1 The files

| file | what |
| --- | --- |
| `src/lib/engine/render.ts` | `renderProject`, streaming source/sink contracts, bounded chunk loop, latency compensation, tail scheduling, cancellation/recovery, WAV source adapter |
| `src/lib/engine/mix-engine.ts` | one recovery-only addition: `reset()` also clears the scratch and sidechain key buffers |
| `tests/rendering.test.mjs` | 17 deterministic rendering tests |
| `scripts/check-rendering-structure.mjs` | the 7.4 structural guard (`npm run check:rendering`) |

### 20.2 Source and sink contracts

`RenderSource` is seekable and stereo at the render rate: `frames`, `sampleRate`,
`read(frameStart, target, frames)`, optional `close()`. A read writes exactly the
requested count into reused target arrays; a short read is a named failure, not
silence. Missing tracks are silence; shorter tracks are padded with silence to the
longest input. `openWavRenderSource` reuses Task 5.2's `readStoredFormat` and
`SliceDecoder` and Task 5.1's import rules: 48 kHz, 24-bit PCM or 32-bit float,
mono/stereo; mono is duplicated to stereo; non-finite float samples are rejected.

`RenderSink.write(chunk)` receives aligned, bounded output chunks and may be async
(backpressure). The chunk arrays are reused after `write` resolves, so a sink that
keeps audio must copy or persist it before resolving. `finish(result)` is the single
commit point; `abort(error)` discards partial output. The renderer owns no files and
does not accumulate the output mix.

### 20.3 Chunk size and memory

`DEFAULT_RENDER_CHUNK_FRAMES = 4096` (the engine's existing default, about 85 ms at
48 kHz). `chunkFrames` is configurable from 1 to `MAX_RENDER_CHUNK_FRAMES = 65536`
(about 1.37 s at 48 kHz). The cap is a provisional orchestration safety bound, not a
DSP parameter. Input buffers, raw engine output, aligned output staging, bus/Return
accumulators and sidechain keys are sized from this cap and the channel count, not
from project duration. DSP state remains sized by the approved module settings
(delay time, reverb network, lookahead), as before. The allocation test instruments
`Float32Array` construction and proves identical audio allocation for a short and a
long render with the same chunk size.

### 20.4 Timeline, tails and latency

Inputs start at frame 0, matching the current imported-stem arrangement. Let `N` be
the longest input and `T = ceil(tailSeconds × sampleRate)`, defaulting to the engine's
conservative longest Return tail. The renderer processes `N + T` frames through the
full engine; frames after `N` are silence, so Return tails, compressor/Dynamic EQ
release and filter state advance normally. `MixEngine.flush` drains only the master
limiter's lookahead; the Return tails are not shortcut through that method.

The limiter reports `L = latencyFrames`. The renderer drops the first `L` raw output
frames and appends `L` flushed frames, delivering exactly `N + T` aligned frames.
This is the compensation contract from §15.6: the residual audio is written, not
zeroed or blindly trimmed. `tailSeconds` may be overridden by a caller; the default
does not truncate the approved Return tail contract.

### 20.5 State continuity and masking

One `MixEngine` instance is used for the whole attempt. There is no reset, rebuild,
parameter re-resolution or masking rerun at a chunk boundary. EQ/Dynamic EQ filter
and detector state, compressor/expander envelopes, bus processing, sidechain key
alignment, delay lines and reverb networks carry across blocks exactly as in Task
7.1–7.2. Task 7.3 masking is supplied as an already-resolved project plus
`maskingDynamicBands`; the renderer preserves those decisions and edges for the whole
render. Chunked output is tested against a continuous reference through the same
engine, including active dynamics, sidechains, masking overlays and wet tails.

### 20.6 Cancellation, failure and retry

Cancellation is cooperative through an `AbortSignal`, checked before/after source
reads, engine blocks, sink writes and yields, and before commit. `RenderCancelledError`
is thrown; `finish` is not called. Source reads, sink writes, commit, or cleanup may
fail. On every failure path the engine is reset, scratch buffers are zeroed, sources
are closed, and the sink's `abort` is called once. A retry is a new `renderProject`
call with a fresh engine and fresh scratch buffers; no attempt state is shared.

The project is still contractually read-only for an attempt, but the renderer also
fingerprints the project metadata at start and re-checks it before each engine block,
after sink writes, and before commit. An observed change throws
`RenderProjectChangedError`, aborts the sink, and never calls `finish`. The fingerprint
is metadata-sized (functions omitted), not an audio-buffer copy. A controller should
still cancel explicitly when it edits; the check is the safeguard that prevents an
observed mid-render edit from committing inconsistent output.

This task chooses **safe restart**, not persisted mid-render checkpoint resume.
Serializing every processor's internal state would change the DSP/project contracts;
the plan permits interrupted renders to resume *or safely restart*. Durable atomic
storage and user-facing progress/recovery belong to the later transport/export wiring.

### 20.7 Not in this build (by design)

UI or transport controls; WAV export files/dialogs/stems/bus export; store/persistence
or clipboard changes; arrangement clip offsets/automation beyond the current
bar-1 imported-stem model; persisted checkpoint resume; new DSP algorithms; changes
to masking methodology; native Tauri/Rust; new dependencies.

## 21. Shared transport and playback (Task 8.1)

Phase 8's first step: plan §6's three listening modes and §14 Task 8.1, wired to the
existing project store, imported assets, Task 7.1 `MixEngine` and Task 7.4
`renderProject`. **No project-model or persistence-schema field is added.** Transport
state is app-level, transient UI/audio state, not part of the saved manifest.
`architecture.md` and `module-contract.md` still do not exist; this section is the
implemented contract.

### 21.1 The files

| file | what |
| --- | --- |
| `src/lib/playback/types.ts` | listening source, transport state, PCM chunk, output/clock contracts, bounded defaults |
| `src/lib/playback/sources.ts` | opens imported stems through the 5.1 asset store and 7.4 WAV source adapter |
| `src/lib/playback/sessions.ts` | bounded RAW sum and PREVIEW `MixEngine` producer, limiter-latency compensation |
| `src/lib/playback/controller.ts` | the one play/pause/stop/seek/source/render state machine and attempt lifecycle |
| `src/lib/playback/web-audio.ts` | browser scheduled-chunk output, generation stop, backpressure |
| `src/lib/playback/store.svelte.ts` | one reactive transport facade for every room |
| `src/lib/playback/shell.ts` | browser wiring: project store, asset store, Web Audio, macrotask clock |
| `tests/playback.test.mjs` | deterministic transport/raw/preview/render/recovery/memory tests |
| `scripts/check-playback-structure.mjs` | the 8.1 structural guard (`npm run check:playback`) |

### 21.2 One shared transport

`PlaybackController` owns `status` (`stopped | playing | paused | rendering | error`),
`source` (`raw | preview | render`), `positionFrames`, `startFrame`, `durationFrames`,
`renderProgress` and `error`. The shell attaches one controller to the reactive
facade; `MiniTransport` is rendered once outside the room switch and the Console deck
reads the same facade. Arrange and Mixer do not create playback state. Switching rooms
therefore cannot remount or reset the playhead.

Play starts or resumes the current source. Pause stops scheduled audio and keeps the
playhead. Stop returns to `startFrame` (frame 0 in this task). Seek clamps to the known
duration, stops the current generation, and restarts at the target if playback was
running. Previous/Next locate to start/end. The Console deck's PLAY key toggles
play/pause in the live room; this is the Task 8.1 deviation from the Task 2.3 inert
latch, recorded as D8.1.1. The listening source remains status text (D2.3.2); no source
selector was added. MIX starts the rendered-mix path.

### 21.3 Raw synchronized playback

RAW opens each imported track as a seekable `RenderSource` (48 kHz, mono duplicated to
stereo, 24-bit PCM / 32-bit float). A bounded block is read from every active source at
the same project frame and unity-summed. Shorter sources are silence after their end;
missing/corrupt stored copies are silence for that track. Mute/solo is the shared Task
7.1 `computeAudibility` rule, re-read each block. No trim, pan, fader, EQ, dynamics,
send or Return processing is applied in RAW.

### 21.4 Lightweight live preview

PREVIEW builds one `MixEngine` for the attempt and feeds it bounded blocks. The
approved track → bus → Return → master signal path, sidechain keys and masking overlays
are the engine's; playback does not duplicate DSP. `refreshAudibility()` is called per
block so mute/solo changes are heard without rebuilding chains. The master limiter's
lookahead is compensated as in §20.4: leading latency is dropped and flushed at the
end. DSP state is continuous inside one unbroken attempt. Pause, seek, stop and restart
discard the attempt and reinitialize at the requested frame, so no stale compressor,
reverb, delay or limiter state leaks across a locate.

### 21.5 Full rendered mix playback

RENDER calls Task 7.4 `renderProject` with a streaming sink. The sink discards output
before the requested start frame, applies backpressure through the output, and reports
progress. `finish` commits the rendered duration; cancellation/failure aborts the
attempt and leaves the transport recoverable. A seek or restart is a new render attempt
from the project start with output before the target discarded (safe restart, §20.6);
no persisted mid-render checkpoint or full-project mix buffer is introduced.

### 21.6 Buffering and memory

Audio buffers are sized from the block size and channel/track count, never from project
duration. RAW/PREVIEW default block: 2048 frames; rendered orchestration block: 4096
frames (Task 7.4 default). The Web Audio backend schedules short chunks on the audio
clock and waits while about one second of audio is already queued. A generation counter
and explicit `stop()`/`disconnect()` ensure old scheduled chunks cannot sound after a
pause, seek, stop or restart. The allocation test proves identical audio allocation for
short and long RAW/PREVIEW sessions.

### 21.7 Not in this build (by design)

An export dialog or other export UI (the engine-level export landed in 8.2, §22; the
screen that drives it is still deferred); a source selector or new transport layout;
arrangement clip offsets beyond the current bar-1 imported-stem model; persisted render
checkpoints; live rebuild of DSP chains on every parameter edit (mute/solo is live;
graph/chain edits require a new attempt); native Tauri/Rust; new dependencies.

## 22. WAV export and external rulebooks (Task 8.2)

Plan §12 asks for any combination of the full mix, the processed individual stems and the
processed buses, as WAV, into a folder the user chooses; plan §9 asks for genre rulebooks
loaded from external JSON. Both are implemented as library code with no UI: this section
is the contract, `src/lib/export/` and `src/lib/rulebook/` are the implementation.

### 22.1 There is no second export pipeline

Every exported file is produced by **Task 7.4's `renderProject`** — the same `MixEngine`,
the same chains, the same summing, the same Return tails, the same safety limiter and the
same latency compensation the transport uses (§20, §21). Export adds three things and
nothing else:

1. a **destination** (`ExportDestination`) — a real folder, memory, or a collector the
   shell turns into downloads;
2. a **writer** (`WavStreamWriter`) — bounded, streaming, with the header written first
   and its sizes patched at `finish()`;
3. **bus monitor taps** (`RenderOptions.onBuses`) — the one addition to the renderer.

The taps are observers. They allocate a buffer pair per bus only when asked for, the
engine writes each bus's output into them during the block it already processes, and the
delivered master is **bit-identical with and without them** (asserted in
`tests/export.test.mjs`). They introduce no gain, no routing and no state.

A tap block is aligned to the input timeline: a block covering input frames
`[at, at + count)` is handed over with `startFrame === at`. Buses carry no latency, and
the master's limiter lookahead is compensated by the master's own head drop, not a second
time here — subtracting it twice shifted every bus file 5 ms early.

### 22.2 What each file contains

| file | signal path | notes |
| --- | --- | --- |
| `<Project> - mix.wav` | every track's inserts → post-fader sends → Returns → bus chains → summing → master safety limiter | the whole path, no mastering, no loudness target |
| `Stems/NN <Track>.wav` | that track's inserts → its own pan/fader → its declared route (bus chain, or Master) | one render per track; no other track is present |
| `Buses/NN <Bus>.wav` | that bus's chain → before it is summed into its destination | read from the tap of the mix pass |
| `export.json` | — | what was written, in what format, with each stem's routing note |

A **stem is a render of that track's own channel**, not a solo trick and not a mute
afterwards: `stemProject()` hands the renderer a project containing one track and only the
Returns its live sends reach, with `sidechains: []` so no other track can duck it. Its
pan, fader, mute and solo are the project's, so an export cannot disagree with what the
user hears. Because each stem keeps its declared route, **the stems sum to the full mix**
sample-for-sample over the project's length (asserted) — with two documented exceptions:

- the master **safety limiter** is the sum's overs guard, not a track's processing, so it
  is not in a stem; a session that never reaches the ceiling makes this exactly zero;
- a **Return** is a shared, effect-only channel: its wet signal belongs to the whole mix,
  and the stems between them carry it once each through the sends that reach it.

Each stem's routing note in `export.json` states its output, which Return you would have
to re-create, and that the master limiter is absent — plan §12's "document carefully".

### 22.3 Format, sample rate and the absence of mastering

- **WAV only** (plan §12). Two encodings: **32-bit IEEE float** (default — the engine's
  own precision, so the file's samples are the render's samples bit for bit) and
  **24-bit PCM** (`formatFromId("pcm24", rate)`), which is the only path that can clip; it
  rounds to nearest, clamps, and reports `clipped: true` per file.
- **Stereo, at the project's sample rate** — `DSP_SAMPLE_RATE`, 48 kHz (§16).
- **No dither.** No noise shaping, no loudness measurement, no `-14 LUFS`, no
  normalisation, no maximisation, no master-bus EQ or compression — §15/§16 fix the
  safety limiter as an overs guard and nothing else. A quiet mix stays quiet; a hot mix is
  held at the ceiling rather than turned down to a target.
- `export.json` records `mastering: "none"` so a downstream tool cannot guess otherwise.

### 22.4 Folder structure and file names

One folder per export, named after the project:

```
<Project>/
  <Project> - mix.wav
  Stems/01 Kick.wav
  Buses/01 Drums.wav
  export.json
```

Names are produced by one pure module (`plan.ts`), in this order:

1. strip what a file system cannot hold (path separators, control characters, the
   Windows-reserved set) and collapse whitespace;
2. never start with a dot, never end with a dot or a space;
3. never use a DOS device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) — those
   become `CON (name)`;
4. truncate to an **80-byte** budget, counted in bytes so a multi-byte character is never
   split, with `…` appended;
5. dedupe **case-insensitively**, adding ` (2)`, ` (3)` — two tracks called "Kick" cannot
   overwrite each other, and neither can they on a case-insensitive volume.

A stem is numbered from its track code (`01`), a bus from its bus code, so the numbers
match the Console's strip order and the order can be changed without renaming anything.

### 22.5 Progress, and what happens when things go wrong

`ExportProgress` reports `preparing → rendering → writing → manifest → done` with a
per-file fraction and an overall one. The overall fraction holds a high-water mark: the
mix and its bus files come from the same pass, so their per-file fractions interleave and
a bar must never jump backwards.

The export reports rather than throws, and never leaves a half-written file:

| situation | result |
| --- | --- |
| nothing selected | `stopped.reason = "no-selection"`, one sentence, no files |
| selected output has nothing to render | `stopped.reason = "no-audio"`, with the plan's own note |
| one file fails (source, DSP, write) | that file is aborted and recorded in `failures`; the rest continue |
| the destination cannot be created at all | `stopped.reason = "write"`, export ends |
| an unsupported format/sample rate | `reason = "format"`, fatal, because the next file would fail identically |
| the user cancels | `reason = "cancelled"`, the current file aborted |
| the project changed mid-export | `reason = "project-changed"` (from `RenderProjectChangedError`) |
| a bus receives nothing | left out, and `plan.notes` says how many |

Failures are also written into `export.json` as `skipped`, so a folder cannot look
complete when one file is missing.

### 22.6 External rulebooks

A rulebook is JSON with schema `alloy.rulebook/1`:

```json
{
  "schema": "alloy.rulebook/1",
  "id": "cinematic",
  "name": "Cinematic",
  "targets": [
    { "scope": "all", "settings": [{ "parameter": "compressor.threshold", "value": -18 }] },
    { "scope": "family", "id": "drums", "settings": [{ "parameter": "eq.lf.gain", "value": 2.5 }] },
    { "scope": "role", "id": "bass", "settings": [{ "parameter": "compressor.ratio", "value": 3 }] }
  ]
}
```

- **The vocabulary is the engine's own parameter specs** (`RULES` in
  `src/lib/rulebook/rulebook.ts` references `EQ_FREQ`, `EQ_GAIN`, `EQ_Q` and the five
  `COMP_*` specs *by object identity*). A rulebook therefore cannot invent a control, a
  unit or a range: it names a path and a number, and the mixer decides what that means.
- **Paths the plan locked are refused by name** (`PINNED_PATHS`: priority, tier, mode,
  ownership, routing, output, sends, master) — a rulebook may not overrule §16.
- **Validation collects every problem** and returns them as
  `{ok: false, problems: [{kind, path, message}]}` with JSON paths such as
  `targets[1].settings[0].value`. Kinds: `missing`, `malformed-json`,
  `unsupported-schema`, `structure`, `unsupported-parameter`, `pinned-parameter`,
  `value-out-of-range`, `wrong-type`. A file loader (`loadRulebookFile`) distinguishes
  "no such file" from "not JSON", and `loadRulebooks` loads several while keeping every
  problem next to the file that caused it.
- **Application is the softest nudge.** `applyRulebook` writes only values whose owner is
  `auto` — a Manual value is the user's, the same rule Tasks 6.x and 7.x use — clamps and
  steps them to the spec, reports what changed and which scopes matched nothing, and
  returns a NEW project (copy-on-write per chain; the caller's project is untouched). It
  runs **after** tier/priority protection and masking resolution: plan §9's precedence.
- **The shipped rulebook is inert.** `PLACEHOLDER_RULEBOOK` is valid, changes nothing, and
  says so in its own `$comment`: plan §9 defers the numeric contents to listening tests,
  so inventing values here would be exactly what it forbids.

The application is at the library level: there is no rulebook screen, no file picker in
the UI and no automatic genre lookup. Loading a file is the caller's job (a `readText`
callback), which keeps the module free of DOM and Node specifics.

## 23. Playhead, transport semantics and follow (Task 10.1)

**What this section pins.** The playhead's whole contract across the app: the
§3 stop semantics, the `lastPlaybackStartPosition` / `stoppedPosition` pair,
the §7 loop wrap, the §1 live position, the §4/§7 follow engine, the §13
per-panel follow state, the §14 preferences, and where each lives.

- **One authoritative position.** The transport controller owns it in frames
  at the output's sample rate. While an attempt runs, the LIVE read is
  `positionFramesNow()` — the Web Audio output's own clock
  (`context.currentTime` against the attempt's epoch), never a JS interval's
  guess; a 50 ms poll mirrors it into the reactive `positionFrames` for the
  readouts. A restart guard holds the TARGET through the wrap's async gap so
  a dead clock (position 0) can never blip the playhead to the project start.
- **`lastPlaybackStartPosition`** is the transport's `startFrame`: recorded by
  a fresh Play (never by a pause-resume), re-recorded by a locate while
  playing (§8), never by any Stop or loop wrap. Previous locates here;
  Return-to-start-on-stop returns the playhead here; a replay from the end
  restarts here. Task 8.1 used frame 0 until the first Play moves it.
- **`stoppedPosition`** records where the last run STOPPED — the freeze point
  of a Stop (even when Return-to-start then moves the playhead) and of the
  natural end (§11: the playhead is left at the project's end, visible, and
  the view never scrolls into empty space for it).
- **Stop, pause and the two preferences (§3).** Pause freezes at the clock and
  never moves the start memory. Stop freezes at the output's own clock and
  records it; with `returnToStartOnStop` the playhead returns to the last
  fresh start instead. A Stop while already stopped returns to the start only
  with `secondStopReturnsToStart`. The two preferences are read live at every
  Stop through the injected `stopBehaviour` provider (both off when absent,
  which is what Node tests drive).
- **Looping (§7).** The region lives in the playhead module
  (`setLoop`/`clearLoop`, frames, validated); the controller polls it on the
  50 ms poll and wraps by restarting the attempt at the loop start — a wrap
  is not a locate, so the start memory keeps the user's last fresh start. The
  wrap point is clamped to the playable duration. Sample-accurate looping
  belongs to the session producers; wrapping a bounded producer from outside
  costs up to the poll's 50 ms — the honest limit, and said so.
  **No UI sets a region yet** (no loop control exists in ALLOY); the
  machinery, the follow integration and the tests are the contract the
  editor that draws a loop region will meet.
- **The follow engine is pure** (`lib/playback/follow.ts`, imports nothing):
  `followTarget(mode, trigger, playheadT, win, loop) → scrollLeft | null` in
  timeline-local pixels. Smooth holds while the playhead is visible left of
  the trigger line (the default 0.75 of the visible timeline) and tracks at
  and past it; an off-window playhead is brought back, never lost. Page holds
  while visible and snaps on exit. Centered is 0.50 by definition; stationary
  always tracks at the panel's trigger. A loop that fits on screen holds
  every mode — no page movement over an on-screen loop.
- **The applying side** (the Arrange layer) runs only while something moves:
  one element per frame (`transform: translateX`, `will-change`), the rAF
  loop alive only while playing or dragging, one draw per change at rest.
  Large corrections ease in over 240 ms (a wrap, a re-follow, a locate from
  far away); steady tracking is exact; page snaps by design; reduced motion
  makes every correction exact.
- **Per-panel follow (§13).** Each panel keeps its own mode/trigger/suspension
  in `lib/playback/playhead.svelte.ts`; a panel that never chose reads the
  Settings defaults. Suspension reasons: `manual-scroll`, `edit`, `scrub`.
  Resume: a restart of playback, a locate while playing, the Re-follow key,
  the F shortcut, or choosing a mode — never a pause-resume, never a wrap.
  After an edit ends the suspension STAYS and the toolbar shows the badge
  with the Re-follow key (§9).
- **The preferences (§14).** The `transport` group in Settings: both Stop
  preferences off, Smooth continuous follow, 0.75, suspend-on-manual-scroll
  on, plus click-to-play (off) and the stationary-while-recording override
  (off). One write per control; the document falls back field by field, so a
  stored document can never smuggle in a value no control offers.
- **Recording.** `isRecording` is FALSE in this build — ALLOY v1 has no
  recording path (the plan has none). The §10 rule (the stationary override)
  is implemented and tested synthetically; the future recorder meets it on
  this contract.
- **Clicks and scrubs.** A click in the timeline region (never the pinned
  track list) locates through the inverse piecewise map (`barsToSeconds`),
  so the click and the line it produces are the same musical moment by
  construction; click-to-play starts playback besides (§2). The drag cap
  scrubs: the line follows the hand, follow stands down for the drag, and ONE
  locate lands on release — a seek per pointermove would reopen the sources
  per event.
