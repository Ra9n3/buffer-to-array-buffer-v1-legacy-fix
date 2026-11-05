/**
 * ALLOY — external JSON genre rulebooks (Task 8.2 B, plan §9).
 *
 * Plan §9: "genre rules are the data-driven tuning layer and should be external
 * editable JSON files rather than hardcoded DSP decisions. The engine consumes the
 * rulebook generically; rulebook content can be updated without rewriting the
 * engine." The numeric contents are deliberately deferred (§9, §17) — this module
 * therefore ships a PLACEHOLDER rulebook that changes nothing, and the machinery to
 * load, validate and apply a real one later without touching the engine.
 *
 * Three parts, and the boundaries matter:
 *
 *   1. `RULES` — the parameter vocabulary. A rulebook may only name parameters this
 *      table declares, with the units and ranges ALLOY already uses (the same specs
 *      `mixer-chain.ts` gives the knobs). A rulebook can therefore narrow a choice;
 *      it can never introduce a control, a unit or a value the UI cannot show.
 *      `pinned: true` parameters are decisions the plan locked (§16) and no rulebook
 *      may set: Auto / Manual ownership, tier and priority, routing.
 *   2. `validateRulebook` — structure and value types, per field, with a path to the
 *      offending value. Malformed, missing and unsupported input is a named result,
 *      never an exception and never a silent default.
 *   3. `applyRulebook` — the precedence plan §9 spells out: prominence tier/priority
 *      FIRST (so protected tracks keep their protection), masking resolution SECOND,
 *      and genre defaults LAST — "the lowest-precedence nudge". This module only
 *      implements the genre-defaults step, because the first two already run in
 *      Tasks 7.1–7.3; `applyRulebook` is applied to the engine's Auto values AFTER
 *      them, in the exporter's rulebook pass.
 *
 * Determinism: applying a rulebook to the same project twice produces the same
 * values; every value is clamped to its declared range and rounded to the spec's
 * step, and the walk is in project order, never in object-key order.
 */

import { DSP_SAMPLE_RATE } from "../dsp/params";
import {
  COMP_ATTACK,
  COMP_MAKEUP,
  COMP_RATIO,
  COMP_RELEASE,
  COMP_THRESHOLD,
  EQ_FREQ,
  EQ_GAIN,
  EQ_Q,
  type ParamSpec,
  type ChainParam,
} from "../mixer-chain";
import type { Project, Track, TrackId } from "../project/model";

export const RULEBOOK_SCHEMA = "alloy.rulebook/1";

/** Where a rulebook may aim a value: a parameter, and the scope it applies to. */
export interface RuleSpec {
  readonly spec: ParamSpec;
  /** True for a decision the plan locked — a rulebook that names one is rejected. */
  readonly pinned?: boolean;
}

/**
 * The parameter vocabulary. Deliberately small: it is the set of Auto-eligible
 * insert parameters the Mixer already exposes (Task 6.1's EQ and 6.2's compressor).
 * A rulebook is rejected if it names anything outside it.
 */
export const RULES: Readonly<Record<string, RuleSpec>> = {
  "eq.lf.freq": { spec: EQ_FREQ },
  "eq.lf.gain": { spec: EQ_GAIN },
  "eq.lmf.freq": { spec: EQ_FREQ },
  "eq.lmf.gain": { spec: EQ_GAIN },
  "eq.lmf.q": { spec: EQ_Q },
  "eq.hmf.freq": { spec: EQ_FREQ },
  "eq.hmf.gain": { spec: EQ_GAIN },
  "eq.hmf.q": { spec: EQ_Q },
  "eq.hf.freq": { spec: EQ_FREQ },
  "eq.hf.gain": { spec: EQ_GAIN },
  "compressor.threshold": { spec: COMP_THRESHOLD },
  "compressor.ratio": { spec: COMP_RATIO },
  "compressor.attack": { spec: COMP_ATTACK },
  "compressor.release": { spec: COMP_RELEASE },
  "compressor.makeup": { spec: COMP_MAKEUP },
};

/** Parameter paths the plan locked: a rulebook may not touch them (§16). */
export const PINNED_PATHS: readonly string[] = Object.freeze([
  "priority",
  "tier",
  "mode",
  "ownership",
  "routing",
  "output",
  "sends",
  "master",
]);

export interface RuleSetting {
  /** A key of `RULES`. */
  readonly parameter: string;
  /** The value in the parameter's own units. */
  readonly value: number;
}

export interface RuleTarget {
  /**
   * Which tracks a rule applies to. `"all"` is every track; a `family` is one
   * instrument family (plan §5); `role` is one musical role. Matching is exact and
   * case-sensitive, like the model's own ids.
   */
  readonly scope: "all" | "family" | "role";
  readonly id?: string;
  readonly settings: readonly RuleSetting[];
}

export interface Rulebook {
  readonly schema: typeof RULEBOOK_SCHEMA;
  readonly id: string;
  readonly name: string;
  /** True for the shipped placeholder: it is valid, and it changes nothing. */
  readonly placeholder?: boolean;
  readonly targets: readonly RuleTarget[];
}

export type RulebookProblemKind =
  | "missing"
  | "malformed-json"
  | "unsupported-schema"
  | "structure"
  | "unsupported-parameter"
  | "pinned-parameter"
  | "value-out-of-range"
  | "wrong-type";

export interface RulebookProblem {
  readonly kind: RulebookProblemKind;
  /** Where the problem is: `targets[2].settings[0].value`. */
  readonly path: string;
  readonly message: string;
}

export type RulebookResult =
  | { readonly ok: true; readonly rulebook: Rulebook; readonly warnings: readonly RulebookProblem[] }
  | { readonly ok: false; readonly problems: readonly RulebookProblem[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The spec's range, from the parameter model itself — never restated here. */
function rangeOf(spec: ParamSpec): { min: number; max: number; step: number } {
  const min = spec.min ?? Number.NEGATIVE_INFINITY;
  const max = spec.max ?? Number.POSITIVE_INFINITY;
  const step = spec.step ?? 0;
  return { min, max, step };
}

/** A parameter's range, printed with the spec's own formatter (no unit invented here). */
export function describeRange(parameter: string): string {
  const rule = RULES[parameter];
  if (!rule) return "unknown parameter";
  const { min, max } = rangeOf(rule.spec);
  return `${rule.spec.format(min)} … ${rule.spec.format(max)}`;
}

/**
 * Validate one parsed rulebook. Problems are collected rather than thrown, so a UI
 * can show every one of them at once; a single problem makes the rulebook invalid,
 * because a partly-applied tuning layer would be worse than none.
 */
export function validateRulebook(value: unknown, source = "rulebook"): RulebookResult {
  const problems: RulebookProblem[] = [];
  const add = (kind: RulebookProblemKind, path: string, message: string): void => {
    problems.push({ kind, path, message });
  };

  if (!isRecord(value)) {
    return { ok: false, problems: [{ kind: "structure", path: source, message: "A rulebook must be a JSON object." }] };
  }
  if (value.schema !== RULEBOOK_SCHEMA) {
    return {
      ok: false,
      problems: [
        {
          kind: "unsupported-schema",
          // The whole file is unusable, so the problem is the file, not a field in it.
          path: source,
          message:
            value.schema === undefined
              ? `This file has no schema; ALLOY rulebooks declare "${RULEBOOK_SCHEMA}".`
              : `This rulebook is schema ${JSON.stringify(value.schema)}; this build reads "${RULEBOOK_SCHEMA}".`,
        },
      ],
    };
  }

  if (value.id === undefined || (typeof value.id === "string" && value.id.trim() === "")) {
    add("missing", "id", "A rulebook needs an id (a short, stable text key).");
  } else if (typeof value.id !== "string") {
    add("wrong-type", "id", "id must be text.");
  }
  if (value.name === undefined || (typeof value.name === "string" && value.name.trim() === "")) {
    add("missing", "name", "A rulebook needs a name to print.");
  } else if (typeof value.name !== "string") {
    add("wrong-type", "name", "name must be text.");
  }
  if (value.placeholder !== undefined && typeof value.placeholder !== "boolean") {
    add("wrong-type", "placeholder", "placeholder must be true or false.");
  }

  const targets = value.targets;
  const checkedTargets: RuleTarget[] = [];
  if (!Array.isArray(targets)) {
    add("structure", "targets", "targets must be a list of rules (an empty list is allowed).");
  } else {
    targets.forEach((entry, index) => {
      const path = `targets[${index}]`;
      if (!isRecord(entry)) {
        add("structure", path, "Each target must be an object.");
        return;
      }
      const scope = entry.scope;
      if (scope !== "all" && scope !== "family" && scope !== "role") {
        add("structure", `${path}.scope`, 'scope must be "all", "family" or "role".');
        return;
      }
      if (scope !== "all" && (entry.id === undefined || (typeof entry.id === "string" && entry.id.trim() === ""))) {
        add("missing", `${path}.id`, `A ${scope} target needs an id.`);
        return;
      }
      if (scope !== "all" && typeof entry.id !== "string") {
        add("wrong-type", `${path}.id`, `A ${scope} target's id must be text.`);
        return;
      }
      if (scope === "all" && entry.id !== undefined) {
        add("structure", `${path}.id`, 'A target scoped to "all" must not name an id.');
      }
      const settings = entry.settings;
      if (!Array.isArray(settings)) {
        add("structure", `${path}.settings`, "A target needs a settings list.");
        return;
      }
      const checkedSettings: RuleSetting[] = [];
      const seen = new Set<string>();
      settings.forEach((setting, sIndex) => {
        const sPath = `${path}.settings[${sIndex}]`;
        if (!isRecord(setting)) {
          add("structure", sPath, "Each setting must be an object.");
          return;
        }
        const parameter = setting.parameter;
        if (typeof parameter !== "string") {
          add("wrong-type", `${sPath}.parameter`, "parameter must be text.");
          return;
        }
        if (PINNED_PATHS.includes(parameter)) {
          add(
            "pinned-parameter",
            `${sPath}.parameter`,
            `"${parameter}" is a decision the product plan locks; a rulebook may not set it.`,
          );
          return;
        }
        const rule = RULES[parameter];
        if (!rule) {
          add(
            "unsupported-parameter",
            `${sPath}.parameter`,
            `"${parameter}" is not a parameter this build's engine exposes. Known: ${Object.keys(RULES).join(", ")}.`,
          );
          return;
        }
        if (rule.pinned === true) {
          add("pinned-parameter", `${sPath}.parameter`, `"${parameter}" is locked.`);
          return;
        }
        if (seen.has(parameter)) {
          add("structure", `${sPath}.parameter`, `"${parameter}" is set twice in one target.`);
          return;
        }
        seen.add(parameter);
        const raw = setting.value;
        if (typeof raw !== "number" || !Number.isFinite(raw)) {
          add("wrong-type", `${sPath}.value`, `value must be a finite number (${describeRange(parameter)}).`);
          return;
        }
        const { min, max } = rangeOf(rule.spec);
        if (raw < min || raw > max) {
          add(
            "value-out-of-range",
            `${sPath}.value`,
            `${raw} is outside ${parameter}'s range (${describeRange(parameter)}).`,
          );
          return;
        }
        checkedSettings.push({ parameter, value: raw });
      });
      checkedTargets.push({ scope, ...(scope === "all" ? {} : { id: entry.id as string }), settings: checkedSettings });
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  const rulebook: Rulebook = {
    schema: RULEBOOK_SCHEMA,
    id: (value.id as string).trim(),
    name: (value.name as string).trim(),
    ...(value.placeholder === true ? { placeholder: true } : {}),
    targets: checkedTargets,
  };
  return { ok: true, rulebook, warnings: [] };
}

/** Validate raw text, distinguishing "no file" from "not JSON" from "not a rulebook". */
export function parseRulebook(text: string | null | undefined, source = "rulebook"): RulebookResult {
  if (text === null || text === undefined) {
    return { ok: false, problems: [{ kind: "missing", path: source, message: "No rulebook file was found." }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [
        {
          kind: "malformed-json",
          path: source,
          message: `This file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  return validateRulebook(parsed, source);
}

/* --- the shipped placeholder --------------------------------------------------------- */

/**
 * The build's own rulebook: valid, honest and inert. Plan §9 defers the numeric
 * contents; inventing them here would be exactly what §9 forbids, so the shipped
 * file declares its vocabulary is empty and says why in its own name.
 */
export const PLACEHOLDER_RULEBOOK: Rulebook = Object.freeze({
  schema: RULEBOOK_SCHEMA,
  id: "placeholder",
  name: "Placeholder — no tuning applied",
  placeholder: true,
  targets: [],
}) as Rulebook;

export const PLACEHOLDER_RULEBOOK_JSON = `${JSON.stringify(
  {
    $comment:
      "ALLOY placeholder rulebook. Plan §9 defers the numeric contents until listening tests: this file is valid and changes nothing. Add targets of the form { scope, id, settings: [{ parameter, value }] } naming a parameter from src/lib/rulebook/rulebook.ts RULES.",
    schema: RULEBOOK_SCHEMA,
    id: "placeholder",
    name: "Placeholder — no tuning applied",
    placeholder: true,
    targets: [],
  },
  null,
  2,
)}\n`;

/* --- applying ------------------------------------------------------------------------- */

export interface AppliedSetting {
  readonly trackId: TrackId;
  readonly parameter: string;
  readonly from: number;
  readonly value: number;
  readonly changed: boolean;
  readonly rulebook: string;
}

export interface AppliedRulebook {
  readonly project: Project;
  readonly applied: readonly AppliedSetting[];
  /** Targets whose family/role matched nothing — said, not hidden. */
  readonly unmatched: readonly string[];
}

function matches(target: RuleTarget, track: Track): boolean {
  if (target.scope === "all") return true;
  if (target.scope === "family") return track.familyId === target.id;
  return track.role === target.id;
}

/**
 * The numeric parameter a path names, on a track's chain: an `EqBandState`'s
 * freq / gain / q, or one of the compressor's five. Returning the ChainParam itself
 * is deliberate — `mode` (Auto / Manual ownership) travels with the value, so the
 * ownership rule below reads the model's own field and cannot drift from it.
 */
function readParam(track: Track, parameter: string): ChainParam | null {
  const [section, band, field] = parameter.split(".");
  if (section === "compressor") {
    const key = band as "threshold" | "ratio" | "attack" | "release" | "makeup";
    return track.chain.comp[key] ?? null;
  }
  if (section === "eq" && field) {
    const eqBand = track.chain.eq.bands.find((entry) => entry.band.id === band);
    if (!eqBand) return null;
    const key = field as "freq" | "gain" | "q";
    return (eqBand as unknown as Record<string, ChainParam | null>)[key] ?? null;
  }
  return null;
}

/** Round a value to the spec's step, in the spec's own units. */
function quantise(value: number, spec: ParamSpec): number {
  const step = spec.step ?? 0;
  if (!step) return value;
  const snapped = Math.round(value / step) * step;
  // Avoid 1.4000000000000001 in a saved document.
  return Number(snapped.toFixed(6));
}

/**
 * Apply a validated rulebook's genre defaults to a project, returning a NEW project
 * (nothing is mutated) and the list of what changed. Only parameters whose owner is
 * Auto are touched: a Manual value is the user's and is never overwritten — the
 * same rule Tasks 6.x and 7.x use for reruns. Values are clamped and stepped to the
 * parameter's own spec, so an edited JSON file cannot put a control out of range.
 *
 * Precedence (plan §9): a rulebook is the lowest-precedence nudge, applied AFTER
 * tier/priority protection and masking resolution. This function does not attempt
 * either — a caller that has not run those steps must run them first.
 */
export function applyRulebook(project: Project, rulebook: Rulebook): AppliedRulebook {
  const applied: AppliedSetting[] = [];
  const unmatched: string[] = [];
  const tracks = project.tracks.map((track) => {
    let next: Track = track;
    for (const target of rulebook.targets) {
      if (!matches(target, track)) continue;
      for (const setting of target.settings) {
        const rule = RULES[setting.parameter];
        if (!rule) continue;
        const param = readParam(next, setting.parameter);
        if (!param) continue;
        // Manual: the user owns this value and a genre default never overwrites it.
        if (param.mode === "manual") continue;
        const { min, max } = rangeOf(rule.spec);
        const clamped = Math.min(max, Math.max(min, setting.value));
        const value = quantise(clamped, rule.spec);
        const from = param.value;
        if (value === from) continue;
        // Copy the chain on first write so the project handed in is untouched.
        if (next === track) next = cloneTrackChain(track);
        const target2 = readParam(next, setting.parameter);
        if (!target2) continue;
        target2.value = value;
        applied.push({ trackId: track.id, parameter: setting.parameter, from, value, changed: true, rulebook: rulebook.id });
      }
    }
    return next;
  });
  for (const target of rulebook.targets) {
    if (target.scope === "all") continue;
    const hit = project.tracks.some((track) => matches(target, track));
    if (!hit) unmatched.push(`${target.scope} "${String(target.id)}" matched no track in this project`);
  }
  return { project: { ...project, tracks }, applied, unmatched };
}

/**
 * Copy-on-write for one track's chain, so applying a rule never mutates the input.
 *
 * `structuredClone` is the right tool in the browser but not in every host (and it
 * refuses anything it cannot clone), so the copy is taken with the same JSON round
 * trip the project store uses to persist a project. A chain is plain data — numbers,
 * strings, booleans, arrays — by construction, which is what makes this safe.
 */
function cloneTrackChain(track: Track): Track {
  const chain = JSON.parse(JSON.stringify(track.chain));
  return { ...track, chain } as Track;
}

/** A one-line summary per rulebook for the export notes and the UI. */
export function manifestsFor(rulebooks: readonly Rulebook[]): string[] {
  const active = rulebooks.filter((rulebook) => rulebook.placeholder !== true && rulebook.targets.length > 0);
  if (active.length === 0) return [];
  return active.map((rulebook) => `Rulebook “${rulebook.name}” (${rulebook.id}) applied its genre defaults as the lowest-precedence nudge.`);
}

/** The session rate a rulebook's values are expressed in (frequency is in Hz). */
export const RULEBOOK_SAMPLE_RATE = DSP_SAMPLE_RATE;

/* --- loading from disk ---------------------------------------------------------------- */

/** Everything the loader needs from a file system: read one text file, or fail. */
export interface RulebookFiles {
  readText(path: string): Promise<string>;
}

/**
 * Load one external rulebook from a path.
 *
 * `missing` and `malformed` are distinguished deliberately: "there is no such file" is
 * a different message to a user than "this file is not a rulebook", and a UI can then
 * offer "choose a file" instead of "fix your JSON". Nothing here throws for a bad
 * rulebook — a broken file must not take the app down — but a file-system error other
 * than "not found" is reported as `missing` with that error's own text, because the file
 * cannot be read either way.
 */
export async function loadRulebookFile(
  files: RulebookFiles,
  path: string,
): Promise<RulebookResult> {
  let text: string;
  try {
    text = await files.readText(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      problems: [{ kind: "missing", path, message: `This rulebook could not be read: ${detail}` }],
    };
  }
  return parseRulebook(text, path);
}

/**
 * Load several rulebooks in order, keeping every problem next to the file it came
 * from. A rulebook that fails is reported and skipped: one unreadable genre file must
 * not stop the others loading, and it must not be silently ignored either.
 */
export async function loadRulebooks(
  files: RulebookFiles,
  paths: readonly string[],
): Promise<{
  readonly rulebooks: readonly Rulebook[];
  readonly problems: readonly RulebookProblem[];
}> {
  const rulebooks: Rulebook[] = [];
  const problems: RulebookProblem[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const result = await loadRulebookFile(files, path);
    if (result.ok) {
      if (seen.has(result.rulebook.id)) {
        problems.push({
          kind: "structure",
          path,
          message: `A rulebook with the id "${result.rulebook.id}" was already loaded; this one is ignored.`,
        });
        continue;
      }
      seen.add(result.rulebook.id);
      rulebooks.push(result.rulebook);
    } else {
      problems.push(...result.problems);
    }
  }
  return { rulebooks, problems };
}
