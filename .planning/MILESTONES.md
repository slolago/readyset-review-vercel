# Milestones

## v1.7 Review UX & Access Rewrite (Shipped: 2026-04-20)

**Phases completed:** 6 phases (43–48), 6 plans, 66 commits
**Files changed (src/):** 56 files, +3,251 / -364 lines
**Timeline:** Single-day sprint, 2026-04-20

**Key accomplishments:**

1. **Phase 43 — version-stack-rewrite:** New `src/lib/version-groups.ts` helper centralizes legacy-root handling; merge, unstack, reorder APIs refactored to use it. Fixed 4 audit bugs: legacy-root drop on merge, ghost-group on unstack root, ad-hoc legacy fallback, reorder partial-input. Added `StackOntoModal` context-menu affordance from grid. Regression script `scripts/verify-stack-integrity.ts`.
2. **Phase 44 — access-model-enforcement:** Stood up Vitest from zero; created `src/lib/permissions.ts` as single source of truth for platform + project + review-link permissions; refactored 22 API routes to delegate; closed 7 concrete security holes (reviewer-write bypass, allowComments bypass on guest POST, expiry/password bypass on guest writes, admin override on projects, project-owner review-link revocation). **116/116 tests green.**
3. **Phase 45 — admin-ui-and-project-rename:** New admin surfaces — `ProjectPermissionsPanel` (audit collaborators + review-link holders + flags), `OrphanUsersPanel` (uninvited cleanup), `UserSessionActions` (suspend + revoke). Three new admin API routes. `RenameProjectModal` + server-side collision check on PUT `/api/projects/:id`.
4. **Phase 46 — comments-integrity-and-range:** Range-comment timeline tooltips polished; `CommentItem` shows range badge + click-to-seek to in-point; composer state + pendingAnnotation cleared on asset switch; `_commentCount` derivation fixed (skip replies + empty text); sidebar tab count matches grid badge; OUT<IN guard + pulsing OUT hint.
5. **Phase 47 — video-export-pipeline:** New `ExportJob` model; POST `/api/exports` runs ffmpeg inline — MP4 (stream-copy with re-encode fallback), GIF (two-pass palettegen/paletteuse); GET `/api/exports/[jobId]` returns fresh signed URL; `ExportModal` with trim bar + format toggle + filename; wired into internal viewer (hidden on review-link pages). `next.config.mjs` updated for Vercel bundling.
6. **Phase 48 — playback-loop-and-selection-hierarchy:** Lifted in/out markers from CommentSidebar to viewer parent; new `loop` toggle in VideoPlayer controls — loops whole video when no range set, clamps to in/out when set (with one-cycle grace on manual seek); new `src/lib/selectionStyle.ts` helper; applied to ProjectCard / FolderCard / AssetCard + sidebar tree parent-of-selected indicator.

**New files (high-value):** `src/lib/permissions.ts`, `src/lib/version-groups.ts`, `src/lib/selectionStyle.ts`, `src/lib/exports.ts`, `src/lib/ffmpeg-resolve.ts`, `tests/permissions.test.ts`, `tests/permissions-api.test.ts`, `src/components/admin/{ProjectPermissionsPanel,OrphanUsersPanel,UserSessionActions}.tsx`, `src/components/viewer/ExportModal.tsx`, `src/components/projects/RenameProjectModal.tsx`, `src/components/files/StackOntoModal.tsx`, 3 admin API routes + exports API routes.

**Pending:** Human verification walkthroughs for phases 43, 45, 46, 47, 48 (automated verification passed all; live-environment checks require running dev server).

---

## v1.3 Video Review Polish (Shipped: 2026-04-08)

**Phases completed:** 6 phases (23–28), 8 plans
**Files changed:** 56 files, +6,074 / -64 lines
**Timeline:** 2026-04-07 → 2026-04-08

**Key accomplishments:**

1. Fixed SMPTE timecode frame digit freezing on frame-step — direct `setCurrentTime` call bypasses the 0.25s rAF threshold in `VideoPlayer.tsx`
2. Added opacity slider to safe zones overlay — slider shows only when a zone is active, resets to 100% on zone change
3. Comment count badge on grid cards — `MessageSquare` icon + "99+" cap, reads `_commentCount` from existing API response (zero API calls)
4. File info tab in asset viewer sidebar — Comments/Info tab bar; `FileInfoPanel` shows 10 metadata fields (filename, type, size, duration, resolution, aspect ratio, FPS, uploader name, date, version)
5. Synchronized asset comparison modal — select 2 assets → full-screen side-by-side with shared play/pause, shared scrubber, and per-side audio toggle
6. Drag-and-drop version stacking — drag asset A onto B merges A's entire version group into B's stack via atomic Firestore batch write; accent border highlight, toast confirmation, grid refresh

**New files:** `FileInfoPanel.tsx`, `AssetCompareModal.tsx`, `POST /api/assets/merge-version`

---

## v1.2 Feature Expansion (Shipped: 2026-04-07)

22 phases shipped. See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details.

---
