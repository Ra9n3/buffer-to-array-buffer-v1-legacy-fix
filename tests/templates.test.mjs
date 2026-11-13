// Task 4.1 — project templates: the empty project (Master only), the fixture session under its one
// identity, and the manifest round trip of each. Pure functions: no store, no storage.
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_PROJECT_NAME,
  PROJECT_TEMPLATES,
  TEMPLATE_LABELS,
  createEmptyProject,
  createTemplateProject,
  isEmptyProject,
  isProjectTemplateId,
} from "../src/lib/project/templates.ts";
import { SESSION_PROJECT_ID, createSessionProject } from "../src/lib/project/session.ts";
import { projectFields } from "../src/lib/project/fields.ts";
import { buildManifest, parseManifest, serializeManifest } from "../src/lib/project/persistence.ts";
import { validateGraph } from "../src/lib/project/routing.ts";

test("the two templates: ids, labels, the type guard", () => {
  assert.deepEqual([...PROJECT_TEMPLATES], ["session-fixture", "empty"]);
  assert.equal(TEMPLATE_LABELS["session-fixture"], "Started as the development session");
  assert.equal(TEMPLATE_LABELS.empty, "Started empty");
  assert.equal(isProjectTemplateId("empty"), true);
  assert.equal(isProjectTemplateId("session-fixture"), true);
  assert.equal(isProjectTemplateId("Empty"), false);
  assert.equal(isProjectTemplateId(""), false);
  assert.equal(isProjectTemplateId(undefined), false);
  assert.equal(isProjectTemplateId(null), false);
  assert.equal(isProjectTemplateId(3), false);
});

test("createEmptyProject: a valid project with Master only — no tracks, Returns or buses, no fields, an empty arrangement", () => {
  const p = createEmptyProject("project-1");
  assert.equal(p.id, "project-1");
  assert.equal(p.name, EMPTY_PROJECT_NAME);
  assert.equal(p.template, "empty");
  assert.deepEqual(p.tracks, []);
  assert.deepEqual(p.returns, []);
  assert.deepEqual(p.buses, []);
  assert.deepEqual(p.arrangement, { barCount: 0, timeSignature: "4/4", sections: [], tempoMarkers: [], clips: {} });
  assert.equal(isEmptyProject(p), true);
  assert.equal(validateGraph(p).ok, true, "nothing routed = a valid graph (Master is not a channel)");
  assert.equal(projectFields(p).length, 0, "no channels, no fields — Master has none");
  const named = createEmptyProject("project-2", "Untitled project 2");
  assert.equal(named.name, "Untitled project 2");
  assert.notEqual(createEmptyProject("a").arrangement, createEmptyProject("b").arrangement, "every call is a fresh object");
});

test("isEmptyProject: the fixture session is not empty; one channel of any kind makes a project non-empty", () => {
  const fixture = createSessionProject();
  assert.equal(isEmptyProject(fixture), false);
  assert.equal(isEmptyProject({ tracks: [], returns: [], buses: [] }), true);
  assert.equal(isEmptyProject({ tracks: [], returns: [], buses: [fixture.buses[0]] }), false);
  assert.equal(isEmptyProject({ tracks: [], returns: [fixture.returns[0]], buses: [] }), false);
  assert.equal(isEmptyProject({ tracks: [fixture.tracks[0]], returns: [], buses: [] }), false);
});

test("createTemplateProject: the fixture only under its one id and with the saved name; empty under any id", () => {
  const fixture = createTemplateProject("session-fixture", SESSION_PROJECT_ID, "My session");
  assert.ok(fixture);
  assert.equal(fixture.id, SESSION_PROJECT_ID);
  assert.equal(fixture.name, "My session");
  assert.equal(fixture.template, "session-fixture");
  assert.equal(fixture.tracks.length, 20);
  assert.equal(fixture.returns.length, 3);
  assert.equal(fixture.buses.length, 1);
  assert.equal(createTemplateProject("session-fixture", "project-other", "x"), null, "another identity cannot be the fixture");
  const empty = createTemplateProject("empty", "project-9", "Untitled project 3");
  assert.ok(empty);
  assert.equal(empty.id, "project-9");
  assert.equal(empty.name, "Untitled project 3");
  assert.equal(isEmptyProject(empty), true);
});

test("manifest round trip: the template travels with the identity; an empty project's manifest has no channels", () => {
  const empty = createEmptyProject("project-7", "Untitled project");
  const text = serializeManifest(buildManifest(empty, projectFields(empty)));
  const m = parseManifest(text);
  assert.ok(m);
  assert.deepEqual(m.project, { id: "project-7", name: "Untitled project", template: "empty", sampleRate: 48000 });
  assert.deepEqual(m.channels, {});
  const fixture = createSessionProject();
  const fm = parseManifest(serializeManifest(buildManifest(fixture, projectFields(fixture))));
  assert.ok(fm);
  assert.equal(fm.project.template, "session-fixture");
  assert.equal(Object.keys(fm.channels).length, 24, "20 tracks + 3 Returns + 1 bus");
  // a manifest written before 4.1 has no template and still parses (the lifecycle decides what it can be)
  const legacy = parseManifest(JSON.stringify({ schema: "alloy.project-manifest/1", project: { id: SESSION_PROJECT_ID, name: "Fixture session" }, channels: {} }));
  assert.ok(legacy);
  assert.equal(legacy.project.template, undefined);
  assert.equal(parseManifest(JSON.stringify({ schema: "alloy.project-manifest/1", project: { id: "x", name: "y", template: 4 }, channels: {} })), null, "a non-string template is not a manifest");
});
