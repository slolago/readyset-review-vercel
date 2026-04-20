---
phase: 43
plan: 01
status: human_needed
typecheck: passed
automated_checks: passed
human_checkpoint: Task 9 — manual QA of the seven scenarios in 43-01-PLAN.md
---

# Phase 43 Verification

## Automated (passed)

- `npx tsc --noEmit` — clean
- `src/lib/version-groups.ts` exists and exports `fetchGroupMembers` + `resolveGroupId`
- All stack-mutation routes (merge, unstack, reorder) and GET handler use the helper
- `grep -rn "where('versionGroupId'" src/app/api/assets/` — only hits are in non-stack-mutation paths (copy read, PUT folderId move) which are explicitly out of Phase 43 scope
- Integration script `scripts/verify-stack-integrity.ts` exists and is runnable

## Human verification needed (Task 9 checkpoint)

The plan ends in a `checkpoint:human-verify` task (Task 9) listing seven QA scenarios:

1. Stack any onto any (DnD)
2. Stack-onto-stack via context menu (the new Gap 5 affordance)
3. Detach original root (Bug 2 regression guard)
4. Detach non-topmost version
5. Reorder within modal
6. Review-link preservation after unstack
7. Firestore console sanity — no dangling versionGroupId pointers

These require a live environment with at least 3 videos and manual comparison of before/after Firestore state. The autonomous executor cannot complete them; routing this plan as `human_needed` so the orchestrator can surface the checklist to the user.

## Commits in this phase

See `43-01-SUMMARY.md` — eight atomic task commits from `5825d745` to `1a9cb9f2`.
