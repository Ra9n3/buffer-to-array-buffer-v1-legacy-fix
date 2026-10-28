import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BadgeCheck,
  BookA,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Lock,
  PauseOctagon,
  Plus,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { lint } from "../../lib/glossary";
import { VUMeter } from "../hardware/VUMeter";
import { Lamp, Legend, Panel, Reveal } from "../ui";
import { TaskForm, TextField } from "./TaskForm";
import {
  TEMPLATE_RAW,
  blockers,
  buildPrompt,
  buildReport,
  copyText,
  downloadText,
  loadTasks,
  newTask,
  readiness,
  reportReady,
  saveTasks,
  type Status,
  type Task,
} from "../../lib/tasks";

const STATUS: Record<Status, { label: string; tone: string; Icon: typeof CircleDashed }> = {
  draft: { label: "draft", tone: "#8d8574", Icon: CircleDashed },
  ready: { label: "ready to build", tone: "#e8a454", Icon: ClipboardCheck },
  awaiting: { label: "awaiting approval", tone: "#cf4436", Icon: PauseOctagon },
  approved: { label: "approved", tone: "#5aa06a", Icon: BadgeCheck },
};

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [activeId, setActiveId] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [docMode, setDocMode] = useState<"rendered" | "raw">("rendered");
  const [openReport, setOpenReport] = useState<string | null>(null);

  const task = tasks.find((t) => t.id === activeId) ?? tasks[0];
  const awaiting = tasks.find((t) => t.status === "awaiting");

  useEffect(() => saveTasks(tasks), [tasks]);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1900);
    return () => clearTimeout(id);
  }, [flash]);

  const patch = (p: Partial<Task>) =>
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...p, updatedAt: Date.now() } : t)));

  const issues = useMemo(() => (task ? blockers(task) : []), [task]);
  const prompt = useMemo(() => (task ? buildPrompt(task) : ""), [task]);
  const report = useMemo(() => (task ? buildReport(task) : ""), [task]);
  const pct = task ? readiness(task) : 0;
  /* glossary.md: "use canonical terms consistently" — lint only the authored parts */
  const termHits = useMemo(() => {
    if (!task) return [];
    const authored = [
      task.name,
      ...task.scope,
      ...task.doNotTouch,
      task.gridSpec,
      ...task.criteria.filter((c) => !c.locked).map((c) => c.text),
      ...Object.values(task.report),
    ].join("\n");
    const seen = new Set<string>();
    return lint(authored).filter((h) => {
      const k = h.found.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [task]);

  if (!task) return null;

  const addTask = () => {
    if (awaiting) return;
    const nums = tasks.map((t) => parseFloat(t.number)).filter((n) => !Number.isNaN(n));
    const next = (Math.max(1, ...nums) + 0.01).toFixed(2);
    const t = newTask(next, "");
    setTasks((ts) => [t, ...ts]);
    setActiveId(t.id);
    setFlash(`Task ${next} opened`);
  };

  const duplicate = () => {
    const copy: Task = {
      ...structuredClone(task),
      id: Math.random().toString(36).slice(2, 9),
      number: (parseFloat(task.number) + 0.01).toFixed(2),
      status: "draft",
      updatedAt: Date.now(),
    };
    setTasks((ts) => [copy, ...ts]);
    setActiveId(copy.id);
    setFlash(`Duplicated as ${copy.number}`);
  };

  const remove = () => {
    if (tasks.length === 1) return;
    const rest = tasks.filter((t) => t.id !== task.id);
    setTasks(rest);
    setActiveId(rest[0].id);
    setFlash(`Task ${task.number} deleted`);
  };

  const setStatus = (status: Status) => {
    patch({ status });
    setFlash(`Task ${task.number} → ${STATUS[status].label}`);
  };

  const submitted = tasks.filter((t) => t.report.built.trim() || t.status === "approved");
  const st = STATUS[task.status];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8">
      {/* -------------------------------------------------------- header */}
      <Reveal>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <Legend className="text-amberlite">alloy · task prompt template</Legend>
            <h1 className="font-display mt-2 text-[clamp(2.4rem,7vw,5rem)] leading-[0.85] font-extrabold uppercase text-[#f6eedd]">
              Build order
              <span className="text-brass">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[#a89e8a]">
              One bounded task at a time. Fill the brackets, hand over the prompt, write the
              report — then stop and wait for approval. The STOP CONDITION block is not optional
              and cannot be switched off.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#template-file"
              className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-4 py-2.5 font-mono text-[9.5px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:border-brass/50 hover:text-[#efe6d1]"
            >
              <FileText size={13} /> the template file
            </a>
            <button
              type="button"
              onClick={addTask}
              disabled={!!awaiting}
              title={awaiting ? "STOP CONDITION — approve the running app first" : "Open a new build task"}
              className={cn(
                "flex items-center gap-2 rounded-[2px] border px-4 py-2.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-all",
                awaiting
                  ? "cursor-not-allowed border-white/10 bg-black/25 text-[#5f584c]"
                  : "border-brass/50 bg-brass/16 text-[#f2dfb4] hover:bg-brass/26 hover:shadow-[0_0_18px_-4px_rgba(201,161,90,.7)] active:translate-y-px",
              )}
            >
              {awaiting ? <Lock size={13} /> : <Plus size={13} />} new task
            </button>
          </div>
        </div>
      </Reveal>

      {/* ------------------------------------------------- approval gate */}
      {awaiting && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-[3px] border border-sred/45 bg-[#1c110e]/85 p-4 shadow-[0_16px_40px_-24px_rgba(207,68,54,.8)]">
          <Lamp on tone="#cf4436" size={12} className="animate-blink" />
          <div className="min-w-[16rem] flex-1">
            <p className="font-display text-[1.25rem] font-bold tracking-[0.05em] text-[#f0d4cc] uppercase">
              Stop condition in effect
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-[#c39c92]">
              Task {awaiting.number} {awaiting.name} ended and filed its report. No further work
              begins until you explicitly approve the running app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTasks((ts) =>
                  ts.map((t) => (t.id === awaiting.id ? { ...t, status: "approved", updatedAt: Date.now() } : t)),
                );
                setFlash(`Task ${awaiting.number} approved — next task unlocked`);
              }}
              className="flex items-center gap-2 rounded-[2px] border border-cgreen/55 bg-cgreen/16 px-3.5 py-2 font-mono text-[9.5px] tracking-[0.18em] text-[#c7e9cf] uppercase transition-colors hover:bg-cgreen/26"
            >
              <BadgeCheck size={13} /> approve running app
            </button>
            <button
              type="button"
              onClick={() => {
                setTasks((ts) =>
                  ts.map((t) => (t.id === awaiting.id ? { ...t, status: "draft", updatedAt: Date.now() } : t)),
                );
                setActiveId(awaiting.id);
                setFlash(`Task ${awaiting.number} sent back for changes`);
              }}
              className="flex items-center gap-2 rounded-[2px] border border-white/15 bg-black/30 px-3.5 py-2 font-mono text-[9.5px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1]"
            >
              <Undo2 size={13} /> send back
            </button>
          </div>
        </div>
      )}

      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-[2px] border border-brass/40 bg-brass/12 px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-[#f0dcb0] uppercase">
          <Lamp on tone="#e8a454" size={8} /> {flash}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
        {/* ------------------------------------------------------ rail */}
        <aside>
          <div className="lg:sticky lg:top-24">
            <Legend size="xs" className="mb-2 block text-brass">
              task queue
            </Legend>
            <ul className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
              {tasks.map((t) => {
                const s = STATUS[t.status];
                const on = t.id === task.id;
                return (
                  <li key={t.id} className="min-w-[190px] lg:min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={cn(
                        "w-full rounded-[2px] border px-3 py-2.5 text-left transition-all duration-150",
                        on
                          ? "border-brass/50 bg-brass/12 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
                          : "border-white/8 bg-black/28 hover:-translate-y-px hover:border-white/20",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <s.Icon size={12} style={{ color: s.tone }} />
                        <span className="font-mono text-[11px] text-[#e5dbc6]">{t.number}</span>
                        <span className="ml-auto font-mono text-[8px] tracking-[0.14em] text-[#6b6458] uppercase">
                          p{t.phase}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[0.82rem] text-[#b3a892]">
                        {t.name || "untitled task"}
                      </span>
                      <span
                        className="mt-1 block font-mono text-[8px] tracking-[0.16em] uppercase"
                        style={{ color: s.tone }}
                      >
                        {s.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 hidden border-t border-white/8 pt-3 lg:block">
              <Legend size="xs" className="mb-2 block text-[#7b7365]">
                recently touched
              </Legend>
              <ul className="space-y-1">
                {[...tasks]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .slice(0, 3)
                  .map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-2 font-mono text-[9px] text-[#7b7365]">
                      <span className="truncate text-[#a89e8a]">{t.number}</span>
                      <span>{ago(t.updatedAt)}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="mt-4 hidden gap-1.5 lg:flex">
              <button
                type="button"
                onClick={duplicate}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[2px] border border-white/10 bg-black/28 px-2 py-1.5 font-mono text-[8.5px] tracking-[0.14em] text-[#8d8574] uppercase transition-colors hover:text-[#e5dbc6]"
              >
                <Copy size={11} /> duplicate
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={tasks.length === 1}
                className="flex items-center justify-center gap-1.5 rounded-[2px] border border-white/10 bg-black/28 px-2 py-1.5 font-mono text-[8.5px] tracking-[0.14em] text-[#8d8574] uppercase transition-colors hover:border-sred/50 hover:text-sred disabled:opacity-40"
              >
                <Trash2 size={11} /> delete
              </button>
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------ main */}
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <TaskForm task={task} patch={patch} />

            {/* ------------------------------------------- live output */}
            <div className="xl:sticky xl:top-24 xl:self-start">
              <Panel className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-white/8 pb-3">
                  <st.Icon size={15} style={{ color: st.tone }} />
                  <div>
                    <div className="font-display text-[1.2rem] leading-none font-bold tracking-[0.06em] text-[#efe6d1] uppercase">
                      {task.number} {task.name || "untitled"}
                    </div>
                    <div className="mt-1 font-mono text-[8.5px] tracking-[0.18em] uppercase" style={{ color: st.tone }}>
                      {st.label} · phase {task.phase} · saved {ago(task.updatedAt)}
                    </div>
                  </div>
                  <div className="ml-auto w-[112px]">
                    <VUMeter label="readiness" width="100%" source={() => pct} />
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await copyText(prompt);
                      setFlash("Prompt copied — hand it to the build agent");
                    }}
                    className="flex items-center gap-2 rounded-[2px] border border-brass/50 bg-brass/16 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#f2dfb4] uppercase transition-colors hover:bg-brass/26"
                  >
                    <Copy size={12} /> copy prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(`${task.number}-task-prompt.md`, prompt)}
                    className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1]"
                  >
                    <Download size={12} /> .md
                  </button>
                  <button
                    type="button"
                    disabled={issues.length > 0 || task.status !== "draft"}
                    onClick={() => setStatus("ready")}
                    className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ClipboardCheck size={12} /> mark ready
                  </button>
                </div>

                {issues.length > 0 ? (
                  <ul className="mb-3 space-y-1 rounded-[2px] border border-amber/35 bg-amber/8 p-3">
                    <li className="mb-1 font-mono text-[8.5px] tracking-[0.2em] text-amberlite uppercase">
                      before this prompt can be handed over
                    </li>
                    {issues.map((i) => (
                      <li key={i} className="flex gap-2 font-mono text-[9.5px] leading-relaxed text-[#c8b083]">
                        <span className="mt-[6px] h-[2px] w-2 shrink-0 bg-amber/70" />
                        {i}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-3 flex items-center gap-2 rounded-[2px] border border-cgreen/40 bg-cgreen/10 px-3 py-2 font-mono text-[9.5px] tracking-[0.14em] text-[#bfe6c6] uppercase">
                    <BadgeCheck size={12} /> prompt complete — scope bounded, criteria specific
                  </p>
                )}

                {termHits.length > 0 && (
                  <div className="mb-3 rounded-[2px] border border-white/10 bg-black/30 p-3">
                    <p className="mb-1.5 flex items-center gap-2 font-mono text-[8.5px] tracking-[0.2em] text-[#c8b083] uppercase">
                      <BookA size={11} /> glossary.md — near-synonyms in your wording
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {termHits.map((h) => (
                        <a
                          key={h.found}
                          href="#/glossary"
                          className="flex items-center gap-1.5 rounded-[2px] border border-sred/30 bg-sred/8 px-2 py-1 font-mono text-[9.5px] text-[#d9a99e] transition-colors hover:border-amber/60"
                        >
                          <span className="line-through decoration-sred/80">{h.found}</span>
                          <span className="text-[#8d8574]">→</span>
                          <span className="text-amberlite">{h.canonical.term}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <pre className="max-h-[52vh] overflow-auto rounded-[2px] border border-white/8 bg-black/45 p-4 font-mono text-[10.5px] leading-[1.7] whitespace-pre-wrap text-[#c9bfa9]">
                  {prompt}
                </pre>
                <p className="mt-2 font-mono text-[8.5px] tracking-[0.16em] text-[#6b6458] uppercase">
                  {prompt.split("\n").length} lines · stop condition included · output path
                  /task-reports/{task.number}-report.md
                </p>
              </Panel>
            </div>
          </div>

          {/* ------------------------------------------------- report */}
          <Panel className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b border-white/8 pb-3">
              <span className="font-mono text-[9px] tracking-[0.24em] text-brass">09</span>
              <h3 className="font-display text-[1.35rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
                Output — task report
              </h3>
              <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365]">
                /task-reports/{task.number}-report.md
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <TextField
                  label="what was built"
                  rows={3}
                  value={task.report.built}
                  onChange={(built) => patch({ report: { ...task.report, built } })}
                  placeholder="Components, files and behaviour delivered in this task"
                />
                <TextField
                  label="deviations, and why"
                  rows={2}
                  value={task.report.deviations}
                  onChange={(deviations) => patch({ report: { ...task.report, deviations } })}
                  placeholder="None — or the decision, the reason, and how it stays reversible"
                />
                <TextField
                  label="what was tested"
                  rows={2}
                  value={task.report.tested}
                  onChange={(tested) => patch({ report: { ...task.report, tested } })}
                  placeholder="Resize / scroll / overlap / interaction checks actually run"
                />
                <TextField
                  label="what remains"
                  rows={2}
                  value={task.report.remains}
                  onChange={(remains) => patch({ report: { ...task.report, remains } })}
                  placeholder="Open items, polish flagged for iteration, deferred decisions"
                />
              </div>
              <div>
                <pre className="max-h-[320px] overflow-auto rounded-[2px] border border-white/8 bg-black/45 p-4 font-mono text-[10.5px] leading-[1.7] whitespace-pre-wrap text-[#c9bfa9]">
                  {report}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await copyText(report);
                      setFlash("Report copied");
                    }}
                    className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1]"
                  >
                    <Copy size={12} /> copy report
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(`${task.number}-report.md`, report)}
                    className="flex items-center gap-2 rounded-[2px] border border-white/14 bg-black/30 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#efe6d1]"
                  >
                    <Download size={12} /> .md
                  </button>
                  <button
                    type="button"
                    disabled={!reportReady(task) || task.status === "awaiting" || task.status === "approved"}
                    onClick={() => setStatus("awaiting")}
                    title={
                      reportReady(task)
                        ? "End the task, file the report, and wait for approval"
                        : "Tick every acceptance criterion and write built / tested / remains first"
                    }
                    className="flex items-center gap-2 rounded-[2px] border border-sred/50 bg-sred/14 px-3 py-2 font-mono text-[9px] tracking-[0.18em] text-[#eec2b8] uppercase transition-colors hover:bg-sred/24 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={12} /> end task · wait for approval
                  </button>
                </div>
                {!reportReady(task) && (
                  <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-[#7b7365] uppercase">
                    every acceptance criterion must be ticked, and built / tested / remains filled,
                    before the task can end
                  </p>
                )}
              </div>
            </div>
          </Panel>

          {/* ------------------------------------------------ archive */}
          <Panel className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b border-white/8 pb-3">
              <span className="font-mono text-[9px] tracking-[0.24em] text-brass">/task-reports/</span>
              <h3 className="font-display text-[1.35rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
                Prior reports
              </h3>
              <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
                read these before starting — {submitted.length} filed
              </span>
            </div>
            {submitted.length === 0 ? (
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#7b7365] uppercase">
                nothing filed yet
              </p>
            ) : (
              <ul className="space-y-2">
                {submitted.map((t) => {
                  const open = openReport === t.id;
                  const s = STATUS[t.status];
                  return (
                    <li key={t.id} className="rounded-[2px] border border-white/10 bg-black/28">
                      <button
                        type="button"
                        onClick={() => setOpenReport(open ? null : t.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/4"
                      >
                        <FileText size={13} className="shrink-0 text-brass" />
                        <span className="font-mono text-[11px] text-[#e0d6c0]">
                          {t.number}-report.md
                        </span>
                        <span className="truncate text-[0.82rem] text-[#8d8574]">{t.name}</span>
                        <span
                          className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[8.5px] tracking-[0.16em] uppercase"
                          style={{ color: s.tone }}
                        >
                          <s.Icon size={11} /> {s.label}
                        </span>
                        <ChevronDown
                          size={14}
                          className={cn("shrink-0 text-[#6b6458] transition-transform", open && "rotate-180")}
                        />
                      </button>
                      {open && (
                        <div className="border-t border-white/8 p-3">
                          <pre className="max-h-[300px] overflow-auto rounded-[2px] bg-black/40 p-3 font-mono text-[10.5px] leading-[1.7] whitespace-pre-wrap text-[#c1b7a1]">
                            {buildReport(t)}
                          </pre>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveId(t.id)}
                              className="rounded-[2px] border border-white/14 px-3 py-1.5 font-mono text-[8.5px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
                            >
                              open task
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await copyText(buildReport(t));
                                setFlash(`${t.number}-report.md copied`);
                              }}
                              className="rounded-[2px] border border-white/14 px-3 py-1.5 font-mono text-[8.5px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
                            >
                              copy
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* -------------------------------------------- template file */}
          <div id="template-file" className="scroll-mt-28">
            <Panel className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-white/8 pb-3">
                <h3 className="font-display text-[1.35rem] leading-none font-bold tracking-[0.05em] text-[#efe6d1] uppercase">
                  ALLOY-TASK-PROMPT-TEMPLATE.md
                </h3>
                <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
                  source of truth · {TEMPLATE_RAW.split("\n").length} lines
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
                      await copyText(TEMPLATE_RAW);
                      setFlash("Template copied");
                    }}
                    className="rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
                  >
                    copy
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText("ALLOY-TASK-PROMPT-TEMPLATE.md", TEMPLATE_RAW)}
                    className="rounded-[2px] border border-white/14 bg-black/30 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] text-[#a89e8a] uppercase hover:text-[#efe6d1]"
                  >
                    download
                  </button>
                </div>
              </div>
              {docMode === "rendered" ? (
                <article className="spec-prose">
                  <Markdown remarkPlugins={[remarkGfm]}>{TEMPLATE_RAW}</Markdown>
                </article>
              ) : (
                <pre className="max-h-[60vh] overflow-auto rounded-[2px] border border-white/8 bg-black/45 p-4 font-mono text-[10.5px] leading-[1.7] whitespace-pre-wrap text-[#c9bfa9]">
                  {TEMPLATE_RAW}
                </pre>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
