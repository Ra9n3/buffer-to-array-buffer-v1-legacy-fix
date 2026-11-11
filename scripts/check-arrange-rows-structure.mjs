#!/usr/bin/env node
/**
 * Arrange track-list rows structural contract check — Task 2.5.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * the row's 5rem, the list column's clamp(12rem, 16vw, 15rem), the row /
 * lane alignment, the visible row count, the legends over their fields, the
 * open list's z-order and drop-up, and the long-name truncation were
 * measured in a real browser at 1920, 1440, 1280, 1024 and 768 CSS px (see
 * task-reports/2.5-report.md and evidence/arrange/). What it tests is the
 * source-level contract:
 *
 *   1. The row is still the Task 0.4 cell: a direct grid child, sticky at
 *      the left, taking its height from --arrange-row-height, its padding
 *      the Phase 0 4 px / 8 px as tokens, no scrolling axis of its own, the
 *      `track-row` region with its code and lane hooks.
 *   2. Composition: three lines — the flat org tab beside the code and the
 *      engraved name (EngravedLabel, truncating); the SOURCE TYPE
 *      ScribbleSelect beside the FAMILY ScribbleSelect (the Task 2.5
 *      follow-ups: eleven families, the source list dependent on the
 *      family, the family window stacked over the tier window); the role
 *      print and the Prominence Tier ScribbleSelect — approved components
 *      only; no `<select>`, no control drawn by hand, no duplicate control.
 *   3. The ScribbleSelect is the send slot's window and plate, value for
 *      value, with select-only combobox semantics: `button role="combobox"`
 *      with haspopup / expanded / controls, a `listbox` of `option`s marked
 *      `aria-selected`, keyboard (arrows, Home / End, Enter / Space, Escape,
 *      Tab, type-ahead), outside press closes, drop-up when the scroller has
 *      more room above; the selected dot is amber (engaged), never green;
 *      the plate scrolls inside itself; tokens only.
 *   4. Role and Tier are two axes: a role is printed, never chosen here; the
 *      tier is one of three (D2.5.1), default Supporting (plan §5a); the
 *      families are the owner's eleven in the owner's order (Percussion its
 *      own family); the source catalog is the owner's compact list, every
 *      source a stable snake_case `sourceTypeId` with a label and a family,
 *      plus Unspecified (`null`) in every family; a family change keeps a
 *      source that belongs and otherwise clears it to Unspecified — never a
 *      default (second follow-up, supersedes D2.5.12); neither choice
 *      touches role, tier or the display name; the name is a prop the row
 *      never writes; no detection, classification or rule evaluation.
 *   5. Fixture honesty: names and org colours DERIVE from the Console's
 *      track list (one session); settings are typed-in constants; the row
 *      is marked `data-simulated`; choices are the row's own `$state`, no
 *      store, no persistence, no audio, no routing.
 *   6. The org colour is the tab only — never a row tint (prompt): the tab
 *      is `background-color: var(--org)` and nothing else reads --org.
 *   7. The corner keeps its `track-list-header` region in the room file and
 *      prints its legends in the row's order; the list column floor is
 *      12rem (D2.5.3).
 *   8. Scope: no screw heads (D2.1.9); the Mixer, the Console, the approved
 *      components, the send slot, the track strip, the fixtures and app.css
 *      are byte-identical to their approved files (the timeline lane was
 *      pinned here until Task 2.6 took it over);
 *      no dependency added or changed; the playground section exists.
 *
 * Run: npm run check:arrange-rows
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const count = (text, re) => (text.match(re) ?? []).length;
const templateOf = (svelte) => svelte.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*<\/style>/, "");
const scriptOf = (svelte) => (svelte.match(/<script[\s\S]*?<\/script>/g) ?? []).join("\n");
const styleOf = (svelte) => svelte.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? "";
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
/** The body of the first rule whose selector list is exactly `selector`. */
const ruleBody = (css, selector) => {
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = stripComments(css).match(re);
  return m ? m[2].replace(/\s+/g, " ").trim() : null;
};
/** One declaration's value inside a rule body. */
const decl = (body, prop) => body?.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`))?.[1].trim() ?? null;

const rowPath = "src/components/ArrangeTrackRow.svelte";
const selectPath = "src/components/hardware/ScribbleSelect.svelte";
const roomPath = "src/rooms/ArrangeRoom.svelte";
const dataPath = "src/lib/arrange.ts";
check("the row, the select, the room and the data file exist", [rowPath, selectPath, roomPath, dataPath].every(exists));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

const row = read(rowPath);
const rowTemplate = templateOf(row);
const rowScript = scriptOf(row);
const rowStyle = styleOf(row);
const select = read(selectPath);
const selectTemplate = templateOf(select);
const selectScript = scriptOf(select);
const selectStyle = styleOf(select);
const slot = read("src/components/channel-strip/SendSlot.svelte");
const slotStyle = styleOf(slot);
const strip = read("src/components/channel-strip/TrackStrip.svelte");
const room = read(roomPath);
const roomTemplate = templateOf(room);
const roomStyle = styleOf(room);
const data = read(dataPath);
const devPage = read("src/dev/DevComponentsPage.svelte");
const devFixture = exists("src/dev/ArrangeRowFixture.svelte") ? read("src/dev/ArrangeRowFixture.svelte") : "";
const pkg = JSON.parse(read("package.json"));
const newSource = [row, select, data, devFixture].join("\n");

// --- 1. Still the Task 0.4 cell. -------------------------------------------------
const rowRule = ruleBody(rowStyle, ".row");
check("the row is one block, sticky at the left with the Phase 0 z-index", decl(rowRule, "position") === "sticky" && decl(rowRule, "left") === "0" && decl(rowRule, "z-index") === "2");
check("the row takes its height from --arrange-row-height and nothing else sets a height", decl(rowRule, "height") === "var(--arrange-row-height)" && count(stripComments(rowStyle), /(?<!-)height:/g) === 2 && /\.row__tab \{[^}]*height: 1rem/s.test(stripComments(rowStyle)));
check("the row's padding is the Phase 0 4 px / 8 px as tokens (space-2xs space-sm)", decl(rowRule, "padding") === "var(--al-space-2xs) var(--al-space-sm)");
check("the row creates no scrolling axis and no longer clips (the plate must leave the cell)", !/overflow(-x|-y)?:\s*(auto|scroll)/.test(rowStyle) && !/\.row \{[^}]*overflow:\s*hidden/s.test(stripComments(rowStyle)));
check("the row keeps its region, code and lane hooks", /data-arrange-region="track-row"/.test(rowTemplate) && /data-track-code=\{track\.code\}/.test(rowTemplate) && /data-lane=\{laneId\}/.test(rowTemplate));
check("the row is a named group: role=group labelled by its engraved name", /role="group"/.test(rowTemplate) && /aria-labelledby=\{`\$\{uid\}-name`\}/.test(rowTemplate) && /<EngravedLabel id=\{`\$\{uid\}-name`\} text=\{track\.name\}/.test(rowTemplate));
// Task 3.1: the row takes the store's live view of the track (arrangeTrackOf) and
// binds its settings to the store (live={trackMeta(...)}); still one row + one lane per track.
check("the room renders one row and one lane per track, the row taking the store's track view and its live binding (Task 3.1) and, since Task 5.1, the track's stem facts (audio, padded, asset status)", /<ArrangeTrackRow\s+track=\{arrangeTrackOf\(track\.id\)\}\s+live=\{trackMeta\(track\.id\)\}\s+laneId=\{`lane-\$\{track\.code\}`\}\s+audio=\{track\.audio\}\s+padded=\{isPadded\(track\.audio\)\}\s+audioStatus=\{assets\.statusOf\(track\.id\)\}\s*\/>/.test(roomTemplate) && count(roomTemplate, /<ArrangeTrackRow\b/g) === 1 && count(roomTemplate, /<ArrangeTimelineLane\b/g) === 1);
check("a row with an open list is lifted above the rows beneath it (sticky siblings paint in DOM order)", /\.row:has\(:global\(\[aria-expanded="true"\]\)\) \{[^}]*z-index:\s*3/s.test(stripComments(rowStyle)));
check("the compact row (≤ 40rem) only closes the gaps — no new heights", /@media \(max-width: 40rem\) \{[\s\S]*\.row \{\s*gap: 1px;\s*\}/.test(stripComments(rowStyle)) && !/@media \(max-width: 40rem\) \{[\s\S]*height/.test(stripComments(rowStyle)));

// --- 2. Composition. -------------------------------------------------------------
check("the row imports EngravedLabel and ScribbleSelect from hardware, and the org token from the Console fixtures", /import EngravedLabel from "\.\/hardware\/EngravedLabel\.svelte"/.test(rowScript) && /import ScribbleSelect from "\.\/hardware\/ScribbleSelect\.svelte"/.test(rowScript) && /import \{ SIMULATED, orgToken \} from "\.\/channel-strip\/track-strip-fixtures"/.test(rowScript));
check("line 1: the org tab, the code (EngravedLabel sm, value, muted), the name (EngravedLabel md, value, bright, truncating)", /<span class="row__tab" style:--org=\{orgToken\(track\.org\)\} data-org-tab=\{String\(track\.org\)\} aria-hidden="true"><\/span>/.test(rowTemplate) && /<EngravedLabel text=\{track\.code\} size="sm" kind="value" tone="muted" title=\{`Track \$\{track\.code\}`\} \/>/.test(rowTemplate) && /<EngravedLabel id=\{`\$\{uid\}-name`\} text=\{track\.name\} size="md" kind="value" tone="bright" truncate \/>/.test(rowTemplate));
check("line 2 left: the SOURCE TYPE combobox — ScribbleSelect sm, aligned start, the chosen family's sources (Unspecified first), disabled while no family is set", /<span class="row__source">\s*<ScribbleSelect\s+label="Source type"\s+context=\{track\.name\}\s+options=\{sourceOptions\}\s+value=\{model\.sourceTypeId \?\? UNSPECIFIED_ID\}\s+onchange=\{chooseSource\}\s+disabled=\{model\.familyId === null\}\s+size="sm"\s+align="start"\s+hook="source"\s*\/>\s*<\/span>/.test(rowTemplate));
check("line 2 right: the FAMILY combobox — ScribbleSelect sm over the eleven families, in the tier window's column (5.75rem)", /<span class="row__family">\s*<ScribbleSelect\s+label="Family"\s+context=\{track\.name\}\s+options=\{FAMILY_OPTIONS\}\s+value=\{model\.familyId \?\? ""\}\s+onchange=\{chooseFamily\}\s+size="sm"\s+hook="family"\s*\/>\s*<\/span>/.test(rowTemplate) && /\.row__family \{[^}]*flex:\s*0 0 5\.75rem/s.test(stripComments(rowStyle)) && rowTemplate.indexOf('class="row__source"') < rowTemplate.indexOf('class="row__family"'));
check("line 3: the role print (EngravedLabel, titled with the plan's full wording) and the tier window (ScribbleSelect xs over PROMINENCE_TIERS, printing the model's tier; a choice — the shown tier included — goes to the model, Task 3.1)", /<span class="row__role" title=\{`Role: \$\{theRole\.long\} \\u2014 the track's musical function`\} data-track-role-print>\s*<EngravedLabel text=\{theRole\.name\} size="sm" \/>\s*<\/span>/.test(rowTemplate) && /<ScribbleSelect\s+label="Prominence tier"\s+context=\{track\.name\}\s+options=\{PROMINENCE_TIERS\}\s+value=\{model\.tier\}\s+onchoose=\{chooseTier\}\s+size="xs"\s+hook="tier"\s+title=/.test(rowTemplate));
check("exactly three ScribbleSelects (source, family, tier) and three EngravedLabels per row plus the one stamp print of Task 5.1 (inside its each block); no other control", count(rowTemplate, /<ScribbleSelect\b/g) === 3 && count(rowTemplate, /<EngravedLabel\b/g) === 4 && /\{#each stamps as stamp \(stamp\.id\)\}\s*<span class="row__stamp"[^>]*>\s*<EngravedLabel text=\{stamp\.text\} size="xs" tone="muted" \/>/.test(rowTemplate) && !/<(select|input|button|Knob|Fader|TactileSwitch|Lamp|VUMeter|LedLadder)\b/.test(rowTemplate));
check("the tier window keeps one width (5.75rem, the family window's) whatever it prints; the source window takes the rest of its line", /\.row__tier \{[^}]*flex:\s*0 0 5\.75rem/s.test(stripComments(rowStyle)) && /\.row__source \{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0/s.test(stripComments(rowStyle)) && count(stripComments(rowStyle), /flex:\s*0 0 5\.75rem/g) === 2 && !/5\.5rem/.test(stripComments(rowStyle)));
check("the name truncates in its own flex item (min-width 0)", /\.row__name \{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0/s.test(stripComments(rowStyle)));
check("the tooltips are concise and name the field: source type / family / tier / role; no decorative text", /title=\{`Prominence tier, \$\{track\.name\}: \$\{tierName\} \\u2014 how the track is treated in mix conflicts`\}/.test(rowTemplate) && !/placeholder|lorem|TODO/i.test(rowTemplate));

// --- 3. The ScribbleSelect: the send slot's recipe with combobox semantics. --------
const sameAs = (sel, slotSel, drop = []) => {
  const a = ruleBody(selectStyle, sel);
  const b = ruleBody(slotStyle, slotSel);
  if (!a || !b) return false;
  const norm = (body) => body.split(";").map((d) => d.trim()).filter((d) => d && !drop.some((p) => d.startsWith(`${p}:`))).sort().join(";");
  return norm(a) === norm(b);
};
check("the window is the send slot's window, value for value (height and print size parameterised, ink the primary print)", (() => {
  const a = ruleBody(selectStyle, ".select__window");
  const b = ruleBody(slotStyle, ".slot__window");
  if (!a || !b) return false;
  const norm = (body) => body.split(";").map((d) => d.trim()).filter(Boolean).sort().join(";");
  const a2 = norm(a.replace("min-height: var(--sel-min-height)", "min-height: 1.125rem").replace("font-size: var(--sel-type)", "font-size: var(--al-text-size-2xs)").replace("color: var(--al-text-primary)", "color: var(--al-text-muted)").replace("width: 100%; ", ""));
  const b2 = norm(b.replace("width: 100%; ", ""));
  return a2 === b2;
})(), "window rule differs from SendSlot .slot__window");
check("the chevron is the send slot's", sameAs(".select__chevron", ".slot__chevron"));
check("the plate is the send slot's menu, value for value, plus its own scrolling (16rem / 60vh) and width (the window at least, 16rem at most)", (() => {
  const a = ruleBody(selectStyle, ".select__list");
  const b = ruleBody(slotStyle, ".slot__menu");
  if (!a || !b) return false;
  const own = ["width", "min-width", "max-width", "max-height", "overflow-y", "overscroll-behavior", "scrollbar-width", "scrollbar-color", "top", "left", "right", "z-index", "display", "flex-direction"];
  const norm = (body) => body.split(";").map((d) => d.trim()).filter((d) => d && !own.some((p) => d.startsWith(`${p}:`))).sort().join(";");
  return norm(a) === norm(b) && /max-height:\s*min\(16rem, 60vh\)/.test(a) && /overflow-y:\s*auto/.test(a) && /min-width:\s*100%/.test(a) && /max-width:\s*16rem/.test(a) && /width:\s*max-content/.test(a);
})(), "plate rule differs from SendSlot .slot__menu");
check("an option is the send slot's item, value for value", sameAs(".select__option", ".slot__item"));
check("the selected dot is amber — engaged, D1.6 — never the green send dot", /\.select__option\[aria-selected="true"\] \.select__dot \{[^}]*background:\s*var\(--al-function-amber-hi\)/s.test(stripComments(selectStyle)) && !/green/.test(selectStyle));
check("two sizes only: xs = the strips' 18 px / 2xs print, sm = 22 px / xs print", /--sel-min-height: 1\.125rem;\s*--sel-type: var\(--al-text-size-2xs\);/.test(stripComments(selectStyle)) && /\.select--sm \{\s*--sel-min-height: 1\.375rem;\s*--sel-type: var\(--al-text-size-xs\);\s*\}/.test(stripComments(selectStyle)) && /export type SelectSize = "xs" \| "sm";/.test(selectScript));
check("the window is a button with select-only combobox semantics", /<button\s+type="button"\s+class="select__window"\s+role="combobox"\s+aria-haspopup="listbox"\s+aria-expanded=\{open\}\s+aria-controls=\{`\$\{uid\}-list`\}\s+aria-label=\{windowName\}/.test(selectTemplate));
check("the plate is a listbox of options marked aria-selected, each carrying its id", /role="listbox"\s+id=\{`\$\{uid\}-list`\}\s+aria-label=\{`\$\{who\} options`\}/.test(selectTemplate) && /role="option"\s+tabindex="-1"\s+aria-selected=\{option\.id === value\}\s+data-select-option=\{option\.id\}/.test(selectTemplate));
check("the accessible name says what, whose and which: '<label>, <context>: <current>. Choose'", /const who = \$derived\(context \? `\$\{label\}, \$\{context\}` : label\);/.test(selectScript) && /const windowName = \$derived\(`\$\{who\}: \$\{currentName\}\. Choose`\);/.test(selectScript));
check("keyboard: arrows wrap, Home / End, Enter / Space choose, Escape closes to the window, Tab leaves, letters type ahead", /event\.key === "ArrowDown"/.test(selectScript) && /event\.key === "ArrowUp"/.test(selectScript) && /event\.key === "Home"/.test(selectScript) && /event\.key === "End"/.test(selectScript) && /event\.key === "Enter" \|\| event\.key === " "/.test(selectScript) && /event\.key === "Escape"/.test(selectScript) && /event\.key === "Tab"/.test(selectScript) && /names\[j\]\.startsWith\(letter\)/.test(selectScript) && /\(i \+ 1\) % list\.length/.test(selectScript) && /\(i - 1 \+ list\.length\) % list\.length/.test(selectScript));
check("opening focuses the current option; closing returns focus to the window", /function focusCurrent\(\)/.test(selectScript) && /if \(restoreFocus\) windowEl\?\.focus\(\);/.test(selectScript));
check("a press outside closes the list (document pointerdown)", /<svelte:document onpointerdown=\{onDocumentPointerDown\} \/>/.test(selectTemplate) && /if \(open && rootEl && !rootEl\.contains\(event\.target as Node\)\) close\(false\);/.test(selectScript));
check("the plate drops up when the nearest scroller has more room above than below", /function scrollHost\(/.test(selectScript) && /dropUp = listEl\.offsetHeight > below && above > below;/.test(selectScript) && /\.select\.is-up \.select__list \{[^}]*bottom:\s*calc\(100% \+ var\(--al-space-3xs\)\)/s.test(stripComments(selectStyle)));
check("the chosen id is the caller's (bindable value + onchange); the select stores nothing", /value = \$bindable\(\)/.test(selectScript) && /onchange\?\.\(id\);/.test(selectScript) && !/localStorage|sessionStorage|fetch\(|writable\(|readable\(/.test(select));
check("the select is tokens only: no hex colour, rem / px geometry from the slot, no new semantic colour", !/#[0-9a-fA-F]{3,8}\b/.test(selectStyle) && !/--al-function-(red|green)|warning|success/.test(selectStyle));
check("the select renders no native <select> and no screw", !/<select\b/.test(selectTemplate) && !/screw/i.test(select));
check("the select's hooks: data-select (hook or label), data-select-value, data-select-open, window, list, option", /data-select=\{hook \?\? label\}/.test(selectTemplate) && /data-select-value=\{value\}/.test(selectTemplate) && /data-select-open=\{open\}/.test(selectTemplate) && /data-select-window/.test(selectTemplate) && /data-select-list/.test(selectTemplate));

// --- 4. Role ≠ Tier; three tiers; families and the source catalog. -----------------
check("three Prominence Tiers — primary, supporting, background — and the plan's default Supporting", /export type ProminenceTier = "primary" \| "supporting" \| "background";/.test(data) && /export const PROMINENCE_TIERS: readonly TierOption\[\] = \[\s*\{ id: "primary", name: "Primary" \},\s*\{ id: "supporting", name: "Supporting" \},\s*\{ id: "background", name: "Background" \},\s*\];/.test(data) && /export const DEFAULT_TIER: ProminenceTier = "supporting";/.test(data));
check("four roles — lead, rhythm, double, harmony — with the plan's full wording for the tooltip", /export type RoleId = "lead" \| "rhythm" \| "double" \| "harmony";/.test(data) && /\{ id: "lead", name: "Lead", long: "Lead \/ main" \}/.test(data) && /\{ id: "double", name: "Double", long: "Stacked \/ double" \}/.test(data) && /\{ id: "harmony", name: "Harmony", long: "Background \/ harmony" \}/.test(data));
check("the role is printed from the fixture and never chosen in the row (no role select, no role state)", /data-track-role=\{track\.role\}/.test(rowTemplate) && !/\$state[^;]*role/.test(rowScript) && !/options=\{ROLES\}/.test(rowTemplate));
check("the tier and the role are separate fields on the track type (the role nullable since Task 5.1: not assigned yet)", /readonly role: RoleId \| null;/.test(data) && /readonly tier: ProminenceTier;/.test(data));
// --- 4b. Families and the source catalog (Task 2.5 follow-ups). ---------------------
const FAMILY_ORDER = ["drums", "percussion", "keys", "strings", "brass", "woodwinds", "synths", "fx", "guitar", "bass", "vocals"];
/** The owner's compact catalog, family by family, in the owner's order (second follow-up). */
const CATALOG = {
  drums: ["kick=Kick", "snare=Snare", "hi_hat=Hi-Hat", "toms=Toms", "cymbals=Cymbals", "overheads=Overheads", "room=Room", "clap=Clap", "full_drum_kit=Full Drum Kit"],
  percussion: ["hand_drums=Hand Drums", "shaker=Shaker", "tambourine=Tambourine", "tuned_percussion=Tuned Percussion", "other_percussion=Other Percussion"],
  keys: ["piano=Piano", "electric_piano=Electric Piano / Rhodes", "organ=Organ"],
  strings: ["violin=Violin", "viola=Viola", "cello=Cello", "string_section=String Section", "plucked_strings=Plucked Strings"],
  brass: ["trumpet=Trumpet", "trombone=Trombone", "french_horn=French Horn", "brass_section=Brass Section"],
  woodwinds: ["flute=Flute", "clarinet=Clarinet", "oboe=Oboe", "bassoon=Bassoon", "saxophone=Saxophone", "woodwind_ensemble=Woodwind Ensemble"],
  synths: ["synth_lead=Synth Lead", "synth_pad=Synth Pad", "synth_pluck=Synth Pluck", "synth_arp=Synth Arp / Sequence", "synth_texture=Synth Texture", "other_synth=Other Synth"],
  fx: ["impact=Impact", "riser_sweep=Riser / Sweep", "atmosphere=Atmosphere", "other_fx=Other FX"],
  guitar: ["acoustic_guitar=Acoustic Guitar", "clean_electric_guitar=Clean Electric Guitar", "distorted_electric_guitar=Distorted Electric Guitar"],
  bass: ["electric_bass=Electric Bass", "upright_bass=Acoustic / Upright Bass", "synth_bass=Synth Bass", "sub_808_bass=Sub / 808 Bass"],
  vocals: ["lead_vocal=Lead Vocal", "backing_vocal=Backing Vocal", "vocal_double=Vocal Double", "choir=Choir", "spoken_rap_vocal=Spoken / Rap Vocal"],
};
const familyList = data.match(/export const FAMILIES: readonly Family\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
const familyIds = [...familyList.matchAll(/\{ familyId: "([a-z]+)", label: "([^"]+)" \}/g)].map((m) => m[1]);
const catalogBody = data.match(/export const SOURCE_TYPES: readonly SourceType\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const sourceRows = [...catalogBody.matchAll(/^  \{ sourceTypeId: "([^"]*)", label: "([^"]+)", familyId: "([a-z]+)" \},$/gm)].map((m) => ({ id: m[1], label: m[2], family: m[3] }));
const catalogEntries = catalogBody.split("\n").filter((line) => line.trim().length > 0 && !line.trim().startsWith("//")).length;
check("the eleven families, in the owner's order, as a closed type and a fixture list — Percussion its own family, not a drum sub-type", /export type FamilyId =\s*\| "drums"\s*\| "percussion"\s*\| "keys"\s*\| "strings"\s*\| "brass"\s*\| "woodwinds"\s*\| "synths"\s*\| "fx"\s*\| "guitar"\s*\| "bass"\s*\| "vocals";/.test(data) && JSON.stringify(familyIds) === JSON.stringify(FAMILY_ORDER) && /\{ familyId: "percussion", label: "Percussion" \}/.test(data) && /\{ familyId: "fx", label: "FX" \}/.test(data));
check("every source is a stable snake_case sourceTypeId with a label and a family (never a label or a track name as the id)", /export interface SourceType \{\s*readonly sourceTypeId: string;\s*readonly label: string;\s*readonly familyId: FamilyId;\s*\}/.test(data) && sourceRows.length === catalogEntries && sourceRows.every((r) => /^[a-z0-9]+(_[a-z0-9]+)*$/.test(r.id) && r.id !== r.label && !/[A-Z\s\/-]/.test(r.id)) && new Set(sourceRows.map((r) => r.id)).size === sourceRows.length);
check("the catalog is the owner's compact list, family by family, in order — 54 sources (9 + 5 + 3 + 5 + 4 + 6 + 6 + 4 + 3 + 4 + 5), nothing added, nothing missing", sourceRows.length === 54 && Object.values(CATALOG).flat().length === 54 && FAMILY_ORDER.every((f) => JSON.stringify(sourceRows.filter((r) => r.family === f).map((r) => `${r.id}=${r.label}`)) === JSON.stringify(CATALOG[f])) && JSON.stringify([...new Set(sourceRows.map((r) => r.family))]) === JSON.stringify(FAMILY_ORDER));
check("the owner's conventions and examples hold: kick / synth_bass / lead_vocal; Synth Bass and Sub / 808 under Bass, non-bass synths under Synths, Overheads and Room under Drums, Shaker under Percussion", [["kick", "drums"], ["synth_bass", "bass"], ["sub_808_bass", "bass"], ["lead_vocal", "vocals"], ["synth_lead", "synths"], ["synth_pad", "synths"], ["overheads", "drums"], ["room", "drums"], ["shaker", "percussion"], ["riser_sweep", "fx"]].every(([id, f]) => sourceRows.some((r) => r.id === id && r.family === f)) && !sourceRows.some((r) => r.family === "synths" && /bass/.test(r.id)));
check("Unspecified is the absence of a source (null), offered first in every family's list as the empty option id; no list while no family is set", /export const UNSPECIFIED_ID = "";/.test(data) && /export const UNSPECIFIED_LABEL = "Unspecified";/.test(data) && /export function sourceOptionsOf\(family: FamilyId \| null, catalog: readonly SourceType\[\] = SOURCE_TYPES\)[^\n]*\{\s*if \(family === null\) return \[\];\s*return \[\{ id: UNSPECIFIED_ID, name: UNSPECIFIED_LABEL \}, \.\.\.sourceTypesOf\(family, catalog\)\.map\(\(s\) => \(\{ id: s\.sourceTypeId, name: s\.label \}\)\)\];/.test(data) && !sourceRows.some((r) => r.id === "" || /unspecified/i.test(r.id)));
check("the helpers: sourceType (lookup), sourceTypesOf (catalog order), isValidSource (null always; a source only in its own family), familyLabel, FAMILY_OPTIONS", /export function sourceType\(id: string \| null, catalog: readonly SourceType\[\] = SOURCE_TYPES\): SourceType \| null \{\s*return id === null \? null : \(catalog\.find\(\(s\) => s\.sourceTypeId === id\) \?\? null\);/.test(data) && /export function sourceTypesOf\(family: FamilyId \| null, catalog: readonly SourceType\[\] = SOURCE_TYPES\): readonly SourceType\[\] \{\s*return family === null \? \[\] : catalog\.filter\(\(s\) => s\.familyId === family\);/.test(data) && /export function isValidSource\(family: FamilyId \| null, id: string \| null, catalog: readonly SourceType\[\] = SOURCE_TYPES\): boolean \{\s*return id === null \|\| sourceType\(id, catalog\)\?\.familyId === family;/.test(data) && /export const FAMILY_OPTIONS[^=]*= FAMILIES\.map\(\(f\) => \(\{ id: f\.familyId, name: f\.label \}\)\);/.test(data));
// Task 3.1: the row's settings live in one model — the bound `live` (the store's
// view) or the row's own fixture-seeded `own` — and the source list derives from it.
check("the row's family, source and tier are one model: the bound live view or the row's own fixture-seeded settings (Task 3.1); the source list derives from the model's family and the catalog prop", /const own = \$state<TrackMetaLive>\(\{\s*familyId: track\.familyId,\s*sourceTypeId: track\.sourceTypeId,\s*tier: track\.tier,\s*tierConfirmed: track\.tierConfirmed !== false,\s*\}\);/.test(rowScript) && /const model = \$derived\(live \?\? own\);/.test(rowScript) && /const sourceOptions = \$derived\(sourceOptionsOf\(model\.familyId, sources\)\);/.test(rowScript) && /sources = SOURCE_TYPES,/.test(rowScript) && /live = null,/.test(rowScript) && /live\?: TrackMetaLive \| null;/.test(rowScript) && !/\$derived\([^)]*familyOf/.test(rowScript));
check("a family change keeps a source that belongs and otherwise clears it to Unspecified — never a default, never the first entry (supersedes D2.5.12); the same family is a no-op", /function chooseFamily\(id: string\): void \{\s*const family = id as FamilyId;\s*if \(family === model\.familyId\) return;\s*model\.familyId = family;\s*(\/\/[^\n]*\s*)?if \(!isValidSource\(family, model\.sourceTypeId, sources\)\) model\.sourceTypeId = null;\s*\}/.test(rowScript) && !/defaultInstrument|defaultSource|\[0\]|suitable/.test(rowScript));
check("a source change sets the source only; the Unspecified option clears it", /function chooseSource\(id: string\): void \{\s*model\.sourceTypeId = id === UNSPECIFIED_ID \? null : id;\s*\}/.test(rowScript) && /function chooseTier\(id: string\): void \{\s*model\.tier = id as ProminenceTier;\s*\}/.test(rowScript));
check("neither choice touches the role, the tier or the display name (independent axes; the name is a read-only prop)", (() => { const fam = rowScript.match(/function chooseFamily[\s\S]*?\n  \}/)?.[0] ?? ""; const src = rowScript.match(/function chooseSource[\s\S]*?\n  \}/)?.[0] ?? ""; return fam.length > 0 && src.length > 0 && !/tier|role|name/i.test(fam + src) && !/track\.name\s*=|name\s*=\s*[^=]/.test(rowScript.replace(/aria-labelledby|track\.name\b(?!\s*=[^=])/g, "")) && !/\$state[^;]*\bname\b/.test(rowScript); })());
check("the row never infers a source or a family from the track name (no name matching, no auto-classification)", !/track\.name\.(match|includes|toLowerCase|startsWith|search)|RegExp\(|\.test\(track\.name/.test(rowScript + data.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the row exposes its family and source for tests (the source attribute is absent when Unspecified)", /data-track-family=\{model\.familyId\}/.test(rowTemplate) && /data-track-source-type=\{model\.sourceTypeId\}/.test(rowTemplate) && !/data-track-instrument/.test(rowTemplate));
// (Task 2.7 added the optional `tierConfirmed: false` to two session lines —
//  the plan's "needs confirmation" fixture for the Mixer; the pair parse and
//  the count below allow it.)
const sessionPairs = [...data.matchAll(/^  "(\d\d)": \{ familyId: "([a-z]+)", sourceTypeId: "([a-z0-9_]+)", role: "[a-z]+", tier: "[a-z]+"(?:, tierConfirmed: false)? \},$/gm)].map((m) => ({ code: m[1], family: m[2], source: m[3] }));
check("every session track's family / source pair is valid (the source exists and belongs to that family); Shaker is Percussion, the Riser is FX", sessionPairs.length === 20 && sessionPairs.every((p) => FAMILY_ORDER.includes(p.family) && sourceRows.some((r) => r.id === p.source && r.family === p.family)) && sessionPairs.some((p) => p.code === "19" && p.family === "percussion" && p.source === "shaker") && sessionPairs.some((p) => p.code === "20" && p.family === "fx" && p.source === "riser_sweep") && sessionPairs.some((p) => p.code === "01" && p.source === "kick") && sessionPairs.some((p) => p.code === "15" && p.source === "lead_vocal"));
check("an unset track (beyond the session) has no family and no source — nothing is classified for it — and the plan's role / tier defaults", /readonly familyId: FamilyId \| null;/.test(data) && /readonly sourceTypeId: string \| null;/.test(data) && /const UNSET_SETTINGS: TrackSettings = \{ familyId: null, sourceTypeId: null, role: "rhythm", tier: DEFAULT_TIER \};/.test(data) && !/readonly instrument/.test(data));
check("the old instrument API is gone (no half-migrated importer)", !/INSTRUMENTS|INSTRUMENT_FAMILIES|familyOf\(|instrumentsOf\(|defaultInstrument|hook="instrument"|data-track-instrument/.test([row, data, devPage, devFixture, room].join("\n")));
const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|\s)\/\/[^\n]*/g, "");
check("no detection, classification, filename parsing, audio / MIDI, persistence or rule evaluation anywhere in the new files (comments aside)", !/AudioContext|Analyser|AudioBuffer|decodeAudioData|MIDIAccess|requestMIDIAccess|detect|classif|\.wav|\.mid\b|filename|requestAnimationFrame|setInterval|setTimeout|Math\.random|localStorage|sessionStorage|indexedDB|fetch\(/.test(codeOnly(newSource)) && !/\bgain\b|\bpan\b|\beq\b|compress|routing|preset|genre/i.test(codeOnly(row + data)));

// --- 5. Fixture honesty. -----------------------------------------------------------
check("names and org colours derive from the Console's track list (one session), never retyped", /import \{ TRACK_STRIPS, type OrgSwatch \} from "\.\.\/components\/channel-strip\/track-strip-fixtures";/.test(data) && /const strip = TRACK_STRIPS\[index\];/.test(data) && /return \{ code: strip\.id, name: strip\.name, org: strip\.org, \.\.\.\(SESSION_SETTINGS\[strip\.id\] \?\? UNSET_SETTINGS\) \};/.test(data) && !/name: "Kick"/.test(data));
check("the Task 0.4 factory and count survive (the arrange guard's contract)", /export function createArrangeTracks\(/.test(data) && /export const PLACEHOLDER_TRACK_COUNT = 20;/.test(data) && /createArrangeTracks\(ARRANGE_TRACK_COUNT\)/.test(data) && /export type ArrangeTrackPlaceholder = ArrangeTrack;/.test(data));
check("every one of the twenty session tracks has typed-in settings", count(data, /^  "\d\d": \{ familyId: "[a-z]+", sourceTypeId: "[a-z0-9_]+", role: "(lead|rhythm|double|harmony)", tier: "(primary|supporting|background)"(?:, tierConfirmed: false)? \},$/gm) === 20);
// Task 3.1: the row itself still imports no store — the ROOM binds it (live prop); without
// the binding it keeps its own fixture-seeded settings, written nowhere (the playground).
check("the row's choices are written to its model only: the bound live view, else its own fixture-seeded $state — the row imports no store, persists nothing (Task 3.1)", /const own = \$state<TrackMetaLive>\(/.test(rowScript) && /const model = \$derived\(live \?\? own\);/.test(rowScript) && count(rowScript, /\$state[<(]/g) === 1 && !/writable\(|readable\(|localStorage|sessionStorage|fetch\(|import .*lib\/mixer|import .*store/.test(row) && /import type \{ TrackMetaLive \} from "\.\/arrange-row-live";/.test(rowScript));
check("the row is marked simulated (a fixture track; an imported one is not — Task 5.1) and exposes its state for tests (family, source type, tier, role)", /data-simulated=\{audio \? false : SIMULATED\}/.test(rowTemplate) && /data-track-audio=\{audio \? "imported" : "none"\}/.test(rowTemplate) && /data-track-source-type=\{model\.sourceTypeId\}/.test(rowTemplate) && /data-track-tier=\{model\.tier\}/.test(rowTemplate));
check("the data file says it is simulated fixture data", /SIMULATED fixture data/.test(data));

// --- 6. The org colour is a marker, never a tint. ---------------------------------
check("the org tab is flat: background-color var(--org) only, 6 × 16, radius 1 (D2.2.13)", /\.row__tab \{\s*flex: 0 0 auto;\s*width: 0\.375rem;\s*height: 1rem;\s*border-radius: 1px;\s*background-color: var\(--org\);\s*\}/.test(stripComments(rowStyle)) && count(stripComments(rowStyle), /var\(--org\)/g) === 1);
check("the row's face is the approved panel, not an org tint; no hex colour in the row", /\.row \{[^}]*background-color:\s*var\(--al-material-panel\)/s.test(stripComments(rowStyle)) && !/#[0-9a-fA-F]{3,8}\b/.test(rowStyle) && !/--org/.test(ruleBody(rowStyle, ".row") ?? ""));
check("the tab recipe is the Console strip's (TrackStrip .strip__tab), value for value", (() => {
  const a = ruleBody(rowStyle, ".row__tab");
  const b = ruleBody(styleOf(strip), ".strip__tab");
  return !!a && !!b && a === b;
})());

// --- 7. The corner and the column. --------------------------------------------------
check("the corner keeps its track-list-header region in the room file and prints legends with EngravedLabel", /data-arrange-region="track-list-header"/.test(roomTemplate) && /<EngravedLabel text="Track list" size="sm" as="p" \/>/.test(roomTemplate) && /import EngravedLabel from "\.\.\/components\/hardware\/EngravedLabel\.svelte"/.test(room));
check("the legends sit in the row's order: Source left and Family right, then Role left and Tier right — the right legends as wide as the 5.75rem window column", /<EngravedLabel text="Source" size="xs" tone="muted" as="p" \/>\s*<span class="arrange-corner__tier-legend">\s*<EngravedLabel text="Family" size="xs" tone="muted" as="p" align="center" \/>[\s\S]*<EngravedLabel text="Role" size="xs" tone="muted" as="p" \/>\s*<span class="arrange-corner__tier-legend">\s*<EngravedLabel text="Tier" size="xs" tone="muted" as="p" align="center" \/>/.test(roomTemplate) && /\.arrange-corner__tier-legend \{[^}]*flex:\s*0 0 5\.75rem/s.test(stripComments(roomStyle)) && !/text="Instrument/.test(roomTemplate));
check("the corner is the panel material and keeps its 2 px baseline", /\.arrange-corner \{[^}]*background-color:\s*var\(--al-material-panel\)/s.test(stripComments(roomStyle)) && /\.arrange-corner \{[^}]*border-bottom:\s*2px solid rgba\(0, 0, 0, 0\.62\)/s.test(stripComments(roomStyle)));
check("the list column floor is 12rem (D2.5.3): clamp(12rem, 16vw, 15rem), and 12rem under 40rem", /--arrange-track-list-width:\s*clamp\(12rem, 16vw, 15rem\);/.test(roomStyle) && /@media \(max-width: 40rem\) \{[\s\S]*--arrange-track-list-width:\s*12rem;/.test(roomStyle));
check("the row height stays 5rem (4.25rem under 40rem); the timeline width is the bar count times the bar width (Task 2.6, D2.6.2)", /--arrange-row-height:\s*5rem;/.test(roomStyle) && /@media \(max-width: 40rem\) \{[\s\S]*--arrange-row-height:\s*4\.25rem;/.test(roomStyle) && /--arrange-timeline-width:\s*calc\(var\(--arrange-bar-count\) \* var\(--arrange-bar-width\)\);/.test(roomStyle));
check("the Phase 0 placeholder frame is gone from the scroller (Task 2.6 skins the timeline; see check:arrange-timeline)", !/\.arrange-timeline-head \{/.test(roomStyle) && !/border:\s*2px dashed/.test(roomStyle));

// --- 8. Scope. -----------------------------------------------------------------------
check("no screw heads in the new files (D2.1.9)", !/screw/i.test(newSource + room));
// (The timeline lane left this pin set with Task 2.6 — it is that task's file,
//  covered by check:arrange-timeline.)
// Task 2.7 re-pinned, at their 2.7 state, the files it changed by owner-approved
// additions: MixerRoom.svelte and lib/mixer.ts (the Mixer's own files), app.css
// (two comments), TrackStrip / StripModule / ReturnStrip / BusMasterStrip (the
// optional `identity` snippet, D2.7.2). MixerChannelStrip.svelte was deleted.
const pinned = {
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/rooms/MixerRoom.svelte": "b6a73be6e10e2c5c63308477342f8cf3b312a971790c3251ac78fa73233f2c6b",
  "src/lib/mixer.ts": "0ceea310a923f03ec526e842807220e75667b247facdc3ae7804a5495c1359a0",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/app.css": "fcefcc5cae66ff67ea3d87cb11f31a6a90e561e248912bad0a97e59a061bb027",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/rooms/ConsoleRoom.svelte": "b9bb7d57ab1f90503798e8fbd2a4c753e43b86eac08e56e6fa591dedd4a6ecde",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/components/ChannelBank.svelte": "f6876c0e896c2b49e9bd0e248a50ec0cdfefadbed9054a0b01a2cd3fd632aca4",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/components/channel-strip/TrackStrip.svelte": "d57cab962a57d0efd5e798be98325c4ef79f68590c198592bdb3a2fe2a9c276f",
  "src/components/channel-strip/SendSlot.svelte": "67dbb6647329fc2354fae93b8e822c6df03e82e8674169a6a2e8ca3f2f009a60",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/track-strip-fixtures.ts": "e891099def6abe69fd2d4558ba2f9f0542a9c4f123d871c2147447e27afab3e5",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/components/channel-strip/StripModule.svelte": "4a18526b15b6f7a1188e94545fc4b4f3833b65d27bba3bfe5d305d964466c614",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/ReturnStrip.svelte": "d5240fa41c0a0057fcf4ed8de7c0239a6cb4f9633aa127d9eb8187c2950dcb0c",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/BusMasterStrip.svelte": "09c7673329ce60d3b86859845fb3592527e9a1bae5c50e5e78b41a374e9f9826",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/bus-return-fixtures.ts": "a72eb75ff0f929dcc78fea7714b6bbcaf0e998d0e2850d43d83a8fe85e0c8101",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/VUMeter.svelte": "c3d850c80d9d53c70ed31c603fe23c011402f813e56bce963494086466347394",
  "src/components/hardware/LedLadder.svelte": "d09d6f36455731128c7f32189b8e641686f603c293968b5629f55fb61f1628b7",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/lib/tokens.ts": "c61debb8c942111395dccc9e67d2111239b9afb80a80cba9402efecb4787bd71",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/components/meter-bridge/ConsoleMeterBridge.svelte": "fa0a228a86ebb75df5388ab485b9af1a8c36af7f9e0d252093f9ab56a104e172",
  // Task 9.1.3 re-pinned this file. Two lines changed, both in the *state the deck
  // reads* — the MIX state now asks `mixRevision` instead of the live `renderProgress
  // === 1` gauge that a finished render always clears, and the completed mix passes
  // its HH:MM through. No markup, class, style or DOM contract was touched; the
  // approved visual structure the rest of this guard describes is unchanged.
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/components/console-transport/ConsoleTransport.svelte": "4cacb4367dabad252401d2e6b473a18961c7c48a0c206124fc83996d4cd478e9",
  // Task 9.1.1 re-pinned the strip (owner decision D9.1.2 option a): it now mounts the
  // listening-source selector beside the keys, in its own component. The strip's layout,
  // the four Phase 0 keys and their functions are unchanged; what moved the hash is one
  // additional child. check-transport-structure guards the new control in detail.
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/components/MiniTransport.svelte": "442869b2337bc90b1172aeb9e35cc3fb3bcbcbff5eab48f42af02ac138335891",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/App.svelte": "c82681587787d678287f9d9d50bac7242424c9a2983db05992d68711176b569b",
  "src/components/RoomShell.svelte": "815bcb79e940433591c632d7ae98c4a5e918394b14d97726ae33c6002d808a71",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}
// (The Mixer left this list in Task 2.7: its strips print the Arrange
//  classification and carry the tier select — plan §5a puts the tier in the
//  Mixer; check:mixer covers it. The Console still knows neither.)
check("the Console room, bank and strip do not import the select or the Arrange data", !/ScribbleSelect|lib\/arrange/.test(["src/rooms/ConsoleRoom.svelte", "src/components/ChannelBank.svelte", "src/components/channel-strip/TrackStrip.svelte"].map(read).join("\n")));
check("the playground renders the rows through ArrangeRowFixture in its own section, with session, narrow, stress, unset, rename and compact blocks", /import ArrangeRowFixture, \{ type ArrangeRowFixtureConfig \} from "\.\/ArrangeRowFixture\.svelte"/.test(devPage) && /data-dev-component="arrange-rows"/.test(devPage) && /<ArrangeRowFixture \{config\} \/>/.test(devPage) && ["session", "narrow", "stress", "unset", "rename", "compact"].every((id) => new RegExp(`id: "${id}"`).test(devPage)) && /import ArrangeTrackRow from "\.\.\/components\/ArrangeTrackRow\.svelte"/.test(devFixture));
check("the stress block carries a long name and a long source label (a test entry in the Guitar family, passed through the catalog prop); the unset block a track with no family and no source", /name: "Backing vocal stack left wide double take 3 comp"/.test(devPage) && /sources: \[\.\.\.SOURCE_TYPES, \{ sourceTypeId: "long_test_source", label: "Acoustic guitar, nylon string, close mic, take 2", familyId: "guitar" \}\]/.test(devPage) && /familyId: null, sourceTypeId: null, role: "rhythm", tier: "supporting"/.test(devPage) && /<ArrangeTrackRow \{track\} laneId=\{`dev-lane-\$\{track\.code\}`\} \{sources\} \/>/.test(devFixture));
check("the rename harness is review-only: a dev button in the fixture swaps the first row's display name (a prop) — the row has no rename control and the harness never writes a source or a family", /renameTo: "Big Kick"/.test(devPage) && /data-dev-rename/.test(devFixture) && /\{ \.\.\.baseTracks\[0\], name: config\.renameTo \}/.test(devFixture) && !/sourceTypeId|familyId/.test(scriptOf(devFixture).replace(/\/\*[\s\S]*?\*\//g, "")) && !/rename/i.test(row));
check(
  "no dependency added or changed",
  !("dependencies" in pkg) &&
    JSON.stringify(Object.keys(pkg.devDependencies).sort()) ===
      JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]),
);
check("the check is wired into package.json", pkg.scripts["check:arrange-rows"] === "node scripts/check-arrange-rows-structure.mjs");

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Arrange track-list rows structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Arrange track-list rows structural contract check — ${passes.length}/${passes.length} passed`);
