import { useEffect, useMemo, useRef } from "react";
import { cn } from "../../utils/cn";
import { subscribe } from "../../lib/signal";

/**
 * §4a — Analog VU meter: recessed dark bezel, brass trim line, warm parchment
 * face, arc scale radiating from a pivot below centre, thin black needle with a
 * soft drop shadow, and — critically — an INCANDESCENT LAMP glow: warm amber
 * (#e8a454–#f0c27a), soft, diffuse, uneven, brighter toward the lower-centre
 * where the bulb sits, with a barely perceptible slow drift.
 * Never a flat fill, never an LED-backlit screen.
 */

export type VUMeterProps = {
  label?: string;
  channel?: number;
  master?: boolean;
  width?: number | string;
  className?: string;
  trim?: number;
  /** drive the needle from something other than the audio bus (e.g. a progress value) */
  source?: () => number;
};

const CX = 100;
const CY = 112; // pivot, below-centre of the arc
const R = 92;
const A_START = -47;
const A_SWEEP = 94;
const DB_MIN = -30;
const DB_MAX = 6;

const dbToN = (db: number) => (db - DB_MIN) / (DB_MAX - DB_MIN);
const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + Math.sin(rad) * r, CY - Math.cos(rad) * r] as const;
};
const arcPath = (r: number, db0: number, db1: number) => {
  const a0 = A_START + dbToN(db0) * A_SWEEP;
  const a1 = A_START + dbToN(db1) * A_SWEEP;
  const [x0, y0] = point(a0, r);
  const [x1, y1] = point(a1, r);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export function VUMeter({
  label = "VU",
  channel = 0,
  master = false,
  width = 208,
  className,
  trim = 1,
  source,
}: VUMeterProps) {
  const needle = useRef<SVGGElement>(null);
  const overload = useRef<HTMLSpanElement>(null);
  const smooth = useRef(0);
  const srcRef = useRef(source);
  srcRef.current = source;

  const ticks = useMemo(() => {
    const marks = [
      { db: -30, t: "-30" },
      { db: -20, t: "-20" },
      { db: -10, t: "-10" },
      { db: -7, t: "" },
      { db: -5, t: "-5" },
      { db: -3, t: "" },
      { db: 0, t: "0" },
      { db: 3, t: "+3" },
      { db: 6, t: "+6" },
    ];
    return marks.map((m) => ({ ...m, a: A_START + dbToN(m.db) * A_SWEEP, red: m.db >= 0 }));
  }, []);

  useEffect(() => {
    let last = performance.now();
    const unsub = subscribe((f) => {
      const now = performance.now();
      const dt = Math.min(64, now - last) / 16.67;
      last = now;
      const base = srcRef.current ? srcRef.current() : master ? f.master : f.levels[channel] ?? 0;
      const raw = Math.max(0, Math.min(1.2, base * trim));
      // classic VU ballistics: fast-ish attack, ~300 ms integration on release
      const k = raw > smooth.current ? 0.4 : 0.07;
      smooth.current += (raw - smooth.current) * Math.min(1, k * dt);
      const v = smooth.current;
      const db = v > 0.012 ? 20 * Math.log10(v) : DB_MIN;
      const n = Math.max(0, Math.min(1.04, dbToN(db)));
      const deg = A_START + n * A_SWEEP;
      needle.current?.setAttribute("transform", `rotate(${deg.toFixed(2)} ${CX} ${CY})`);
      if (overload.current) overload.current.style.opacity = v > 0.99 ? "1" : "0.07";
    });
    return unsub;
  }, [channel, master, trim]);

  return (
    <figure className={cn("relative", className)} style={{ width }}>
      {/* bezel, recessed into the panel like a window */}
      <div
        className="relative rounded-[5px] p-[7px]"
        style={{
          background: "linear-gradient(168deg,#2c1e15,#150f0b 58%,#0a0706)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,.07), inset 0 3px 10px rgba(0,0,0,.9), 0 1px 0 rgba(255,255,255,.06), 0 16px 30px -18px rgba(0,0,0,.95)",
        }}
      >
        {/* thin brass trim line between frame and face */}
        <div
          className="rounded-[2px] p-[1.5px]"
          style={{ background: "linear-gradient(180deg,#dcc189,#7a5f2c)" }}
        >
          <div className="relative overflow-hidden rounded-[1px]">
            {/* face: warm, slightly yellowed parchment */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(150% 125% at 50% 116%, #f7e9c0 0%, #efdcad 32%, #e4cd97 60%, #cfb281 86%, #c0a274 100%)",
              }}
            />
            {/* incandescent glow — broad, soft, offset toward lower centre */}
            <div
              className="animate-lamp pointer-events-none absolute"
              style={{
                left: "-34%",
                right: "-34%",
                bottom: "-52%",
                height: "146%",
                background:
                  "radial-gradient(closest-side, rgba(244,203,131,.9), rgba(232,164,84,.4) 44%, rgba(232,164,84,0) 76%)",
                filter: "blur(16px)",
                mixBlendMode: "soft-light",
                transform: "scale(1.3, .9)",
              }}
            />
            <div
              className="animate-lampslow pointer-events-none absolute"
              style={{
                left: "10%",
                right: "-12%",
                bottom: "-66%",
                height: "128%",
                background:
                  "radial-gradient(closest-side, rgba(255,220,158,.6), rgba(226,158,66,.18) 52%, rgba(0,0,0,0) 74%)",
                filter: "blur(24px)",
                mixBlendMode: "screen",
                opacity: 0.45,
              }}
            />
            {/* uneven vignette + aged glass */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(84% 66% at 15% 6%, rgba(255,255,255,.3), rgba(255,255,255,0) 52%), linear-gradient(180deg, rgba(92,64,28,.28), rgba(92,64,28,0) 24%), radial-gradient(125% 92% at 52% 98%, rgba(0,0,0,0) 40%, rgba(74,48,18,.36) 100%)",
              }}
            />

            <svg viewBox="0 0 200 122" className="relative block h-auto w-full">
              {/* printed scale */}
              <path d={arcPath(R, DB_MIN, 0)} fill="none" stroke="#2b241b" strokeWidth="1.7" opacity="0.72" />
              <path d={arcPath(R, 0, DB_MAX)} fill="none" stroke="#b0341c" strokeWidth="3.4" opacity="0.92" />
              {ticks.map((t, i) => {
                const [x1, y1] = point(t.a, t.db % 10 === 0 || t.red ? R - 12 : R - 7);
                const [x2, y2] = point(t.a, R + 1);
                const [lx, ly] = point(t.a, R - 25);
                const color = t.red ? "#a52a1c" : "#2b241b";
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={t.db % 10 === 0 ? 1.6 : 1} />
                    {t.t && (
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={color}
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="var(--font-mono)"
                      >
                        {t.t}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* minor tick ladder between printed values, programmatic */}
              {Array.from({ length: 31 }, (_, i) => {
                const db = DB_MIN + i;
                const a = A_START + dbToN(db) * A_SWEEP;
                const [x1, y1] = point(a, R - 4);
                const [x2, y2] = point(a, R + 1);
                return (
                  <line
                    key={`m${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={db >= 0 ? "#a52a1c" : "#2b241b"}
                    strokeWidth="0.7"
                    opacity="0.55"
                  />
                );
              })}
              <text
                x="100"
                y="84"
                textAnchor="middle"
                fill="#3a2f21"
                fontSize="12"
                letterSpacing="3"
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                VU
              </text>
              <text
                x="100"
                y="97"
                textAnchor="middle"
                fill="rgba(58,47,33,.6)"
                fontSize="6.2"
                letterSpacing="1.5"
                fontFamily="var(--font-mono)"
              >
                ALLOY · 600Ω · +4 dBu
              </text>

              {/* needle with a soft drop shadow on the face */}
              <g ref={needle}>
                <line
                  x1={CX + 1.6}
                  y1={CY + 6.4}
                  x2={CX + 2.2}
                  y2={CY - R + 2}
                  stroke="rgba(46,30,10,.3)"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                />
                <line
                  x1={CX}
                  y1={CY + 5}
                  x2={CX}
                  y2={CY - R}
                  stroke="#17140f"
                  strokeWidth="1.45"
                  strokeLinecap="round"
                />
              </g>
              <circle cx={CX} cy={CY} r="6.5" fill="#1c1712" />
              <circle cx={CX} cy={CY} r="6.5" fill="none" stroke="rgba(255,255,255,.22)" />
              <circle cx={CX - 1.6} cy={CY - 1.8} r="1.7" fill="rgba(255,255,255,.35)" />
            </svg>

            {/* peak lamp inside the window */}
            <span
              ref={overload}
              className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full"
              style={{
                background: "radial-gradient(circle at 36% 30%, #ffd7c2, #cf4436 55%, #4a130c)",
                boxShadow: "0 0 8px 2px rgba(207,68,54,.75)",
                opacity: 0.07,
                transition: "opacity 70ms linear",
              }}
            />
            {/* glass reflection */}
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(112deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,.05) 24%, rgba(255,255,255,0) 40%)",
              }}
            />
          </div>
        </div>
      </div>
      <figcaption className="engrave mt-1.5 text-center font-mono text-[9px] uppercase tracking-[0.26em]">
        {label}
      </figcaption>
    </figure>
  );
}
