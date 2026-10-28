import { useEffect, useRef } from "react";
import { cn } from "../../utils/cn";
import { subscribe } from "../../lib/signal";

/**
 * §4b — LED segment ladder. A deliberately different object from the VU meter:
 * discrete, crisply-edged blocks, green low / amber mid / red peak, lighting
 * cumulatively from the bottom up with a fast peak-hold marker.
 * No diffuse glow anywhere in here — that belongs to 4a only.
 */

export type LedLadderProps = {
  channel?: number;
  master?: boolean;
  segments?: number;
  height?: number;
  label?: string;
  className?: string;
  showScale?: boolean;
};

const band = (n: number, count: number) => {
  const i = n * count;
  if (i >= count * 0.86) return { on: "#ff4b32", off: "#3a1613", glow: "rgba(255,75,50,.55)" };
  if (i >= count * 0.6) return { on: "#f0b93c", off: "#39290f", glow: "rgba(240,185,60,.45)" };
  return { on: "#5fd07a", off: "#153022", glow: "rgba(95,208,122,.35)" };
};

export function LedLadder({
  channel = 0,
  master = false,
  segments = 20,
  height = 210,
  label,
  className,
  showScale = false,
}: LedLadderProps) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const peakRef = useRef<HTMLSpanElement>(null);
  const state = useRef({ lit: 0, peak: 0, peakAt: 0 });

  useEffect(() => {
    let last = performance.now();
    const unsub = subscribe((f) => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const v = master ? f.master : (f.levels[channel] ?? 0);
      const n = Math.max(0, Math.min(1, v / 1.15));
      const lit = Math.round(n * segments);
      if (lit >= state.current.peak) {
        state.current.peak = lit;
        state.current.peakAt = now;
      } else if (now - state.current.peakAt > 550) {
        state.current.peak = Math.max(lit, state.current.peak - 0.06 * (dt / 16.67));
      }
      if (lit !== state.current.lit) {
        state.current.lit = lit;
        for (let i = 0; i < segments; i++) {
          const el = refs.current[i];
          if (!el) continue;
          const c = band(i / segments, segments);
          const on = i < lit;
          el.style.background = on
            ? `linear-gradient(180deg, ${c.on}, ${c.on})`
            : `linear-gradient(180deg, ${c.off}, rgba(0,0,0,.5))`;
          el.style.boxShadow = on
            ? `0 0 4px ${c.glow}, inset 0 0 0 .5px rgba(255,255,255,.35)`
            : "inset 0 0 0 .5px rgba(255,255,255,.06)";
        }
      }
      if (peakRef.current) {
        const p = Math.max(state.current.peak, lit);
        peakRef.current.style.bottom = `calc(${(p / segments) * 100}% - 1px)`;
        peakRef.current.style.opacity = p > 0.5 ? "1" : "0";
      }
    });
    return unsub;
  }, [channel, master, segments]);

  const segH = (height - (segments - 1) * 2) / segments;

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      {showScale && (
        <div className="flex flex-col justify-between py-[1px] text-right font-mono text-[7.5px] leading-none text-[#8b8371]">
          {["+3", "0", "-6", "-12", "-24", "-inf"].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      <div className="flex flex-col-reverse items-stretch" style={{ height }}>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="relative block w-[13px]"
            style={{
              height: segH,
              marginBottom: i === segments - 1 ? 0 : 2,
              borderRadius: 1,
              background: `linear-gradient(180deg, ${band(i / segments, segments).off}, rgba(0,0,0,.5))`,
              boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.06)",
              transition: "background 30ms linear",
            }}
          />
        ))}
      </div>
      <div className="relative w-[3px]">
        <span
          ref={peakRef}
          className="absolute left-0 h-[2px] w-[9px] rounded-[1px] bg-cream/85"
          style={{ bottom: "0%", opacity: 0, transition: "bottom 60ms linear, opacity 200ms" }}
        />
      </div>
      {label && (
        <div className="engrave flex items-center pl-1 font-mono text-[9px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">
          {label}
        </div>
      )}
    </div>
  );
}
