#!/usr/bin/env node
/**
 * ALLOY — Task 9.1.4 structural contract: the local-vs-origin sync guard.
 *
 * What this guards. Twice during Task 9.1 the local clone held a history that had lost
 * commits already pushed to origin; committing would have deleted ~5,400 pushed lines and
 * pushing would have served that deletion to the PR. It was caught by luck both times.
 *
 *   1. The guard exists, runs, and is pure of network assumptions that could block work:
 *      an unreachable origin stands DOWN (exit 0), it never blocks a commit.
 *   2. It classifies the four shapes that matter — in-sync, ahead, behind, diverged — and
 *      treats "behind" as unsafe, which is the shape of the incident.
 *   3. It fetches before comparing, because in both incidents the remote-tracking ref was
 *      itself stale: a check that only read `origin/<branch>` could not have caught it.
 *   4. A bypass exists and is honoured, so a deliberate reset is never impossible.
 *   5. It is installed as a pre-commit hook and documented, and no dependency was added —
 *      the detection is a subprocess call, not a parser.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const passes = [];
const failures = [];
function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const PATH = "scripts/git-sync-guard.mjs";
const exists = (rel) => existsSync(rel);
const read = (rel) => readFileSync(rel, "utf8");

check("the guard exists", exists(PATH));
const G = exists(PATH) ? read(PATH) : "";

check("it fetches before comparing, so a stale remote-tracking ref cannot hide the problem",
  /fetchOrigin\(branch\)/.test(G) && /git", \["fetch", "--quiet", "origin", branch\]/.test(G));

check("it treats 'behind' as the unsafe shape and names it as the destructive one",
  /isAncestor\(head, upstream\)/.test(G) && /BEHIND/.test(G) && /would "delete" pushed work/.test(G));

check("it distinguishes in-sync, ahead, behind, diverged and detached",
  /"in-sync"/.test(G) && /"ahead"/.test(G) && /"behind"/.test(G) && /"diverged"/.test(G) && /"detached"/.test(G));

check("an unreachable origin stands down instead of blocking work",
  /EXIT_OFFLINE = 0/.test(G) && /could not reach origin/.test(G));

check("a bypass exists and is honoured", /ALLOY_SKIP_SYNC_CHECK/.test(G));

check("it can install and remove its own pre-commit hook", /--install/.test(G) && /--uninstall/.test(G) && /"pre-commit"/.test(G));

check("it adds no dependency — detection is a git subprocess call",
  /execFileSync\("git"/.test(G) && !/from "[^"]*node_modules/.test(G));

// The guard must actually run and report the current state without throwing.
let ran = false;
let said = "";
try {
  said = execFileSync(process.execPath, [PATH], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ran = true;
} catch (error) {
  // A non-zero exit is legitimate (behind/diverged) but it must still have spoken.
  said = String(error.stdout ?? "");
  ran = said.length > 0 || String(error.stderr ?? "").length > 0;
}
check("running it reports a verdict rather than crashing", ran && /git-sync-guard:/.test(said));

const pkgPath = "package.json";
const pkg = JSON.parse(read(pkgPath));
check("it is wired as a script", pkg.scripts["check:git-sync"] === "node scripts/git-sync-guard.mjs");

const readme = read("README.md");
check("the README tells a clone to install the hook", /git-sync-guard\.mjs --install/.test(readme));

const log = read("decisions-log.md");
check("the decisions log records Task 9.1.4", /D9\.1\.4/.test(log));

const deps = Object.keys(pkg.dependencies ?? {});
check("no dependency was added for it", deps.length === 0);

for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.log(`  FAIL  ${name}`);
console.log(`\nGit sync guard structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
