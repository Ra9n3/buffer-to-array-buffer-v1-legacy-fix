/**
 * ALLOY design token registry — Task 1.1.
 *
 * METADATA ONLY. No colour, spacing or type VALUE appears in this file; every
 * value lives in `src/lib/tokens.css`, which is the single authoritative source.
 * This module exists so the /dev/components playground can render every token
 * with a human label, a purpose, and its provenance, and so a structural check
 * can prove the registry and the stylesheet describe the same set of tokens.
 *
 * The playground reads each token's actual value from the live document with
 * `readTokenValues()` below, so what the owner sees on screen is what the CSS
 * computes — never a second copy that could drift.
 *
 * Do not add a value here. Add it to tokens.css first, then register it here;
 * `npm run check:tokens` fails if you do one without the other.
 */

export type TokenCategory =
  | "colour-material"
  | "colour-text"
  | "colour-border"
  | "colour-function"
  | "colour-org"
  | "spacing"
  | "typography";

export interface TokenDef {
  /** The CSS custom property name, exactly as declared in tokens.css. */
  readonly name: string;
  /** Human label shown on the playground. */
  readonly label: string;
  readonly category: TokenCategory;
  /** What the token is for, in the owner's terms. */
  readonly usage: string;
  /** Where the value comes from: the governing document, or the adopted palette. */
  readonly source: string;
  /** Functional colours only: which family and which cap role. */
  readonly family?: string;
  readonly familyLabel?: string;
  readonly applies?: string;
  readonly role?: "base" | "hi" | "lo" | "ink";
}

export interface CategoryDef {
  readonly id: TokenCategory;
  readonly title: string;
  readonly blurb: string;
}

/**
 * Section order and copy for the playground. Every category here must contain at
 * least one token, and every token must belong to one of these.
 */
export const TOKEN_CATEGORIES: readonly CategoryDef[] = [
  {
    id: "colour-material",
    title: "Colour — panel & material",
    blurb:
      "The physical substance of the console: cabinet, control surface, face plates, recessed wells, metal trim and walnut. Plan §4 names warm near-black and dark grey-green surfaces, cream meter faces and a warm lamp; §4a of the hardware spec fixes the lamp range.",
  },
  {
    id: "colour-text",
    title: "Colour — text",
    blurb:
      "Two separate roles. Engraved lettering is dark fill plus a lighter cut edge, so it reads as machined into the panel. Interface text is warm off-white and stays readable at dense sizes.",
  },
  {
    id: "colour-border",
    title: "Colour — borders & separators",
    blurb:
      "Panel bevels and division lines. A bevel is a light top edge against a shadowed bottom edge; using one without the other reads as a flat outline.",
  },
  {
    id: "colour-function",
    title: "Colour — functional",
    blurb:
      "Plan §4 and hardware spec §5 assign six families to six kinds of control. Each family carries four roles: a cap mid tone, a radial highlight and shade for the dome, and an ink colour for the pointer and printed value.",
  },
  {
    id: "colour-org",
    title: "Colour — organisational",
    blurb:
      "Identity markers for tracks and groups, not control colours (hardware spec §7). Nine entries: eight swatches plus the Unassigned/Neutral state, inside the plan's 24-swatch cap.",
  },
  {
    id: "spacing",
    title: "Spacing",
    blurb:
      "One scale for dense control surfaces and readable supporting content. Pixels, not rem: these are panel dimensions and must not rescale with the user's text size.",
  },
  {
    id: "typography",
    title: "Typography",
    blurb:
      "Two clearly different voices, per plan §4: a compact industrial condensed face for engraved labels, and a highly readable face for anything a user actually reads. No web fonts are loaded — the build must work offline — so both resolve through the OS.",
  },
];

/** Every design token. Ordered as declared in tokens.css. */
export const TOKENS: readonly TokenDef[] = [
  { name: "--al-material-panel", label: "Panel", category: "colour-material", usage: "Base cabinet colour. Warm near-black, brown-leaning rather than neutral.", source: "Plan §4" },
  { name: "--al-material-surface", label: "Control surface", category: "colour-material", usage: "Dark grey-green module bay, between the cabinet and a face plate.", source: "Plan §4" },
  { name: "--al-material-surface-raised", label: "Raised face plate", category: "colour-material", usage: "One step lighter than the control surface, so a bevel has something to read against.", source: "Plan §4" },
  { name: "--al-material-recess", label: "Recessed well", category: "colour-material", usage: "Meter windows, switch wells, inset bays. Darker because it sits in shadow.", source: "Plan §4" },
  { name: "--al-material-metal", label: "Brushed metal", category: "colour-material", usage: "Restrained metal accents only: edge trim, screw heads.", source: "Plan §4" },
  { name: "--al-material-metal-shadow", label: "Brushed metal, shadowed", category: "colour-material", usage: "Shadowed metal edges and the lower half of a metal bevel.", source: "Plan §4" },
  { name: "--al-material-wood", label: "Walnut trim", category: "colour-material", usage: "Side trim. The walnut reading of the plan's walnut/rosewood.", source: "Plan §4" },
  { name: "--al-material-cream", label: "Cream meter face", category: "colour-material", usage: "Recessed meter windows with cream faces.", source: "Plan §4" },
  { name: "--al-material-lamp", label: "Incandescent lamp", category: "colour-material", usage: "Warm amber lamp glow for meters and engaged indicators; must bloom softly, never a crisp LED outline.", source: "Spec §4a" },
  { name: "--al-accent-stripe", label: "Accent stripe", category: "colour-material", usage: "The recurring console accent stripe. Shares the orange functional family.", source: "Plan §4" },
  { name: "--al-text-primary", label: "Primary text", category: "colour-text", usage: "Warm off-white interface text on dark material. Never pure white.", source: "Plan §4" },
  { name: "--al-text-secondary", label: "Secondary text", category: "colour-text", usage: "Supporting copy, values, units.", source: "Plan §4" },
  { name: "--al-text-muted", label: "Muted text", category: "colour-text", usage: "De-emphasised metadata and placeholder copy.", source: "Plan §4" },
  { name: "--al-text-engraved", label: "Engraved label fill", category: "colour-text", usage: "Dark fill of lettering cut into the panel. Always paired with the highlight.", source: "Plan §4" },
  { name: "--al-text-engraved-highlight", label: "Engraved highlight", category: "colour-text", usage: "The 1px lighter edge that makes lettering read as cut rather than printed.", source: "Plan §4" },
  { name: "--al-text-on-cream", label: "Text on cream", category: "colour-text", usage: "Text sitting on a cream surface: meter faces, cream caps.", source: "Plan §4" },
  { name: "--al-border-strong", label: "Strong border", category: "colour-border", usage: "Structural border between major modules.", source: "Plan §4" },
  { name: "--al-border-subtle", label: "Subtle border", category: "colour-border", usage: "Border between adjacent controls or rows.", source: "Plan §4" },
  { name: "--al-separator", label: "Separator", category: "colour-border", usage: "Hairline engraved division line.", source: "Plan §4" },
  { name: "--al-bevel-light", label: "Bevel light", category: "colour-border", usage: "Lit top edge where a raised surface catches light.", source: "Plan §4" },
  { name: "--al-bevel-shadow", label: "Bevel shadow", category: "colour-border", usage: "Shadowed bottom edge of the same bevel.", source: "Plan §4" },
  { name: "--al-function-cream-base", label: "Cream / off-white — base", category: "colour-function", usage: "Input trim and gain staging, fader caps. Mid tone of the control cap", source: "Spec §5", family: "cream", familyLabel: "Cream / off-white", applies: "Input trim and gain staging, fader caps", role: "base" },
  { name: "--al-function-cream-hi", label: "Cream / off-white — hi", category: "colour-function", usage: "Input trim and gain staging, fader caps. Upper-left radial highlight on the cap", source: "Spec §5", family: "cream", familyLabel: "Cream / off-white", applies: "Input trim and gain staging, fader caps", role: "hi" },
  { name: "--al-function-cream-lo", label: "Cream / off-white — lo", category: "colour-function", usage: "Input trim and gain staging, fader caps. Lower-right radial shade on the cap", source: "Spec §5", family: "cream", familyLabel: "Cream / off-white", applies: "Input trim and gain staging, fader caps", role: "lo" },
  { name: "--al-function-cream-ink", label: "Cream / off-white — ink", category: "colour-function", usage: "Input trim and gain staging, fader caps. Pointer and printed value on top of the cap", source: "Spec §5", family: "cream", familyLabel: "Cream / off-white", applies: "Input trim and gain staging, fader caps", role: "ink" },
  { name: "--al-function-amber-base", label: "Amber / gold — base", category: "colour-function", usage: "EQ and tonal controls. Mid tone of the control cap", source: "Spec §5", family: "amber", familyLabel: "Amber / gold", applies: "EQ and tonal controls", role: "base" },
  { name: "--al-function-amber-hi", label: "Amber / gold — hi", category: "colour-function", usage: "EQ and tonal controls. Upper-left radial highlight on the cap", source: "Spec §5", family: "amber", familyLabel: "Amber / gold", applies: "EQ and tonal controls", role: "hi" },
  { name: "--al-function-amber-lo", label: "Amber / gold — lo", category: "colour-function", usage: "EQ and tonal controls. Lower-right radial shade on the cap", source: "Spec §5", family: "amber", familyLabel: "Amber / gold", applies: "EQ and tonal controls", role: "lo" },
  { name: "--al-function-amber-ink", label: "Amber / gold — ink", category: "colour-function", usage: "EQ and tonal controls. Pointer and printed value on top of the cap", source: "Spec §5", family: "amber", familyLabel: "Amber / gold", applies: "EQ and tonal controls", role: "ink" },
  { name: "--al-function-red-base", label: "Red — base", category: "colour-function", usage: "Compression and dynamics. Mid tone of the control cap", source: "Spec §5", family: "red", familyLabel: "Red", applies: "Compression and dynamics", role: "base" },
  { name: "--al-function-red-hi", label: "Red — hi", category: "colour-function", usage: "Compression and dynamics. Upper-left radial highlight on the cap", source: "Spec §5", family: "red", familyLabel: "Red", applies: "Compression and dynamics", role: "hi" },
  { name: "--al-function-red-lo", label: "Red — lo", category: "colour-function", usage: "Compression and dynamics. Lower-right radial shade on the cap", source: "Spec §5", family: "red", familyLabel: "Red", applies: "Compression and dynamics", role: "lo" },
  { name: "--al-function-red-ink", label: "Red — ink", category: "colour-function", usage: "Compression and dynamics. Pointer and printed value on top of the cap", source: "Spec §5", family: "red", familyLabel: "Red", applies: "Compression and dynamics", role: "ink" },
  { name: "--al-function-bluegrey-base", label: "Blue-grey — base", category: "colour-function", usage: "Pan, stereo image, spatial placement. Mid tone of the control cap", source: "Spec §5", family: "bluegrey", familyLabel: "Blue-grey", applies: "Pan, stereo image, spatial placement", role: "base" },
  { name: "--al-function-bluegrey-hi", label: "Blue-grey — hi", category: "colour-function", usage: "Pan, stereo image, spatial placement. Upper-left radial highlight on the cap", source: "Spec §5", family: "bluegrey", familyLabel: "Blue-grey", applies: "Pan, stereo image, spatial placement", role: "hi" },
  { name: "--al-function-bluegrey-lo", label: "Blue-grey — lo", category: "colour-function", usage: "Pan, stereo image, spatial placement. Lower-right radial shade on the cap", source: "Spec §5", family: "bluegrey", familyLabel: "Blue-grey", applies: "Pan, stereo image, spatial placement", role: "lo" },
  { name: "--al-function-bluegrey-ink", label: "Blue-grey — ink", category: "colour-function", usage: "Pan, stereo image, spatial placement. Pointer and printed value on top of the cap", source: "Spec §5", family: "bluegrey", familyLabel: "Blue-grey", applies: "Pan, stereo image, spatial placement", role: "ink" },
  { name: "--al-function-green-base", label: "Green — base", category: "colour-function", usage: "Sends, auxiliary paths, reverb/delay. Mid tone of the control cap", source: "Spec §5", family: "green", familyLabel: "Green", applies: "Sends, auxiliary paths, reverb/delay", role: "base" },
  { name: "--al-function-green-hi", label: "Green — hi", category: "colour-function", usage: "Sends, auxiliary paths, reverb/delay. Upper-left radial highlight on the cap", source: "Spec §5", family: "green", familyLabel: "Green", applies: "Sends, auxiliary paths, reverb/delay", role: "hi" },
  { name: "--al-function-green-lo", label: "Green — lo", category: "colour-function", usage: "Sends, auxiliary paths, reverb/delay. Lower-right radial shade on the cap", source: "Spec §5", family: "green", familyLabel: "Green", applies: "Sends, auxiliary paths, reverb/delay", role: "lo" },
  { name: "--al-function-green-ink", label: "Green — ink", category: "colour-function", usage: "Sends, auxiliary paths, reverb/delay. Pointer and printed value on top of the cap", source: "Spec §5", family: "green", familyLabel: "Green", applies: "Sends, auxiliary paths, reverb/delay", role: "ink" },
  { name: "--al-function-orange-base", label: "Orange — base", category: "colour-function", usage: "Bus/group masters, recurring console accent stripe. Mid tone of the control cap", source: "Spec §5", family: "orange", familyLabel: "Orange", applies: "Bus/group masters, recurring console accent stripe", role: "base" },
  { name: "--al-function-orange-hi", label: "Orange — hi", category: "colour-function", usage: "Bus/group masters, recurring console accent stripe. Upper-left radial highlight on the cap", source: "Spec §5", family: "orange", familyLabel: "Orange", applies: "Bus/group masters, recurring console accent stripe", role: "hi" },
  { name: "--al-function-orange-lo", label: "Orange — lo", category: "colour-function", usage: "Bus/group masters, recurring console accent stripe. Lower-right radial shade on the cap", source: "Spec §5", family: "orange", familyLabel: "Orange", applies: "Bus/group masters, recurring console accent stripe", role: "lo" },
  { name: "--al-function-orange-ink", label: "Orange — ink", category: "colour-function", usage: "Bus/group masters, recurring console accent stripe. Pointer and printed value on top of the cap", source: "Spec §5", family: "orange", familyLabel: "Orange", applies: "Bus/group masters, recurring console accent stripe", role: "ink" },
  { name: "--al-org-1", label: "Organisational swatch 1", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-2", label: "Organisational swatch 2", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-3", label: "Organisational swatch 3", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-4", label: "Organisational swatch 4", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-5", label: "Organisational swatch 5", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-6", label: "Organisational swatch 6", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-7", label: "Organisational swatch 7", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-8", label: "Organisational swatch 8", category: "colour-org", usage: "Track/group identity marker only. Never used as a control colour.", source: "Plan §5b" },
  { name: "--al-org-neutral", label: "Organisational neutral", category: "colour-org", usage: "The Unassigned/Neutral state. New tracks start here.", source: "Plan §5b" },
  { name: "--al-space-3xs", label: "Spacing 3XS", category: "spacing", usage: "Hairline inset, engraved rule offset", source: "Plan §4" },
  { name: "--al-space-2xs", label: "Spacing 2XS", category: "spacing", usage: "Gap inside a control cluster", source: "Plan §4" },
  { name: "--al-space-xs", label: "Spacing XS", category: "spacing", usage: "Control-to-label gap", source: "Plan §4" },
  { name: "--al-space-sm", label: "Spacing SM", category: "spacing", usage: "Padding inside a control well", source: "Plan §4" },
  { name: "--al-space-md", label: "Spacing MD", category: "spacing", usage: "Module inner padding", source: "Plan §4" },
  { name: "--al-space-lg", label: "Spacing LG", category: "spacing", usage: "Gap between modules", source: "Plan §4" },
  { name: "--al-space-xl", label: "Spacing XL", category: "spacing", usage: "Section separation", source: "Plan §4" },
  { name: "--al-space-2xl", label: "Spacing 2XL", category: "spacing", usage: "Room-level padding", source: "Plan §4" },
  { name: "--al-space-3xl", label: "Spacing 3XL", category: "spacing", usage: "Major vertical rhythm", source: "Plan §4" },
  { name: "--al-font-label", label: "Label family", category: "typography", usage: "Compact industrial condensed grotesque for engraved hardware labels.", source: "Plan §4" },
  { name: "--al-font-ui", label: "Interface family", category: "typography", usage: "Readable text for explanations, values and supporting copy.", source: "Plan §4" },
  { name: "--al-font-mono", label: "Mono family", category: "typography", usage: "Tabular numbers: time readouts, positions, numeric entry.", source: "Plan §4" },
  { name: "--al-text-size-2xs", label: "Text size 2XS", category: "typography", usage: "Micro print, tick numerals", source: "Plan §4" },
  { name: "--al-text-size-xs", label: "Text size XS", category: "typography", usage: "Control labels, dense metadata", source: "Plan §4" },
  { name: "--al-text-size-sm", label: "Text size SM", category: "typography", usage: "Secondary interface text", source: "Plan §4" },
  { name: "--al-text-size-md", label: "Text size MD", category: "typography", usage: "Default control text", source: "Plan §4" },
  { name: "--al-text-size-base", label: "Text size base", category: "typography", usage: "Body text", source: "Plan §4" },
  { name: "--al-text-size-lg", label: "Text size LG", category: "typography", usage: "Sub-headings", source: "Plan §4" },
  { name: "--al-text-size-xl", label: "Text size XL", category: "typography", usage: "Section headings", source: "Plan §4" },
  { name: "--al-text-size-2xl", label: "Text size 2XL", category: "typography", usage: "Room titles", source: "Plan §4" },
  { name: "--al-font-weight-regular", label: "Weight regular", category: "typography", usage: "Body copy and long supporting text", source: "Plan §4" },
  { name: "--al-font-weight-medium", label: "Weight medium", category: "typography", usage: "Dense labels needing a little more presence", source: "Plan §4" },
  { name: "--al-font-weight-semibold", label: "Weight semibold", category: "typography", usage: "Control labels", source: "Plan §4" },
  { name: "--al-font-weight-bold", label: "Weight bold", category: "typography", usage: "Engraved panel labels and headings", source: "Plan §4" },
  { name: "--al-font-weight-black", label: "Weight black", category: "typography", usage: "Wordmark and the strongest headings", source: "Plan §4" },
  { name: "--al-line-height-tight", label: "Line height tight", category: "typography", usage: "Single-line engraved labels", source: "Plan §4" },
  { name: "--al-line-height-snug", label: "Line height snug", category: "typography", usage: "Dense multi-line metadata", source: "Plan §4" },
  { name: "--al-line-height-normal", label: "Line height normal", category: "typography", usage: "Body copy", source: "Plan §4" },
  { name: "--al-letter-spacing-engraved", label: "Letter spacing engraved", category: "typography", usage: "Small all-caps panel labels", source: "Plan §4" },
  { name: "--al-letter-spacing-label", label: "Letter spacing label", category: "typography", usage: "Medium all-caps labels", source: "Plan §4" },
  { name: "--al-letter-spacing-normal", label: "Letter spacing normal", category: "typography", usage: "Body text", source: "Plan §4" },
  { name: "--al-letter-spacing-tight", label: "Letter spacing tight", category: "typography", usage: "Large headings", source: "Plan §4" },
];

export const FUNCTION_ROLE_ORDER = ["base", "hi", "lo", "ink"] as const;

/**
 * The six functional colour families from plan §4 / hardware spec §5.
 *
 * Declared here, next to the token registry that already carries each family's
 * meaning, so a component never has to invent or repeat a family list.
 */
export type FunctionFamily =
  | "cream"
  | "amber"
  | "red"
  | "bluegrey"
  | "green"
  | "orange";

export type FunctionRole = (typeof FUNCTION_ROLE_ORDER)[number];

/**
 * `var()` reference for one role of one functional family, e.g.
 * `functionToken("red", "hi")` → `var(--al-function-red-hi)`.
 *
 * Components must use this (or an inline `var(--al-function-…)`) rather than
 * copying a hex value, so a palette change is still a one-file edit.
 */
export function functionToken(family: FunctionFamily, role: FunctionRole): string {
  return `var(--al-function-${family}-${role})`;
}

/** Tokens in one category, in declaration order. */
export function tokensInCategory(category: TokenCategory): TokenDef[] {
  return TOKENS.filter((token) => token.category === category);
}

/** Functional-colour families, each with its four roles. */
export function functionFamilies(): Array<{
  key: string;
  label: string;
  applies: string;
  roles: TokenDef[];
}> {
  const families = new Map<
    string,
    { key: string; label: string; applies: string; roles: TokenDef[] }
  >();

  for (const token of tokensInCategory("colour-function")) {
    const key = token.family ?? "";
    if (!families.has(key)) {
      families.set(key, {
        key,
        label: token.familyLabel ?? key,
        applies: token.applies ?? "",
        roles: [],
      });
    }
    families.get(key)!.roles.push(token);
  }

  return [...families.values()];
}

/**
 * Reads the live value of every registered token from the document root.
 *
 * Browser only. Custom properties are returned as authored (`#23211d`,
 * `12px`), so the playground can show the exact value that appears in
 * tokens.css rather than a reformatted copy.
 */
export function readTokenValues(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const computed = getComputedStyle(document.documentElement);
  const values: Record<string, string> = {};

  for (const token of TOKENS) {
    values[token.name] = computed.getPropertyValue(token.name).trim();
  }

  return values;
}
