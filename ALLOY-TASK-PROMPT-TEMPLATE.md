# ALLOY — Task Prompt Template

Use this structure for every build task, UI or otherwise. Fill in each bracketed
section. Do not remove the STOP CONDITION block.

```text
TASK: [number + short name]

READ FIRST:
- decisions-log.md
- glossary.md (required for every task; use canonical terms consistently)
- architecture.md (if it exists yet)
- hardware-reference.md (required for any Phase 1 or Phase 2 task)
- All prior task reports in /task-reports/
  Do not re-litigate decisions already locked in these documents. If a
  decision is marked "deferred," do not silently treat it as finalized —
  choose the simplest testable approach, record it, and preserve the ability
  to change it later.

SCOPE (do exactly this, nothing more):
- [one specific, bounded deliverable]
- [one specific, bounded deliverable]

DO NOT TOUCH:
- [explicitly list rooms/components/files that must not change this task]
- Do not add functionality beyond what is listed above, even if it seems
  like a natural next step.

STRUCTURE REQUIREMENTS (layout/behavior — must be unambiguous without images):
- [ASCII box diagram of the layout, if applicable]
- [explicit grid/flex spec: fixed vs. flexible sizes, breakpoints, scroll
  containers]

VISUAL REQUIREMENTS (skin — only include in Phase 1/2 tasks):
- [reference the specific section of hardware-reference.md that applies]
- [which function-colors from the color table apply to this component]
- Use only existing shared components — do not create one-off styles.

ACCEPTANCE CRITERIA (all must be true before the task is considered done):
- [ ] Automated structural check passes: no unintended horizontal overflow, no console/runtime errors, every navigable route renders, and no element exceeds its container bounds
- [ ] App builds and runs with no console errors
- [ ] [specific resize/scroll/overlap check]
- [ ] [specific interaction check]
- [ ] No changes made outside the stated scope

STOP CONDITION:
Do not proceed to another task automatically. End this task, write the task
report, and wait for explicit user approval of the running app before any
further work begins.

OUTPUT:
Write /task-reports/[number]-report.md with: what was built, any deviations
and why, what was tested, and what remains.
```
