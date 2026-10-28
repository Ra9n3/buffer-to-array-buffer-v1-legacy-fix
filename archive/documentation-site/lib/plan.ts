import raw from "../../ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt?raw";

export const PLAN_RAW = raw;

/* ------------------------------------------------------------------ types */

export type Table = { head: string[]; rows: string[][]; kind?: "rooms" | "colour" | "profiles" };
export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "step"; n: string; text: string }
  | { type: "table"; table: Table };

export type Section = { num: string; title: string; blocks: Block[] };

export type Task = { id: string; text: string; review?: string };
export type Phase = { n: string; title: string; notes: string[]; tasks: Task[]; stop?: string };

/* ------------------------------------------------- tables, restored exactly */

const TABLES: Record<string, Table[]> = {
  "3": [
    {
      kind: "rooms",
      head: ["Room", "Purpose", "Main contents"],
      rows: [
        [
          "Console",
          "The primary overview and automatic-mix workspace.",
          "Vintage meter bridge; VU and level meters; stereo correlation/goniometer; spectrum display; transport; time/status display; channel strips; bank selection; large illuminated MIX button.",
        ],
        [
          "Arrange",
          "Import and organize the session.",
          "Timeline and raw waveforms; track names; instrument/role labels; song structure markers; tempo track; organizational groups; bus-routing controls/patchbay.",
        ],
        [
          "Mixer",
          "Inspect and edit processing in detail.",
          "Channel strips; selected-track processing chain; EQ curve; compressor and gain-reduction display; sends; Auto/Manual controls; original-versus-current ghost indicators; plain-language “what changed and why” panel.",
        ],
      ],
    },
  ],
  "4": [
    {
      kind: "colour",
      head: ["Color family", "Meaning"],
      rows: [
        ["Cream / off-white", "Input trim and gain staging"],
        ["Amber / gold", "EQ and tonal controls"],
        ["Red", "Compression and dynamics"],
        ["Blue-grey", "Pan, stereo image, and spatial placement"],
        ["Green", "Sends, auxiliary paths, and reverb"],
        ["Orange", "Bus/group masters and the recurring console accent stripe"],
      ],
    },
  ],
  "6": [
    {
      head: ["Mode", "Purpose", "Expected behavior"],
      rows: [
        [
          "Raw stem playback",
          "Listen to the imported session before mixing.",
          "Synchronized playback of source tracks with no mix processing. Used to check files, takes, and section boundaries.",
        ],
        [
          "Lightweight live preview",
          "Hear quick balance changes while preparing the mix.",
          "Responsive preview for basic gain, pan, mute, solo, and routing-related monitoring. It is explicitly not a substitute for the full DSP render.",
        ],
        [
          "Full rendered mix",
          "Hear the actual processed result.",
          "Uses the real analysis, DSP, masking, routing, sends, bus processing, and automation pipeline. This is the authoritative sound.",
        ],
      ],
    },
  ],
  "7": [
    {
      head: ["Measurement family", "Examples", "Why it matters"],
      rows: [
        [
          "Level and dynamics",
          "Sample peak, true peak where supported, RMS/loudness over time, crest factor",
          "Gain staging, level consistency, transient/dynamic assessment, output safety.",
        ],
        [
          "Frequency content",
          "Energy by frequency band over time, spectral centroid, low/mid/high balance",
          "Identify tonal imbalance and possible overlap; guide EQ decisions against genre/instrument targets.",
        ],
        [
          "Transient behavior",
          "Transient activity and changes in short-time energy",
          "Help characterize punch and guide suitable dynamics settings.",
        ],
        [
          "Stereo behavior",
          "Stereo correlation, channel energy, width/mono compatibility checks",
          "Avoid risky widening and reveal possible phase cancellation.",
        ],
        [
          "Input integrity",
          "DC offset, silence/near-silence, file format, channel count, sample rate, duration",
          "Catch problematic or unsupported files and prevent invalid measurements.",
        ],
      ],
    },
  ],
  "11": [
    {
      kind: "profiles",
      head: ["Profile", "Intent"],
      rows: [
        ["Lite", "Lowest RAM use and conservative concurrency; longer render time is acceptable."],
        ["Standard", "Balanced concurrency, buffering, memory use, and render time."],
        ["Performance", "Higher concurrency/buffering for capable machines to reduce render time."],
      ],
    },
  ],
  "12": [
    {
      head: ["Output", "Definition"],
      rows: [
        [
          "Full mix",
          "The summed stereo rough mix, with channel/bus processing applied, but without mastering or loudness maximization.",
        ],
        [
          "Processed individual stems",
          "One output per original track, with that track’s processing baked in so it can be imported into a DAW for further work. Routing/export behavior should be documented carefully when bus processing contributes to the sound.",
        ],
        ["Processed buses", "One output per bus/submix (for example drums, vocals, guitars), with the bus processing applied."],
      ],
    },
  ],
  "19": [
    {
      head: ["Document", "Purpose", "Required for"],
      rows: [
        ["architecture.md", "Code structure, module boundaries", "All tasks from Phase 0 onward"],
        ["data-model.md", "Shared typed project model", "Phase 3 onward"],
        [
          "module-contract.md",
          "Interfaces between analysis/DSP/routing/persistence/export modules",
          "Phase 5 onward",
        ],
        [
          "decisions-log.md",
          "Running record of implementation decisions, including resolved deferred items",
          "All tasks",
        ],
        [
          "hardware-reference.md",
          "Buildable physical-hardware visual specifications, including organizational-color tab/flag treatment",
          "All Phase 1 and Phase 2 tasks",
        ],
        [
          "task-prompt-template.md",
          "Required structure and acceptance checks for individual task prompts",
          "Used by the human author when writing each task",
        ],
        ["glossary.md", "Authoritative definitions and distinctions for product terminology", "All tasks"],
      ],
    },
  ],
};

/* ------------------------------------------------------------------ parsing */

/* Section headers never end in a period — that keeps §8's numbered chain
   ("1. Input trim and gain staging.") from being read as a new section. */
const SECTION_RE = /^(\d+[a-z]?)\. ([A-Z][^.]*)$/;
const PHASE_RE = /^Phase (\d+) — (.+)$/;
const TASK_RE = /^(\d+\.\d+) — (.+)$/;
const STOP_RE = /^STOP — (.+)$/;
const STEP_RE = /^(\d+)\.\s+(.+)$/;

function isHeading(line: string) {
  return (
    line.length <= 60 &&
    /^[A-Z]/.test(line) &&
    !/[.:;]$/.test(line) &&
    !/^\d/.test(line) &&
    !line.includes("  ")
  );
}

function parseBody(body: string, tables: Table[]): Block[] {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const table = tables.find((t) => t.head[0] === line);
    if (table) {
      const n = table.head.length + table.rows.reduce((a, r) => a + r.length, 0);
      // verify the flattened run really matches before consuming it
      const run = lines.slice(i, i + n);
      const flat = [...table.head, ...table.rows.flat()];
      if (run.length === n && run.every((l, k) => l === flat[k])) {
        out.push({ type: "table", table });
        i += n;
        continue;
      }
    }
    const step = STEP_RE.exec(line);
    if (step) {
      out.push({ type: "step", n: step[1], text: step[2] });
      i += 1;
      continue;
    }
    if (isHeading(line)) {
      out.push({ type: "h3", text: line });
      i += 1;
      continue;
    }
    out.push({ type: "p", text: line });
    i += 1;
  }
  return out;
}

type Chunk = { num: string; title: string; body: string[] };

function splitPlan() {
  const frontMatter: string[] = [];
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const m = SECTION_RE.exec(trimmed);
    if (m) {
      current = { num: m[1], title: m[2], body: [] };
      chunks.push(current);
      continue;
    }
    if (trimmed === "Closing Vision") {
      current = { num: "vision", title: "Closing Vision", body: [] };
      chunks.push(current);
      continue;
    }
    if (current) current.body.push(trimmed);
    else frontMatter.push(trimmed);
  }

  return { frontMatter: frontMatter.filter(Boolean), chunks };
}

const parsed = splitPlan();

export const FRONT_MATTER = parsed.frontMatter;

export const SECTIONS: Section[] = parsed.chunks.map((s) => ({
  num: s.num,
  title: s.title,
  blocks: parseBody(s.body.join("\n"), TABLES[s.num] ?? []),
}));

export const getSection = (num: string) => SECTIONS.find((s) => s.num === num);

/* ------------------------------------------------------- §14 roadmap parse */

export const ROADMAP: { intro: string[]; phases: Phase[] } = (() => {
  const intro: string[] = [];
  const phases: Phase[] = [];
  let cur: Phase | null = null;

  for (const line of rawBodyOf("14")) {
    const pm = PHASE_RE.exec(line);
    if (pm) {
      cur = { n: pm[1], title: pm[2], notes: [], tasks: [] };
      phases.push(cur);
      continue;
    }
    const sm = STOP_RE.exec(line);
    if (sm && cur) {
      cur.stop = sm[1];
      continue;
    }
    const tm = TASK_RE.exec(line);
    if (tm && cur) {
      const [text, review] = tm[2].split(/ Review: /);
      cur.tasks.push({ id: tm[1], text: text.trim(), review: review?.trim() });
      continue;
    }
    if (!cur) intro.push(line);
    else cur.notes.push(line);
  }
  return { intro, phases };
})();

function rawBodyOf(num: string) {
  const entry = parsed.chunks.find((s: Chunk) => s.num === num);
  return entry ? entry.body.filter(Boolean) : [];
}

export const LOCKED = rawBodyOf("16").filter(Boolean);
export const DEFERRED = rawBodyOf("17").filter(Boolean);

/* -------------------------------------------- tasks already built in repo */

export const BUILT: Record<string, { label: string; href: string }> = {
  "1.1": { label: "tokens live in this repo", href: "#spec" },
  "1.2": { label: "knob — see playground §1", href: "#playground" },
  "1.3": { label: "fader — see playground §3", href: "#playground" },
  "1.4": { label: "switch — see playground §2", href: "#playground" },
  "1.5": { label: "VU + LED ladder — §4", href: "#playground" },
  "1.6": { label: "engraved labels + lamps", href: "#playground" },
  "2.2": { label: "strip prototype — §5–7", href: "#colour" },
};

/* ------------------------------------------------ §18/§19 document map */

export const DOC_MAP: { file: string; inRepo: boolean; href?: string; note: string }[] = [
  { file: "ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt", inRepo: true, href: "#/plan", note: "product-level source of truth — this document" },
  { file: "hardware-reference.md", inRepo: true, href: "#spec", note: "stored as ALLOY-HARDWARE-REFERENCE-SPEC.md" },
  { file: "task-prompt-template.md", inRepo: true, href: "#/tasks", note: "stored as ALLOY-TASK-PROMPT-TEMPLATE.md" },
  { file: "glossary.md", inRepo: true, href: "#/glossary", note: "stored as ALLOY-PRODUCT-GLOSSARY.md" },
  { file: "architecture.md", inRepo: false, note: "code structure and module boundaries — from Phase 0 onward" },
  { file: "data-model.md", inRepo: false, note: "shared typed project model — Phase 3 onward" },
  { file: "module-contract.md", inRepo: false, note: "module interfaces — Phase 5 onward" },
  { file: "decisions-log.md", inRepo: false, note: "running record of decisions — all tasks" },
  { file: "/task-reports/", inRepo: true, href: "#/tasks", note: "one report per task, written at every stop" },
];

export const PLAN_STATS = {
  sections: SECTIONS.filter((s) => s.num !== "vision").length,
  phases: ROADMAP.phases.length,
  tasks: ROADMAP.phases.reduce((a, p) => a + p.tasks.length, 0),
  stops: ROADMAP.phases.filter((p) => p.stop).length,
  locked: LOCKED.length,
  deferred: DEFERRED.length,
  lines: raw.split("\n").length,
  bytes: raw.length,
};
