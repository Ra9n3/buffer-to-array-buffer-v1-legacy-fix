import { useEffect, useState } from "react";
import { ArrowRight, BookA, ClipboardList, GitCommitHorizontal, ScrollText } from "lucide-react";
import { cn } from "./utils/cn";
import { COLORS } from "./lib/colors";
import { bus } from "./lib/signal";
import { Knob } from "./components/hardware/Knob";
import { Fader } from "./components/hardware/Fader";
import { VUMeter } from "./components/hardware/VUMeter";
import { LedLadder } from "./components/hardware/LedLadder";
import { TactileSwitch } from "./components/hardware/TactileSwitch";
import { Playground } from "./components/Playground";
import { SpecDoc } from "./components/SpecDoc";
import { ColorSection } from "./components/ColorSection";
import { TasksView } from "./components/tasks/TasksView";
import { GlossaryView } from "./components/glossary/GlossaryView";
import { PlanView } from "./components/plan/PlanView";
import { Lamp, Legend, Panel, Reveal } from "./components/ui";

const SECTIONS = [
  { id: "spec", n: "00", name: "The file" },
  { id: "playground", n: "01–04", name: "Component playground" },
  { id: "colour", n: "05–07", name: "Colour & construction" },
];

export default function App() {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  const isTasks = hash.startsWith("#/tasks");
  const isGlossary = hash.startsWith("#/glossary");
  const isPlan = hash.startsWith("#/plan");
  const isSub = isTasks || isGlossary || isPlan;
  const [progress, setProgress] = useState(0);
  const [master, setMaster] = useState(7.2);
  const [trim, setTrim] = useState(6.6);
  const [hf, setHf] = useState(5.4);
  const [comp, setComp] = useState(4.2);
  const [ph, setPh] = useState(true);
  const [hp, setHp] = useState(true);

  /* the hero module feeds the same bus every meter on this page reads */
  useEffect(() => {
    let g = (trim / 10) * (master / 10) * 1.4;
    g *= 0.7 + (hf / 10) * 0.6; // HF EQ adds brightness and a little level
    g *= 1 - (comp / 10) * 0.32; // dynamics squashes the peaks
    if (ph) g *= 1.08; // phantom: more capsule output
    if (hp) g *= 0.88; // HPF: low-end energy gone
    bus.setGain(2, Math.min(1.1, g));
    bus.setGain(3, Math.min(1.1, g * 0.86));
  }, [trim, master, hf, comp, ph, hp]);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      setProgress(p);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isSub]);

  /* tiny hash router: #/tasks and #/glossary are tools, everything else is the reference */
  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash);
      const next = window.location.hash;
      if (next.startsWith("#/")) {
        window.scrollTo({ top: 0, behavior: "auto" });
      } else if (next && next !== "#top") {
        requestAnimationFrame(() =>
          document.getElementById(next.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink text-[#ded5c4]">
      {/* ---------------------------------------------------- ambient layers */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(80% 55% at 12% -8%, rgba(232,164,84,.13), rgba(232,164,84,0) 62%), radial-gradient(70% 60% at 92% 8%, rgba(109,134,154,.12), rgba(0,0,0,0) 60%), radial-gradient(120% 80% at 50% 120%, rgba(60,36,24,.4), rgba(0,0,0,0) 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,.022) 0 1px, rgba(0,0,0,0) 1px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,.014) 0 1px, rgba(0,0,0,0) 1px 6px)",
        }}
      />

      {/* --------------------------------------------------------- meter bridge nav */}
      <header className="sticky top-0 z-40">
        <div className="face grain relative border-b border-black/70">
          <div className="mx-auto flex w-full max-w-[1240px] items-center gap-4 px-5 py-2.5 sm:px-8">
            <a href="#top" className="group flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-[2px] bg-brass font-display text-[15px] leading-none font-bold text-[#1a1409] shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_2px_5px_rgba(0,0,0,.6)] transition-transform group-hover:-translate-y-px">
                A
              </span>
              <span className="font-display text-[19px] leading-none font-bold tracking-[0.22em] text-[#efe6d1] uppercase">
                Alloy
              </span>
              <span className="hidden font-mono text-[8.5px] tracking-[0.24em] text-[#7b7365] uppercase sm:inline">
                hardware ref · v1
              </span>
            </a>

            <nav className="ml-auto hidden items-center gap-1 md:flex">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "rounded-[2px] px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-colors hover:bg-white/6 hover:text-amberlite",
                    isSub ? "text-[#6b6458]" : "text-[#8d8574]",
                  )}
                >
                  <span className="mr-1.5 text-[8.5px] text-brass/70">{s.n}</span>
                  {s.name}
                </a>
              ))}
              <a
                href="#/plan"
                className={cn(
                  "ml-1 flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-all",
                  isPlan
                    ? "border-brass/60 bg-brass/20 text-[#f6e6c4]"
                    : "border-white/12 bg-black/25 text-[#8d8574] hover:border-brass/45 hover:text-amberlite",
                )}
              >
                <ScrollText size={12} /> build plan
              </a>
              <a
                href="#/glossary"
                className={cn(
                  "flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-all",
                  isGlossary
                    ? "border-brass/60 bg-brass/20 text-[#f6e6c4]"
                    : "border-white/12 bg-black/25 text-[#8d8574] hover:border-brass/45 hover:text-amberlite",
                )}
              >
                <BookA size={12} /> glossary
              </a>
              <a
                href="#/tasks"
                className={cn(
                  "flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-all",
                  isTasks
                    ? "border-brass/60 bg-brass/20 text-[#f6e6c4]"
                    : "border-white/12 bg-black/25 text-[#8d8574] hover:border-brass/45 hover:text-amberlite",
                )}
              >
                <ClipboardList size={12} /> task template
              </a>
            </nav>

            <div className="ml-auto flex items-center gap-3 md:ml-4">
              <div className="flex items-center gap-1 md:hidden">
                <a
                  href="#spec"
                  className={cn(
                    "rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors",
                    isSub
                      ? "border-white/12 bg-black/25 text-[#8d8574]"
                      : "border-brass/50 bg-brass/16 text-[#f2dfb4]",
                  )}
                >
                  spec
                </a>
                <a
                  href="#/plan"
                  aria-label="Product design and build plan"
                  className={cn(
                    "flex items-center rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors",
                    isPlan
                      ? "border-brass/50 bg-brass/16 text-[#f2dfb4]"
                      : "border-white/12 bg-black/25 text-[#8d8574]",
                  )}
                >
                  <ScrollText size={11} />
                </a>
                <a
                  href="#/glossary"
                  aria-label="Glossary"
                  className={cn(
                    "flex items-center rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors",
                    isGlossary
                      ? "border-brass/50 bg-brass/16 text-[#f2dfb4]"
                      : "border-white/12 bg-black/25 text-[#8d8574]",
                  )}
                >
                  <BookA size={11} />
                </a>
                <a
                  href="#/tasks"
                  className={cn(
                    "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors",
                    isTasks
                      ? "border-brass/50 bg-brass/16 text-[#f2dfb4]"
                      : "border-white/12 bg-black/25 text-[#8d8574]",
                  )}
                >
                  <ClipboardList size={11} /> tasks
                </a>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <a href="#top" aria-label="Input section meter, driven by the hero controls">
                  <VUMeter label="" width={104} channel={2} />
                </a>
                <a href="#playground" aria-label="Playground channel meter">
                  <VUMeter label="" width={104} channel={0} />
                </a>
              </div>
              <span className="flex items-center gap-1.5">
                <Lamp on tone="#cf4436" size={8} />
                <span className="font-mono text-[8.5px] tracking-[0.2em] text-[#8d8574] uppercase">
                  sig
                </span>
              </span>
            </div>
          </div>
          {/* scroll progress as a fader-track style indicator */}
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/50">
            <div
              className="h-full"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: "linear-gradient(90deg,#8a430e,#e8a454 60%,#f0c27a)",
                boxShadow: "0 0 8px rgba(232,164,84,.6)",
              }}
            />
          </div>
        </div>
      </header>

      <main id="top" className="relative">
        {isTasks ? (
          <TasksView />
        ) : isGlossary ? (
          <GlossaryView />
        ) : isPlan ? (
          <PlanView />
        ) : (
          <>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto w-full max-w-[1240px] px-5 pt-12 pb-6 sm:px-8">
          <Reveal>
            <Panel className="px-5 py-6 sm:px-9 sm:py-9">
              {/* §5 recurring console accent stripe */}
              <div className="stripe-org absolute inset-x-0 top-0 h-[5px] bg-org/85" />
              <div className="grid gap-9 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center">
                <div>
                  <Legend className="text-amberlite">
                    analog console design system · phase 1 · read before building
                  </Legend>
                  <h1 className="font-display mt-4 text-[clamp(3.1rem,11vw,7.6rem)] leading-[0.82] font-extrabold tracking-[-0.01em] text-[#f6eedd] uppercase">
                    Hardware
                    <br />
                    <span className="text-[#7f7768]">reference</span>
                    <span className="text-brass">.</span>
                  </h1>
                  <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-[#b3a892]">
                    Seven sections of unambiguous, buildable specification for knobs, tactile
                    square switches, finger-hollow fader caps and lamp-lit VU meters — translated
                    from real console hardware because screenshots could not be attached to build
                    prompts. Every detail below is implemented live, on this page.
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-2.5">
                    <a
                      href="#spec"
                      className="group relative overflow-hidden rounded-[2px] border border-brass/50 bg-brass/16 px-5 py-2.5 font-mono text-[10px] tracking-[0.2em] text-[#f2dfb4] uppercase transition-all hover:bg-brass/26 hover:shadow-[0_0_18px_-4px_rgba(201,161,90,.7)] active:translate-y-px"
                    >
                      open the spec
                      <span className="absolute inset-y-0 -left-8 w-8 -skew-x-12 bg-white/18 transition-transform duration-500 group-hover:translate-x-[220%]" />
                    </a>
                    <a
                      href="#playground"
                      className="rounded-[2px] border border-white/14 bg-black/30 px-5 py-2.5 font-mono text-[10px] tracking-[0.2em] text-[#a89e8a] uppercase transition-colors hover:border-white/30 hover:text-[#efe6d1]"
                    >
                      component playground
                    </a>
                    <span className="ml-1 flex items-center gap-2 font-mono text-[9px] tracking-[0.18em] text-[#6b6458] uppercase">
                      <GitCommitHorizontal size={13} className="text-cgreen" />
                      repo · spec committed
                    </span>
                  </div>

                  <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/8 pt-6 sm:grid-cols-4">
                    {[
                      ["§1", "knurled base + colour cap"],
                      ["§2", "keycap, not a toggle"],
                      ["§3", "concave fader cap"],
                      ["§4", "lamp glow, not LED"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-mono text-[9px] tracking-[0.22em] text-brass">{k}</dt>
                        <dd className="mt-1 text-[0.82rem] leading-snug text-[#a89e8a]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* live module — the thing the spec is about */}
                <div className="relative">
                  <div className="rounded-[3px] border border-white/8 bg-black/25 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <Legend size="xs" className="text-[#7b7365]">
                        ch 01 · input section
                      </Legend>
                      <Legend size="xs" className="text-[#7b7365]">
                        alloy model 24
                      </Legend>
                    </div>

                    <div className="flex flex-wrap items-start justify-center gap-2.5">
                      <Knob label="trim" color={COLORS.cream} value={trim} size={96} onChange={setTrim} defaultValue={6.7} format={(v) => `${(v * 6 - 24).toFixed(1)}dB`} />
                      <Knob label="eq hf" color={COLORS.amber} value={hf} size={96} onChange={setHf} defaultValue={5} />
                      <Knob label="dyn" color={COLORS.red} value={comp} size={96} onChange={setComp} defaultValue={3} format={(v) => `${(1 + v / 4).toFixed(1)}:1`} />
                    </div>

                    <div className="mt-5 flex items-end justify-center gap-4">
                      <Fader
                        label="level"
                        value={master}
                        min={-8}
                        max={10}
                        height={150}
                        onChange={setMaster}
                        marks={[
                          { v: 10, label: "+10" },
                          { v: 0, label: "0" },
                          { v: -8, label: "−∞" },
                        ]}
                        format={(v) => `${v <= 0 ? "" : "+"}${v.toFixed(1)}dB`}
                      />
                      <div className="flex flex-col gap-3 pt-3">
                        <TactileSwitch label="phantom" value="48v" size={38} engaged={ph} onToggle={setPh} lampTone="#cf4436" />
                        <TactileSwitch label="hpf" value="75hz" size={38} engaged={hp} onToggle={setHp} />
                      </div>
                      <div className="flex flex-col items-center gap-2 pt-3">
                        <LedLadder channel={2} segments={16} height={150} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <VUMeter channel={2} label="ch 01 · l" width="100%" />
                    <VUMeter channel={3} label="ch 01 · r" width="100%" />
                  </div>
                </div>
              </div>
            </Panel>
          </Reveal>

          {/* section index plates */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {SECTIONS.map((s, i) => (
              <Reveal key={s.id} delay={i * 70}>
                <a
                  href={`#${s.id}`}
                  className="group flex items-center justify-between gap-4 rounded-[3px] border border-white/8 bg-[#1b1712]/80 px-4 py-3.5 transition-all duration-200 hover:-translate-y-[2px] hover:border-brass/45 hover:bg-[#241e17]"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[9px] tracking-[0.2em] text-brass">{s.n}</span>
                    <span className="font-display text-[1.15rem] font-semibold tracking-[0.04em] text-[#e5dbc6] uppercase">
                      {s.name}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="shrink-0 text-[#6b6458] transition-all duration-200 group-hover:translate-x-1 group-hover:text-amberlite"
                  />
                </a>
              </Reveal>
            ))}
          </div>

          {/* the companion documents — the product plan, vocabulary and workflow */}
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Reveal delay={60}>
              <a
                href="#/plan"
                className="group flex h-full flex-col gap-3 rounded-[3px] border border-org/40 bg-[#1d1509]/85 px-5 py-4 transition-all duration-200 hover:border-org/70 hover:bg-[#26190c]"
              >
                <span className="flex items-center gap-2.5">
                  <Lamp on tone="#df7a26" size={10} />
                  <span className="font-mono text-[9px] tracking-[0.22em] text-[#d0a06a] uppercase">
                    product-level source of truth
                  </span>
                  <ArrowRight size={14} className="ml-auto text-[#8d8574] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-org" />
                </span>
                <span className="font-display text-[1.35rem] leading-none font-bold tracking-[0.04em] text-[#f6e7d2] uppercase">
                  ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt
                </span>
                <span className="text-[0.85rem] leading-snug text-[#a89e8a]">
                  Nineteen sections: vision, rooms, visual system, routing model, analysis, MIX
                  logic, send/return, rulebooks, export, the Phase 0–9 roadmap with its stop gates,
                  and the locked-vs-deferred split.
                </span>
              </a>
            </Reveal>
            <Reveal delay={120}>
              <a
                href="#/glossary"
                className="group flex h-full flex-col gap-3 rounded-[3px] border border-brass/30 bg-[#1b1710]/85 px-5 py-4 transition-all duration-200 hover:border-brass/60 hover:bg-[#241e14]"
              >
                <span className="flex items-center gap-2.5">
                  <Lamp on tone="#e8a454" size={10} />
                  <span className="font-mono text-[9px] tracking-[0.22em] text-[#c8b083] uppercase">
                    glossary.md · required for every task
                  </span>
                  <ArrowRight size={14} className="ml-auto text-[#8d8574] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-amberlite" />
                </span>
                <span className="font-display text-[1.35rem] leading-none font-bold tracking-[0.04em] text-[#f4e9d2] uppercase">
                  ALLOY-PRODUCT-GLOSSARY.md
                </span>
                <span className="text-[0.85rem] leading-snug text-[#a89e8a]">
                  Sixteen canonical terms — Track, Bus, Return Bus, Role vs Prominence Tier,
                  Organizational vs Functional colour — with a prose checker that flags the
                  near-synonyms and rewrites them.
                </span>
              </a>
            </Reveal>
            <Reveal delay={180}>
              <a
                href="#/tasks"
                className="group flex h-full flex-col gap-3 rounded-[3px] border border-sred/30 bg-[#1b1210]/85 px-5 py-4 transition-all duration-200 hover:border-sred/60 hover:bg-[#241614]"
              >
                <span className="flex items-center gap-2.5">
                  <Lamp on tone="#cf4436" size={10} className="animate-blink" />
                  <span className="font-mono text-[9px] tracking-[0.22em] text-[#c39c92] uppercase">
                    task template · workflow
                  </span>
                  <ArrowRight size={14} className="ml-auto text-[#8d8574] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#e6a396]" />
                </span>
                <span className="font-display text-[1.35rem] leading-none font-bold tracking-[0.04em] text-[#f0dfd6] uppercase">
                  ALLOY-TASK-PROMPT-TEMPLATE.md
                </span>
                <span className="text-[0.85rem] leading-snug text-[#a89e8a]">
                  Scope, do-not-touch, acceptance criteria and a STOP CONDITION you cannot delete —
                  filled in live, handed over as a prompt, closed with a task report.
                </span>
              </a>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------------------- sections */}
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="hairline h-px w-full opacity-40" />
        </div>

        <SpecDoc />

        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="hairline h-px w-full opacity-40" />
        </div>

        <Playground />

        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="hairline h-px w-full opacity-40" />
        </div>

        <ColorSection />

        {/* ----------------------------------------------------------- rules */}
        <section className="mx-auto w-full max-w-[1240px] px-5 pb-20 sm:px-8">
          <Reveal>
            <Panel className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
              {[
                {
                  t: "Do",
                  c: "text-cgreen",
                  b: "border-cgreen/35",
                  items: [
                    "SVG or layered CSS gradients for every component",
                    "Two-part knob: knurl + colour cap + pointer",
                    "Recessed wells, inset shadows, printed labels",
                    "Asymmetric, soft, uneven lamp glow",
                  ],
                },
                {
                  t: "Do not",
                  c: "text-sred",
                  b: "border-sred/35",
                  items: [
                    "Flat solid-colour dials or uniform fader caps",
                    "Pill toggles, material checkboxes, sliding knobs",
                    "LED-backlit screens posing as VU meters",
                    "Organisational colour flooding a strip background",
                  ],
                },
                {
                  t: "When unsure",
                  c: "text-amberlite",
                  b: "border-amber/35",
                  items: [
                    "Choose the more physical-hardware reading",
                    "Add light: which edge catches it, which pools shadow",
                    "Flag the part for iteration instead of one-pass shipping",
                    "Keep functional and organisational colour separate",
                  ],
                },
              ].map((col) => (
                <div key={col.t} className={cn("rounded-[3px] border bg-black/25 p-5", col.b)}>
                  <h3 className={cn("font-display text-[1.5rem] font-bold uppercase", col.c)}>
                    {col.t}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {col.items.map((it) => (
                      <li key={it} className="flex gap-2.5 text-[0.86rem] leading-snug text-[#b3a892]">
                        <span className="mt-[7px] h-[2px] w-2 shrink-0 bg-current opacity-50" />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Panel>
          </Reveal>
        </section>
          </>
        )}
      </main>

      {/* --------------------------------------------------------- footer */}
      <footer className="relative border-t border-black/70 bg-[#131009]">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-6 px-5 py-8 sm:px-8">
          <div>
            <div className="font-display text-[1.6rem] leading-none font-bold tracking-[0.24em] text-[#e5dbc6] uppercase">
              Alloy
            </div>
            <p className="mt-2 font-mono text-[9.5px] tracking-[0.18em] text-[#6b6458] uppercase">
              hardware reference specification · phase 1 source of truth
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] tracking-[0.14em] text-[#8d8574] uppercase">
            <span>file · ALLOY-HARDWARE-REFERENCE-SPEC.md</span>
            <span className="hidden sm:inline">·</span>
            <a href="#spec" className="transition-colors hover:text-amberlite">
              jump to spec
            </a>
            <a href="#playground" className="transition-colors hover:text-amberlite">
              playground
            </a>
            <a href="#/plan" className="transition-colors hover:text-amberlite">
              build plan
            </a>
            <a href="#/glossary" className="transition-colors hover:text-amberlite">
              glossary
            </a>
            <a href="#/tasks" className="transition-colors hover:text-amberlite">
              task template
            </a>
            <span className="flex items-center gap-1.5">
              <Lamp on tone="#e8a454" size={7} /> power · on
            </span>
          </div>
        </div>
        <div className="stripe-org h-[4px] w-full bg-org/70" />
      </footer>
    </div>
  );
}
