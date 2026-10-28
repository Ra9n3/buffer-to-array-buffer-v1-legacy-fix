import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  BookOpenText,
  Copy,
  Download,
  Link2,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { COLORS, ORG_COLORS } from "../../lib/colors";
import { copyText, downloadText } from "../../lib/tasks";
import { DOMAINS, GLOSSARY_RAW, TERMS, byId, isFlagOnly, lint, rewrite, type Domain, type Term } from "../../lib/glossary";
import { Knob } from "../hardware/Knob";
import { Lamp, Legend, Panel, Reveal } from "../ui";

const SAMPLE =
  "Add a folder track for the drum stems and tint it orange. The lead vocal has the highest importance so treat it as foreground; pin its EQ so MIX leaves it alone, then route the aux send to the FX track and ignore the reverb tail in masking.";

export function GlossaryView() {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [active, setActive] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [draft, setDraft] = useState(SAMPLE);
  const [docMode, setDocMode] = useState<"rendered" | "raw">("rendered");

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (domain !== "all" && t.domain !== domain) return false;
      if (!needle) return true;
      return (
        t.term.toLowerCase().includes(needle) ||
        t.definition.toLowerCase().includes(needle) ||
        t.avoid.some((a) => a.toLowerCase().includes(needle))
      );
    });
  }, [q, domain]);

  /** typing a near-synonym in search surfaces its canonical term up front */
  const redirect = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || needle.length < 3) return null;
    return TERMS.find((t) => t.avoid.some((a) => a.toLowerCase() === needle)) ?? null;
  }, [q]);

  const hits = useMemo(() => lint(draft), [draft]);
  const activeTerm = active ? byId(active) : null;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    TERMS.forEach((t) => (c[t.domain] = (c[t.domain] ?? 0) + 1));
    return c;
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8">
      <Reveal>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <Legend className="text-amberlite">alloy · product glossary · glossary.md</Legend>
            <h1 className="font-display mt-2 text-[clamp(2.4rem,7vw,5rem)] leading-[0.85] font-extrabold uppercase text-[#f6eedd]">
              Canonical terms
              <span className="text-brass">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[#a89e8a]">
              {TERMS.length} definitions, used identically in the specification, task prompts,
              implementation and reports. When older prose uses a near-synonym, the canonical term
              below wins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#/tasks"
              className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-4 py-2.5 font-mono text-[9.5px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:border-brass/50 hover:text-[#efe6d1]"
            >
              required for every task <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </Reveal>

      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-[2px] border border-brass/40 bg-brass/12 px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-[#f0dcb0] uppercase">
          <Lamp on tone="#e8a454" size={8} /> {flash}
        </div>
      )}

      {/* ----------------------------------------------- the two collisions */}
      <Reveal>
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Collision
            title="Role ≠ Prominence Tier"
            tone="#cf4436"
            left={{
              h: "Role",
              sub: "musical function",
              items: ["lead / main", "rhythm", "stacked / double", "background / harmony"],
            }}
            right={{
              h: "Prominence Tier",
              sub: "mix-conflict treatment · backed by Priority 1–10",
              items: ["Primary", "Supporting", "Background"],
            }}
            rule="Unrelated axes despite overlapping wording. A background-harmony Role can be a Primary tier; a lead Role can be Supporting. Never assume one implies the other."
            onOpen={() => setActive("role-vs-prominence-tier")}
          />
          <ColourCollision onOpen={(id) => setActive(id)} />
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ----------------------------------------------------- list */}
        <div className="min-w-0">
          <Panel className="mb-4 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1">
                <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#7b7365]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="search a term, a definition — or the wrong word"
                  aria-label="Search glossary"
                  className="w-full rounded-[2px] border border-white/10 bg-black/40 py-2 pr-8 pl-9 font-mono text-[12px] text-[#e5dbc6] shadow-[inset_0_2px_5px_rgba(0,0,0,.6)] outline-none placeholder:text-[#5f584c] focus:border-amber/70"
                />
                {q && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQ("")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-[#7b7365] hover:text-[#e5dbc6]"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <div className="flex flex-wrap gap-1">
                <Chip on={domain === "all"} onClick={() => setDomain("all")}>
                  all · {TERMS.length}
                </Chip>
                {(Object.keys(DOMAINS) as Domain[]).map((d) => (
                  <Chip key={d} on={domain === d} onClick={() => setDomain(d)} tone={DOMAINS[d].tone}>
                    {DOMAINS[d].label} · {counts[d] ?? 0}
                  </Chip>
                ))}
              </div>
            </div>

            {redirect && (
              <button
                type="button"
                onClick={() => setActive(redirect.id)}
                className="mt-3 flex w-full items-center gap-3 rounded-[2px] border border-amber/45 bg-amber/10 px-3 py-2 text-left transition-colors hover:bg-amber/16"
              >
                <ShieldAlert size={14} className="shrink-0 text-amberlite" />
                <span className="font-mono text-[10px] tracking-[0.1em] text-[#e9d4a8]">
                  “{q.trim()}” is a near-synonym. The canonical term is{" "}
                  <strong className="text-amberlite">{redirect.term}</strong> — use that.
                </span>
                <ArrowRight size={13} className="ml-auto shrink-0 text-amberlite" />
              </button>
            )}
          </Panel>

          {results.length === 0 ? (
            <Panel className="p-8 text-center">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#7b7365] uppercase">
                no term matches “{q}” — if it should exist, propose it in a task report
              </p>
            </Panel>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {results.map((t, i) => (
                <Reveal as="li" key={t.id} delay={Math.min(i, 6) * 40}>
                  <TermCard term={t} active={active === t.id} onOpen={() => setActive(t.id)} highlight={q} />
                </Reveal>
              ))}
            </ul>
          )}
        </div>

        {/* --------------------------------------------------- detail */}
        <aside className="min-w-0">
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto lg:pr-1">
            {activeTerm ? (
              <Detail term={activeTerm} onClose={() => setActive(null)} onJump={(id) => setActive(id)} onFlash={setFlash} />
            ) : (
              <Panel className="p-5">
                <Legend className="mb-2 block text-brass">term detail</Legend>
                <p className="text-[0.88rem] leading-relaxed text-[#a89e8a]">
                  Select a term to see its definition, the near-synonyms it replaces, related
                  terms, and where in the repo it is load-bearing.
                </p>
                <div className="mt-4 flex items-center gap-3 rounded-[2px] border border-white/8 bg-black/28 p-3">
                  <Lamp on tone="#e8a454" size={9} />
                  <span className="font-mono text-[9px] leading-relaxed tracking-[0.14em] text-[#8d8574] uppercase">
                    tip — search for the word you were about to use; if it is a near-synonym, the
                    canonical term surfaces first
                  </span>
                </div>
              </Panel>
            )}

            {/* ------------------------------------------- prose lint */}
            <Panel className="mt-4 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={13} className="text-amberlite" />
                <Legend className="text-brass">prose check — prefer the canonical term</Legend>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                aria-label="Paste prose to check for near-synonyms"
                className="w-full resize-y rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 font-body text-[0.86rem] leading-relaxed text-[#e0d6c0] shadow-[inset_0_2px_5px_rgba(0,0,0,.6)] outline-none focus:border-amber/70"
              />
              <div className="mt-2 rounded-[2px] border border-white/8 bg-black/30 p-3 text-[0.85rem] leading-relaxed text-[#c3b9a3]">
                {hits.length === 0 ? (
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#9fc7a7] uppercase">
                    clean — every term here is canonical
                  </span>
                ) : (
                  <Highlighted text={draft} hits={hits} onPick={(id) => setActive(id)} />
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
                  {hits.length} near-synonym{hits.length === 1 ? "" : "s"} found
                  {hits.some((h) => isFlagOnly(h.found)) && " · dotted = rephrase by hand"}
                </span>
                <button
                  type="button"
                  disabled={hits.length === 0}
                  onClick={() => {
                    setDraft(rewrite(draft));
                    setFlash("Rewritten with canonical terms");
                  }}
                  className="ml-auto rounded-[2px] border border-brass/50 bg-brass/16 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#f2dfb4] uppercase transition-colors hover:bg-brass/26 disabled:opacity-40"
                >
                  rewrite canonically
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(SAMPLE)}
                  className="rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
                >
                  reset
                </button>
              </div>
            </Panel>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------ the file */}
      <div id="glossary-file" className="mt-10 scroll-mt-28">
        <Panel className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-white/8 pb-3">
            <BookOpenText size={15} className="text-brass" />
            <h3 className="font-display text-[1.35rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
              ALLOY-PRODUCT-GLOSSARY.md
            </h3>
            <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
              source of truth · {GLOSSARY_RAW.split("\n").length} lines · the cards above are parsed from it
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setDocMode(docMode === "rendered" ? "raw" : "rendered")}
                className="rounded-[2px] border border-brass/45 bg-brass/12 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#e7d3ab] uppercase hover:bg-brass/22"
              >
                {docMode === "rendered" ? "raw md" : "rendered"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyText(GLOSSARY_RAW);
                  setFlash("Glossary copied");
                }}
                className="flex items-center gap-1.5 rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
              >
                <Copy size={11} /> copy
              </button>
              <button
                type="button"
                onClick={() => downloadText("ALLOY-PRODUCT-GLOSSARY.md", GLOSSARY_RAW)}
                className="flex items-center gap-1.5 rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
              >
                <Download size={11} /> download
              </button>
            </div>
          </div>
          {docMode === "rendered" ? (
            <article className="spec-prose">
              <Markdown remarkPlugins={[remarkGfm]}>{GLOSSARY_RAW}</Markdown>
            </article>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-[2px] border border-white/8 bg-black/45 p-4 font-mono text-[10.5px] leading-[1.7] whitespace-pre-wrap text-[#c9bfa9]">
              {GLOSSARY_RAW}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Chip({
  on,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-all",
        on
          ? "border-white/25 bg-white/8 text-[#efe6d1] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
          : "border-white/10 bg-black/28 text-[#8d8574] hover:text-[#d8cdb6]",
      )}
    >
      {tone && <span className="h-2 w-2 rounded-full" style={{ background: tone, boxShadow: on ? `0 0 6px ${tone}` : "none" }} />}
      {children}
    </button>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded-[1px] bg-amber/30 px-0.5 text-[#fbe9c3]">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function TermCard({
  term,
  active,
  onOpen,
  highlight,
}: {
  term: Term;
  active: boolean;
  onOpen: () => void;
  highlight: string;
}) {
  const d = DOMAINS[term.domain];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "face grain relative h-full w-full rounded-[3px] border p-4 text-left transition-all duration-200 hover:-translate-y-[2px]",
        active ? "border-brass/60 shadow-[0_0_0_1px_rgba(201,161,90,.35),0_18px_40px_-22px_rgba(0,0,0,.9)]" : "border-black/60 hover:border-white/20",
      )}
    >
      {/* engraved nameplate with a domain tab — §7 marker treatment */}
      <div className="relative flex items-center gap-2.5">
        <span
          className="stripe-org h-[15px] w-[30px] shrink-0"
          style={{
            background: d.tone,
            clipPath: "polygon(0 0, 100% 0, 100% 72%, 86% 100%, 0 100%)",
            boxShadow: "0 1px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.4)",
          }}
        />
        <h3 className="engrave font-mono text-[12px] font-semibold tracking-[0.16em] uppercase">
          <Mark text={term.term} q={highlight} />
        </h3>
        <span className="ml-auto font-mono text-[8px] tracking-[0.16em] text-[#6b6458] uppercase">{d.label}</span>
      </div>
      <p className="relative mt-2.5 text-[0.86rem] leading-relaxed text-[#c3b9a3]">
        <Mark text={term.definition} q={highlight} />
      </p>
      {term.avoid.length > 0 && (
        <p className="relative mt-3 flex flex-wrap items-center gap-1 font-mono text-[8.5px] tracking-[0.1em] text-[#7b7365] uppercase">
          <span className="text-[#a1786e]">not:</span>
          {term.avoid.slice(0, 3).map((a) => (
            <span key={a} className="rounded-[1px] border border-white/8 px-1.5 py-0.5 line-through decoration-sred/70">
              <Mark text={a} q={highlight} />
            </span>
          ))}
          {term.avoid.length > 3 && <span>+{term.avoid.length - 3}</span>}
        </p>
      )}
    </button>
  );
}

function Detail({
  term,
  onClose,
  onJump,
  onFlash,
}: {
  term: Term;
  onClose: () => void;
  onJump: (id: string) => void;
  onFlash: (s: string) => void;
}) {
  const d = DOMAINS[term.domain];
  const entry = `**${term.term}** — ${term.definition}`;
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <span
          className="stripe-org mt-1 h-[19px] w-[38px] shrink-0"
          style={{
            background: d.tone,
            clipPath: "polygon(0 0, 100% 0, 100% 72%, 86% 100%, 0 100%)",
            boxShadow: "0 1px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.4)",
          }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.7rem] leading-none font-bold tracking-[0.04em] text-[#f4ecdb] uppercase">
            {term.term}
          </h2>
          <p className="mt-1 font-mono text-[8.5px] tracking-[0.18em] uppercase" style={{ color: d.tone }}>
            {d.label} · {d.blurb}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="text-[#7b7365] hover:text-[#efe6d1]">
          <X size={15} />
        </button>
      </div>

      <p className="mt-4 border-l-2 border-brass/60 pl-3 text-[0.92rem] leading-relaxed text-[#e0d6c0]">
        {term.definition}
      </p>

      {term.avoid.length > 0 && (
        <div className="mt-5">
          <Legend size="xs" className="mb-2 block text-[#a1786e]">
            near-synonyms this replaces
          </Legend>
          <div className="flex flex-wrap gap-1.5">
            {term.avoid.map((a) => (
              <span key={a} className="flex items-center gap-1.5 rounded-[2px] border border-sred/30 bg-sred/8 px-2 py-1 font-mono text-[9.5px] text-[#d9a99e]">
                <span className="line-through decoration-sred/80">{a}</span>
                <ArrowRight size={10} className="text-[#8d8574]" />
                <span className="text-amberlite">{term.term}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {term.related.length > 0 && (
        <div className="mt-5">
          <Legend size="xs" className="mb-2 block text-brass">
            related canonical terms
          </Legend>
          <div className="flex flex-wrap gap-1.5">
            {term.related.map((r) => {
              const t = byId(r);
              if (!t) return null;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onJump(r)}
                  className="flex items-center gap-1.5 rounded-[2px] border border-white/12 bg-black/30 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.08em] text-[#d8cdb6] uppercase transition-colors hover:border-brass/50 hover:text-amberlite"
                >
                  <Link2 size={10} /> {t.term}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {term.usedIn.length > 0 && (
        <div className="mt-5">
          <Legend size="xs" className="mb-2 block text-[#8d8574]">
            load-bearing in
          </Legend>
          <ul className="space-y-1">
            {term.usedIn.map((u) => (
              <li key={u} className="flex gap-2 font-mono text-[10px] text-[#a89e8a]">
                <span className="mt-[7px] h-[2px] w-2 shrink-0 bg-brass/60" />
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex gap-2 border-t border-white/8 pt-4">
        <button
          type="button"
          onClick={async () => {
            await copyText(entry);
            onFlash(`“${term.term}” definition copied`);
          }}
          className="flex items-center gap-1.5 rounded-[2px] border border-brass/50 bg-brass/16 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#f2dfb4] uppercase hover:bg-brass/26"
        >
          <Copy size={11} /> copy definition
        </button>
        <a
          href="#glossary-file"
          className="flex items-center gap-1.5 rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
        >
          in the file
        </a>
      </div>
    </Panel>
  );
}

function Highlighted({
  text,
  hits,
  onPick,
}: {
  text: string;
  hits: ReturnType<typeof lint>;
  onPick: (id: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  hits.forEach((h, k) => {
    parts.push(<span key={`t${k}`}>{text.slice(i, h.start)}</span>);
    const flag = isFlagOnly(h.found);
    parts.push(
      <button
        key={`h${k}`}
        type="button"
        onClick={() => onPick(h.canonical.id)}
        title={flag ? `Concept: ${h.canonical.term} — rephrase by hand` : `Canonical: ${h.canonical.term}`}
        className={cn(
          "group mx-0.5 inline-flex items-baseline gap-1 rounded-[2px] border px-1 align-baseline transition-colors",
          flag
            ? "border-amber/40 bg-amber/8 hover:border-amber/70"
            : "border-sred/40 bg-sred/10 hover:border-amber/60 hover:bg-amber/12",
        )}
      >
        <span className={cn(flag ? "text-[#e9d4a8] underline decoration-amber/70 decoration-dotted" : "text-[#d9a99e] line-through decoration-sred/80")}>
          {h.found}
        </span>
        <span className="font-mono text-[10px] text-amberlite">{flag ? `see ${h.canonical.term}` : h.canonical.term}</span>
      </button>,
    );
    i = h.end;
  });
  parts.push(<span key="tail">{text.slice(i)}</span>);
  return <>{parts}</>;
}

function Collision({
  title,
  tone,
  left,
  right,
  rule,
  onOpen,
}: {
  title: string;
  tone: string;
  left: { h: string; sub: string; items: string[] };
  right: { h: string; sub: string; items: string[] };
  rule: string;
  onOpen: () => void;
}) {
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert size={14} style={{ color: tone }} />
        <h3 className="font-display text-[1.3rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        {[left, right].map((side, i) => (
          <div key={side.h} className={cn("rounded-[2px] border border-white/8 bg-black/28 p-3", i === 1 && "order-3")}>
            <div className="engrave font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">{side.h}</div>
            <div className="mt-0.5 font-mono text-[8px] tracking-[0.14em] text-[#7b7365] uppercase">{side.sub}</div>
            <ul className="mt-2 space-y-1">
              {side.items.map((it) => (
                <li key={it} className="flex items-center gap-2 font-mono text-[10px] text-[#c3b9a3]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="order-2 flex flex-col items-center justify-center gap-1 px-1">
          <span className="font-display text-[1.6rem] font-bold" style={{ color: tone }}>
            ≠
          </span>
          <span className="font-mono text-[7.5px] tracking-[0.16em] text-[#6b6458] uppercase [writing-mode:vertical-rl]">
            independent
          </span>
        </div>
      </div>
      <p className="mt-3 text-[0.84rem] leading-relaxed text-[#b3a892]">{rule}</p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-brass uppercase hover:text-amberlite"
      >
        open the term <ArrowRight size={11} />
      </button>
    </Panel>
  );
}

function ColourCollision({ onOpen }: { onOpen: (id: string) => void }) {
  const [v, setV] = useState(6.2);
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber" />
        <h3 className="font-display text-[1.3rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
          Organizational Color ≠ Functional Color Coding
        </h3>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <div className="rounded-[2px] border border-white/8 bg-black/28 p-3">
          <div className="engrave font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">Organizational</div>
          <div className="mt-0.5 font-mono text-[8px] tracking-[0.14em] text-[#7b7365] uppercase">identity · who is this</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ORG_COLORS.slice(0, 6).map((c, i) => (
              <span
                key={c}
                className="stripe-org grid h-[15px] w-[30px] place-items-center font-mono text-[7px] font-semibold text-[#1a1409]"
                style={{
                  background: c,
                  clipPath: "polygon(0 0, 100% 0, 100% 72%, 86% 100%, 0 100%)",
                  boxShadow: "0 1px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.4)",
                }}
              >
                {["DRV", "BAS", "RHY", "LDV", "AMB", "KEY"][i]}
              </span>
            ))}
          </div>
          <p className="mt-2 font-mono text-[8.5px] leading-relaxed tracking-[0.1em] text-[#8d8574] uppercase">
            a tab beside the name — arrange · mixer · console
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-1">
          <span className="font-display text-[1.6rem] font-bold text-amber">≠</span>
          <span className="font-mono text-[7.5px] tracking-[0.16em] text-[#6b6458] uppercase [writing-mode:vertical-rl]">
            independent
          </span>
        </div>
        <div className="rounded-[2px] border border-white/8 bg-black/28 p-3">
          <div className="engrave font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">Functional</div>
          <div className="mt-0.5 font-mono text-[8px] tracking-[0.14em] text-[#7b7365] uppercase">purpose · what does this do</div>
          <div className="mt-1 flex items-center justify-between gap-1">
            <Knob label="" color={COLORS.amber} value={v} size={58} onChange={setV} caption="eq" />
            <Knob label="" color={COLORS.red} value={10 - v} size={58} onChange={(n) => setV(10 - n)} caption="dyn" />
            <Knob label="" color={COLORS.bluegrey} value={5} min={0} max={10} size={58} onChange={() => undefined} caption="pan" bipolar />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[0.84rem] leading-relaxed text-[#b3a892]">
        Organizational colour says <em className="text-amberlite not-italic">which track</em>; functional colour says{" "}
        <em className="text-amberlite not-italic">what the control does</em>. The cap of a pot never takes the track's colour.
      </p>
      <div className="mt-3 flex gap-4">
        <button type="button" onClick={() => onOpen("organizational-color")} className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-brass uppercase hover:text-amberlite">
          organizational color <ArrowRight size={11} />
        </button>
        <button type="button" onClick={() => onOpen("functional-color-coding")} className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-brass uppercase hover:text-amberlite">
          functional color coding <ArrowRight size={11} />
        </button>
      </div>
    </Panel>
  );
}
