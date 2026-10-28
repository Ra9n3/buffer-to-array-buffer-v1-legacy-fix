import template from "../../ALLOY-TASK-PROMPT-TEMPLATE.md?raw";

export const TEMPLATE_RAW = template;
/** the fenced block is the part that gets handed to a build agent */
export const TEMPLATE_BODY = (template.match(/```text\n([\s\S]*?)```/)?.[1] ?? template).trim();

export const STOP_CONDITION =
  "Do not proceed to another task automatically. End this task, write the task\nreport, and wait for explicit user approval of the running app before any\nfurther work begins.";

export const OUTPUT_TEXT = (n: string) =>
  `Write /task-reports/${n || "[number]"}-report.md with: what was built, any deviations\nand why, what was tested, and what remains.`;

export const CRITERION_STRUCTURAL =
  "Automated structural check passes: no unintended horizontal overflow, no console/runtime errors, every navigable route renders, and no element exceeds its container bounds";
export const CRITERION_BUILD = "App builds and runs with no console errors";
export const CRITERION_SCOPE = "No changes made outside the stated scope";

export type Criterion = { id: string; text: string; locked: boolean; done: boolean };
export type Status = "draft" | "ready" | "awaiting" | "approved";

export type Task = {
  id: string;
  number: string;
  name: string;
  phase: 1 | 2 | 3;
  readFirst: Record<string, boolean>;
  scope: string[];
  doNotTouch: string[];
  ascii: string;
  gridSpec: string;
  visualRefs: string[];
  colors: string[];
  criteria: Criterion[];
  status: Status;
  report: { built: string; deviations: string; tested: string; remains: string };
  updatedAt: number;
};

export const READ_FIRST_DOCS = [
  { key: "plan", label: "product design & build plan", note: "product-level source of truth · §16 locked, §17 deferred", state: "present", href: "#/plan" },
  { key: "decisions", label: "decisions-log.md", note: "locked decisions — never re-litigate", state: "missing", href: "" },
  { key: "glossary", label: "glossary.md", note: "canonical terms, every task", state: "present", href: "#/glossary" },
  { key: "architecture", label: "architecture.md", note: "only if it exists yet", state: "missing", href: "" },
  { key: "hardware", label: "hardware-reference.md", note: "required for Phase 1 + 2", state: "present", href: "#spec" },
  { key: "reports", label: "/task-reports/*", note: "every prior task report", state: "present", href: "#/tasks" },
] as const;

const uid = () => Math.random().toString(36).slice(2, 9);

export const criterion = (text: string, locked = false): Criterion => ({
  id: uid(),
  text,
  locked,
  done: false,
});

export function newTask(number = "1.01", name = ""): Task {
  return {
    id: uid(),
    number,
    name,
    phase: 1,
    readFirst: { plan: false, decisions: false, glossary: false, architecture: false, hardware: false, reports: false },
    scope: [""],
    doNotTouch: [""],
    ascii: "+------------------------------------------+\n| meter bridge (fixed 96px)                |\n+--------+------------------------+--------+\n| rail   | channel strips (1fr)   | master |\n| 220px  | overflow-x: auto       | 260px  |\n+--------+------------------------+--------+",
    gridSpec: "",
    visualRefs: [],
    colors: [],
    criteria: [
      criterion(CRITERION_STRUCTURAL, true),
      criterion(CRITERION_BUILD, true),
      criterion("[specific resize/scroll/overlap check]"),
      criterion("[specific interaction check]"),
      criterion(CRITERION_SCOPE, true),
    ],
    status: "draft",
    report: { built: "", deviations: "", tested: "", remains: "" },
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ storage */

const KEY = "alloy.tasks.v2";

export function seedTasks(): Task[] {
  const a = newTask("1.01", "Rotary pot component");
  a.readFirst = { plan: true, decisions: true, glossary: true, architecture: false, hardware: true, reports: true };
  a.scope = [
    "Knob.tsx: knurled base + function-colour cap + rotating pointer",
    "Programmatic 270° tick ring with numerals at the two extremes only",
  ];
  a.doNotTouch = ["Console room shell", "Meter bridge", "Any fader or switch file"];
  a.gridSpec = "Fixed 112px square control, 9.5px engraved legend above, value readout below. No horizontal scroll at 320px.";
  a.visualRefs = ["1. Rotary Pot (Knob)", "5. Functional Color Coding — Applied to Components"];
  a.colors = ["cream", "amber", "red", "bluegrey", "green", "orange"];
  a.criteria[2].text = "At 320px the knob row wraps instead of overflowing; tick numerals never clip the cap";
  a.criteria[3].text = "Drag, wheel, Shift-fine, arrows/PageUp/Home/End, focus ring, double-click numeric entry all respond";
  a.criteria = a.criteria.map((c) => ({ ...c, done: true }));
  a.status = "approved";
  a.report = {
    built: "Knob with two-part construction, 18 knurl ridges, radial cap highlight, pointer, generated tick ring and fixed reference triangle.",
    deviations: "Knurl ridge count fixed at 18 (spec allows 16–20) so the ridge pitch stays legible at 78px.",
    tested: "Drag, shift-fine, wheel, arrow/Page/Home/End, focus ring, disabled desaturation, double-click numeric entry.",
    remains: "Cap specular could take a second iteration at small sizes.",
  };

  const b = newTask("1.02", "Tactile square switch");
  b.readFirst = { plan: true, decisions: true, glossary: true, architecture: false, hardware: true, reports: true };
  b.scope = [
    "TactileSwitch.tsx with Variant A (cap-labelled) and Variant B (panel-labelled)",
    "Adjacent amber/red engaged lamp — the cap colour never changes",
  ];
  b.doNotTouch = ["Knob.tsx", "VU meter components", "Colour table tokens"];
  b.gridSpec = "Variant B: 44px cap inside a 58px recessed well, legend above / value below, lamp 9px at 10px gap.";
  b.visualRefs = ["2. Tactile Square Switch", "4. VU Meter — Lamp Illumination (Not LED)"];
  b.colors = ["cream"];
  b.criteria[2].text = "Variant B well never overlaps the legend above or the value label below at 320–1440px";
  b.criteria[3].text = "Press sinks the cap; releasing restores it; the engaged lamp — not the cap colour — carries on/off";
  b.criteria = b.criteria.map((c) => ({ ...c, done: true }));
  b.status = "awaiting";
  b.report = {
    built: "One shared component, both labelling conventions, recessed well on Variant B, pressed state sinks the cap by 1.5px.",
    deviations: "None.",
    tested: "Press, keyboard Enter/Space, engaged lamp on both variants, disabled state, 320px wrap.",
    remains: "Awaiting explicit approval of the running app before the fader task starts.",
  };

  const c = newTask("1.03", "Finger-hollow fader cap");
  c.visualRefs = ["3. Fader Cap — \"Finger-Hollow Curve\""];
  c.colors = ["cream"];
  c.scope = ["Fader.tsx: concave cap with layered lip highlights and central trough"];
  c.doNotTouch = ["Knob.tsx", "TactileSwitch.tsx"];
  c.status = "draft";
  return [c, b, a];
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedTasks();
    const parsed = JSON.parse(raw) as Task[];
    if (!Array.isArray(parsed) || !parsed.length) return seedTasks();
    return parsed;
  } catch {
    return seedTasks();
  }
}

export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* storage unavailable — the builder still works in-memory */
  }
}

/* --------------------------------------------------------------- validation */

export function blockers(t: Task): string[] {
  const out: string[] = [];
  if (!t.number.trim()) out.push("Task number is required");
  if (!t.name.trim()) out.push("Task needs a short name");
  if (!t.scope.some((s) => s.trim())) out.push("At least one bounded deliverable in SCOPE");
  if (!t.doNotTouch.some((s) => s.trim())) out.push("Name at least one thing in DO NOT TOUCH");
  if (!t.readFirst.plan) out.push("Read the product design & build plan — the product-level source of truth");
  if (!t.readFirst.glossary) out.push("glossary.md is required for every task");
  if (t.phase !== 3 && !t.readFirst.hardware)
    out.push("hardware-reference.md is required for Phase 1 and 2 tasks");
  if (!t.readFirst.reports) out.push("Read the prior task reports in /task-reports/");
  if (t.phase !== 3 && t.visualRefs.length === 0)
    out.push("Reference at least one hardware-reference.md section");
  if (!t.gridSpec.trim() && !t.ascii.trim())
    out.push("Structure must be unambiguous without images — add a diagram or a grid spec");
  if (t.criteria.some((c) => c.text.includes("[specific")))
    out.push("Replace the placeholder acceptance criteria with real checks");
  return out;
}

export function readiness(t: Task): number {
  const total = 11;
  const b = blockers(t).length;
  const done = t.criteria.filter((c) => c.done).length / Math.max(1, t.criteria.length);
  const base = Math.max(0, (total - b) / total);
  return Math.min(1, base * 0.72 + done * 0.28);
}

export function reportReady(t: Task) {
  return (
    t.report.built.trim().length > 0 &&
    t.report.tested.trim().length > 0 &&
    t.report.remains.trim().length > 0 &&
    t.criteria.every((c) => c.done)
  );
}

/* --------------------------------------------------------------- generators */

const bullet = (items: string[]) =>
  items.filter((s) => s.trim()).map((s) => `- ${s.trim()}`).join("\n") || "- [not filled in]";

export function buildPrompt(t: Task): string {
  const lines: string[] = [];
  lines.push(`TASK: ${t.number || "[number]"} ${t.name || "[short name]"}`.trimEnd(), "");
  lines.push(
    "READ FIRST:",
    "- decisions-log.md",
    "- glossary.md (required for every task; use canonical terms consistently)",
    "- architecture.md (if it exists yet)",
    "- hardware-reference.md (required for any Phase 1 or Phase 2 task)",
    "- All prior task reports in /task-reports/",
    '  Do not re-litigate decisions already locked in these documents. If a',
    '  decision is marked "deferred," do not silently treat it as finalized —',
    "  choose the simplest testable approach, record it, and preserve the ability",
    "  to change it later.",
    "",
  );
  lines.push("SCOPE (do exactly this, nothing more):", bullet(t.scope), "");
  lines.push(
    "DO NOT TOUCH:",
    bullet(t.doNotTouch),
    "- Do not add functionality beyond what is listed above, even if it seems",
    "  like a natural next step.",
    "",
  );
  lines.push("STRUCTURE REQUIREMENTS (layout/behavior — must be unambiguous without images):");
  if (t.ascii.trim()) {
    lines.push("- ASCII box diagram:");
    lines.push("");
    lines.push("```text");
    lines.push(t.ascii.replace(/\s+$/, ""));
    lines.push("```");
    lines.push("");
  } else {
    lines.push("- [ASCII box diagram of the layout, if applicable]");
  }
  lines.push(
    `- ${t.gridSpec.trim() || "[explicit grid/flex spec: fixed vs. flexible sizes, breakpoints, scroll containers]"}`,
    "",
  );
  if (t.phase !== 3) {
    lines.push("VISUAL REQUIREMENTS (skin — only include in Phase 1/2 tasks):");
    lines.push(
      bullet(
        t.visualRefs.map((r) => `hardware-reference.md → ${r}`),
      ),
    );
    lines.push(
      `- Function-colors in play: ${t.colors.length ? t.colors.join(", ") : "[from the color table]"}`,
    );
    lines.push("- Use only existing shared components — do not create one-off styles.", "");
  }
  lines.push("ACCEPTANCE CRITERIA (all must be true before the task is considered done):");
  lines.push(t.criteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n"), "");
  lines.push("STOP CONDITION:", STOP_CONDITION, "");
  lines.push("OUTPUT:", OUTPUT_TEXT(t.number));
  return lines.join("\n");
}

export function buildReport(t: Task): string {
  return [
    `# Task ${t.number || "[number]"} — ${t.name || "[short name]"} · report`,
    "",
    `Phase ${t.phase} · status: ${t.status}`,
    "",
    "## What was built",
    t.report.built.trim() || "_not written yet_",
    "",
    "## Deviations, and why",
    t.report.deviations.trim() || "None.",
    "",
    "## What was tested",
    t.report.tested.trim() || "_not written yet_",
    "",
    "### Acceptance criteria",
    ...t.criteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`),
    "",
    "## What remains",
    t.report.remains.trim() || "_not written yet_",
    "",
    "---",
    "",
    "STOP CONDITION: waiting for explicit user approval of the running app before",
    "any further work begins.",
    "",
  ].join("\n");
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}
