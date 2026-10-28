import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { COLORS } from "../../lib/colors";

/**
 * §3 — Fader cap with the "finger-hollow curve".
 * Cap is 2.75:1 wide, rounded short ends, and CONCAVE: two light highlight
 * bands on the front/back lips with a darker trough pooling in the centre —
 * baked into an SVG gradient stack, never one uniform highlight.
 * The cap rides a visible shaft inside a recessed slot with reference ticks.
 */

export type FaderProps = {
  value: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
  label?: string;
  height?: number;
  disabled?: boolean;
  color?: keyof typeof COLORS;
  format?: (v: number) => string;
  marks?: { v: number; label: string }[];
  className?: string;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function Fader({
  value,
  min = 0,
  max = 10,
  onChange,
  label,
  height = 232,
  disabled = false,
  color = "cream",
  format,
  marks,
  className,
}: FaderProps) {
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [entry, setEntry] = useState(false);
  const [text, setText] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startV: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cap = COLORS[color];
  const capW = 68;
  const capH = Math.round(capW / 2.75); // 2.5:1 – 3:1
  const norm = clamp((value - min) / (max - min), 0, 1);
  const travel = height - capH - 8;
  const bottom = 4 + (1 - norm) * travel;

  const set = (v: number) => onChange?.(clamp(Math.round(v * 1000) / 1000, min, max));

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!drag.current || !trackRef.current) return;
      const h = trackRef.current.clientHeight - capH - 8;
      const dy = drag.current.startY - e.clientY;
      set(drag.current.startV + (dy / h) * (max - min));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, max, min, capH]);

  useEffect(() => {
    if (entry) {
      setText(format ? format(value) : value.toFixed(1));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [entry, format, value]);

  const tickMarks = useMemo(
    () =>
      marks ??
      Array.from({ length: 11 }, (_, i) => ({
        v: min + (i / 10) * (max - min),
        label: i % 5 === 0 ? String(min + (i / 10) * (max - min)) : "",
      })),
    [marks, min, max],
  );

  const uid = useMemo(() => `f${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className={cn("flex select-none flex-col items-center gap-2", className)}>
      {label && (
        <span className="engrave font-mono text-[9.5px] tracking-[0.24em] uppercase">{label}</span>
      )}

      <div
        ref={trackRef}
        className="relative"
        style={{ width: capW + 34, height, cursor: disabled ? "not-allowed" : "grab" }}
        onDoubleClick={() => !disabled && setEntry(true)}
      >
        {/* recessed slot cut into the panel */}
        <div
          className="well absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{ left: (capW + 34) / 2 - 6, width: 12, height: height - 6 }}
        >
          {/* shaft */}
          <div
            className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2"
            style={{
              background: "linear-gradient(90deg,#211d19,#8b857c 40%,#4a443d)",
              opacity: 0.9,
            }}
          />
        </div>

        {/* reference ticks alongside the slot, same print convention as the knob */}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0">
          {tickMarks.map((m, i) => {
            const n = clamp((m.v - min) / (max - min), 0, 1);
            // screen position of the cap centre when it rests on this mark
            const centre = height - (4 + n * travel + capH / 2);
            return (
              <div key={i} className="absolute" style={{ top: centre - 0.5, left: 0, right: 0 }}>
                <span
                  className="absolute block h-px"
                  style={{
                    width: m.label ? 9 : 6,
                    background: m.label ? "rgba(200,189,166,.6)" : "rgba(200,189,166,.28)",
                    right: 3,
                  }}
                />
                <span
                  className="absolute block h-px"
                  style={{
                    width: m.label ? 9 : 6,
                    background: m.label ? "rgba(200,189,166,.6)" : "rgba(200,189,166,.28)",
                    left: 3,
                  }}
                />
                {m.label && (
                  <>
                    <span
                      className="absolute -translate-y-1/2 font-mono text-[8px] text-[#9d9482]"
                      style={{ right: 14 }}
                    >
                      {m.label}
                    </span>
                    <span
                      className="absolute -translate-y-1/2 font-mono text-[8px] text-[#9d9482]"
                      style={{ left: 14 }}
                    >
                      {m.label}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* the cap */}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ?? "fader"}
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Math.round(value * 100) / 100}
          aria-disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (disabled || entry) return;
            const step = (max - min) / (e.shiftKey ? 200 : 40);
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              e.preventDefault();
              set(value + step);
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
              e.preventDefault();
              set(value - step);
            } else if (e.key === "Home") set(min);
            else if (e.key === "End") set(max);
            else if (e.key === "Enter") {
              e.preventDefault();
              setEntry(true);
            }
          }}
          onPointerDown={(e) => {
            if (disabled || entry) return;
            drag.current = { startY: e.clientY, startV: value };
            setDragging(true);
            const h = trackRef.current ? trackRef.current.clientHeight - capH - 8 : travel;
            const relY = e.clientY - (trackRef.current?.getBoundingClientRect().top ?? 0);
            const n = 1 - clamp((relY - 4) / h, 0, 1);
            set(min + n * (max - min));
          }}
          className={cn(
            "absolute outline-none transition-[filter] duration-150",
            dragging ? "cursor-grabbing" : "cursor-grab",
            disabled ? "saturate-[0.12] opacity-60" : "hover:brightness-[1.05]",
            focused && !disabled && "shadow-[0_0_0_2px_rgba(240,194,122,.85)]",
          )}
          style={{
            left: 17,
            bottom,
            width: capW,
            height: capH,
            borderRadius: Math.round(capH * 0.42),
            transition: dragging ? "none" : "bottom 80ms linear",
          }}
        >
          <svg
            viewBox={`0 0 ${capW} ${capH}`}
            width={capW}
            height={capH}
            className="absolute inset-0"
            style={{
              filter: "drop-shadow(0 5px 7px rgba(0,0,0,.62))",
            }}
          >
            <defs>
              {/* concave cross-section: bright lips front + back, dark pooling centre */}
              <linearGradient id={`${uid}-v`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cap.hi} />
                <stop offset="13%" stopColor={cap.base} />
                <stop offset="30%" stopColor={cap.lo} />
                <stop offset="50%" stopColor="#524b40" />
                <stop offset="70%" stopColor={cap.lo} />
                <stop offset="87%" stopColor={cap.base} />
                <stop offset="100%" stopColor={cap.hi} />
              </linearGradient>
              <linearGradient id={`${uid}-h`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(0,0,0,.42)" />
                <stop offset="9%" stopColor="rgba(0,0,0,0)" />
                <stop offset="50%" stopColor="rgba(255,255,255,.14)" />
                <stop offset="91%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,.42)" />
              </linearGradient>
              <linearGradient id={`${uid}-trough`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,0,0,.62)" />
                <stop offset="55%" stopColor="rgba(0,0,0,.3)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.3)" />
              </linearGradient>
            </defs>

            <rect
              x="0.5"
              y="0.5"
              width={capW - 1}
              height={capH - 1}
              rx={Math.round(capH * 0.42) - 1}
              fill={`url(#${uid}-v)`}
              stroke="rgba(0,0,0,.6)"
            />
            {/* the hollow itself */}
            <rect
              x={4}
              y={capH * 0.33}
              width={capW - 8}
              height={capH * 0.36}
              rx={capH * 0.18}
              fill={`url(#${uid}-trough)`}
              opacity="0.85"
            />
            {/* lips catching light */}
            <rect x={5} y={1.4} width={capW - 10} height={1.5} rx={0.8} fill="rgba(255,255,255,.62)" />
            <rect x={5} y={capH - 2.9} width={capW - 10} height={1.4} rx={0.7} fill="rgba(255,255,255,.44)" />
            {/* centre index line printed on the cap */}
            <rect x={capW / 2 - 14} y={capH / 2 - 0.5} width={28} height={1} fill={cap.ink} opacity="0.5" />
            <rect
              x="0.5"
              y="0.5"
              width={capW - 1}
              height={capH - 1}
              rx={Math.round(capH * 0.42) - 1}
              fill={`url(#${uid}-h)`}
            />
          </svg>
        </div>

        {entry && (
          <div className="absolute inset-x-0 grid place-items-center" style={{ bottom: bottom - 26 }}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                const p = parseFloat(text);
                if (!Number.isNaN(p)) set(p);
                setEntry(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEntry(false);
              }}
              className="w-20 rounded-[2px] border border-amberlite/70 bg-ink/92 px-1.5 py-0.5 text-center font-mono text-[11px] text-amberlite outline-none"
              inputMode="decimal"
            />
          </div>
        )}
      </div>

      <span
        className={cn(
          "font-mono text-[10px] tabular-nums",
          dragging ? "text-amberlite" : "text-[#bdb29a]",
        )}
      >
        {format ? format(value) : `${value >= 0 ? "+" : ""}${value.toFixed(1)}`}
      </span>
    </div>
  );
}
