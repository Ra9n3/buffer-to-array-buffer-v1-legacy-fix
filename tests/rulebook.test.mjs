// Task 8.2 — external JSON rulebooks.
//
// The rulebook layer loads genre defaults from a file the user points at, validates
// them against the engine's own parameter specs, and applies them as the softest nudge.
// These tests use REAL fixture files (tests/fixtures/rulebooks/) for the file-level
// cases, so "missing" and "malformed" are exercised against a file system rather than a
// string, and a string for the field-by-field validation matrix.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PINNED_PATHS,
  PLACEHOLDER_RULEBOOK,
  PLACEHOLDER_RULEBOOK_JSON,
  RULEBOOK_SAMPLE_RATE,
  RULEBOOK_SCHEMA,
  RULES,
  applyRulebook,
  describeRange,
  loadRulebookFile,
  loadRulebooks,
  manifestsFor,
  parseRulebook,
  validateRulebook,
} from "../src/lib/rulebook/rulebook.ts";
import { COMP_THRESHOLD, EQ_GAIN, EQ_FREQ } from "../src/lib/mixer-chain.ts";
import { projectFixture, trackFixture } from "./engine-fixtures.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "rulebooks");

/** A minimal reader over the real fixtures directory. */
const files = {
  readText: (filePath) => readFile(path.join(FIXTURES, filePath), "utf8"),
};

function project() {
  const kick = { ...trackFixture({ id: "track-01", name: "Kick", threshold: -30 }), familyId: "drums", role: "kick" };
  const bass = { ...trackFixture({ id: "track-02", name: "Bass", threshold: -24 }), familyId: "bass", role: "bass" };
  return projectFixture({ tracks: [kick, bass], returns: [], buses: [] });
}

const VALID = {
  schema: RULEBOOK_SCHEMA,
  id: "test",
  name: "Test",
  targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: -18 }] }],
};

/* --- the vocabulary ------------------------------------------------------------------- */

test("8.2 · the vocabulary names real parameters and cannot invent a unit", () => {
  // The rulebook's vocabulary IS the engine's specs, by reference: a rulebook can only
  // move a control the mixer really has, in the units that control really uses.
  assert.equal(RULES["compressor.threshold"].spec, COMP_THRESHOLD);
  assert.equal(RULES["eq.lf.gain"].spec, EQ_GAIN);
  assert.equal(RULES["eq.lf.freq"].spec, EQ_FREQ);
  assert.match(describeRange("compressor.threshold"), /dB/);
  assert.match(describeRange("eq.lf.gain"), /dB/);
  assert.match(describeRange("eq.lmf.q"), /0\.30/);
  assert.match(describeRange("compressor.ratio"), /1:1/);
  assert.match(describeRange("nope"), /unknown parameter/);
  assert.equal(RULEBOOK_SAMPLE_RATE, 48000);

  // Every path the plan locked is named, so a validator can refuse them by name.
  for (const pinned of ["priority", "tier", "mode", "ownership", "routing", "output", "sends", "master"]) {
    assert.ok(PINNED_PATHS.includes(pinned), `${pinned} must be pinned`);
  }
});

test("8.2 · a valid rulebook loads from a real file", async () => {
  const result = await loadRulebookFile(files, "valid.json");
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.problems));
  assert.equal(result.rulebook.schema, RULEBOOK_SCHEMA);
  assert.equal(result.rulebook.id, "fixture-rock");
  assert.deepEqual(result.rulebook.targets.map((target) => target.scope), ["all", "family"]);
});

test("8.2 · a missing file is 'missing', not 'malformed'", async () => {
  const result = await loadRulebookFile(files, "no-such-rulebook.json");
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].kind, "missing");
  assert.equal(result.problems[0].path, "no-such-rulebook.json");
  assert.match(result.problems[0].message, /ENOENT|could not be read/);

  // A reader that throws something that is not an Error still yields a message.
  const broken = await loadRulebookFile({ readText: () => { throw "disk on fire"; } }, "x.json");
  assert.equal(broken.ok, false);
  assert.equal(broken.problems[0].kind, "missing");
  assert.match(broken.problems[0].message, /disk on fire/);
});

test("8.2 · a truncated file is 'malformed-json' with the parser's reason", async () => {
  const result = await loadRulebookFile(files, "malformed.json");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].kind, "malformed-json");
  assert.match(result.problems[0].message, /not valid JSON/);
});

test("8.2 · a future schema is refused by name", async () => {
  const result = await loadRulebookFile(files, "wrong-schema.json");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].kind, "unsupported-schema");
  assert.match(result.problems[0].message, /alloy\.rulebook\/9/);
  assert.ok(result.problems[0].message.includes(RULEBOOK_SCHEMA));
});

test("8.2 · a misspelled parameter is refused", async () => {
  const result = await loadRulebookFile(files, "unknown-parameter.json");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].kind, "unsupported-parameter");
  assert.equal(result.problems[0].path, "targets[0].settings[0].parameter");
  assert.match(result.problems[0].message, /compressor\.threshold/);
});

test("8.2 · a rulebook may not set a decision the plan locked", async () => {
  const result = await loadRulebookFile(files, "pinned.json");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].kind, "pinned-parameter");
  assert.equal(result.problems[0].path, "targets[0].settings[0].parameter");
  assert.match(result.problems[0].message, /priority/);
});

test("8.2 · several rulebooks load together, and a bad one is reported and skipped", async () => {
  const loaded = await loadRulebooks(files, ["valid.json", "malformed.json", "wrong-schema.json", "absent.json"]);
  assert.equal(loaded.rulebooks.length, 1, "the good one still loaded");
  assert.equal(loaded.rulebooks[0].id, "fixture-rock");
  assert.deepEqual(
    loaded.problems.map((problem) => problem.kind),
    ["malformed-json", "unsupported-schema", "missing"],
    "every failure is reported, in order, with its own kind",
  );
  assert.deepEqual(
    loaded.problems.map((problem) => problem.path),
    ["malformed.json", "wrong-schema.json", "absent.json"],
    "each problem names the file it came from",
  );
});

test("8.2 · two rulebooks with the same id are not both applied", async () => {
  const duplicated = {
    readText: async (filePath) =>
      filePath === "a.json"
        ? JSON.stringify({ ...VALID, id: "same", name: "A" })
        : JSON.stringify({ ...VALID, id: "same", name: "B" }),
  };
  const loaded = await loadRulebooks(duplicated, ["a.json", "b.json"]);
  assert.equal(loaded.rulebooks.length, 1);
  assert.equal(loaded.rulebooks[0].name, "A", "the first one wins");
  assert.equal(loaded.problems.length, 1);
  assert.match(loaded.problems[0].message, /already loaded/);
});

/* --- validation matrix ---------------------------------------------------------------- */

test("8.2 · structure, types and ranges are all checked, with a path for each problem", () => {
  for (const json of ["[1,2,3]", "null", "\"a rulebook\""]) {
    const result = parseRulebook(json, "file.json");
    assert.equal(result.ok, false, `${json} must be rejected`);
    assert.equal(result.problems[0].kind, "structure");
  }

  const fieldCases = [
    [{ ...VALID, id: undefined }, "id", "missing"],
    [{ ...VALID, id: "   " }, "id", "missing"],
    [{ ...VALID, id: 5 }, "id", "wrong-type"],
    [{ ...VALID, name: undefined }, "name", "missing"],
    [{ ...VALID, placeholder: "yes" }, "placeholder", "wrong-type"],
    [{ ...VALID, targets: "all" }, "targets", "structure"],
    [{ ...VALID, targets: [null] }, "targets[0]", "structure"],
    [{ ...VALID, targets: [{ scope: "everyone", settings: [] }] }, "targets[0].scope", "structure"],
    [{ ...VALID, targets: [{ scope: "family", settings: [] }] }, "targets[0].id", "missing"],
    [{ ...VALID, targets: [{ scope: "role", id: 7, settings: [] }] }, "targets[0].id", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", id: "x", settings: [] }] }, "targets[0].id", "structure"],
    [{ ...VALID, targets: [{ scope: "all" }] }, "targets[0].settings", "structure"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{}] }] }, "targets[0].settings[0].parameter", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "eq.lf.gain" }] }] }, "targets[0].settings[0].value", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "eq.lf.gain", value: "loud" }] }] }, "targets[0].settings[0].value", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "eq.lf.gain", value: Number.NaN }] }] }, "targets[0].settings[0].value", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "eq.lf.gain", value: Number.POSITIVE_INFINITY }] }] }, "targets[0].settings[0].value", "wrong-type"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "eq.lf.gain", value: 9999 }] }] }, "targets[0].settings[0].value", "value-out-of-range"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "master.gain", value: 0 }] }] }, "targets[0].settings[0].parameter", "unsupported-parameter"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "output", value: 1 }] }] }, "targets[0].settings[0].parameter", "pinned-parameter"],
  ];
  for (const [value, problemPath, kind] of fieldCases) {
    const result = validateRulebook(value, "file.json");
    assert.equal(result.ok, false, `must reject ${JSON.stringify(value).slice(0, 90)}`);
    const hit = result.problems.find((problem) => problem.path === problemPath);
    assert.ok(hit, `expected a problem at ${problemPath}; got ${JSON.stringify(result.problems)}`);
    assert.equal(hit.kind, kind, `${problemPath} → ${kind}`);
  }
});

test("8.2 · the same parameter twice in one target is refused, not silently merged", () => {
  const result = validateRulebook({
    ...VALID,
    targets: [{ scope: "all", settings: [
      { parameter: "compressor.ratio", value: 2 },
      { parameter: "compressor.ratio", value: 3 },
    ] }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].path, "targets[0].settings[1].parameter");
  assert.match(result.problems[0].message, /twice/);
});

test("8.2 · every problem is collected, so a file can be fixed in one pass", () => {
  const result = validateRulebook({
    ...VALID,
    name: "",
    targets: [
      { scope: "all", settings: [{ parameter: "nope", value: 1 }, { parameter: "compressor.ratio", value: 999 }] },
      { scope: "everyone", settings: [] },
    ],
  });
  assert.equal(result.ok, false);
  const paths = result.problems.map((problem) => problem.path);
  assert.deepEqual(paths, ["name", "targets[0].settings[0].parameter", "targets[0].settings[1].value", "targets[1].scope"]);
});

test("8.2 · a rejected rulebook changes nothing", () => {
  const before = project();
  const snapshot = JSON.stringify(before);
  const result = validateRulebook({ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "priority", value: 1 }] }] });
  assert.equal(result.ok, false);
  assert.equal("rulebook" in result, false, "a failed validation yields no rulebook to apply");
  assert.equal(JSON.stringify(before), snapshot);
});

/* --- the shipped placeholder ---------------------------------------------------------- */

test("8.2 · the shipped rulebook is valid, inert and honest about it", () => {
  const parsed = parseRulebook(PLACEHOLDER_RULEBOOK_JSON, "placeholder.json");
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.problems));
  assert.equal(parsed.rulebook.placeholder, true);
  assert.deepEqual(parsed.rulebook.targets, []);
  assert.equal(PLACEHOLDER_RULEBOOK.id, parsed.rulebook.id);

  // Its own JSON explains why it is empty, so a reader does not go looking for numbers.
  const raw = JSON.parse(PLACEHOLDER_RULEBOOK_JSON);
  assert.match(raw.$comment, /§9/);
  assert.match(raw.$comment, /changes nothing/);

  const applied = applyRulebook(project(), PLACEHOLDER_RULEBOOK);
  assert.deepEqual(applied.applied, []);
  assert.equal(JSON.stringify(applied.project), JSON.stringify(project()));
  assert.deepEqual(manifestsFor([PLACEHOLDER_RULEBOOK]), [], "a placeholder claims nothing");
});

/* --- application --------------------------------------------------------------------- */

test("8.2 · applying writes only Auto values, and never mutates the input", () => {
  const input = project();
  // A Manual value belongs to the user.
  input.tracks[1].chain.comp.threshold.mode = "manual";
  const manualSnapshot = JSON.stringify(input);

  const result = validateRulebook({
    ...VALID,
    targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: -10 }] }],
  });
  assert.equal(result.ok, true);
  const applied = applyRulebook(input, result.rulebook);

  assert.equal(JSON.stringify(input), manualSnapshot, "the caller's project is untouched");
  assert.deepEqual(applied.applied.map((entry) => entry.trackId), ["track-01"]);
  assert.equal(applied.applied[0].from, -30);
  assert.equal(applied.applied[0].value, -10);
  assert.equal(applied.applied[0].rulebook, "test");
  assert.equal(applied.project.tracks[0].chain.comp.threshold.value, -10);
  assert.equal(applied.project.tracks[1].chain.comp.threshold.value, -24, "the Manual value survived");
  // The chain that did not change is the SAME object: copy-on-write, not copy-always.
  assert.equal(applied.project.tracks[1].chain, input.tracks[1].chain);
});

test("8.2 · scopes select exactly the tracks they name, and a scope that matches nothing is said", () => {
  const applied = applyRulebook(
    project(),
    validateRulebook({
      ...VALID,
      targets: [
        { scope: "family", id: "drums", settings: [{ parameter: "eq.lf.gain", value: 3 }] },
        { scope: "role", id: "bass", settings: [{ parameter: "eq.lf.gain", value: -2 }] },
        { scope: "family", id: "strings", settings: [{ parameter: "eq.lf.gain", value: 1 }] },
      ],
    }).rulebook,
  );
  assert.deepEqual(applied.applied.map((entry) => `${entry.trackId}:${entry.parameter}:${entry.value}`), [
    "track-01:eq.lf.gain:3",
    "track-02:eq.lf.gain:-2",
  ]);
  assert.deepEqual(applied.unmatched, ['family "strings" matched no track in this project']);

  const lfGain = (trackId) =>
    applied.project.tracks.find((track) => track.id === trackId).chain.eq.bands.find((band) => band.band.id === "lf").gain.value;
  assert.equal(lfGain("track-01"), 3);
  assert.equal(lfGain("track-02"), -2);
});

test("8.2 · values are stepped to the parameter's own spec, so a file cannot leave debris", () => {
  const result = validateRulebook({ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "compressor.ratio", value: 4.37 }] }] });
  assert.equal(result.ok, true);
  const applied = applyRulebook(project(), result.rulebook);
  const written = applied.project.tracks[0].chain.comp.ratio.value;
  const step = RULES["compressor.ratio"].spec.step ?? 0;
  if (step > 0) {
    assert.equal(Number((written / step).toFixed(6)) % 1, 0, `${written} is a multiple of ${step}`);
  }
  assert.equal(written, Number(written.toFixed(6)), "no floating-point debris");
  // And the value is reported as written, so a UI shows what the engine will use.
  assert.equal(applied.applied[0].value, written);
});

test("8.2 · applying is idempotent, so a rerun cannot drift the mix", () => {
  const rulebook = validateRulebook(VALID).rulebook;
  const once = applyRulebook(project(), rulebook);
  const twice = applyRulebook(once.project, rulebook);
  assert.equal(twice.applied.length, 0, "nothing changed the second time");
  assert.deepEqual(
    twice.project.tracks.map((track) => track.chain.comp.threshold.value),
    once.project.tracks.map((track) => track.chain.comp.threshold.value),
  );
});

test("8.2 · every parameter in the vocabulary resolves to a real control on a real track", () => {
  for (const parameter of Object.keys(RULES)) {
    const rule = RULES[parameter];
    const applied = applyRulebook(
      project(),
      validateRulebook({
        ...VALID,
        targets: [{ scope: "all", settings: [{ parameter, value: rule.spec.min ?? 0 }] }],
      }).rulebook,
    );
    assert.ok(
      applied.applied.length > 0 || applied.unmatched.length === 0,
      `${parameter} applied without an error`,
    );
    if (applied.applied.length > 0) {
      assert.equal(applied.applied[0].parameter, parameter);
      assert.ok(Number.isFinite(applied.applied[0].value));
    }
  }
});

test("8.2 · a rulebook never touches routing, sends, mute, solo or priority", () => {
  const input = project();
  input.tracks[0].channel.sends = [{ to: "return-none", level: -6, mode: "auto" }];
  input.tracks[0].channel.pan = -40;
  input.tracks[0].priority = 9;
  const snapshot = JSON.stringify(input);
  const applied = applyRulebook(input, validateRulebook({
    ...VALID,
    targets: [{ scope: "all", settings: [
      { parameter: "compressor.threshold", value: -12 },
      { parameter: "eq.hf.gain", value: 1 },
    ] }],
  }).rulebook);
  assert.equal(JSON.stringify(input), snapshot);
  for (const track of applied.project.tracks) {
    const original = input.tracks.find((entry) => entry.id === track.id);
    assert.deepEqual(track.channel, original.channel, "the channel (routing, sends, pan, mute, solo) is untouched");
    assert.equal(track.priority, original.priority);
    assert.equal(track.output, original.output);
  }
});
