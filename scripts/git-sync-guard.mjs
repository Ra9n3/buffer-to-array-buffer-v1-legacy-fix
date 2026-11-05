#!/usr/bin/env node
/**
 * ALLOY — the local-vs-origin sync guard (Task 9.1.4).
 *
 * Why this exists. During 9.1 the local clone twice held a history that had
 * *lost commits already pushed to origin*: `HEAD` sat on an older commit while
 * `origin/<branch>` was two commits further ahead, and the files of that work
 * survived only as untracked copies on disk. Committing then would have deleted
 * ~5,400 pushed lines, and pushing would have served the deletion to the PR. It
 * was caught by luck, not by a check.
 *
 * A guard that only reads `origin/<branch>` cannot catch this: in both
 * incidents that remote-tracking ref was itself absent or stale, because nothing
 * had fetched. So this fetches first. If the fetch fails (offline, no network)
 * it says so and stands down — a sync guard must never block work because the
 * network is down.
 *
 *   node scripts/git-sync-guard.mjs            check, explain, exit 1 if unsafe
 *   node scripts/git-sync-guard.mjs --install  install the pre-commit hook
 *   node scripts/git-sync-guard.mjs --uninstall
 *
 * Set ALLOY_SKIP_SYNC_CHECK=1 to bypass (merges and rebases do this themselves).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const EXIT_UNSAFE = 1;
const EXIT_OFFLINE = 0; // never block on a network failure
const FETCH_TIMEOUT_MS = 8000;

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function tryGit(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

/** The branch we are actually on, or null when detached. */
function currentBranch() {
  const name = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  return name && name !== "HEAD" ? name : null;
}

/** Fetch the current branch from origin. Returns true when origin was reachable. */
function fetchOrigin(branch) {
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", branch], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: FETCH_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

const isAncestor = (maybeAncestor, descendant) => {
  try {
    git(["merge-base", "--is-ancestor", maybeAncestor, descendant]);
    return true;
  } catch {
    return false;
  }
};

function repoRoot() {
  return tryGit(["rev-parse", "--show-toplevel"]);
}

/**
 * Compare local HEAD with origin/<branch>.
 * `verdict` is one of: in-sync, ahead, behind, diverged, no-upstream, offline.
 */
export function inspect() {
  const branch = currentBranch();
  if (!branch) return { verdict: "detached", branch: null };

  if (!fetchOrigin(branch)) {
    return { verdict: "offline", branch, remote: `origin/${branch}` };
  }

  const remote = `origin/${branch}`;
  const upstream = tryGit(["rev-parse", "--verify", "--quiet", remote]);
  if (!upstream) return { verdict: "no-upstream", branch, remote };

  const head = git(["rev-parse", "HEAD"]);
  if (head === upstream) return { verdict: "in-sync", branch, remote, head };

  // Behind: every local commit is already on origin, yet origin has more. This
  // is the shape of the incident — local history silently went backwards.
  if (isAncestor(head, upstream)) {
    const behind = Number(git(["rev-list", "--count", `${head}..${upstream}`]));
    return { verdict: "behind", branch, remote, head, upstream, behind };
  }

  // Ahead: local is origin plus our own unpushed commits. The normal case.
  if (isAncestor(upstream, head)) {
    const ahead = Number(git(["rev-list", "--count", `${upstream}..${head}`]));
    return { verdict: "ahead", branch, remote, head, upstream, ahead };
  }

  return { verdict: "diverged", branch, remote, head, upstream };
}

const ADVICE = {
  behind: (r) =>
    `Local history is BEHIND ${r.remote} by ${r.behind} commit(s).\n` +
    `This is the destructive shape: committing now would "delete" pushed work and\n` +
    `pushing would serve that deletion to the PR.\n\n` +
    `  git fetch origin\n` +
    `  git reset ${r.remote}      # mixed reset; files on disk are untouched\n\n` +
    `Then re-check that nothing of yours is only on disk (git status) before staging.`,
  diverged: (r) =>
    `Local history has DIVERGED from ${r.remote}.\n` +
    `Neither side contains the other, so a push would be rejected.\n\n` +
    `  git log --oneline --left-right ${r.remote}...HEAD\n\n` +
    `Rebase your own commits onto origin, or ask before rewriting anything.`,
  detached: () =>
    `HEAD is detached. Commits made here belong to no branch and are easy to lose.\n` +
    `  git switch -c <name>`,
};

function main(argv) {
  const install = argv.includes("--install");
  const uninstall = argv.includes("--uninstall");
  const root = repoRoot();

  if (!root) {
    console.error("git-sync-guard: not inside a git repository");
    return 0;
  }

  if (install || uninstall) {
    const hookPath = join(root, ".git", "hooks", "pre-commit");
    if (uninstall) {
      rmSync(hookPath, { force: true });
      console.log("git-sync-guard: pre-commit hook removed");
      return 0;
    }
    const relative = "scripts/git-sync-guard.mjs";
    if (!existsSync(join(root, relative))) {
      console.error(`git-sync-guard: ${relative} not found; run this from the repo root`);
      return EXIT_UNSAFE;
    }
    mkdirSync(dirname(hookPath), { recursive: true });
    writeFileSync(
      hookPath,
      [
        "#!/bin/sh",
        "# Installed by scripts/git-sync-guard.mjs (Task 9.1.4).",
        "# Blocks a commit when local history has fallen behind origin, so pushed",
        "# work cannot be silently reverted by a stale clone.",
        `node "${relative}" || exit 1`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const current = readFileSync(hookPath, "utf8");
    // Write again through chmod to be sure it is executable on every platform.
    writeFileSync(hookPath, current, { mode: 0o755 });
    console.log("git-sync-guard: pre-commit hook installed");
    console.log("  bypass with ALLOY_SKIP_SYNC_CHECK=1 when you know why");
    return 0;
  }

  if (process.env.ALLOY_SKIP_SYNC_CHECK === "1") {
    console.log("git-sync-guard: skipped (ALLOY_SKIP_SYNC_CHECK=1)");
    return 0;
  }

  const result = inspect();

  switch (result.verdict) {
    case "in-sync":
    case "ahead":
    case "no-upstream":
      // Safe. Say the useful thing quietly and get out of the way.
      if (result.verdict === "ahead") {
        console.log(`git-sync-guard: ok — ${result.ahead} unpushed commit(s) on ${result.branch}`);
      } else if (result.verdict === "no-upstream") {
        console.log(`git-sync-guard: ${result.remote} does not exist yet — nothing to compare`);
      } else {
        console.log(`git-sync-guard: ok — ${result.branch} matches ${result.remote}`);
      }
      return 0;

    case "offline":
      console.error(
        `git-sync-guard: could not reach origin, so this check was skipped.\n` +
          `  Consider \`git fetch origin\` before committing — an unreachable origin is\n` +
          `  exactly when stale local history goes unnoticed.`,
      );
      return EXIT_OFFLINE;

    default: {
      const advice = ADVICE[result.verdict];
      console.error(`git-sync-guard: ${result.verdict.toUpperCase()}`);
      console.error(advice ? advice(result) : "");
      return EXIT_UNSAFE;
    }
  }
}

// Only run when invoked directly, so the module can be imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
