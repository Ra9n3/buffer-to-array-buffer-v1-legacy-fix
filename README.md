# ALLOY

Rule-based automatic rough-mixing application. The build now carries the product's
working audio path end to end: import 48 kHz stems, mix them, route them through
buses and Returns, listen to them, export them, and reopen the project.

All UI work through Phase 2 is implemented and approved. The DSP, routing, import,
rendering, playback and export layers are implemented and covered by automated
tests (425 tests across 36 suites). This README describes **verified** behaviour;
`task-reports/9.1-stabilization.md` is the audit that produced it, including the
things that are **not** wired and the ones that cannot be checked without a browser.

## Sources of truth

| File | Purpose |
| --- | --- |
| `ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt` | Product-level source of truth, including the Phase 0–9 roadmap |
| `ALLOY-HARDWARE-REFERENCE-SPEC.md` | Required reading for Phase 1 and Phase 2 UI work |
| `ALLOY-PRODUCT-GLOSSARY.md` | Canonical terminology |
| `ALLOY-TASK-PROMPT-TEMPLATE.md` | Required task/report structure |
| `decisions-log.md` | Recorded decisions, including the owner's UI rulings |
| `data-model.md` | The project model and its invariants |
| `task-reports/` | One report per finished task |

## Stack

Svelte 5 + TypeScript + Vite 7. No SvelteKit and no server-side rendering, per
the locked decision in the product plan. No runtime dependencies beyond Svelte;
the DSP, the WAV codec, the exporter and the asset store are all first-party code
in `src/lib/`.

## Commands

```bash
npm install
npm run dev              # development server
npm run build            # production build (single self-contained index.html)
npm run preview          # serve the production build
npm run check            # svelte-check + TypeScript diagnostics (0 errors, 0 warnings)
npm test                 # full suite: 425 tests, 36 files, no browser needed
                       # one structural contract check per area:
                       #   arrange · mixer · transport · tokens · knob · fader · switch
                       #   meter · label-lamp · console-bridge · channel-strip
                       #   console-transport · bus-return · arrange-rows
                       #   arrange-timeline · mixer-detail · mixer-chain-types · project
                       #   routing · editing · home-settings · import · analysis · dsp
                       #   dynamics · return-dsp · engine · sidechain · masking
                       #   rendering · playback · export
npm run check:playback   # e.g. the shared-transport contract (41 checks)
npm run check:export     # e.g. WAV export and rulebook contract (95 checks)
```

The 32 `check:*` scripts are structural contracts, not linters: each one pins a
public component's markup, its approved dimensions and the invariants a future
change must not quietly break. They run in about a second and are the reason a
refactor cannot silently move a control or drop a guard.

## What actually works

### Rooms and routing

Hash routes keep the shell static-host friendly:

- `#/console` — default room
- `#/arrange`
- `#/mixer`
- `#/dev/components` — private token/component playground, not a room, not in the nav

All three rooms read **one** project store (`src/lib/project/store.svelte.ts`).
There is no per-room copy of a track, a level, a mute, a solo or a name: a change
made in the Console is what the Mixer and the Arrange rows read on their next
render. Cross-room consistency is structural, not synchronised after the fact.

### Import

Drag or choose WAV files in the Arrange room's import band.

| Accepted | Refused |
| --- | --- |
| WAV · **48 kHz** · **24-bit PCM** or **32-bit float** · **mono or stereo** | any other sample rate (no resampling), 16/8-bit or compressed WAVs, more than 2 channels, files that are not WAV |

Refusals are per file and per reason: a format problem says what the file is and
what to re-export; a file that is not a WAV is a *format* refusal, not a claim
that it is damaged. A batch keeps every file that passed. A mono stem is
flagged, not duplicated. A very short stem is flagged and padded. A silent stem
is flagged. The same file imported twice becomes two tracks with two copies of
the audio — ALLOY keeps no import history, so nothing is overwritten (verified,
and a known limitation).

An import is **not undoable** (like a project switch, it leaves nothing to undo);
it is saved by autosave immediately.

### Project state, undo/redo and autosave

Every editable leaf of the project is registered by a stable path
(`src/lib/project/fields.ts`). The store observes them, records what moved as one
history entry, and autosave writes the manifest to Web Storage 1 s after the last
change. Undo and redo are `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` / `Ctrl+Y`, and are
suppressed while typing in a text field. An edit and its undo restore the exact
value (verified for the channel level; the mechanism is the same for every
registered field).

### Processing and the mix engine

Per-channel trim, pan, level, mute, solo; sends to the Reverb and Delay Returns;
EQ, compressor, expander; buses; sidechain detection; masking resolution and the
safety limiter are implemented in `src/lib/engine/` and verified as modules.

**MIX does not yet invoke masking.** `measureMaskingSources`,
`detectMaskingConflicts`, `resolveMaskingConflicts` and `resolveMaskingAudio` are
implemented and tested but no application code calls them — see the known issues
below.

### Playback — three modes, one transport

| Mode | What it plays | Reachable from the UI |
| --- | --- | --- |
| **RAW** (default) | the stems as imported, summed with no channel processing | yes — the default, and the source selector |
| **PREVIEW** | the live lightweight preview: real routing and DSP, chunked | yes — the source selector |
| **RENDER** | the full rendered mix | yes — the Console's MIX button, or the source selector |

The mode is chosen with the three-position **Raw · Preview · Render** control in the mini
transport, which is visible in every room. It is an addition beside the four approved keys and
MIX, not a replacement for any of them: PREVIOUS, PLAY, STOP, NEXT and MIX keep their exact
functions. Choosing a mode never starts playback, STOP and the locate keys never change the mode,
and the playhead position survives a switch.

MIX is the Console deck's separate render action, not Play (`D2.3.2`). Play
toggles play/pause, Stop returns to the defined start, Previous locates to the
start and Next to the end of the current source. The transport is one controller
for all three rooms: switching rooms cannot remount it, reset it or resume it
twice. Playback state includes the playable length, which is measured when the
shell installs and re-measured when the project's structure moves (an import, a
project switch, an undo past one).

### Export

The export **library** writes a full mix, processed stems and processed buses as
WAV (`src/lib/export/`), with a manifest, collision-free names and no mastering
or loudness maximisation. Two formats, both 48 kHz stereo and both re-importable:

| Format | Encoding |
| --- | --- |
| `float32` (default) | 48 kHz · 32-bit float · stereo |
| `pcm24` | 48 kHz · 24-bit PCM · stereo |

Verified export invariants: the processed stems sum to the full mix (max error
< 1e-6 below the limiter's threshold); a bus file is sample-aligned with the mix
where the bus carries latency (best cross-correlation lag is zero); the manifest
states `mastering: "none"`.

**There is no export UI.** The exporter is a library the app does not yet call —
no button starts an export. The same is true of opening a project from disk:
autosave and the reopen path exist, but there is no file-open control.

### Rulebooks

`schema: "alloy.rulebook/1"` validation, safe failure on bad input, and a shipped
**placeholder** rulebook that is valid, honest and changes nothing (plan §9
defers the numeric contents until listening tests). The exporter can report a
rulebook set beside the files. Nothing in the app currently loads a rulebook.

## Structure

```text
src/
├── App.svelte                    application shell and room routing
├── main.ts                       app mount and shell installation
├── components/                   approved UI: strips, keys, knobs, faders,
│                                 meters, labels, lamps, transport, import band
│                                 MiniTransportSource.svelte = the source selector
├── dev/DevComponentsPage.svelte  private component playground
├── lib/
│   ├── tokens.css / tokens.ts    design tokens: values / metadata, kept in step
│   ├── project/                  model, store, history, autosave, import, lifecycle
│   ├── audio/                    WAV codec, import rules, asset store, peaks
│   ├── analysis/                 level · spectral · transient · stereo · integrity
│   ├── dsp/                      EQ · dynamic EQ · compressor · expander · limiter ·
│   │                             FDN reverb · delay
│   ├── engine/                   chains, routing, summing, buses, sidechain, masking
│   ├── rendering/                bounded render
│   ├── playback/                 controller, sessions, Web Audio output, facade
│   ├── export/                   planner, encoder, destinations, manifest
│   ├── rulebook/                 schema, validation, shipped placeholder
│   └── arrange.ts, mixer.ts, rooms.ts, settings.svelte.ts
└── rooms/                        ConsoleRoom · ArrangeRoom · MixerRoom
scripts/                          32 structural contract checks
tests/                            36 suites, 425 tests, no browser required
```

## Known issues and deferred work

Full detail in `task-reports/9.1-stabilization.md`. In short:

1. **Nothing about the listening source is outstanding** — it was the last functional hole
   in the transport and it is closed. RAW / PREVIEW / RENDER are all selectable from the
   source selector in the mini transport, the active mode is shown in
   `Stopped — RAW / PREVIEW / RENDER`, and RAW is reachable again after MIX. The selector is
   **not saved with the project**: a reload starts at RAW.
2. **MIX does not resolve masking**, so the Auto-vs-Manual and rerun semantics of
   plan §10/§15 are verified in the engine, not in the integrated path.
3. **No export UI and no open-project UI.**
4. **None of the UI has been exercised in a browser here.** This environment has no
   browser, so all browser-level behaviour is verified only through the logic the
   components call. A manual pass is still required.
5. **There is no Tauri shell** — the native port has not started; see the
   native-port section of the 9.1 report for what it requires.

## Retired documentation site

The previous React documentation/playground site is preserved in
`archive/documentation-site/` for reference only. It is not part of the build.
