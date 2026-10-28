import { useState } from "react";
import { Check, Lock, Plus, Trash2, BookOpen, FileWarning } from "lucide-react";
import specRaw from "../../../ALLOY-HARDWARE-REFERENCE-SPEC.md?raw";
import { cn } from "../../utils/cn";
import { COLORS, COLOR_ORDER } from "../../lib/colors";
import { READ_FIRST_DOCS, STOP_CONDITION, type Criterion, type Task } from "../../lib/tasks";
import { Lamp, Legend } from "../ui";

const HW_SECTIONS = specRaw
  .split("\n")
  .filter((l) => l.startsWith("## "))
  .map((l) => l.replace("## ", "").trim());

/* ------------------------------------------------------------------ pieces */

export function Block({
  n,
  title,
  hint,
  children,
  locked,
}: {
  n: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  return (
    <section className="face grain relative rounded-[3px] border border-black/60 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/8 pb-3">
        <span className="font-mono text-[9px] tracking-[0.24em] text-brass">{n}</span>
        <h3 className="font-display text-[1.35rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
          {title}
        </h3>
        {locked && (
          <span className="ml-auto flex items-center gap-1.5 rounded-[2px] border border-sred/45 bg-sred/12 px-2 py-0.5 font-mono text-[8.5px] tracking-[0.18em] text-[#e6a396] uppercase">
            <Lock size={10} /> locked
          </span>
        )}
        {hint && (
          <p className="w-full font-mono text-[9px] leading-relaxed tracking-[0.08em] text-[#7b7365] uppercase">
            {hint}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

const inputCls =
  "w-full rounded-[2px] border border-white/10 bg-black/35 px-3 py-2 font-mono text-[12px] text-[#e5dbc6] shadow-[inset_0_2px_5px_rgba(0,0,0,.6)] outline-none transition-colors placeholder:text-[#5f584c] focus:border-amber/70 focus:bg-black/50";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[8.5px] tracking-[0.22em] text-[#8d8574] uppercase">
        {label}
      </span>
      {rows ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputCls, "resize-y leading-[1.7]", !mono && "font-body")}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="group flex items-center gap-2">
          <span className="h-[2px] w-3 shrink-0 bg-brass/60" />
          <input
            value={it}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onChange([...items.slice(0, i + 1), "", ...items.slice(i + 1)]);
              }
            }}
            className={inputCls}
          />
          <button
            type="button"
            aria-label={`Remove line ${i + 1}`}
            onClick={() => onChange(items.length > 1 ? items.filter((_, j) => j !== i) : [""])}
            className="shrink-0 rounded-[2px] border border-white/10 bg-black/30 p-1.5 text-[#7b7365] transition-colors hover:border-sred/50 hover:text-sred"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="flex items-center gap-1.5 rounded-[2px] border border-dashed border-white/15 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] text-[#8d8574] uppercase transition-colors hover:border-brass/60 hover:text-amberlite"
      >
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- form */

export function TaskForm({
  task,
  patch,
}: {
  task: Task;
  patch: (p: Partial<Task>) => void;
}) {
  const [newCriterion, setNewCriterion] = useState("");

  const setCriterion = (id: string, p: Partial<Criterion>) =>
    patch({ criteria: task.criteria.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- TASK */}
      <Block n="01" title="Task" hint="number + short name — the handle every report is filed under">
        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_150px]">
          <TextField label="number" value={task.number} onChange={(v) => patch({ number: v })} placeholder="1.04" />
          <TextField label="short name" value={task.name} onChange={(v) => patch({ name: v })} placeholder="Channel strip skeleton" />
          <div>
            <span className="mb-1.5 block font-mono text-[8.5px] tracking-[0.22em] text-[#8d8574] uppercase">
              phase
            </span>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ phase: p })}
                  className={cn(
                    "flex-1 rounded-[2px] border py-2 font-mono text-[11px] transition-all",
                    task.phase === p
                      ? "border-brass/60 bg-brass/20 text-[#f6e6c4] shadow-[inset_0_1px_0_rgba(255,255,255,.16)]"
                      : "border-white/10 bg-black/30 text-[#8d8574] hover:text-[#d8cdb6]",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Block>

      {/* ----------------------------------------------------- READ FIRST */}
      <Block
        n="02"
        title="Read first"
        hint="never re-litigate a locked decision. a deferred decision gets the simplest testable approach, recorded"
      >
        <ul className="space-y-1.5">
          {READ_FIRST_DOCS.map((d) => {
            const required =
              d.key === "plan" ||
              d.key === "glossary" ||
              d.key === "reports" ||
              (d.key === "hardware" && task.phase !== 3);
            const on = task.readFirst[d.key];
            return (
              <li
                key={d.key}
                className={cn(
                  "flex items-center gap-3 rounded-[2px] border px-3 py-2 transition-all",
                  on ? "border-cgreen/45 bg-cgreen/10" : "border-white/10 bg-black/28",
                )}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => patch({ readFirst: { ...task.readFirst, [d.key]: !on } })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-[2px] border transition-colors",
                      on
                        ? "border-cgreen bg-cgreen/30 text-[#d6f2dc]"
                        : "border-white/25 text-transparent",
                    )}
                  >
                    <Check size={11} strokeWidth={3.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11.5px] text-[#e0d6c0]">
                      {d.label}
                    </span>
                    <span className="block font-mono text-[8.5px] tracking-[0.14em] text-[#7b7365] uppercase">
                      {d.note}
                    </span>
                  </span>
                </button>
                {d.state === "present" ? (
                  <a
                    href={d.href}
                    className="flex shrink-0 items-center gap-1 font-mono text-[8.5px] tracking-[0.16em] text-brass uppercase hover:text-amberlite"
                  >
                    <BookOpen size={11} /> in repo
                  </a>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[8.5px] tracking-[0.16em] text-[#6b6458] uppercase">
                    <FileWarning size={11} /> not yet
                  </span>
                )}
                {required && (
                  <span className="hidden shrink-0 rounded-[2px] border border-amber/40 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.14em] text-amberlite uppercase sm:inline">
                    required
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Block>

      {/* ---------------------------------------------------------- SCOPE */}
      <Block n="03" title="Scope" hint="do exactly this, nothing more — one bounded deliverable per line">
        <ListEditor
          items={task.scope}
          onChange={(scope) => patch({ scope })}
          placeholder="one specific, bounded deliverable"
          addLabel="add deliverable"
        />
      </Block>

      {/* --------------------------------------------------- DO NOT TOUCH */}
      <Block
        n="04"
        title="Do not touch"
        hint="rooms, components or files that must not change this task — no natural next steps"
      >
        <ListEditor
          items={task.doNotTouch}
          onChange={(doNotTouch) => patch({ doNotTouch })}
          placeholder="e.g. Meter bridge, Knob.tsx, routing"
          addLabel="add protected area"
        />
      </Block>

      {/* ------------------------------------------------------ STRUCTURE */}
      <Block
        n="05"
        title="Structure requirements"
        hint="layout and behaviour must be unambiguous without images"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <TextField
            label="ASCII box diagram"
            rows={7}
            value={task.ascii}
            onChange={(ascii) => patch({ ascii })}
            placeholder="+------------------+"
          />
          <TextField
            label="grid / flex spec — fixed vs flexible, breakpoints, scroll containers"
            rows={7}
            value={task.gridSpec}
            onChange={(gridSpec) => patch({ gridSpec })}
            placeholder="Rail 220px fixed · strips 1fr with overflow-x auto · master 260px fixed · stacks below 900px"
          />
        </div>
      </Block>

      {/* --------------------------------------------------------- VISUAL */}
      <Block
        n="06"
        title="Visual requirements"
        hint={
          task.phase === 3
            ? "phase 3 — skin block is omitted from the generated prompt"
            : "reference the exact section of hardware-reference.md · shared components only, no one-off styles"
        }
      >
        <div className={cn("space-y-4", task.phase === 3 && "pointer-events-none opacity-40")}>
          <div>
            <Legend size="xs" className="mb-2 block text-[#8d8574]">
              hardware-reference.md sections
            </Legend>
            <div className="flex flex-wrap gap-1.5">
              {HW_SECTIONS.map((s) => {
                const on = task.visualRefs.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      patch({
                        visualRefs: on
                          ? task.visualRefs.filter((v) => v !== s)
                          : [...task.visualRefs, s],
                      })
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 text-left font-mono text-[9.5px] tracking-[0.08em] transition-all",
                      on
                        ? "border-brass/60 bg-brass/18 text-[#f2dfb4]"
                        : "border-white/10 bg-black/28 text-[#8d8574] hover:border-white/25 hover:text-[#d8cdb6]",
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Legend size="xs" className="mb-2 block text-[#8d8574]">
              function-colors in play (§5 colour table)
            </Legend>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_ORDER.map((k) => {
                const c = COLORS[k];
                const on = task.colors.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      patch({ colors: on ? task.colors.filter((v) => v !== k) : [...task.colors, k] })
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 font-mono text-[9.5px] tracking-[0.1em] transition-all",
                      on
                        ? "border-white/30 bg-white/8 text-[#efe6d1]"
                        : "border-white/10 bg-black/28 text-[#8d8574] hover:text-[#d8cdb6]",
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{
                        background: `radial-gradient(circle at 34% 28%, ${c.hi}, ${c.base} 48%, ${c.lo})`,
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.5)",
                      }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="border-l-2 border-amber/60 pl-3 font-mono text-[9.5px] tracking-[0.08em] text-[#c8b083] uppercase">
            use only existing shared components — do not create one-off styles
          </p>
        </div>
      </Block>

      {/* ----------------------------------------------------- ACCEPTANCE */}
      <Block
        n="07"
        title="Acceptance criteria"
        hint="all must be true before the task is considered done — the three locked rows always ship"
      >
        <ul className="space-y-1.5">
          {task.criteria.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-start gap-3 rounded-[2px] border px-3 py-2 transition-colors",
                c.done ? "border-cgreen/40 bg-cgreen/8" : "border-white/10 bg-black/28",
              )}
            >
              <button
                type="button"
                aria-pressed={c.done}
                aria-label={`Mark criterion ${c.done ? "not done" : "done"}`}
                onClick={() => setCriterion(c.id, { done: !c.done })}
                className={cn(
                  "mt-[2px] grid h-4 w-4 shrink-0 place-items-center rounded-[2px] border transition-colors",
                  c.done ? "border-cgreen bg-cgreen/30 text-[#d6f2dc]" : "border-white/25 text-transparent hover:border-amber/70",
                )}
              >
                <Check size={11} strokeWidth={3.4} />
              </button>
              {c.locked ? (
                <span className="flex-1 text-[0.85rem] leading-snug text-[#c3b9a3]">{c.text}</span>
              ) : (
                <input
                  value={c.text}
                  onChange={(e) => setCriterion(c.id, { text: e.target.value })}
                  className="flex-1 bg-transparent text-[0.85rem] leading-snug text-[#e0d6c0] outline-none focus:text-amberlite"
                />
              )}
              {c.locked ? (
                <Lock size={12} className="mt-1 shrink-0 text-[#6b6458]" />
              ) : (
                <button
                  type="button"
                  aria-label="Remove criterion"
                  onClick={() => patch({ criteria: task.criteria.filter((x) => x.id !== c.id) })}
                  className="mt-[1px] shrink-0 text-[#6b6458] transition-colors hover:text-sred"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCriterion.trim()) {
                patch({
                  criteria: [
                    ...task.criteria,
                    { id: Math.random().toString(36).slice(2, 9), text: newCriterion.trim(), locked: false, done: false },
                  ],
                });
                setNewCriterion("");
              }
            }}
            placeholder="specific resize / scroll / overlap / interaction check…"
            className={inputCls}
          />
          <button
            type="button"
            disabled={!newCriterion.trim()}
            onClick={() => {
              patch({
                criteria: [
                  ...task.criteria,
                  { id: Math.random().toString(36).slice(2, 9), text: newCriterion.trim(), locked: false, done: false },
                ],
              });
              setNewCriterion("");
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-[2px] border border-brass/45 bg-brass/12 px-3 font-mono text-[9px] tracking-[0.18em] text-[#e7d3ab] uppercase transition-colors hover:bg-brass/22 disabled:opacity-40"
          >
            <Plus size={12} /> add check
          </button>
        </div>
      </Block>

      {/* -------------------------------------------------- STOP CONDITION */}
      <Block n="08" title="Stop condition" locked>
        <div className="flex items-start gap-4 rounded-[2px] border border-sred/35 bg-[#1a100d]/70 p-4">
          <span className="mt-1">
            <Lamp on tone="#cf4436" size={11} />
          </span>
          <div>
            <p className="font-mono text-[12px] leading-[1.75] whitespace-pre-wrap text-[#e8cfc6]">
              {STOP_CONDITION}
            </p>
            <p className="mt-3 font-mono text-[9px] tracking-[0.16em] text-[#a1786e] uppercase">
              this block ships with every generated prompt · it cannot be edited or removed
            </p>
          </div>
        </div>
      </Block>
    </div>
  );
}
