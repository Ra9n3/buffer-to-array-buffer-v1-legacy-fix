import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "../utils/cn";
import { COLORS, ORG_COLORS } from "../lib/colors";
import { bus } from "../lib/signal";
import { Legend, Panel, Reveal, SectionHead } from "./ui";
import { Knob } from "./hardware/Knob";
import { Fader } from "./hardware/Fader";
import { TactileSwitch } from "./hardware/TactileSwitch";
import { LedLadder } from "./hardware/LedLadder";
import { VUMeter } from "./hardware/VUMeter";

const TRACKS = [
  { name: "DRUM BUS", short: "DRV", color: 0 },
  { name: "BASS DI", short: "BAS", color: 3 },
  { name: "RHYTHM GTR", short: "RHY", color: 1 },
  { name: "LEAD VOCAL", short: "LDV", color: 5 },
  { name: "ROOM AMBS", short: "AMB", color: 2 },
];

function OrgTab({ color, code, size = "md" }: { color: string; code: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "stripe-org inline-flex shrink-0 items-center justify-center font-mono font-semibold text-[#1a1409]",
        size === "sm" ? "h-[13px] w-[26px] text-[7px] tracking-[0.1em]" : "h-[19px] w-[38px] text-[9px] tracking-[0.14em]",
      )}
      style={{
        background: color,
        clipPath: "polygon(0 0, 100% 0, 100% 72%, 86% 100%, 0 100%)",
        boxShadow: `0 1px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.4)`,
      }}
    >
      {code}
    </span>
  );
}

export function ColorSection() {
  const [sel, setSel] = useState(0);
  const track = TRACKS[sel];
  const orgColor = ORG_COLORS[track.color];

  const [trim, setTrim] = useState(6.2);
  const [eq, setEq] = useState(4.4);
  const [dyn, setDyn] = useState(3.1);
  const [pan, setPan] = useState(0);
  const [aux, setAux] = useState(2.6);
  const [ph, setPh] = useState(true);
  const [pad, setPad] = useState(false);
  const [fader, setFader] = useState(7.2);

  /* this strip drives channel 5 of the shared bus, so its meters agree */
  useEffect(() => {
    let g = (trim / 10) * 0.9 + 0.06;
    g *= 0.75 + (eq / 10) * 0.45;
    g *= 1 - (dyn / 10) * 0.34;
    g *= 0.8 + (aux / 10) * 0.3;
    if (ph) g *= 1.07;
    if (pad) g *= 0.16;
    g *= 0.28 + (fader / 10) * 0.9;
    bus.setGain(5, Math.min(1.12, g));
  }, [trim, eq, dyn, aux, ph, pad, fader]);

  return (
    <section id="colour" className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8">
      <Reveal>
        <SectionHead
          index="§5–7"
          tone={orgColor}
          title="Colour is information, not decoration"
          lede={
            <>
              Functional colour lives on the cap of every pot. Organisational colour lives on one
              small tab beside the engraved track name — and nowhere else on the strip. Same
              treatment in Arrange, Mixer and Console.
            </>
          }
          right={
            <div className="flex flex-wrap gap-2">
              {TRACKS.map((t, i) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSel(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-all",
                    sel === i
                      ? "border-white/25 bg-white/8 text-[#efe6d1]"
                      : "border-white/8 bg-black/25 text-[#8d8574] hover:text-[#c8bda6]",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-[1px]"
                    style={{ background: ORG_COLORS[t.color] }}
                  />
                  {t.short}
                </button>
              ))}
            </div>
          }
        />
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ------------------------------------------------------------ strip */}
        <Reveal>
          <Panel className="px-4 py-6 sm:px-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/8 pb-4">
              <div className="flex items-center gap-2.5">
                <OrgTab color={orgColor} code={track.short} />
                <span className="engrave font-mono text-[11px] tracking-[0.2em] uppercase">
                  {track.name}
                </span>
              </div>
              <span className="font-mono text-[9px] tracking-[0.18em] text-[#7b7365] uppercase">
                ch {String(sel + 1).padStart(2, "0")}
              </span>
            </div>

            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-6">
                <div className="flex flex-wrap justify-center gap-3">
                  <Knob label="trim" color={COLORS.cream} value={trim} size={78} onChange={setTrim} defaultValue={6.7} format={(v) => `${(v * 6 - 24).toFixed(1)}dB`} />
                  <Knob label="eq hf" color={COLORS.amber} value={eq} size={78} onChange={setEq} defaultValue={5} />
                  <Knob label="dyn" color={COLORS.red} value={dyn} size={78} onChange={setDyn} defaultValue={3} format={(v) => `${(1 + v / 4).toFixed(1)}:1`} />
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Knob label="pan" color={COLORS.bluegrey} value={pan} min={-5} max={5} size={78} bipolar defaultValue={0} onChange={setPan} format={(v) => (Math.abs(v) < 0.05 ? "C" : `${v < 0 ? "L" : "R"}${Math.abs(v).toFixed(1)}`)} />
                  <Knob label="aux" color={COLORS.green} value={aux} size={78} onChange={setAux} defaultValue={0} format={(v) => `AUX${v.toFixed(1)}`} />
                  <div className="flex items-center gap-4 self-end pb-4">
                    <TactileSwitch label="phantom" value="48v" size={38} engaged={ph} onToggle={setPh} lampTone="#cf4436" />
                    <TactileSwitch label="pad" value="26db" size={38} engaged={pad} onToggle={setPad} />
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-center gap-2.5 pb-1">
                <LedLadder channel={5} segments={26} height={232} label="peak" showScale />
                <Fader
                  label="lvl"
                  value={fader}
                  min={-8}
                  max={10}
                  height={232}
                  onChange={setFader}
                  format={(v) => `${v <= 0 ? "" : "+"}${v.toFixed(1)}dB`}
                  marks={[
                    { v: 10, label: "+10" },
                    { v: 0, label: "0" },
                    { v: -8, label: "−∞" },
                  ]}
                />
              </div>
            </div>
          </Panel>
        </Reveal>

        {/* ------------------------------------------------------- explanation */}
        <Reveal delay={90} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[3px] border border-cgreen/35 bg-[#101508]/50 p-4">
              <Legend className="mb-3 flex items-center gap-1.5 text-cgreen">
                <Check size={12} strokeWidth={3} /> as specified
              </Legend>
              <div className="flex items-center gap-2.5 rounded-[2px] border border-white/8 bg-black/30 px-3 py-2.5">
                <OrgTab color={orgColor} code={track.short} size="sm" />
                <span className="engrave font-mono text-[9.5px] tracking-[0.18em] uppercase">
                  {track.name}
                </span>
              </div>
              <p className="mt-3 text-[0.82rem] leading-relaxed text-[#a89e8a]">
                A small, clearly visible tab or flag beside the engraved name. Console material,
                labels and control surfaces stay identical across every strip.
              </p>
            </div>

            <div className="rounded-[3px] border border-sred/35 bg-[#170f0d]/50 p-4">
              <Legend className="mb-3 flex items-center gap-1.5 text-sred">
                <X size={12} strokeWidth={3} /> rejected
              </Legend>
              <div
                className="flex items-center gap-2.5 rounded-[2px] px-3 py-2.5"
                style={{ background: `linear-gradient(180deg, ${orgColor}66, ${orgColor}22)` }}
              >
                <span className="font-mono text-[9.5px] tracking-[0.18em] text-white/90 uppercase">
                  {track.name}
                </span>
              </div>
              <p className="mt-3 text-[0.82rem] leading-relaxed text-[#a89e8a]">
                Washing the whole channel-strip background in organisational colour turns an
                identity cue into a theme, and destroys the console material.
              </p>
            </div>
          </div>

          <div className="rounded-[3px] border border-white/8 bg-black/25 p-4">
            <Legend className="mb-3 block text-brass">
              same marker, every room — arrange · mixer · console
            </Legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {/* arrange clip */}
              <div className="rounded-[2px] border border-white/10 bg-[#191510] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <OrgTab color={orgColor} code={track.short} size="sm" />
                  <span className="font-mono text-[8.5px] tracking-[0.14em] text-[#a89e8a] uppercase">
                    arrange
                  </span>
                </div>
                <div className="relative h-[46px] overflow-hidden rounded-[1px] bg-black/40">
                  {[18, 40, 62, 84].map((x) => (
                    <span
                      key={x}
                      className="absolute top-1 bottom-1 w-[16%] rounded-[1px]"
                      style={{ left: `${x}%`, background: `${orgColor}bb`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.35)" }}
                    />
                  ))}
                </div>
              </div>
              {/* mixer slot */}
              <div className="rounded-[2px] border border-white/10 bg-[#191510] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <OrgTab color={orgColor} code={track.short} size="sm" />
                  <span className="font-mono text-[8.5px] tracking-[0.14em] text-[#a89e8a] uppercase">
                    mixer
                  </span>
                </div>
                <div className="flex items-end gap-1.5">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span
                      key={i}
                      className="w-[10px] rounded-[1px] bg-[#3a342c]"
                      style={{ height: 34 - Math.abs(4 - i) * 3 }}
                    >
                      <span
                        className="block h-[6px] rounded-[1px]"
                        style={{ background: orgColor, marginTop: 12 + i * 1.5 }}
                      />
                    </span>
                  ))}
                </div>
              </div>
              {/* console slot */}
              <div className="rounded-[2px] border border-white/10 bg-[#191510] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <OrgTab color={orgColor} code={track.short} size="sm" />
                  <span className="font-mono text-[8.5px] tracking-[0.14em] text-[#a89e8a] uppercase">
                    console
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <VUMeter label="" width={150} channel={5} />
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[3px] border border-brass/30 bg-[#1d1811] p-5">
            <span className="animate-lamp pointer-events-none absolute -bottom-24 -right-10 h-48 w-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(232,164,84,.3), rgba(232,164,84,0) 68%)", filter: "blur(14px)" }} />
            <Legend className="relative mb-2 block text-amberlite">§6 · construction note</Legend>
            <p className="relative text-[0.92rem] leading-relaxed text-[#cec3ac]">
              Prefer SVG or layered CSS gradients over flat single-color fills for{" "}
              <strong className="text-[#f6e9cd]">every</strong> component in this document. The goal
              throughout is “physical object with light and shadow”. Where a component is described
              as asymmetric, soft or layered, that is a requirement, not a suggestion — flat
              renderings do not satisfy the design intent and get revised.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
