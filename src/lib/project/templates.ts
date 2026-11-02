/**
 * ALLOY — PROJECT TEMPLATES — Task 4.1.
 *
 * The structures a project can be rebuilt from. A saved project (the
 * manifest, persistence.ts) holds identity and field values only, so
 * reopening one means: build its template, apply the saved values
 * (lifecycle.ts). Two templates exist in this build:
 *
 *   session-fixture  the approved development session (session.ts): the
 *                    twenty fixture tracks, three Returns, the Mix Bus. Its
 *                    identity is fixed (SESSION_PROJECT_ID) — there is one.
 *   empty            "Start empty" (owner, D4.1.2): no tracks, no Returns,
 *                    no buses — only the Master output exists, which is not
 *                    a channel. The plan's two default Returns (§8a) are
 *                    created by MIX / the user with the audio engine; their
 *                    parameter values are not invented here. The
 *                    arrangement is empty too: 0 bars, no sections, no
 *                    tempo markers, no clips; the time signature is the
 *                    conventional 4/4 label — nothing is drawn from it until
 *                    stems arrive (Phase 5).
 *
 * Pure: no Svelte, no storage, no ids of its own (the caller brings the id).
 */

import type { Project, ProjectTemplateId } from "./model";
import { SESSION_PROJECT_ID, createSessionProject } from "./session";

export const PROJECT_TEMPLATES: readonly ProjectTemplateId[] = ["session-fixture", "empty"];

export function isProjectTemplateId(value: unknown): value is ProjectTemplateId {
  return typeof value === "string" && (PROJECT_TEMPLATES as readonly string[]).includes(value);
}

/** What Home prints for a template. */
export const TEMPLATE_LABELS: Readonly<Record<ProjectTemplateId, string>> = {
  "session-fixture": "Development session",
  empty: "Empty project",
};

export const EMPTY_PROJECT_NAME = "Untitled project";
export const EMPTY_TIME_SIGNATURE = "4/4";

/** A valid project with nothing in it: the model's own empty collections, Master only. */
export function createEmptyProject(id: string, name: string = EMPTY_PROJECT_NAME): Project {
  return {
    id,
    name,
    template: "empty",
    tracks: [],
    returns: [],
    buses: [],
    arrangement: {
      barCount: 0,
      timeSignature: EMPTY_TIME_SIGNATURE,
      sections: [],
      tempoMarkers: [],
      clips: {},
    },
  };
}

/**
 * A fresh project of `template` under the identity a manifest recorded, or
 * null when the identity cannot belong to the template (the fixture session
 * has one id). The name is the saved one: a template has no claim on it.
 */
export function createTemplateProject(template: ProjectTemplateId, id: string, name: string): Project | null {
  if (template === "session-fixture") {
    if (id !== SESSION_PROJECT_ID) return null;
    const project = createSessionProject();
    project.name = name;
    return project;
  }
  return createEmptyProject(id, name);
}

/** A project with no channels at all (every room shows its empty state). */
export function isEmptyProject(project: Pick<Project, "tracks" | "returns" | "buses">): boolean {
  return project.tracks.length === 0 && project.returns.length === 0 && project.buses.length === 0;
}
