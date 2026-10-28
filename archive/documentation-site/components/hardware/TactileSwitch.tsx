import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { Lamp } from "../ui";

/**
 * §2 — Tactile square switch, one component with two labelling conventions.
 *  Variant A: glossy chrome cap, label printed on the cap.
 *  Variant B: matte cap inset in a recessed well, function label above /
 *             value label below, engaged state carried by an adjacent lamp.
 * No pill toggles, no material checkboxes — a physical push-button keycap.
 */

export type TactileSwitchProps = {
  variant?: "A" | "B";
  label: string;
  value?: string;
  engaged?: boolean;
  onToggle?: (next: boolean) => void;
  lampTone?: string;
  size?: number;
  disabled?: boolean;
  className?: string;
  hint?: string;
};

export function TactileSwitch({
  variant = "B",
  label,
  value,
  engaged = false,
  onToggle,
  lampTone = "#cf4436",
  size = 46,
  disabled = false,
  className,
  hint,
}: TactileSwitchProps) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const radius = Math.round(size * 0.18); // 15–20% of width, not fully round

  useEffect(() => {
    if (!pressed) return;
    const up = () => setPressed(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [pressed]);

  // Pressed = cap sinks. Engaged = the lamp carries the signal, not the cap (§2).
  const sink = pressed;

  const capStyle: React.CSSProperties =
    variant === "A"
      ? {
          borderRadius: radius,
          background: sink
            ? "linear-gradient(148deg,#8f8a82 0%,#6d6862 30%,#4b463f 68%,#2c2823 100%)"
            : "linear-gradient(148deg,#eceae4 0%,#b9b4ab 24%,#807a71 52%,#4f4941 78%,#292521 100%)",
          boxShadow: sink
            ? "inset 0 2px 4px rgba(0,0,0,.72), inset 0 -1px 0 rgba(255,255,255,.14), 0 1px 0 rgba(255,255,255,.05)"
            : `0 ${engaged ? 2 : 4}px 0 #17140f, 0 ${engaged ? 4 : 9}px 12px -2px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.6)`,
          transform: sink ? "translateY(2px) scale(.978)" : "none",
        }
      : {
          borderRadius: radius,
          background: sink
            ? "linear-gradient(158deg,#4c473f,#39342e 62%,#241f1a)"
            : "linear-gradient(158deg,#7b746a,#575049 58%,#39332c)",
          boxShadow: sink
            ? "inset 0 2px 5px rgba(0,0,0,.8), inset 0 -1px 0 rgba(255,255,255,.08)"
            : "inset 0 1px 0 rgba(255,255,255,.26), inset 0 -2px 3px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.05)",
          transform: sink ? "translateY(1.5px) scale(.982)" : "none",
        };

  const gloss =
    variant === "A"
      ? {
          background:
            "radial-gradient(140% 110% at 26% 14%, rgba(255,255,255,.9), rgba(255,255,255,.2) 34%, rgba(255,255,255,0) 62%)",
          opacity: sink ? 0.22 : 0.75,
          borderRadius: radius,
        }
      : {
          background:
            "radial-gradient(120% 90% at 30% 12%, rgba(255,255,255,.34), rgba(255,255,255,0) 58%)",
          opacity: sink ? 0.12 : 0.4,
          borderRadius: radius,
        };

  return (
    <div className={cn("flex select-none flex-col items-center gap-1.5", className)}>
      {variant === "B" && (
        <span className="engrave font-mono text-[9.5px] tracking-[0.24em] uppercase">{label}</span>
      )}

      <div className="flex items-center gap-2.5">
        <button
          ref={btn}
          type="button"
          disabled={disabled}
          aria-pressed={engaged}
          aria-label={label}
          onPointerDown={() => !disabled && setPressed(true)}
          onClick={() => !disabled && onToggle?.(!engaged)}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle?.(!engaged);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "relative grid place-items-center transition-all duration-100 outline-none",
            disabled && "pointer-events-none opacity-60 saturate-[0.12]",
          )}
          style={{ width: size, height: size }}
        >
          {/* recessed square well (variant B) — the switch sits below the panel surface */}
          {variant === "B" && (
            <span
              className="well absolute -inset-[7px]"
              style={{ borderRadius: radius + 5 }}
              aria-hidden
            >
              <span
                className="absolute inset-0"
                style={{
                  borderRadius: radius + 5,
                  boxShadow:
                    "inset 0 0 0 1px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              />
            </span>
          )}

          <span
            className="absolute inset-0"
            style={capStyle}
            aria-hidden
          />
          <span className="absolute inset-0 overflow-hidden" style={gloss} aria-hidden />
          {/* side wall of the keycap */}
          <span
            className="absolute inset-x-0 bottom-0 h-[26%]"
            style={{
              borderRadius: `0 0 ${radius}px ${radius}px`,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.42))",
              opacity: sink ? 0.7 : 0.95,
            }}
            aria-hidden
          />
          {focused && !disabled && (
            <span
              className="absolute -inset-[9px] rounded-[4px] border border-dashed border-amberlite/90"
              aria-hidden
            />
          )}
          {variant === "A" && (
            <span
              className={cn(
                "relative font-mono text-[9.5px] font-semibold tracking-[0.18em] uppercase",
                sink ? "text-[#c8bda6]" : "inkprint",
              )}
            >
              {label}
            </span>
          )}
        </button>

        {/* engaged lamp: small, amber/red regardless of function colour */}
        <Lamp on={engaged} tone={lampTone} size={variant === "A" ? 8 : 9} />
      </div>

      {variant === "B" ? (
        <span
          className={cn(
            "font-mono text-[9.5px] tracking-[0.16em] uppercase transition-colors",
            engaged ? "text-amberlite" : "text-[#8b8371]",
          )}
        >
          {value ?? "—"}
        </span>
      ) : (
        value && (
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-[#8b8371] uppercase">
            {value}
          </span>
        )
      )}
      {hint && (
        <span className="max-w-[10ch] text-center font-mono text-[8px] leading-tight tracking-[0.12em] text-[#6d6659] uppercase">
          {hint}
        </span>
      )}
    </div>
  );
}
