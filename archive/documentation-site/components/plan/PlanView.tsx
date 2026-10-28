import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Copy,
  Download,
  Lock,
  ScrollText,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { COLORS, COLOR_ORDER } from "../../lib/colors";
import { copyText, downloadText } from "../../lib/tasks";
import {
  BUILT,
  DEFERRED,
  DOC_MAP,
  FRONT_MATTER,
  LOCKED,
  PLAN_RAW,
  PLAN_STATS,
  ROADMAP,
  SECTIONS,
  type Block,
  type Table,
} from "../../lib/plan";
import { Lamp, Legend, Panel, Reveal } from "../ui";

const COLOR_BY_NAME: Record<string, string> = {
  "Cream / off-white": "cream",
  "Amber / gold": "amber",
  Red: "red",
  "Blue-grey": "bluegrey",
  Green: "green",
  Orange: "orange",
};

const slug = (s: string) => `sec-${s}`;

export function PlanView() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string>(SECTIONS[0]?.num ?? "1");
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(""), 2000);
    return () => clearTimeout(id);
  }, [flash]);

  /* scroll-spy over the section rail */
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(slug(s.num))).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("sec-", ""));
      },
      { rootMargin: "-96px 0px -66% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return null;
    const hits: { num: string; title: string; line: string }[] = [];
    SECTIONS.forEach((s) => {
      if (s.title.toLowerCase().includes(needle))
        hits.push({ num: s.num, title: s.title, line: `section title` });
      s.blocks.forEach((b) => {
        const text = b.type === "table" ? b.table.rows.flat().join(" ") : (b as { text: string }).text ?? "";
        if (text.toLowerCase().includes(needle)) hits.push({ num: s.num, title: s.title, line: text });
      });
    });
    return hits.slice(0, 40);
  }, [q]);

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8">
      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-[2px] border border-brass/40 bg-brass/12 px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-[#f0dcb0] uppercase">
          <Lamp on tone="#e8a454" size={8} /> {flash}
        </div>
      )}

      {/* ---------------------------------------------------------- masthead */}
      <Reveal>
        <header className="relative mb-8 overflow-hidden rounded-[3px] border border-black/60 face grain px-5 py-7 sm:px-8 sm:py-9">
          <span className="stripe-org absolute inset-x-0 top-0 h-[5px] bg-org/85" />
          <span
            aria-hidden
            className="animate-lamp pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(232,164,84,.32), rgba(232,164,84,0) 68%)",
              filter: "blur(8px)",
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
            <div>
              <Legend className="text-amberlite">
                {FRONT_MATTER[1] ?? "Rule-Based Automatic Rough-Mixing Application"}
              </Legend>
              <h1 className="font-display mt-3 text-[clamp(2.6rem,8vw,5.6rem)] leading-[0.84] font-extrabold uppercase text-[#f6eedd]">
                Product design
                <br />
                <span className="text-[#7f7768]">&amp; build plan</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-[#b3a892]">
                {FRONT_MATTER[2] ??
                  "Product vision • UX • audio engine • architecture • implementation roadmap"}
                . A consolidated working document based on the full design conversation — the
                product-level source of truth that every task prompt, report and room defers to.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href="#sec-14"
                  className="group flex items-center gap-2 rounded-[2px] border border-brass/50 bg-brass/16 px-4 py-2.5 font-mono text-[9.5px] tracking-[0.2em] text-[#f2dfb4] uppercase transition-all hover:bg-brass/26 hover:shadow-[0_0_18px_-4px_rgba(201,161,90,.7)]"
                >
                  <ScrollText size={12} /> the roadmap
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href="#sec-16"
                  className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-4 py-2.5 font-mono text-[9.5px] tracking-[0.2em] text-[#a89e8a] uppercase transition-colors hover:border-white/30 hover:text-[#efe6d1]"
                >
                  <Lock size={12} /> {LOCKED.length} locked decisions
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await copyText(PLAN_RAW);
                    setCopied(true);
                    setFlash("Full plan copied to clipboard");
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-[2px] border px-4 py-2.5 font-mono text-[9.5px] tracking-[0.2em] uppercase transition-colors",
                    copied
                      ? "border-cgreen/60 bg-cgreen/18 text-[#bfe6c6]"
                      : "border-white/14 bg-black/30 text-[#a89e8a] hover:text-[#efe6d1]",
                  )}
                >
                  <Copy size={12} /> {copied ? "copied" : "copy text"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadText("ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt", PLAN_RAW);
                    setFlash("Downloaded ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt");
                  }}
                  className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-4 py-2.5 font-mono text-[9.5px] tracking-[0.2em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1]"
                >
                  <Download size={12} /> download
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-4 gap-y-4 border-l border-white/10 pl-6">
              {[
                ["sections", String(PLAN_STATS.sections)],
                ["phases", String(PLAN_STATS.phases)],
                ["tasks", String(PLAN_STATS.tasks)],
                ["stop gates", String(PLAN_STATS.stops)],
                ["locked", String(PLAN_STATS.locked)],
                ["deferred", String(PLAN_STATS.deferred)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[8.5px] tracking-[0.2em] text-[#7b7365] uppercase">{k}</dt>
                  <dd className="font-display mt-0.5 text-[1.9rem] leading-none font-bold text-amberlite">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mt-7 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <label className="relative min-w-[240px] flex-1">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#7b7365]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="search all 19 sections — try “masking”, “Return bus”, “chunk”"
                aria-label="Search the plan"
                className="w-full rounded-[2px] border border-white/10 bg-black/45 py-2 pr-8 pl-9 font-mono text-[12px] text-[#e5dbc6] shadow-[inset_0_2px_5px_rgba(0,0,0,.6)] outline-none placeholder:text-[#5f584c] focus:border-amber/70"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQ("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[#7b7365] hover:text-[#efe6d1]"
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <span className="font-mono text-[9px] tracking-[0.16em] text-[#7b7365] uppercase">
              {(PLAN_STATS.bytes / 1024).toFixed(1)} KB · {PLAN_STATS.lines} lines · plain text, committed to the repo
            </span>
          </div>

          {matches && (
            <div className="relative mt-3 max-h-64 overflow-auto rounded-[2px] border border-white/10 bg-black/45">
              {matches.length === 0 ? (
                <p className="px-3 py-3 font-mono text-[10px] tracking-[0.14em] text-[#7b7365] uppercase">
                  nothing in the plan matches “{q}”
                </p>
              ) : (
                matches.map((m, i) => {
                  const at = m.line.toLowerCase().indexOf(q.trim().toLowerCase());
                  const from = Math.max(0, at - 60);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        document.getElementById(slug(m.num))?.scrollIntoView({ block: "start" });
                        setActive(m.num);
                      }}
                      className="flex w-full items-start gap-3 border-b border-white/6 px-3 py-2 text-left transition-colors last:border-0 hover:bg-amber/8"
                    >
                      <span className="mt-[2px] shrink-0 rounded-[2px] bg-brass/20 px-1.5 py-0.5 font-mono text-[9px] text-amberlite">
                        §{m.num}
                      </span>
                      <span className="min-w-0 text-[0.82rem] leading-snug text-[#c3b9a3]">
                        …{m.line.slice(from, from + 190)}…
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </header>
      </Reveal>

      {/* ------------------------------------------------------------- body */}
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-auto pr-1">
            <Legend size="xs" className="mb-2.5 block text-brass">
              contents · {PLAN_STATS.sections} sections
            </Legend>
            <ul className="space-y-px">
              {SECTIONS.map((s) => (
                <li key={s.num}>
                  <a
                    href={`#${slug(s.num)}`}
                    className={cn(
                      "flex items-baseline gap-2 rounded-[2px] px-2 py-1.5 font-mono text-[9.5px] leading-snug tracking-[0.05em] uppercase transition-colors",
                      active === s.num
                        ? "bg-brass/18 text-amberlite shadow-[inset_2px_0_0_#e8a454]"
                        : "text-[#8d8574] hover:bg-white/4 hover:text-[#d8cdb6]",
                    )}
                  >
                    <span className={cn("shrink-0 text-[9px]", active === s.num ? "text-amber" : "text-[#6b6458]")}>
                      {s.num === "vision" ? "✦" : s.num}
                    </span>
                    <span className="min-w-0">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-white/8 pt-4">
              <Legend size="xs" className="mb-2 block text-brass">
                jump to
              </Legend>
              <div className="flex flex-col gap-1">
                {[
                  ["#/tasks", "task template"],
                  ["#/glossary", "glossary"],
                  ["#spec", "hardware spec"],
                  ["#playground", "phase 1 playground"],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-1.5 rounded-[2px] px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-[#8d8574] uppercase transition-colors hover:bg-white/4 hover:text-amberlite"
                  >
                    <ArrowRight size={10} /> {label}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          {SECTIONS.map((s, i) => (
            <Reveal key={s.num} delay={Math.min(i, 5) * 30}>
              <section
                id={slug(s.num)}
                className="scroll-mt-28"
              >
                {s.num === "14" ? (
                  <Roadmap />
                ) : s.num === "16" ? (
                  <LockedDecisions />
                ) : s.num === "17" ? (
                  <Deferred />
                ) : s.num === "vision" ? (
                  <Vision text={s.blocks.map((b) => (b as { text?: string }).text ?? "").join(" ")} />
                ) : s.num === "19" ? (
                  <SupportingDocs blocks={s.blocks} />
                ) : (
                  <GenericSection num={s.num} title={s.title} blocks={s.blocks} />
                )}
              </section>
            </Reveal>
          ))}
          <p className="pb-6 text-center font-mono text-[9px] tracking-[0.24em] text-[#6b6458] uppercase">
            {FRONT_MATTER[FRONT_MATTER.length - 1] ??
              "Working product specification • Consolidated from the design discussion"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- generic section */

function GenericSection({ num, title, blocks }: { num: string; title: string; blocks: Block[] }) {
  return (
    <Panel className="p-5 sm:p-7">
      <SectionTitle num={num} title={title} />
      <div className="mt-4 space-y-3">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} blocks={blocks} index={i} />
        ))}
      </div>
    </Panel>
  );
}

function SectionTitle({ num, title, right }: { num: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/8 pb-3">
      <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-[2px] bg-brass px-1.5 font-mono text-[11px] font-semibold text-[#1a1409] shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_2px_6px_rgba(0,0,0,.6)]">
        {num}
      </span>
      <h2 className="font-display min-w-0 text-[clamp(1.4rem,3.4vw,2.1rem)] leading-[0.95] font-bold uppercase text-[#f4ecdb]">
        {title}
      </h2>
      {right && <div className="ml-auto">{right}</div>}
    </header>
  );
}

/** Runs of short paragraphs read as a bullet list rather than a wall of prose. */
function isListRun(blocks: Block[], index: number) {
  let n = 0;
  for (let i = index; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "p" && b.text.length <= 150) n++;
    else break;
  }
  return n >= 3;
}

function BlockView({ block, blocks, index }: { block: Block; blocks: Block[]; index: number }) {
  switch (block.type) {
    case "h3":
      return (
        <h3 className="pt-2 font-mono text-[10px] font-semibold tracking-[0.22em] text-amberlite uppercase">
          {block.text}
        </h3>
      );
    case "step":
      return (
        <div className="flex items-start gap-3">
          <span className="mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-brass/50 bg-black/40 font-mono text-[9px] text-amberlite">
            {block.n}
          </span>
          <p className="text-[0.9rem] leading-relaxed text-[#c6bba5]">{block.text}</p>
        </div>
      );
    case "table":
      return <TableView table={block.table} />;
    default: {
      if (isListRun(blocks, index)) {
        return (
          <div className="flex gap-2.5">
            <span className="mt-[8px] h-[2px] w-2 shrink-0 bg-brass/70" />
            <p className="min-w-0 text-[0.9rem] leading-relaxed text-[#c3b9a3]">{block.text}</p>
          </div>
        );
      }
      return <p className="text-[0.92rem] leading-[1.75] text-[#c6bba5]">{block.text}</p>;
    }
  }
}

function TableView({ table }: { table: Table }) {
  if (table.kind === "colour") {
    return (
      <div className="my-4 grid gap-2 sm:grid-cols-2">
        {table.rows.map(([name, meaning]) => {
          const c = COLORS[COLOR_BY_NAME[name] ?? "cream"];
          return (
            <div
              key={name}
              className="group flex items-center gap-3 rounded-[2px] border border-white/8 bg-black/28 px-3 py-2.5 transition-colors hover:border-brass/40"
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full transition-transform group-hover:scale-110"
                style={{
                  background: `radial-gradient(circle at 34% 28%, ${c.hi}, ${c.base} 48%, ${c.lo})`,
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.5)",
                }}
              />
              <span className="min-w-0">
                <span className="block font-mono text-[10px] tracking-[0.14em] text-[#e5dbc6] uppercase">{name}</span>
                <span className="block text-[0.82rem] leading-snug text-[#a89e8a]">{meaning}</span>
              </span>
            </div>
          );
        })}
        <p className="sm:col-span-2 font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
          §4 functional colour — identical to the hardware reference §5 table, applied per pot
        </p>
      </div>
    );
  }

  if (table.kind === "profiles") {
    return (
      <div className="my-4 grid gap-2 sm:grid-cols-3">
        {table.rows.map(([name, intent], i) => (
          <div
            key={name}
            className={cn(
              "rounded-[2px] border p-3 transition-all hover:-translate-y-[2px]",
              i === 1 ? "border-amber/45 bg-amber/8" : "border-white/8 bg-black/28",
            )}
          >
            <div className="flex items-center gap-2">
              <Lamp on={i === 1} tone="#e8a454" size={8} />
              <span className="font-display text-[1.15rem] leading-none font-bold tracking-[0.06em] text-[#efe6d1] uppercase">
                {name}
              </span>
              {i === 1 && (
                <span className="ml-auto font-mono text-[8px] tracking-[0.16em] text-amberlite uppercase">default</span>
              )}
            </div>
            <p className="mt-2 text-[0.82rem] leading-snug text-[#a89e8a]">{intent}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="my-4 overflow-x-auto rounded-[2px] border border-white/8">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="bg-black/40">
            {table.head.map((h) => (
              <th key={h} className="engrave px-3 py-2 font-mono text-[9px] tracking-[0.2em] uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-white/6 align-top transition-colors hover:bg-amber/6">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-3 py-2.5 text-[0.85rem] leading-snug",
                    ci === 0
                      ? "font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap text-amberlite uppercase"
                      : "text-[#b3a892]",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- §14 phases */

function Roadmap() {
  const [open, setOpen] = useState<string[]>(["0", "1", "2"]);
  const toggle = (n: string) => setOpen((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]));

  return (
    <Panel className="p-5 sm:p-7">
      <SectionTitle
        num="14"
        title="Revised Web Build Roadmap: UI-First Phased Approach"
        right={
          <button
            type="button"
            onClick={() => setOpen(open.length ? [] : ROADMAP.phases.map((p) => p.n))}
            className="rounded-[2px] border border-white/14 bg-black/30 px-2.5 py-1 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
          >
            {open.length ? "collapse all" : "expand all"}
          </button>
        }
      />
      <div className="mt-4 space-y-3">
        {ROADMAP.intro.map((p, i) => (
          <p key={i} className="text-[0.92rem] leading-[1.75] text-[#c6bba5]">
            {p}
          </p>
        ))}
      </div>

      {/* the governing rule, as a printed warning plate */}
      <div className="mt-5 flex items-start gap-3 rounded-[2px] border border-amber/40 bg-amber/8 p-4">
        <ShieldAlert size={16} className="mt-[2px] shrink-0 text-amberlite" />
        <p className="text-[0.88rem] leading-relaxed text-[#e9d4a8]">
          <strong className="text-[#fbe9c3]">Governing rule.</strong> Structure and skin are built and
          explicitly approved in isolation before any shared project state, audio import, analysis or
          DSP is connected. No task may combine new layout/visual work with new functional/data wiring.
        </p>
      </div>

      <ol className="relative mt-6 space-y-3 border-l border-dashed border-brass/25 pl-5 sm:pl-7">
        {ROADMAP.phases.map((phase) => {
          const expanded = open.includes(phase.n);
          const built = phase.tasks.filter((t) => BUILT[t.id]).length;
          const isUiPhase = Number(phase.n) <= 2;
          return (
            <li key={phase.n} className="relative">
              <span
                className="absolute -left-[26px] top-4 grid h-4 w-4 place-items-center rounded-full border sm:-left-[34px]"
                style={{
                  borderColor: isUiPhase ? "#e8a454" : "rgba(201,161,90,.4)",
                  background: isUiPhase ? "radial-gradient(circle at 35% 30%, #f0c27a, #8a430e)" : "#1b1712",
                  boxShadow: isUiPhase ? "0 0 8px rgba(232,164,84,.6)" : "none",
                }}
              />
              <div
                className={cn(
                  "rounded-[3px] border transition-colors",
                  expanded ? "border-brass/35 bg-black/30" : "border-white/8 bg-black/20 hover:border-white/20",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(phase.n)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left"
                >
                  <span className="font-display text-[1.5rem] leading-none font-extrabold text-brass">
                    {phase.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display block text-[1.15rem] leading-tight font-bold tracking-[0.03em] text-[#f0e7d4] uppercase">
                      {phase.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9px] tracking-[0.16em] text-[#7b7365] uppercase">
                      {phase.tasks.length} task{phase.tasks.length === 1 ? "" : "s"}
                      {built > 0 && ` · ${built} demonstrated in this repo`}
                      {phase.stop ? " · stop gate" : ""}
                    </span>
                  </span>
                  {isUiPhase && (
                    <span className="rounded-[2px] border border-amber/50 bg-amber/12 px-2 py-0.5 font-mono text-[8.5px] tracking-[0.18em] text-amberlite uppercase">
                      approval required
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-mono text-[12px] text-[#8d8574] transition-transform duration-200",
                      expanded && "rotate-90 text-amberlite",
                    )}
                  >
                    ▸
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-white/8 px-4 py-4">
                    {phase.notes.map((n, i) => (
                      <p key={i} className="text-[0.88rem] leading-relaxed text-[#b3a892]">
                        {n}
                      </p>
                    ))}
                    <ul className="space-y-2">
                      {phase.tasks.map((t) => {
                        const b = BUILT[t.id];
                        return (
                          <li
                            key={t.id}
                            className="group rounded-[2px] border border-white/7 bg-black/25 p-3 transition-colors hover:border-brass/35"
                          >
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-amberlite">
                                {t.id}
                              </span>
                              <span className="min-w-0 flex-1 text-[0.88rem] leading-snug text-[#d3c9b3]">{t.text}</span>
                              {b && (
                                <a
                                  href={b.href}
                                  className="flex items-center gap-1 rounded-[2px] border border-cgreen/40 bg-cgreen/10 px-2 py-0.5 font-mono text-[8.5px] tracking-[0.14em] text-[#bfe6c6] uppercase transition-colors hover:bg-cgreen/20"
                                >
                                  {b.label} <ArrowRight size={9} />
                                </a>
                              )}
                            </div>
                            {t.review && (
                              <p className="mt-2 flex gap-2 border-l-2 border-brass/40 pl-2.5 font-mono text-[9.5px] leading-relaxed tracking-[0.04em] text-[#a89e8a] uppercase">
                                <span className="shrink-0 text-brass">review:</span>
                                <span className="min-w-0 normal-case">{t.review}</span>
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {phase.stop && (
                      <div className="relative flex items-start gap-3 overflow-hidden rounded-[2px] border border-sred/50 bg-[#1d100d] p-3.5">
                        <span
                          aria-hidden
                          className="animate-lamp pointer-events-none absolute -right-10 -bottom-12 h-32 w-32 rounded-full"
                          style={{
                            background: "radial-gradient(circle, rgba(207,68,54,.4), rgba(207,68,54,0) 70%)",
                            filter: "blur(8px)",
                          }}
                        />
                        <Lamp on tone="#cf4436" size={10} className="relative mt-[3px] shrink-0 animate-blink" />
                        <p className="relative font-mono text-[9.5px] leading-relaxed tracking-[0.14em] text-[#e6b3a6] uppercase">
                          <strong className="text-[#f3cdc2]">STOP</strong> — {phase.stop}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------- §16 / §17 / §19 */

function LockedDecisions() {
  const [filter, setFilter] = useState("");
  const shown = LOCKED.filter((d) => d.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <Panel className="p-5 sm:p-7">
      <SectionTitle
        num="16"
        title="Decisions Locked So Far"
        right={
          <span className="flex items-center gap-2 rounded-[2px] border border-cgreen/40 bg-cgreen/10 px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] text-[#bfe6c6] uppercase">
            <Lock size={11} /> {LOCKED.length} requirements
          </span>
        }
      />
      <p className="mt-3 text-[0.88rem] leading-relaxed text-[#b3a892]">
        Section 18 makes these requirements, not suggestions: “Treat the locked decisions in Section 16
        as requirements.”
      </p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter decisions…"
        aria-label="Filter locked decisions"
        className="mt-4 w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-[#e5dbc6] outline-none placeholder:text-[#5f584c] focus:border-cgreen/60 sm:max-w-xs"
      />
      <ol className="mt-4 grid gap-2 lg:grid-cols-2">
        {shown.map((d, i) => (
          <li
            key={d}
            className="flex items-start gap-2.5 rounded-[2px] border border-white/7 bg-black/25 p-3 transition-colors hover:border-cgreen/35"
          >
            <span className="mt-[1px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[2px] border border-cgreen/50 bg-cgreen/15 text-[#bfe6c6]">
              <Lock size={9} />
            </span>
            <span className="min-w-0 text-[0.85rem] leading-snug text-[#c6bba5]">
              <span className="mr-1.5 font-mono text-[9px] text-[#6b6458]">{String(i + 1).padStart(2, "0")}</span>
              {d}
            </span>
          </li>
        ))}
      </ol>
      {shown.length === 0 && (
        <p className="mt-4 font-mono text-[10px] tracking-[0.14em] text-[#7b7365] uppercase">
          no locked decision matches “{filter}”
        </p>
      )}
    </Panel>
  );
}

function Deferred() {
  return (
    <Panel className="p-5 sm:p-7">
      <SectionTitle
        num="17"
        title="Deliberately Deferred / Needs Later Validation"
        right={
          <span className="flex items-center gap-2 rounded-[2px] border border-amber/45 bg-amber/10 px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] text-[#e9d4a8] uppercase">
            <CircleAlert size={11} /> {DEFERRED.length} open
          </span>
        }
      />
      <div className="mt-3 flex items-start gap-3 rounded-[2px] border border-amber/35 bg-amber/8 p-3.5">
        <ShieldAlert size={15} className="mt-[2px] shrink-0 text-amberlite" />
        <p className="text-[0.86rem] leading-relaxed text-[#e0c9a2]">
          Do not silently turn these into fixed requirements. If an implementation detail must be
          chosen to make progress, choose the simplest testable approach, record it in{" "}
          <span className="font-mono text-[11px] text-amberlite">decisions-log.md</span>, and preserve
          the ability to change it later.
        </p>
      </div>
      <ul className="mt-4 grid gap-2 lg:grid-cols-2">
        {DEFERRED.map((d) => (
          <li
            key={d}
            className="flex items-start gap-2.5 rounded-[2px] border border-dashed border-amber/25 bg-black/20 p-3 transition-colors hover:border-amber/50"
          >
            <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rotate-45 border border-amber/70" />
            <span className="min-w-0 text-[0.85rem] leading-snug text-[#bfb49c]">{d}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SupportingDocs({ blocks }: { blocks: Block[] }) {
  return (
    <Panel className="p-5 sm:p-7">
      <SectionTitle num="19" title="Supporting Documents" />
      <div className="mt-4 space-y-3">
        {blocks
          .filter((b) => b.type === "p")
          .map((b, i) => (
            <p key={i} className="text-[0.92rem] leading-[1.75] text-[#c6bba5]">
              {(b as { text: string }).text}
            </p>
          ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {DOC_MAP.map((d) => (
          <div
            key={d.file}
            className={cn(
              "flex items-start gap-3 rounded-[2px] border p-3 transition-colors",
              d.inRepo ? "border-cgreen/30 bg-[#101509]/60" : "border-white/8 bg-black/25",
            )}
          >
            <span
              className={cn(
                "mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border",
                d.inRepo ? "border-cgreen/60 bg-cgreen/15 text-[#bfe6c6]" : "border-white/20 bg-black/40 text-[#6b6458]",
              )}
            >
              {d.inRepo ? <Copy size={9} /> : <X size={9} />}
            </span>
            <span className="min-w-0">
              {d.href ? (
                <a
                  href={d.href}
                  className="font-mono text-[10.5px] break-all text-amberlite underline decoration-brass/40 underline-offset-2 hover:decoration-amber"
                >
                  {d.file}
                </a>
              ) : (
                <span className="font-mono text-[10.5px] break-all text-[#ded4bf]">{d.file}</span>
              )}
              <span className="mt-0.5 block text-[0.79rem] leading-snug text-[#8d8574]">{d.note}</span>
              <span
                className={cn(
                  "mt-1 inline-block font-mono text-[8px] tracking-[0.18em] uppercase",
                  d.inRepo ? "text-cgreen" : "text-[#6b6458]",
                )}
              >
                {d.inRepo ? "in repo" : "not written yet"}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[2px] border border-white/8 bg-black/25 p-4">
        <Legend size="xs" className="mb-2 block text-brass">
          §18 handoff rules that bind every task
        </Legend>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {[
            "The owner commits and tags; the agent must not",
            "No internet-dependent dependencies in the offline environment",
            "No new dependency or version change without reported rationale",
            "Real audio processing by the end of Phases 5–7",
            "Every task ends with a mandatory stop for user review",
            "Rejected output: revert, revise the prompt, rerun",
            "UI tasks must cite the hardware-reference section they follow",
            "UI reports state the exact techniques used, not just “it matches”",
          ].map((r) => (
            <li key={r} className="flex gap-2 text-[0.82rem] leading-snug text-[#b3a892]">
              <span className="mt-[7px] h-[2px] w-2 shrink-0 bg-brass/70" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Vision({ text }: { text: string }) {
  return (
    <Panel className="relative overflow-hidden p-6 sm:p-9">
      <span
        aria-hidden
        className="animate-lamp pointer-events-none absolute -bottom-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(232,164,84,.26), rgba(232,164,84,0) 68%)",
          filter: "blur(14px)",
        }}
      />
      <span className="stripe-org absolute inset-x-0 bottom-0 h-[5px] bg-org/80" />
      <div className="relative">
        <Legend className="text-amberlite">closing vision</Legend>
        <p className="font-display mt-3 text-[clamp(1.3rem,3.2vw,2rem)] leading-[1.15] font-semibold uppercase text-[#f4ecdb]">
          {text.split(". ")[0]}.
        </p>
        <p className="mt-4 max-w-3xl text-[0.95rem] leading-[1.8] text-[#c6bba5]">
          {text
            .split(". ")
            .slice(1)
            .join(". ")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.18em] text-[#7b7365] uppercase">
            proven in this repo:
          </span>
          {COLOR_ORDER.map((k) => (
            <span
              key={k}
              className="h-3 w-3 rounded-full"
              title={COLORS[k].name}
              style={{
                background: `radial-gradient(circle at 34% 28%, ${COLORS[k].hi}, ${COLORS[k].base} 48%, ${COLORS[k].lo})`,
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,.5)",
              }}
            />
          ))}
          <a
            href="#playground"
            className="ml-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] text-brass uppercase hover:text-amberlite"
          >
            component playground <ArrowRight size={11} />
          </a>
        </div>
      </div>
    </Panel>
  );
}
