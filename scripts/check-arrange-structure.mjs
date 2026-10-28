#!/usr/bin/env node
/**
 * Arrange room structural contract check — Task 0.4.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * pixel alignment can only be measured in a real browser. What it does test is
 * the source-level contract that keeps the geometry correct by construction:
 *
 *   1. ArrangeRoom renders exactly one scroll container.
 *   2. Track rows and timeline lanes are produced by a single loop over one
 *      track array, so their counts cannot diverge.
 *   3. Neither the track row nor the lane introduces its own overflow/scroll
 *      container (the desync defect this task rules out).
 *   4. Both track row and lane take their height from the shared
 *      --arrange-row-height custom property.
 *   5. All seven planned regions are still present.
 *
 * This catches the specific regression risk — someone re-splitting the track
 * list and timeline into two independently scrolling columns — that a type
 * check and a production build would both happily pass.
 *
 * Run: npm run check:arrange
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => readFileSync(resolve(root, rel), "utf8");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) {
    passes.push(name);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

const room = read("src/rooms/ArrangeRoom.svelte");
const trackRow = read("src/components/ArrangeTrackRow.svelte");
const lane = read("src/components/ArrangeTimelineLane.svelte");
const data = read("src/lib/arrange.ts");

// --- 1. Exactly one scroll container in the room.
const scrollerMarkers = (room.match(/class="arrange-scroll"/g) ?? []).length;
check(
  "ArrangeRoom declares exactly one scroll container",
  scrollerMarkers === 1,
  `found ${scrollerMarkers}`,
);

// Only .arrange-scroll may set overflow on an axis; nothing else in the room
// stylesheet may create a nested scrolling region. Declarations are parsed per
// CSS block so numeric values such as `gap: 0.75rem` can never be mistaken for
// a selector.
const roomCss = (/<style>([\s\S]*?)<\/style>/.exec(room)?.[1] ?? "");
const cssBlocks = [...roomCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim().split(/\s+/).pop(),
  body: m[2],
}));

const overflowDeclarations = cssBlocks.flatMap((block) =>
  [...block.body.matchAll(/overflow(?:-[xy])?\s*:\s*([^;]+);/g)].map((m) => ({
    selector: block.selector,
    value: m[1].trim(),
  })),
);

const nonScrollerOverflow = overflowDeclarations.filter(
  (d) => d.selector !== ".arrange-scroll" && /auto|scroll/.test(d.value),
);

check(
  "no nested scrolling region besides .arrange-scroll",
  nonScrollerOverflow.length === 0,
  nonScrollerOverflow.map((d) => `${d.selector}{overflow:${d.value}}`).join(", "),
);

check(
  ".arrange-scroll scrolls on both axes (shared vertical mechanism)",
  overflowDeclarations.some(
    (d) => d.selector === ".arrange-scroll" && /auto|scroll/.test(d.value),
  ),
);

// --- 2. One loop drives both track rows and lanes.
const tracksLoop = /{#each\s+ARRANGE_TRACKS\s+as\s+track[^}]*}/.exec(room);
check("ArrangeRoom iterates the shared ARRANGE_TRACKS array", Boolean(tracksLoop));

const trackRowUsages = (room.match(/<ArrangeTrackRow\b/g) ?? []).length;
const laneUsages = (room.match(/<ArrangeTimelineLane\b/g) ?? []).length;

check(
  "exactly one track-row usage and one lane usage (both inside the loop)",
  trackRowUsages === 1 && laneUsages === 1,
  `rows=${trackRowUsages} lanes=${laneUsages}`,
);

const loopBody = tracksLoop
  ? room.slice(tracksLoop.index, room.indexOf("{/each}", tracksLoop.index))
  : "";

check(
  "the track row and the lane are rendered by the same loop",
  loopBody.includes("<ArrangeTrackRow") && loopBody.includes("<ArrangeTimelineLane"),
);

check(
  "row and lane are paired on the same laneId",
  /laneId=\{`lane-\$\{track\.code\}`\}/.test(loopBody),
);

// --- 3. Neither cell scrolls its own axis.
for (const [name, src] of [
  ["ArrangeTrackRow", trackRow],
  ["ArrangeTimelineLane", lane],
]) {
  const own = [
    ...src.matchAll(/overflow(?:-[xy])?\s*:\s*([^;]+);/g),
  ].map((m) => m[1].trim());
  check(
    `${name} creates no scrolling axis of its own`,
    !own.some((v) => /auto|scroll/.test(v)),
    own.join(", "),
  );
}

// --- 4. Shared row geometry.
const rowHeightDefs = (room.match(/--arrange-row-height\s*:/g) ?? []).length;
check("room defines --arrange-row-height", rowHeightDefs >= 1);

check(
  "ArrangeTrackRow height comes from --arrange-row-height",
  /height:\s*var\(--arrange-row-height\)/.test(trackRow),
);

check(
  "ArrangeTimelineLane height comes from --arrange-row-height",
  /height:\s*var\(--arrange-row-height\)/.test(lane),
);

check(
  "timeline header width comes from --arrange-timeline-width",
  /--arrange-timeline-width\s*:/.test(room) &&
    /grid-template-columns:\s*var\(--arrange-track-list-width\)\s+var\(--arrange-timeline-width\)/.test(
      room,
    ),
);

// --- 5. Planned regions present.
for (const region of [
  "track-list-header",
  "timeline-header",
  "structure-markers",
  "tempo-track",
  "timeline-ruler",
]) {
  check(`region "${region}" is present`, room.includes(`data-arrange-region="${region}"`));
}
check(
  'region "timeline-lane" is present',
  lane.includes('data-arrange-region="timeline-lane"'),
);
check(
  'region "track-row" is present',
  trackRow.includes('data-arrange-region="track-row"'),
);

// The organizational-groups / bus-routing placeholder was removed from the
// skeleton on owner instruction. Guard against silent reintroduction of a
// fixed-height block that would compete with the timeline for space.
check(
  "the removed organisational placeholder has not been reintroduced",
  !room.includes('data-arrange-region="organisational-groups"'),
);

// The room header must not consume vertical space, but its <h1> must still name
// the section for assistive technology.
const shell = read("src/components/RoomShell.svelte");
check(
  "RoomShell supports a visually hidden header",
  /hideHeader\s*=\s*false/.test(shell) && /is-visually-hidden/.test(shell),
);
check(
  "RoomShell keeps the room <h1> for the section's accessible name",
  /<h1/.test(shell) && /aria-labelledby/.test(shell),
);
check(
  "ArrangeRoom hides its header",
  /hideHeader/.test(room),
);

// --- 6. Data invariants: marker spans must cover the timeline exactly.
const barCount = Number(/export const ARRANGE_BAR_COUNT = (\d+);/.exec(data)?.[1]);
check("ARRANGE_BAR_COUNT is exported as a number", Number.isFinite(barCount));

const markerSpans = [...data.matchAll(/barCount:\s*(\d+)/g)].map((m) =>
  Number(m[1]),
);
const markerTotal = markerSpans.reduce((a, b) => a + b, 0);
check(
  `structure marker spans sum to ARRANGE_BAR_COUNT (${markerTotal} vs ${barCount})`,
  markerTotal === barCount,
);

// The row count must remain a parameter, not a literal baked into the markup,
// so 20 stays a tunable placeholder rather than a product requirement.
check(
  "track rows are built by the createArrangeTracks factory",
  /export function createArrangeTracks\(/.test(data) &&
    /createArrangeTracks\(ARRANGE_TRACK_COUNT\)/.test(data),
);

check(
  "placeholder count is declared as PLACEHOLDER_TRACK_COUNT",
  /export const PLACEHOLDER_TRACK_COUNT = \d+;/.test(data),
);

const trackCount = Number(
  /export const PLACEHOLDER_TRACK_COUNT = (\d+);/.exec(data)?.[1],
);
check("PLACEHOLDER_TRACK_COUNT is a number", Number.isFinite(trackCount));

// The room must not hard-code a row count of its own.
check(
  "ArrangeRoom does not hard-code a track count",
  !/length:\s*\d+/.test(room) && !/from\(\{\s*length/.test(room),
);

// --- Report.
const total = passes.length + failures.length;
console.log(`\nArrange structural contract check — ${passes.length}/${total} passed\n`);

for (const p of passes) console.log(`  PASS  ${p}`);
for (const f of failures) console.log(`  FAIL  ${f}`);

if (failures.length > 0) {
  console.log(
    `\n${failures.length} failure(s). Layout geometry is NOT covered by this check — ` +
      `verify alignment in a real browser at 1920px and 1024px.\n`,
  );
  process.exit(1);
}

console.log(
  `\nStructural contract intact. This check does not measure pixel alignment; ` +
    `confirm rows and lanes still line up in a real browser.\n`,
);
