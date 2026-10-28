import raw from "../../ALLOY-PRODUCT-GLOSSARY.md?raw";

export const GLOSSARY_RAW = raw;

export type Domain = "signal" | "mix" | "colour" | "workflow" | "platform";

export type Term = {
  id: string;
  term: string;
  definition: string;
  domain: Domain;
  /** near-synonyms seen in older prose; the canonical term wins */
  avoid: string[];
  /** related canonical terms, by id */
  related: string[];
  /** which repo documents lean on this term */
  usedIn: string[];
};

export const DOMAINS: Record<Domain, { label: string; tone: string; blurb: string }> = {
  signal: { label: "Signal path", tone: "#5aa06a", blurb: "What audio flows through, and where it sums." },
  mix: { label: "Mix logic", tone: "#cf4436", blurb: "How MIX decides what wins, and what it may touch." },
  colour: { label: "Colour", tone: "#e8a454", blurb: "Two colour systems that must never be confused." },
  workflow: { label: "Workflow & data", tone: "#70879a", blurb: "Modes, effects behaviour and external data." },
  platform: { label: "Platform", tone: "#c9a15a", blurb: "What the later native build is, and is not." },
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^\w\s/-]/g, "").trim().replace(/[\s/]+/g, "-");

/** Hand-curated metadata keyed by term; definitions themselves come from the .md */
const META: Record<string, Omit<Term, "id" | "term" | "definition">> = {
  Track: {
    domain: "signal",
    avoid: ["stem", "channel", "clip", "lane", "audio file"],
    related: ["role", "priority", "send", "organizational-group"],
    usedIn: ["hardware-reference §7", "task template · SCOPE"],
  },
  "Organizational Group": {
    domain: "signal",
    avoid: ["folder", "folder track", "VCA", "group bus", "submix"],
    related: ["track", "organizational-color", "bus"],
    usedIn: ["hardware-reference §7"],
  },
  Bus: {
    domain: "signal",
    avoid: ["group", "submix", "aux", "stem bus", "summing track"],
    related: ["return-bus", "organizational-group", "send"],
    usedIn: ["hardware-reference §5 (orange)"],
  },
  "Return Bus": {
    domain: "signal",
    avoid: ["aux return", "FX track", "effect channel", "wet bus"],
    related: ["bus", "send", "wet-tail"],
    usedIn: ["hardware-reference §5 (green)"],
  },
  Role: {
    domain: "mix",
    avoid: ["part", "function", "type", "lead flag", "importance"],
    related: ["prominence-tier", "priority", "role-vs-prominence-tier"],
    usedIn: ["rulebook", "task template · glossary rule"],
  },
  "Prominence Tier": {
    domain: "mix",
    avoid: ["level", "tier", "importance", "foreground/background"],
    related: ["priority", "role", "role-vs-prominence-tier"],
    usedIn: ["mix conflicts", "masking resolution"],
  },
  Priority: {
    domain: "mix",
    avoid: ["weight", "rank", "importance score", "level"],
    related: ["prominence-tier", "role"],
    usedIn: ["mix conflicts"],
  },
  "Role vs Prominence Tier": {
    domain: "mix",
    avoid: ["lead = primary", "background role = background tier"],
    related: ["role", "prominence-tier", "priority"],
    usedIn: ["every task prompt"],
  },
  "Organizational Color": {
    domain: "colour",
    avoid: ["track color", "theme", "tint", "accent", "label color"],
    related: ["functional-color-coding", "organizational-group", "track"],
    usedIn: ["hardware-reference §7"],
  },
  "Functional Color Coding": {
    domain: "colour",
    avoid: ["knob color", "accent color", "track color", "skin"],
    related: ["organizational-color"],
    usedIn: ["hardware-reference §5", "task template · VISUAL"],
  },
  "Auto/Manual": {
    domain: "workflow",
    avoid: ["lock", "freeze", "override", "pin", "bypass"],
    related: ["send", "rulebook"],
    usedIn: ["MIX", "per-parameter UI"],
  },
  Send: {
    domain: "workflow",
    avoid: ["aux send", "FX send", "bus send level", "return level"],
    related: ["return-bus", "auto-manual", "wet-tail"],
    usedIn: ["hardware-reference §5 (green)"],
  },
  "Wet Tail": {
    domain: "workflow",
    avoid: ["reverb tail", "decay", "FX bleed", "ambience"],
    related: ["return-bus", "send"],
    usedIn: ["masking analysis"],
  },
  Rulebook: {
    domain: "workflow",
    avoid: ["preset", "template", "profile", "genre pack", "config"],
    related: ["auto-manual", "role"],
    usedIn: ["Section 9 fallback"],
  },
  "Native Port": {
    domain: "platform",
    avoid: ["desktop app", "JUCE build", "Electron app", "wrapper"],
    related: ["plugin-hosting"],
    usedIn: ["architecture.md (when it exists)"],
  },
  "Plugin Hosting": {
    domain: "platform",
    avoid: ["VST support", "plugins", "third-party FX"],
    related: ["native-port"],
    usedIn: ["deferred · not v1"],
  },
};

/** Parse "- **Term** — definition" bullets (also tolerates the unbolded dash form). */
function parse(md: string): Term[] {
  const out: Term[] = [];
  const bullets = md.split(/\n(?=- )/).filter((b) => b.trim().startsWith("- "));
  for (const b of bullets) {
    const text = b.replace(/\n\s+/g, " ").replace(/^- /, "").trim();
    const m = text.match(/^\*{0,2}([^*—]+?)\*{0,2}\s+—\s+([\s\S]+)$/);
    if (!m) continue;
    const term = m[1].trim();
    const meta = META[term] ?? {
      domain: "workflow" as Domain,
      avoid: [],
      related: [],
      usedIn: [],
    };
    out.push({ id: slug(term), term, definition: m[2].trim(), ...meta });
  }
  return out;
}

export const TERMS: Term[] = parse(raw);
export const byId = (id: string) => TERMS.find((t) => t.id === id);

/** Every near-synonym → the canonical term that should replace it. */
export const SYNONYMS: { avoid: string; canonical: Term }[] = TERMS.flatMap((t) =>
  t.avoid.map((a) => ({ avoid: a, canonical: t })),
).sort((a, b) => b.avoid.length - a.avoid.length);

/**
 * Lint a piece of prose: find near-synonyms that have a canonical term.
 * Returns matches with offsets so the UI can highlight them.
 */
export function lint(text: string) {
  const hits: { start: number; end: number; found: string; canonical: Term }[] = [];
  const canonicalWords = new Set(TERMS.map((t) => t.term.toLowerCase()));
  for (const { avoid, canonical } of SYNONYMS) {
    if (canonicalWords.has(avoid.toLowerCase())) continue;
    const re = new RegExp(`(?<![\\w-])${avoid.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![\\w-])`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ start, end, found: m[0], canonical });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Verbs / modes that flag a concept but can't be swapped in-place as a noun. */
const FLAG_ONLY = new Set(["tint", "lock", "freeze", "override", "pin", "bypass", "theme", "skin", "accent"]);

export function rewrite(text: string) {
  const hits = lint(text);
  let out = "";
  let i = 0;
  for (const h of hits) {
    if (FLAG_ONLY.has(h.found.toLowerCase())) continue;
    out += text.slice(i, h.start) + h.canonical.term;
    i = h.end;
  }
  // fix the article in front of a swapped-in vowel-initial term ("a Organizational Group")
  return (out + text.slice(i)).replace(/\b([Aa]) (?=[AEIOU][a-z])/g, (_, a) => `${a}n `);
}

export const isFlagOnly = (found: string) => FLAG_ONLY.has(found.toLowerCase());
