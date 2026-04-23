---
gsd_state_version: 1.0
milestone: v2.4
milestone_name: Meta XMP Stamping on Delivery
status: complete
stopped_at: All 4 phases implemented (79-82); pending human verification on Vercel runtime + live stamp round-trip
last_updated: "2026-04-23T15:00:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** Fast, accurate video review
**Current focus:** v2.4 shipped (code); human verification pending on Vercel runtime + live round-trip

## Current Position

Phase: All v2.4 phases shipped (79, 80, 81, 82)
Status: Milestone complete (code) — 4/4 phases, 6/6 plans, 13/13 REQs addressed
Last activity: 2026-04-23 — Phase 82 summary written; roadmap updated

Progress: [██████████] 100% (4/4 phases)

## Accumulated Context

### Key decisions (v2.4)

- Always-async stamp jobs — no sync threshold; Vercel 60s budget cannot absorb even 1 large-file stamp inline in a POST
- One stamped GCS copy per asset (`projects/{pid}/assets/{aid}/stamped{ext}`) — shared across review links; deterministic from asset name + hardcoded constants
- `stampedAt < updatedAt` invalidation with active null-clearing on rename (redundant but explicit per spec wording; releases stale cached signed URL)
- Per-request `new ExifTool({ maxProcs:1, maxTasksPerProcess:1 })` with `await et.end()` in finally — never module-scope singleton; no `-stay_open True` in serverless
- Streaming GCS upload via new `uploadStream()` helper — `uploadBuffer()` OOMs on 500MB+ source
- Attrib append-semantics (read existing → normalize to array → re-stamp `Data` on each → append new entry) — mirrors reference scf-metadata Electron app 1:1
- `-config` passed to `et.write()` args (not constructor) — standard exiftool-vendored pattern
- `coerceToDate()` at every timestamp comparison — per PITFALLS.md; raw Timestamp-vs-ISO silently breaks
- Hardcoded `FB_ID=2955517117817270`, `DATA='|{"Company":"Ready Set"|}'`, `META_TZ='America/New_York'` — matches reference app; future milestone may extract to `project.metaConfig`
- `decorate()` fallback to original URL on missing/stale stamp — guests never see 503, link always usable (STAMP-08)
- Subfolder drill-down stamps deferred to future milestone — direct root-level assets only at POST time

### v2.4 reference materials

- `scf-metadata` Electron source: `C:\Users\Lola\AppData\Local\scf-meta\app-0.11.9\resources\app`
  - `src/backend/exiftool.js` — 60-line reference implementation
  - `public/exiftool/.config` — XMP namespace schema
- Before/after sample files: `C:\Users\Lola\Documents\RS_RPLT_D001_C005_WalkThroughUGC_NEW_V01_VID_9x16.mp4` vs Downloads copy
- Phase 79 verification report — `.planning/phases/79-platform-spike/79-VERIFICATION-SPIKE.md`

### Recently shipped

- v2.4 Meta XMP Stamping on Delivery (4 phases, 2026-04-23)
- v2.3 App-Wide Performance Polish (5 phases, 2026-04-22)
- v2.2 Dashboard & Annotation UX Fixes (4 phases, 2026-04-21)
- v2.1 Dashboard Performance (3 phases, 2026-04-21)

### Operational state

- **Pending human verification:** `/api/spike/exiftool-version` deploy on Vercel Pro Lambda — confirm perl resolves and `et.version()` returns successfully. Fallback plan documented in `79-VERIFICATION-SPIKE.md` if perl is absent.
- **Pending human verification (live round-trip):** Create a real review link with a video asset; confirm guest downloads a file with all 4 `Attrib` XMP fields. Rename flow; new-version flow; concurrent-creator flow.
- **Vercel auto-deploy:** observed that the vercel remote push doesn't immediately trigger a deploy (buildId unchanged 10+ min after push). May require manual deploy trigger from dashboard, or auto-deploy may simply be slow. Not a code issue.
- **Cleanup item:** remove `/api/spike/exiftool-version` after v2.4 production stamp pipeline is confirmed healthy. Tracked.
- Firestore composite indexes deployed (v1.9 + v2.0 + v2.1 batches + v2.3 comments(assetId, reviewLinkId))
- Review-link passwords auto-migrate plaintext → bcrypt on first verify (v2.0)
- collaboratorIds backfilled on 18 existing projects (v2.1)

### Pending Todos

None — v2.4 code complete.

### Blockers/Concerns

- **Perl on Vercel Lambda (LOW confidence → pending verification):** spike route deployed but not yet confirmed live. Human action: check Vercel dashboard for commit `10ac41f4` deploy status; curl spike endpoint. If fails, execute fallback plan in `79-VERIFICATION-SPIKE.md`.
- **Vercel bundle size:** `exiftool-vendored` + `.pl` add ~24MB to the deploy. Haven't confirmed we stay under the 250MB uncompressed Vercel Pro limit with ffmpeg/ffprobe already in place. Check deploy logs if deploy fails.

## Session Continuity

Last session: 2026-04-23
Stopped at: v2.4 code complete; lifecycle (audit + archive + cleanup) pending
Resume file: None
