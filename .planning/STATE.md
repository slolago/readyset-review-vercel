---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Review & Version Workflow
status: Defining requirements
stopped_at: milestone start
last_updated: "2026-04-08T15:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** v1.4 — Review & Version Workflow

## Current Phase

None — defining requirements

## Status

v1.4 started. Requirements phase in progress.

## Decisions

- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- Use application/x-frame-move MIME type (not text/plain) so container drag handlers can distinguish internal item drags from OS file/folder drops
- Dual MIME type on drag start (x-frame-move + x-frame-version-stack) for version stacking
- frameRate stored as optional number on Asset interface — absent for legacy assets; FPS row shows dash when not present
- Atomic Firestore batch for version group merge — prevents collision under concurrency

## Blockers

(none)
