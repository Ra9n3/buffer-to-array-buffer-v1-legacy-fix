import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import raw from "../../ALLOY-HARDWARE-REFERENCE-SPEC.md?raw";
import { cn } from "../utils/cn";
import { Legend, Panel, Reveal } from "./ui";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export function SpecDoc() {
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");

  const headings = useMemo(
    () =>
      raw
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .map((l) => {
          const text = l.replace("## ", "").trim();
          return { text, id: slug(text) };
        }),
    [],
  );

  const lines = raw.split("\n").length;
  const bytes = new Blob([raw]).size;

  const shown = useMemo(() => {
    if (!filter.trim()) return null;
    const q = filter.toLowerCase();
    const blocks = raw.split(/\n(?=## )/);
    return blocks.filter((b) => b.toLowerCase().includes(q)).join("\n\n");
  }, [filter]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = raw;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([raw], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ALLOY-HARDWARE-REFERENCE-SPEC.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="spec" className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8">
      <Reveal>
        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
          <div>
            <Legend className="text-amberlite">the file in the repo</Legend>
            <h2 className="font-display mt-2 text-[clamp(2.1rem,5.4vw,3.9rem)] leading-[0.9] font-bold uppercase text-[#f4ecdb]">
              ALLOY-HARDWARE-
              <br />
              <span className="text-[#9a9284]">REFERENCE-SPEC.md</span>
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-[#a89e8a]">
            Screenshots and photos could not be attached to build prompts, so the hardware detail
            lives here as text. Every Phase 1 task reads this file first. When a detail is unclear,
            the more <em className="text-amberlite not-italic">physical hardware</em> reading wins
            over the more flat-UI reading — always.
          </p>
        </div>
      </Reveal>

      <Panel className="mb-6 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {[
            ["path", "./ALLOY-HARDWARE-REFERENCE-SPEC.md"],
            ["size", `${(bytes / 1024).toFixed(1)} KB · ${lines} lines`],
            ["sections", `${headings.length} numbered parts`],
            ["status", "read before implementing"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-[9rem]">
              <div className="font-mono text-[8.5px] tracking-[0.26em] text-[#7b7365] uppercase">
                {k}
              </div>
              <div className="mt-1 font-mono text-[11.5px] text-[#d8cdb6]">{v}</div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "rendered" ? "raw" : "rendered")}
              className="rounded-[2px] border border-brass/45 bg-brass/12 px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] text-[#e7d3ab] uppercase transition-colors hover:bg-brass/22"
            >
              {mode === "rendered" ? "show raw md" : "show rendered"}
            </button>
            <button
              type="button"
              onClick={copy}
              className={cn(
                "rounded-[2px] border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-colors",
                copied
                  ? "border-cgreen/60 bg-cgreen/18 text-[#bfe6c6]"
                  : "border-white/15 bg-black/25 text-[#a89e8a] hover:text-[#e5dbc6]",
              )}
            >
              {copied ? "copied to clipboard" : "copy markdown"}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-[2px] border border-white/15 bg-black/25 px-3 py-1.5 font-mono text-[9.5px] tracking-[0.18em] text-[#a89e8a] uppercase transition-colors hover:text-[#e5dbc6]"
            >
              download
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="mb-6 grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-7">
        <div>
          <Legend className="mb-3 block text-brass">repository layout</Legend>
          <pre className="overflow-x-auto rounded-[2px] border border-white/8 bg-black/40 p-4 font-mono text-[11px] leading-[1.8] text-[#c1b7a1]">
{`alloy-hardware-spec/
├── ALLOY-HARDWARE-REFERENCE-SPEC.md   ← you are reading it
├── README.md
├── .gitignore
└── src/
    ├── components/hardware/
    │   ├── Knob.tsx          §1  rotary pot
    │   ├── TactileSwitch.tsx §2  square switch (A/B)
    │   ├── Fader.tsx         §3  finger-hollow cap
    │   ├── VUMeter.tsx       §4a lamp-lit VU
    │   └── LedLadder.tsx     §4b segment ladder
    └── lib/signal.ts         shared program source`}
          </pre>
        </div>
        <div>
          <Legend className="mb-3 block text-brass">history</Legend>
          <ul className="space-y-2">
            {[
              ["docs", "add ALLOY hardware reference specification", "7 sections · 225 lines"],
              ["playground", "implement §1–§4 components against the spec", "knob · switch · fader · meters"],
              ["colour", "wire §5 functional + §7 organisational markers", "channel strip demo"],
            ].map(([kind, msg, meta]) => (
              <li
                key={msg}
                className="group flex items-baseline gap-3 rounded-[2px] border border-white/8 bg-black/28 px-3 py-2 transition-colors hover:border-brass/40"
              >
                <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-brass/80 shadow-[0_0_6px_rgba(201,161,90,.7)] transition-transform group-hover:scale-125" />
                <span className="min-w-0">
                  <span className="font-mono text-[10px] tracking-[0.14em] text-amberlite uppercase">
                    {kind}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-[#cec3ac]">{msg}</span>
                  <span className="block font-mono text-[9px] tracking-[0.12em] text-[#6b6458] uppercase">
                    {meta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.82rem] leading-relaxed text-[#a89e8a]">
            The markdown in this repo is the source of truth for the whole build — the rendered
            sheet on the right is generated straight from{" "}
            <code className="font-mono text-[11px] text-amberlite">ALLOY-HARDWARE-REFERENCE-SPEC.md</code>,
            so the document and the demo can never drift apart.
          </p>
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Legend size="xs" className="mb-3 block text-brass">
              contents
            </Legend>
            <nav className="space-y-0.5">
              {headings.map((h, i) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className="group flex items-baseline gap-2.5 rounded-[2px] px-2 py-1.5 font-mono text-[10px] leading-snug tracking-[0.06em] text-[#8d8574] transition-colors hover:bg-white/4 hover:text-amberlite"
                >
                  <span className="text-[9px] text-brass/70 group-hover:text-amberlite">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="uppercase">{h.text.replace(/^\d+\.\s*/, "")}</span>
                </a>
              ))}
            </nav>
            <div className="mt-6 border-t border-white/8 pt-4">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter sections…"
                aria-label="Filter specification sections"
                className="w-full rounded-[2px] border border-white/12 bg-black/35 px-2.5 py-1.5 font-mono text-[10.5px] text-[#e0d6c0] uppercase placeholder:text-[#6b6458] placeholder:normal-case focus:border-amber/60 focus:outline-none"
              />
            </div>
          </div>
        </aside>

        <Panel className="p-5 sm:p-8 lg:p-10" light={false}>
          {mode === "rendered" ? (
            <article className="spec-prose">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node: _node, ...p }) => (
                    <h2
                      {...p}
                      className="font-display !mt-0 !text-[clamp(2rem,4.4vw,3rem)] !normal-case"
                    />
                  ),
                  h2: ({ children, ...p }) => {
                    const text = typeof children === "string" ? children : String(children ?? "");
                    return <h2 id={slug(text)} {...p}>{children}</h2>;
                  },
                  a: (p) => <a className="text-amberlite underline" {...p} />,
                }}
              >
                {shown ?? raw}
              </Markdown>
              {shown !== null && !shown.trim() && (
                <p className="font-mono text-[11px] tracking-[0.15em] text-[#8d8574] uppercase">
                  no section matches “{filter}”
                </p>
              )}
            </article>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-[2px] border border-white/8 bg-black/40 p-5 font-mono text-[11.5px] leading-[1.7] whitespace-pre-wrap text-[#c9bfa9]">
              {raw.split("\n").map((line, i) => (
                <span key={i} className="block">
                  <span className="mr-4 inline-block w-8 select-none text-right text-[#514a3f]">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      line.startsWith("#") && "text-amberlite",
                      line.startsWith("-") && "text-[#a8bfae]",
                    )}
                  >
                    {line || " "}
                  </span>
                </span>
              ))}
            </pre>
          )}
        </Panel>
      </div>
    </section>
  );
}
