import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import type { FunctionColor } from "../../lib/colors";

/**
 * §1 — Rotary Pot.
 * Two-part construction: knurled cylindrical base + slightly smaller colour cap.
 * Rotating pointer, programmatic 270° tick ring, fixed printed reference triangle.
 * States: default · dragging · keyboard-focused · disabled · numeric entry.
 */

export type KnobProps = {
  value: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  onChange?: (v: number) => void;
  onDoubleClick?: () => void;
  color: FunctionColor;
  label?: string;
  size?: number;
  disabled?: boolean;
  format?: (v: number) => string;
  bipolar?: boolean;
  className?: string;
  caption?: string;
};

const START = -135;
const SWEEP = 270;
const RIDGES = 18; // §1 — 16–20 knurl ridges

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function Knob({
  value,
  min = 0,
  max = 10,
  defaultValue,
  onChange,
  color,
  label,
  size = 112,
  disabled = false,
  format,
  bipolar = false,
  className,
  caption,
}: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [entry, setEntry] = useState(false);
  const [text, setText] = useState("");
  const drag = useRef<{ y: number; v: number; fine: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useMemo(() => `k${Math.random().toString(36).slice(2, 8)}`, []);

  const norm = (value - min) / (max - min);
  const angle = START + clamp(norm, 0, 1) * SWEEP;
  const refNorm =
    defaultValue === undefined
      ? bipolar
        ? 0.5
        : (1 - min) / (max - min)
      : (defaultValue - min) / (max - min);
  const refAngle = START + clamp(refNorm, 0, 1) * SWEEP;

  const ticks = useMemo(() => {
    const count = 21; // regular intervals around ~270°
    return Array.from({ length: count }, (_, i) => {
      const a = START + (i / (count - 1)) * SWEEP;
      return { a, major: i % 5 === 0 };
    });
  }, []);

  const setValue = useCallback(
    (v: number) => {
      onChange?.(clamp(Math.round(v * 1000) / 1000, min, max));
    },
    [max, min, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const px = drag.current.y - e.clientY;
      const mult = e.shiftKey || drag.current.fine ? 0.25 : 1;
      setValue(drag.current.v + (px / 150) * (max - min) * mult);
    };
    const up = () => {
      setDragging(false);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, max, min, setValue]);

  useEffect(() => {
    if (entry) {
      setText(format ? format(value) : value.toFixed(2));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [entry, format, value]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || entry) return;
    const step = e.altKey ? 0.05 : e.shiftKey ? 1 : 0.25;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        e.preventDefault();
        setValue(value + step);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        e.preventDefault();
        setValue(value - step);
        break;
      case "PageUp":
        e.preventDefault();
        setValue(value + (max - min) * 0.1);
        break;
      case "PageDown":
        e.preventDefault();
        setValue(value - (max - min) * 0.1);
        break;
      case "Home":
        e.preventDefault();
        setValue(min);
        break;
      case "End":
        e.preventDefault();
        setValue(max);
        break;
      case "Enter":
        e.preventDefault();
        setEntry(true);
        break;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        if (defaultValue !== undefined) setValue(defaultValue);
        break;
    }
  };

  const commit = () => {
    const parsed = parseFloat(text.replace(",", "."));
    if (!Number.isNaN(parsed)) setValue(parsed);
    setEntry(false);
  };

  const R = { base: 34, cap: 26.4, tickIn: 39.5, tickOut: 44, label: 51.5 };
  const cx = 60;
  const cy = 60;

  return (
    <div className={cn("flex select-none flex-col items-center gap-1.5", className)}>
      {label && (
        <span className="engrave font-mono text-[9.5px] tracking-[0.24em] uppercase">
          {label}
        </span>
      )}

      <div
        className="relative"
        style={{ width: size, height: size, cursor: disabled ? "not-allowed" : "ns-resize" }}
      >
        <svg
          viewBox="0 0 120 120"
          width={size}
          height={size}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ?? "rotary pot"}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Math.round(value * 100) / 100}
          aria-disabled={disabled}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onDoubleClick={() => !disabled && setEntry(true)}
          onPointerDown={(e) => {
            if (disabled || entry) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            drag.current = { y: e.clientY, v: value, fine: e.shiftKey };
            setDragging(true);
          }}
          onWheel={(e) => {
            if (disabled) return;
            e.preventDefault();
            setValue(value - Math.sign(e.deltaY) * (e.shiftKey ? 0.05 : 0.25));
          }}
          className={cn(
            "outline-none transition-[filter] duration-200",
            disabled ? "saturate-[0.12] opacity-60" : "hover:brightness-[1.04]",
          )}
          style={{
            filter: dragging
              ? "drop-shadow(0 10px 14px rgba(0,0,0,.72))"
              : "drop-shadow(0 6px 9px rgba(0,0,0,.55))",
          }}
        >
          <defs>
            <radialGradient id={`${uid}-cap`} cx="34%" cy="27%" r="82%">
              <stop offset="0%" stopColor={color.hi} />
              <stop offset="46%" stopColor={color.base} />
              <stop offset="100%" stopColor={color.lo} />
            </radialGradient>
            <linearGradient id={`${uid}-base`} x1="18%" y1="0%" x2="82%" y2="100%">
              <stop offset="0%" stopColor="#57514a" />
              <stop offset="34%" stopColor="#2b2621" />
              <stop offset="70%" stopColor="#15120f" />
              <stop offset="100%" stopColor="#080706" />
            </linearGradient>
            <linearGradient id={`${uid}-spec`} x1="14%" y1="2%" x2="86%" y2="98%">
              <stop offset="0%" stopColor="rgba(255,255,255,.34)" />
              <stop offset="30%" stopColor="rgba(255,255,255,.05)" />
              <stop offset="62%" stopColor="rgba(0,0,0,.28)" />
              <stop offset="100%" stopColor="rgba(0,0,0,.58)" />
            </linearGradient>
            <radialGradient id={`${uid}-skirt`} cx="50%" cy="50%" r="50%">
              <stop offset="70%" stopColor="rgba(0,0,0,.55)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>

          {/* printed tick ring — never rotates */}
          <g>
            {ticks.map((t, i) => {
              const rad = ((t.a - 90) * Math.PI) / 180;
              const r1 = t.major ? R.tickIn - 2.4 : R.tickIn;
              const x1 = cx + Math.cos(rad) * r1;
              const y1 = cy + Math.sin(rad) * r1;
              const x2 = cx + Math.cos(rad) * R.tickOut;
              const y2 = cy + Math.sin(rad) * R.tickOut;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={t.major ? "#c8bda6" : "rgba(200,189,166,.42)"}
                  strokeWidth={t.major ? 1.5 : 0.9}
                  strokeLinecap="round"
                />
              );
            })}
            <text
              x={cx + Math.cos(((START - 90) * Math.PI) / 180) * R.label}
              y={cy + Math.sin(((START - 90) * Math.PI) / 180) * R.label}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#a89d86"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
            >
              {min}
            </text>
            <text
              x={cx + Math.cos(((START + SWEEP - 90) * Math.PI) / 180) * R.label}
              y={cy + Math.sin(((START + SWEEP - 90) * Math.PI) / 180) * R.label}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#a89d86"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
            >
              {max}
            </text>
            {/* fixed reference triangle printed on the panel */}
            <g transform={`rotate(${refAngle} ${cx} ${cy})`}>
              <path
                d={`M ${cx} ${cy - R.tickOut - 1.4} l 3.1 -4.6 l -6.2 0 z`}
                fill="#e8a454"
                stroke="rgba(0,0,0,.5)"
                strokeWidth="0.5"
              />
            </g>
          </g>

          {/* rotating shaft: knurled base + cap + pointer */}
          <g transform={`rotate(${angle} ${cx} ${cy})`} style={{ transition: dragging ? "none" : "transform 90ms linear" }}>
            <circle cx={cx} cy={cy} r={R.base + 2.5} fill={`url(#${uid}-skirt)`} />
            <circle cx={cx} cy={cy} r={R.base} fill={`url(#${uid}-base)`} />
            {Array.from({ length: RIDGES }, (_, i) => {
              const a = (i / RIDGES) * 360;
              return (
                <g key={i} transform={`rotate(${a} ${cx} ${cy})`}>
                  <rect
                    x={cx - 1.05}
                    y={cy - R.base - 0.3}
                    width={2.1}
                    height={7.4}
                    rx={1}
                    fill="rgba(255,255,255,.16)"
                  />
                  <rect
                    x={cx + 1.05}
                    y={cy - R.base - 0.3}
                    width={1.5}
                    height={7.4}
                    rx={0.7}
                    fill="rgba(0,0,0,.6)"
                  />
                </g>
              );
            })}
            {/* fixed-looking specular wash over the knurlled skirt */}
            <circle
              cx={cx}
              cy={cy}
              r={R.base}
              fill={`url(#${uid}-spec)`}
              style={{ mixBlendMode: "screen", opacity: 0.35 }}
              transform={`rotate(${-angle} ${cx} ${cy})`}
            />
            <circle cx={cx} cy={cy} r={R.base} fill="none" stroke="rgba(0,0,0,.7)" strokeWidth="1" />

            {/* cap */}
            <circle cx={cx} cy={cy} r={R.cap} fill={`url(#${uid}-cap)`} />
            <circle
              cx={cx}
              cy={cy}
              r={R.cap}
              fill="none"
              stroke="rgba(0,0,0,.42)"
              strokeWidth="1.1"
            />
            <ellipse
              cx={cx - 7}
              cy={cy - 9.5}
              rx={11}
              ry={6.6}
              fill="rgba(255,255,255,.24)"
              transform={`rotate(-26 ${cx - 7} ${cy - 9.5})`}
            />
            {/* pointer: near centre to cap edge */}
            <line
              x1={cx}
              y1={cy - 3.5}
              x2={cx}
              y2={cy - R.cap + 1.4}
              stroke={color.ink}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <line
              x1={cx}
              y1={cy - 3.5}
              x2={cx}
              y2={cy - R.cap + 1.4}
              stroke="rgba(255,255,255,.22)"
              strokeWidth="0.7"
              strokeLinecap="round"
              transform="translate(0.8 0.8)"
            />
            <circle cx={cx} cy={cy} r="2.6" fill="rgba(0,0,0,.55)" />
            <circle cx={cx - 0.6} cy={cy - 0.7} r="1" fill="rgba(255,255,255,.4)" />
          </g>

          {/* keyboard focus ring */}
          {focused && !disabled && (
            <circle
              cx={cx}
              cy={cy}
              r={R.tickOut + 4}
              fill="none"
              stroke="#f0c27a"
              strokeWidth="1.6"
              strokeDasharray="5 4"
              opacity="0.95"
            />
          )}
        </svg>

        {entry && (
          <div className="absolute inset-0 grid place-items-center">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEntry(false);
              }}
              className="w-[62%] rounded-[2px] border border-amberlite/70 bg-ink/92 px-1.5 py-1 text-center font-mono text-[12px] text-amberlite shadow-[0_6px_18px_rgba(0,0,0,.7)] outline-none"
              inputMode="decimal"
              aria-label={`${label ?? "knob"} numeric value`}
            />
          </div>
        )}
      </div>

      <span
        className={cn(
          "font-mono text-[10px] tracking-[0.08em] tabular-nums transition-colors",
          dragging ? "text-amberlite" : "text-[#bdb29a]",
        )}
      >
        {format ? format(value) : value.toFixed(1)}
      </span>
      {caption && (
        <span className="font-mono text-[8.5px] tracking-[0.18em] text-[#7b7365] uppercase">
          {caption}
        </span>
      )}
    </div>
  );
}
