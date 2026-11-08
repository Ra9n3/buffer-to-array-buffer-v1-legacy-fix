// Task 9.1.2 — the development session, loaded explicitly.
//
// Until this task the store booted straight into the 20-track fixture session, so every
// suite that touched the store silently inherited it. The app now boots an EMPTY project
// (owner decision: a new user importing stems must never lose their audio to a solo left
// on a fixture track), and the fixture is development data — which is what it always was.
//
// So the suites that test the fixture session's behaviour now say so on the record instead
// of relying on a default. Load it before reading:
//
//     import { loadFixtureSession } from "./fixture-session.mjs";
//     loadFixtureSession();
//
// Nothing else about those suites changes: they drive the real store exactly as before.
const { createSessionProject } = await import("../src/lib/project/session.ts");
const { autosave, loadProject, project } = await import("../src/lib/project/store.svelte.ts");

/**
 * Replace the store's open project with the development session. Synchronous and whole.
 *
 * It also retargets autosave to the fixture's own storage key, exactly as the lifecycle
 * does on every project switch (`autosave.retarget(projectKey(id), storedText)`). Without
 * that, autosave keeps writing under the *previous* project's key — it reads its key once
 * at construction — and the manifest lands somewhere no reader looks.
 */
export function loadFixtureSession() {
  const next = createSessionProject();
  loadProject(next);
  autosave.retarget(`alloy.project.${next.id}`, null);
}

/** True when the store is currently holding the development session. */
export function fixtureLoaded() {
  return project.template === "session-fixture";
}
