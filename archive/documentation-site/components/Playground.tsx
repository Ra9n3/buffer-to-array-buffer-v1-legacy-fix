import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "../utils/cn";
import { COLORS, COLOR_ORDER } from "../lib/colors";
import { bus } from "../lib/signal";
import { Knob } from "./hardware/Knob";
import { TactileSwitch } from "./hardware/TactileSwitch";
import { Fader } from "./hardware/Fader";
import { VUMeter } from "./hardware/VUMeter";
import { LedLadder } from "./hardware/LedLadder";
import { Lamp, Legend, Panel, Reveal } from "./ui";

/* ------------------------------------------------------------------ helpers */

function Note({
  children,
  tone = "amber",
  className,
}: {
  children: React.ReactNode;
  tone?: "amber" | "red";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-l-2 pl-3 font-mono text-[10.5px] leading-relaxed tracking-[0.04em] uppercase",
        tone === "amber" ? "border-amber/70 text-[#c8b083]" : "border-sred/80 text-[#d9968a]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Toggleable where it does something, otherwise a printed state legend chip. */
function StateChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] uppercase transition-all duration-150",
    active
      ? "border-amber/70 bg-amber/18 text-amberlite shadow-[inset_0_1px_0_rgba(255,255,255,.14)]"
      : "border-white/10 bg-black/25 text-[#8d8574]",
    onClick && "cursor-pointer hover:border-white/25 hover:text-[#e5dbc6]",
  );
  const dot = (
    <span
      className={cn(
        "h-[5px] w-[5px] rounded-full",
        active ? "bg-amberlite shadow-[0_0_5px_#e8a454]" : "bg-[#4a4239]",
      )}
    />
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {dot}
      {children}
    </button>
  ) : (
    <span className={cls}>
      {dot}
      {children}
    </span>
  );
}

function Compare({
  heading,
  right,
  left,
  why,
}: {
  heading: string;
  right: React.ReactNode;
  left: React.ReactNode;
  why: string;
}) {
  return (
    <div className="rounded-[3px] border border-black/50 bg-black/25 p-4">
      <Legend className="mb-3 block text-[9px] text-[#8d8574]">{heading}</Legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative flex items-center justify-center rounded-[2px] border border-cgreen/40 bg-[#12180f]/60 py-6">
          <span className="absolute left-2 top-2 flex items-center gap-1 font-mono text-[8.5px] tracking-[0.2em] text-cgreen uppercase">
            <Check size={11} strokeWidth={3} /> per spec
          </span>
          {right}
        </div>
        <div className="relative flex items-center justify-center rounded-[2px] border border-sred/40 bg-[#180f0d]/60 py-6">
          <span className="absolute left-2 top-2 flex items-center gap-1 font-mono text-[8.5px] tracking-[0.2em] text-sred uppercase">
            <X size={11} strokeWidth={3} /> rejected
          </span>
          {left}
        </div>
      </div>
      <div className="mt-3">
        <Note tone="red">{why}</Note>
      </div>
    </div>
  );
}

const TABS = [
  { id: "knob", n: "§1", name: "Rotary Pot" },
  { id: "switch", n: "§2", name: "Tactile Square Switch" },
  { id: "fader", n: "§3", name: "Fader Cap" },
  { id: "meter", n: "§4", name: "VU / LED" },
  { id: "color", n: "§5", name: "Functional Colour" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ------------------------------------------------------------------ section */

export function Playground() {
  const [tab, setTab] = useState<TabId>("knob");

  // §1 state
  const [trim, setTrim] = useState(6.4);
  const [drive, setDrive] = useState(4.2);
  const [pan, setPan] = useState(0);
  const [sendA, setSendA] = useState(3.1);
  const [disabled, setDisabled] = useState(false);

  // §2 state
  const [pad, setPad] = useState(false);
  const [phantom, setPhantom] = useState(true);
  const [hpf, setHpf] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [onCap, setOnCap] = useState(true);
  const [solo, setSolo] = useState(false);
  const [dim, setDim] = useState(false);

  // §3 state
  const [chFader, setChFader] = useState(6.6);
  const [master, setMaster] = useState(7.4);

  // §4 state
  const [running, setRunning] = useState(true);
  const [comp, setComp] = useState(4.5);

  /* controls drive the shared signal source, so the meters visibly agree */
  useEffect(() => {
    bus.set({
      drive: drive / 10,
      master: master / 10,
      pad,
      phantom,
      hpf,
      comp: comp / 10,
      running,
    });
  }, [drive, master, pad, phantom, hpf, comp, running]);

  useEffect(() => {
    bus.setGain(0, (trim / 10) * (chFader / 10) + 0.05);
  }, [trim, chFader]);

  useEffect(() => {
    bus.setGain(1, 0.4 + (sendA / 10) * 0.5);
  }, [sendA]);

  useEffect(() => {
    bus.set({ bypass });
  }, [bypass]);

  return (
    <section id="playground" className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8">
      <Reveal>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <Legend className="text-amberlite">Phase 1 · component playground</Legend>
            <h2 className="font-display mt-2 text-[clamp(2.1rem,5.4vw,3.9rem)] leading-[0.9] font-bold uppercase text-[#f4ecdb]">
              Build it physical,
              <br />
              <span className="text-[#9a9284]">not flat</span>
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[#a89e8a]">
            Every control below is live and wired to the same synthetic program source that moves
            the meters. Drag vertically, scroll to nudge, hold <kbd className="font-mono text-[10px] text-amberlite">Shift</kbd>{" "}
            for fine moves, tab for the focus ring, double-click for numeric entry.
          </p>
        </header>
      </Reveal>

      {/* tab rail, styled as a selector strip */}
      <div className="well mb-8 flex flex-wrap gap-1 rounded-[3px] p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "group flex items-baseline gap-2 rounded-[2px] px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] uppercase transition-all duration-150",
              tab === t.id
                ? "bg-brass/22 text-[#f6e6c4] shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_2px_6px_rgba(0,0,0,.5)]"
                : "text-[#8d8574] hover:bg-white/4 hover:text-[#c8bda6]",
            )}
          >
            <span className={cn("text-[9px]", tab === t.id ? "text-amber" : "text-[#6b6458]")}>
              {t.n}
            </span>
            {t.name}
          </button>
        ))}
      </div>

      <Panel className="p-5 sm:p-8">
        {tab === "knob" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <div className="flex flex-wrap items-start justify-center gap-3 rounded-[3px] border border-white/6 bg-black/20 p-5 sm:gap-6 sm:p-7">
                <Knob
                  label="input trim"
                  color={COLORS.cream}
                  value={trim}
                  onChange={setTrim}
                  defaultValue={6.7}
                  disabled={disabled}
                  format={(v) => `${(v * 6 - 24).toFixed(1)} dB`}
                />
                <Knob
                  label="drive"
                  color={COLORS.amber}
                  value={drive}
                  onChange={setDrive}
                  disabled={disabled}
                  defaultValue={4}
                  format={(v) => v.toFixed(1)}
                />
                <Knob
                  label="comp"
                  color={COLORS.red}
                  value={comp}
                  onChange={setComp}
                  disabled={disabled}
                  defaultValue={4.5}
                  format={(v) => `${(1 + v / 4).toFixed(2)}:1`}
                />
                <Knob
                  label="pan"
                  color={COLORS.bluegrey}
                  value={pan}
                  min={-5}
                  max={5}
                  bipolar
                  onChange={setPan}
                  disabled={disabled}
                  defaultValue={0}
                  format={(v) => (Math.abs(v) < 0.05 ? "C" : `${v < 0 ? "L" : "R"}${Math.abs(v).toFixed(1)}`)}
                />
                <Knob
                  label="send a"
                  color={COLORS.green}
                  value={sendA}
                  onChange={setSendA}
                  disabled={disabled}
                  defaultValue={0}
                  format={(v) => `AUX ${v.toFixed(1)}`}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StateChip active={disabled} onClick={() => setDisabled((d) => !d)}>
                  disabled
                </StateChip>
                <span className="font-mono text-[9px] tracking-[0.14em] text-[#7b7365] uppercase">
                  states covered: default · drag · focus ring · numeric entry (2× click) ·
                  alt = 0.05 step · del = default
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Legend size="xs" className="text-[#7b7365]">
                    meter
                  </Legend>
                  <LedLadder channel={0} segments={12} height={70} />
                </span>
              </div>
            </div>

            <div className="space-y-5">
              <ul className="space-y-2 text-[0.9rem] leading-relaxed text-[#c3b9a3]">
                {[
                  "Two-part build: knurled cylindrical base + cap, cap diameter smaller than base.",
                  "Base dark, 16–20 vertical ridges around the circumference, rotating with the shaft.",
                  "Cap in the assigned function colour with a radial highlight (upper-left light, lower-right shade).",
                  "Single straight pointer from near centre to cap edge in a dark contrasting ink.",
                  "Tick ring generated programmatically over ~270°; numerals at the two extremes only.",
                  "Fixed triangle printed on the panel marks centre / unity / default.",
                ].map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <span className="mt-[7px] h-[2px] w-2 shrink-0 bg-brass/70" />
                    {s}
                  </li>
                ))}
              </ul>

              <Compare
                heading="§1 explicitly avoid"
                right={<DemoKnob color={COLORS.amber} label="drive" />}
                left={
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="grid h-[70px] w-[70px] place-items-center rounded-full bg-[#dfa055]">
                      <span className="block h-[26px] w-[2px] -translate-y-[18px] bg-[#2c1a06]" />
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.2em] text-[#8d8574] uppercase">
                      flat dial
                    </span>
                  </div>
                }
                why="a flat solid-colour circle with no base/cap separation, no knurl texture and no pointer reads as a generic modern UI dial"
              />
            </div>
          </div>
        )}

        {tab === "switch" && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <Legend className="mb-3 block text-brass">Variant A — cap-labelled</Legend>
                <div className="flex flex-wrap items-start justify-center gap-8 rounded-[3px] border border-white/6 bg-black/20 px-6 py-8">
                  <TactileSwitch variant="A" label="on" engaged={onCap} onToggle={setOnCap} size={54} value="main" lampTone="#e8a454" />
                  <TactileSwitch variant="A" label="solo" engaged={solo} onToggle={setSolo} size={54} value="ch 1" lampTone="#e8a454" />
                  <TactileSwitch variant="A" label="dim" engaged={dim} onToggle={setDim} size={54} value="-12 dB" lampTone="#cf4436" />
                </div>
                <ul className="mt-3 space-y-1.5 text-[0.86rem] text-[#b3a892]">
                  <li>Rounded corners at ~18% of width — not fully round.</li>
                  <li>Glossy chrome cap: diagonal highlight, brighter top-left, darker bottom-right.</li>
                  <li>Label printed on the cap itself.</li>
                </ul>
              </div>

              <div>
                <Legend className="mb-3 block text-brass">
                  Variant B — panel-labelled (default convention)
                </Legend>
                <div className="flex flex-wrap items-start justify-center gap-8 rounded-[3px] border border-white/6 bg-black/20 px-6 py-8">
                  <TactileSwitch label="pad" value="26db" engaged={pad} onToggle={setPad} size={44} />
                  <TactileSwitch label="phantom" value="48v" engaged={phantom} onToggle={setPhantom} size={44} lampTone="#cf4436" />
                  <TactileSwitch label="hpf" value="75hz" engaged={hpf} onToggle={setHpf} size={44} />
                  <TactileSwitch label="bypass" value="eq" engaged={bypass} onToggle={setBypass} size={44} lampTone="#e8a454" />
                </div>
                <ul className="mt-3 space-y-1.5 text-[0.86rem] text-[#b3a892]">
                  <li>Matte cap inset into a recessed square well, below the panel surface.</li>
                  <li>Function label above, value label below — both printed on the panel.</li>
                  <li>
                    The adjacent lamp carries on/off; the cap does not change colour. Watch the
                    meters react — <span className="text-amberlite">PAD</span> pulls −26 dB,{" "}
                    <span className="text-amberlite">HPF</span> thins the low end.
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-6">
              <Legend className="block text-brass">
                state gallery — press any switch to see it sink
              </Legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["default", "raised, full highlight"],
                    ["pressed", "cap sinks, shadow shifts inward, −1 to 2 px"],
                    ["engaged", "adjacent amber/red lamp only"],
                    ["disabled", "desaturated, no pointer events"],
                  ] as const
                ).map(([k, v], i) => (
                  <div
                    key={k}
                    className="rounded-[2px] border border-white/8 bg-black/28 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <TactileSwitch
                        label={k}
                        value={v.split(" ")[0]}
                        size={30}
                        engaged={i === 2}
                        disabled={i === 3}
                      />
                    </div>
                    <p className="font-mono text-[9.5px] leading-relaxed tracking-[0.05em] text-[#8d8574] uppercase">
                      {v}
                    </p>
                  </div>
                ))}
              </div>

              <Compare
                heading="§2 explicitly avoid"
                right={<DemoSwitch variant="A" label="on" value="main" />}
                left={
                  <div className="flex flex-col items-center gap-3">
                    <span className="relative block h-[26px] w-[48px] rounded-full bg-[#3f6b4c]">
                      <span className="absolute right-[3px] top-[3px] block h-[20px] w-[20px] rounded-full bg-white" />
                    </span>
                    <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-[#8d8574] uppercase">
                      <span className="grid h-4 w-4 place-items-center rounded-[3px] bg-[#5aa06a] text-white">
                        <Check size={10} strokeWidth={3.4} />
                      </span>
                      checkbox
                    </span>
                  </div>
                }
                why="sliding pill shapes and flat material-design checkboxes do not read as a physical push-button keycap"
              />
            </div>
          </div>
        )}

        {tab === "fader" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="flex items-start justify-center gap-10 rounded-[3px] border border-white/6 bg-black/20 px-6 py-7">
                <Fader
                  label="ch 1"
                  value={chFader}
                  min={-8}
                  max={10}
                  onChange={setChFader}
                  height={262}
                  format={(v) => `${v <= 0 ? "" : "+"}${v.toFixed(1)} dB`}
                  marks={[
                    { v: 10, label: "+10" },
                    { v: 5, label: "+5" },
                    { v: 0, label: "0" },
                    { v: -5, label: "-5" },
                    { v: -8, label: "−∞" },
                  ]}
                />
                <Fader
                  label="master"
                  value={master}
                  min={-8}
                  max={10}
                  onChange={setMaster}
                  height={262}
                  format={(v) => `${v <= 0 ? "" : "+"}${v.toFixed(1)} dB`}
                  marks={[
                    { v: 10, label: "+10" },
                    { v: 5, label: "+5" },
                    { v: 0, label: "0" },
                    { v: -5, label: "-5" },
                    { v: -8, label: "−∞" },
                  ]}
                />
                <div className="flex flex-col items-center gap-3 pt-8">
                  <LedLadder master segments={34} height={230} label="meter bridge" showScale />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Legend size="xs" className="text-[#7b7365]">
                  cross-section detail
                </Legend>
                <svg viewBox="0 0 240 42" className="h-[42px] w-[240px]">
                  <defs>
                    <linearGradient id="cxg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f6efdc" />
                      <stop offset="45%" stopColor="#6f675a" />
                      <stop offset="55%" stopColor="#5a5347" />
                      <stop offset="100%" stopColor="#efe7d2" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M14 30 Q60 6 120 26 Q180 6 226 30 L226 34 Q180 14 120 32 Q60 14 14 34 Z"
                    fill="url(#cxg)"
                    stroke="rgba(0,0,0,.6)"
                  />
                  <path d="M14 30 Q60 8 120 27" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.6" />
                  <path d="M120 27 Q180 8 226 30" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.4" />
                  <text x="120" y="14" textAnchor="middle" fill="#8d8574" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.4">
                    HOLLOW
                  </text>
                  <text x="24" y="14" fill="#c9a15a" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.2">
                    LIP
                  </text>
                  <text x="192" y="14" fill="#c9a15a" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.2">
                    LIP
                  </text>
                </svg>
              </div>
            </div>

            <div className="space-y-5">
              <ul className="space-y-2 text-[0.9rem] leading-relaxed text-[#c3b9a3]">
                {[
                  "Rectangular cap, 2.5:1 to 3:1 width-to-height, rounded short ends.",
                  "Top surface is concave — it dips to a central trough and rises again at both edges, like a small halfpipe for a fingertip.",
                  "Layered gradients: two light bands on the front/back lips, darker gradient pooling in the centre. A single uniform highlight must not be used.",
                  "Cream / off-white, matching the input-trim colour family (§5).",
                  "Cap rides a visible shaft inside a long recessed slot, with level-reference ticks alongside — same print convention as the knob.",
                ].map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <span className="mt-[7px] h-[2px] w-2 shrink-0 bg-brass/70" />
                    {s}
                  </li>
                ))}
              </ul>
              <Note>
                flagged for extra polish / iteration — this is not a one-pass component
              </Note>
              <Compare
                heading="§3 explicitly avoid"
                right={<FaderPreview concave />}
                left={<div className="scale-[1.35]"><FaderPreview /></div>}
                why="a flat rectangular cap with one uniform highlight reads as a generic DAW fader, not a hardware fader cap"
              />
            </div>
          </div>
        )}

        {tab === "meter" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <div>
              <div className="flex flex-wrap items-start justify-center gap-6 rounded-[3px] border border-white/6 bg-black/20 px-6 py-7">
                <VUMeter master label="master l" width={224} trim={1} />
                <VUMeter master label="master r" width={224} channel={1} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <StateChip active={running} onClick={() => setRunning((r) => !r)}>
                  {running ? "transport · playing" : "transport · stopped"}
                </StateChip>
                <span className="flex items-center gap-2 rounded-[2px] border border-white/8 bg-black/30 px-3 py-1">
                  <Lamp on={running} tone="#e8a454" size={8} />
                  <Legend size="xs" className="text-[#8d8574]">
                    signal present
                  </Legend>
                </span>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-6 rounded-[3px] border border-white/6 bg-black/20 p-5">
                <div className="w-full max-w-[190px]">
                  <VUMeter label="4a · lamp v u" width={190} channel={3} />
                </div>
                <div className="flex flex-col items-center gap-2 pt-1">
                  <LedLadder channel={2} segments={22} height={172} label="4b · ladder" />
                </div>
              </div>
              <Note tone="red">
                do not conflate 4a and 4b — the master/channel meter bridge is lamp-style 4a; the
                crisp segment ladder belongs only where a fast numeric peak display is called for
              </Note>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[2px] border border-white/8 bg-black/28 p-3">
                  <Legend size="xs" className="mb-1.5 block text-brass">
                    lamp glow
                  </Legend>
                  <p className="text-[0.82rem] leading-relaxed text-[#a89e8a]">
                    Warm amber <span className="font-mono text-[11px] text-amberlite">#e8a454–#f0c27a</span>,
                    large blur, asymmetric falloff from a lower-centre bulb point, slow brightness
                    drift.
                  </p>
                </div>
                <div className="rounded-[2px] border border-white/8 bg-black/28 p-3">
                  <Legend size="xs" className="mb-1.5 block text-brass">
                    segments
                  </Legend>
                  <p className="text-[0.82rem] leading-relaxed text-[#a89e8a]">
                    Green low, amber mid, red at the top; cumulative from the bottom; crisp edges,
                    no diffuse bloom.
                  </p>
                </div>
              </div>
              <Compare
                heading="§4a explicitly avoid"
                right={<div className="w-[190px]"><VUMeter label="lamp, not screen" width={190} channel={5} /></div>}
                left={
                  <div
                    className="w-[190px] rounded-[3px] border border-white/10 p-4"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 50%, #dfe9e6 0%, #dfe9e6 70%, #b9c6c2 70%)",
                    }}
                  >
                    <svg viewBox="0 0 160 40" className="h-auto w-full">
                      <line x1="8" y1="34" x2="152" y2="6" stroke="#0f1a17" strokeWidth="2" />
                      <text x="80" y="38" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="#0f1a17">
                        LED-BACKLIT SCREEN
                      </text>
                    </svg>
                  </div>
                }
                why="a flat background fill or a uniform radial gradient with a hard edge reads as an LED-backlit screen"
              />
            </div>
          </div>
        )}

        {tab === "color" && <ColorTable />}
      </Panel>
    </section>
  );
}

/* ----------------------------------------------------- §5 functional colour */

/** Self-contained demo control for comparison / gallery contexts. */
function DemoKnob({ color, label }: { color: (typeof COLORS)[string]; label: string }) {
  const [v, setV] = useState(6.4);
  return <Knob label={label} color={color} value={v} size={84} onChange={setV} defaultValue={6.7} />;
}

function DemoSwitch({
  variant = "A",
  label,
  value,
  initial = true,
}: {
  variant?: "A" | "B";
  label: string;
  value?: string;
  initial?: boolean;
}) {
  const [on, setOn] = useState(initial);
  return <TactileSwitch variant={variant} label={label} value={value} engaged={on} onToggle={setOn} size={44} />;
}

function ColorTable() {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <Legend className="mb-4 block text-brass">
          §5 — applied to every pot individually, not as a panel accent
        </Legend>
        <div className="overflow-hidden rounded-[3px] border border-white/8">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-black/35">
                <th className="engrave px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em]">
                  colour family
                </th>
                <th className="engrave px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em]">
                  applies to
                </th>
              </tr>
            </thead>
            <tbody>
              {COLOR_ORDER.map((k) => {
                const c = COLORS[k];
                const dim = hover && hover !== k;
                return (
                  <tr
                    key={k}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "border-t border-white/6 transition-opacity duration-200",
                      dim && "opacity-35",
                      hover === k && "bg-amber/8",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{
                            background: `radial-gradient(circle at 34% 28%, ${c.hi}, ${c.base} 48%, ${c.lo})`,
                            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.5)",
                          }}
                        />
                        <span className="font-mono text-[11px] text-[#ddd3bd]">{c.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[0.85rem] text-[#a89e8a]">{c.applies}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note className="mt-4">
          switch-engaged lamps use red or amber regardless of the switch's own function colour
        </Note>
      </div>

      <div>
        <Legend className="mb-4 block text-brass">same pots, different functions</Legend>
        <div className="grid grid-cols-3 gap-4 rounded-[3px] border border-white/6 bg-black/20 p-5">
          {COLOR_ORDER.map((k) => (
            <DemoKnob
              key={k}
              color={COLORS[k]}
              label={k === "bluegrey" ? "pan" : k === "cream" ? "trim" : k}
            />
          ))}
        </div>
        <p className="mt-4 text-[0.9rem] leading-relaxed text-[#a89e8a]">
          The cap colour is assigned by what the control <em className="text-amberlite not-italic">does</em>,
          so a strip reads correctly at a glance from across the room — cream is always gain
          staging, amber is always tonal, red is always dynamics.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------- flat fader for compare */

function FaderPreview({ concave = false }: { concave?: boolean }) {
  const W = 66;
  const H = 24;
  return (
    <div className="relative h-[132px] w-[100px]">
      <div
        className={cn(
          "absolute top-1/2 left-1/2 h-[124px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full",
          concave ? "well" : "bg-[#14110d]",
        )}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2"
        style={{ width: W, height: H, borderRadius: H * 0.42 }}
      >
        {concave ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="absolute inset-0"
            style={{ filter: "drop-shadow(0 5px 7px rgba(0,0,0,.62))" }}
          >
            <defs>
              <linearGradient id="fp-v" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbf5e6" />
                <stop offset="13%" stopColor="#e7ddc4" />
                <stop offset="31%" stopColor="#a29880" />
                <stop offset="50%" stopColor="#524b40" />
                <stop offset="69%" stopColor="#a29880" />
                <stop offset="87%" stopColor="#e7ddc4" />
                <stop offset="100%" stopColor="#fbf5e6" />
              </linearGradient>
              <linearGradient id="fp-t" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,0,0,.62)" />
                <stop offset="60%" stopColor="rgba(0,0,0,.28)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.32)" />
              </linearGradient>
            </defs>
            <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx={H * 0.42 - 1} fill="url(#fp-v)" stroke="rgba(0,0,0,.6)" />
            <rect x={4} y={H * 0.33} width={W - 8} height={H * 0.36} rx={H * 0.18} fill="url(#fp-t)" opacity="0.85" />
            <rect x={5} y={1.4} width={W - 10} height={1.5} rx={0.8} fill="rgba(255,255,255,.66)" />
            <rect x={5} y={H - 2.9} width={W - 10} height={1.4} rx={0.7} fill="rgba(255,255,255,.44)" />
            <rect x={W / 2 - 13} y={H / 2 - 0.5} width={26} height={1} fill="#241f18" opacity="0.45" />
          </svg>
        ) : (
          <div
            className="h-full w-full"
            style={{
              borderRadius: H * 0.42,
              background: "#e7ddc4",
              boxShadow: "0 2px 4px rgba(0,0,0,.4)",
            }}
          />
        )}
      </div>
    </div>
  );
}
