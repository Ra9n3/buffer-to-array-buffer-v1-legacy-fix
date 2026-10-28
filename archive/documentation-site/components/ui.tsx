import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ reveal */

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error generic element ref
      ref={ref}
      className={cn("reveal", shown && "is-in", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------- panel */

export function Panel({
  children,
  className,
  screws = true,
  light = false,
}: {
  children: ReactNode;
  className?: string;
  screws?: boolean;
  light?: boolean;
}) {
  return (
    <div
      className={cn(
        "grain relative overflow-hidden rounded-[3px] border border-black/60",
        light ? "face-light" : "face",
        className,
      )}
    >
      {screws && (
        <>
          <Screw className="left-2 top-2" rot={24} />
          <Screw className="right-2 top-2" rot={-62} />
          <Screw className="bottom-2 left-2" rot={78} />
          <Screw className="bottom-2 right-2" rot={-18} />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function Screw({ className, rot = 30 }: { className?: string; rot?: number }) {
  return (
    <span
      aria-hidden
      className={cn("screw", className)}
      style={{ ["--slot" as string]: `${rot}deg` }}
    />
  );
}

/* ------------------------------------------------------------- engraved text */

export function Legend({
  children,
  className,
  size = "sm",
}: {
  children: ReactNode;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={cn(
        "engrave font-mono uppercase tracking-[0.22em]",
        size === "xs" ? "text-[9px]" : "text-[10.5px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHead({
  index,
  title,
  lede,
  tone = "#c9a15a",
  right,
}: {
  index: string;
  title: string;
  lede?: ReactNode;
  tone?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] font-mono text-[11px] font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_2px_6px_rgba(0,0,0,.6)]"
            style={{ background: tone }}
          >
            {index}
          </span>
          <span
            className="h-px flex-none w-8"
            style={{ background: "linear-gradient(90deg,#c9a15a,transparent)" }}
          />
        </div>
        <h2 className="font-display mt-3 text-[clamp(2rem,5.2vw,3.6rem)] leading-[0.92] font-bold uppercase text-[#f4ecdb]">
          {title}
        </h2>
        {lede && (
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-[#b3a892]">{lede}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ misc bits */

export function Hairline({ className }: { className?: string }) {
  return <div className={cn("hairline h-px w-full opacity-50", className)} />;
}

export function Lamp({
  on,
  tone = "#e8a454",
  size = 9,
  className,
}: {
  on: boolean;
  tone?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-full transition-all duration-150"
        style={{
          background: on
            ? `radial-gradient(circle at 35% 30%, #fff8e6, ${tone} 46%, rgba(0,0,0,.35))`
            : "radial-gradient(circle at 35% 30%, #4a4239, #211d18 62%, #15120f)",
          boxShadow: on
            ? `0 0 6px 1px ${tone}b3, 0 0 14px 4px ${tone}4d, inset 0 0 2px rgba(255,255,255,.7)`
            : "inset 0 1px 2px rgba(0,0,0,.8)",
        }}
      />
      {/* glass lens highlight, present whether lit or dark */}
      <span className="absolute left-[22%] top-[16%] h-[22%] w-[26%] rounded-full bg-white/45 blur-[0.6px]" />
    </span>
  );
}
