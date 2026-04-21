---
phase: 58-data-consistency
plan: 01
subsystem: data-consistency
tags: [types, permissions, rename, logging]
requires:
  - src/lib/permissions.ts::canAccessProject(user, project)
  - src/app/api/projects/[projectId]/route.ts PUT collision pattern
provides:
  - src/lib/names.ts::validateAssetRename
  - src/lib/names.ts::validateFolderRename
  - Asset.thumbnailGcsPath, Asset.spriteStripGcsPath, Asset.spriteStripUrl, Asset.description
  - Comment.approvalStatus
affects:
  - /api/assets/size, /api/review-links/[token]/viewers (migrated to pure canAccessProject)
  - /api/assets/[assetId] PUT (rename collision)
  - /api/folders/[folderId] PUT (rename collision)
  - 18 API route files (catch-block logging)
tech-stack:
  added: []
  patterns:
    - rename collision validation helper with pure-function + DB read separation
    - contextual log prefix format [VERB /api/route/path]
key-files:
  created:
    - src/lib/names.ts
    - tests/names.test.ts
  modified:
    - src/types/index.ts
    - src/lib/auth-helpers.ts
    - src/app/api/assets/size/route.ts
    - src/app/api/review-links/[token]/viewers/route.ts
    - src/app/api/assets/[assetId]/route.ts
    - src/app/api/folders/[folderId]/route.ts
    - src/app/api/exports/route.ts
    - src/app/api/exports/[jobId]/route.ts
    - src/app/api/admin/users/route.ts
    - src/app/api/admin/users/[userId]/route.ts
    - src/app/api/admin/projects/route.ts
    - src/app/api/assets/[assetId]/probe/route.ts
    - src/app/api/assets/[assetId]/generate-sprite/route.ts
    - src/app/api/assets/route.ts
    - src/app/api/users/route.ts
    - src/app/api/comments/route.ts
    - src/app/api/stats/route.ts
    - src/app/api/review-links/route.ts
    - src/app/api/review-links/all/route.ts
    - src/app/api/review-links/[token]/route.ts
    - src/app/api/review-links/[token]/contents/route.ts
    - src/app/api/projects/[projectId]/route.ts
    - src/app/api/projects/[projectId]/collaborators/route.ts
decisions:
  - "DC-01 wrapper removed outright (not deprecated) — only 2 callers existed, both migrated"
  - "DC-02 Comment.approvalStatus typed as ReviewStatus (server accepts all 3 values)"
  - "DC-03 test file placed in tests/ not src/lib/ — matches vitest.config include pattern"
  - "DC-03 collision check skipped when parentId changes in folder PUT (move-collision out of scope)"
metrics:
  duration_min: 6
  completed: 2026-04-20
---

# Phase 58 Plan 01: data-consistency Summary

Closed DC-01..04 by consolidating the async canAccessProject wrapper, declaring phantom Asset/Comment fields, adding rename-collision validation for assets + folders, and ensuring every API catch block logs with a contextual prefix.

## DC-01: canAccessProject consolidation

Migrated call sites (2):

| Route | Change |
|---|---|
| `GET /api/assets/size` | Load project doc inside try, call pure `canAccessProject(user, project)` |
| `GET /api/review-links/[token]/viewers` | Load project doc after review-link doc, call pure `canAccessProject(user, project)` |

**Wrapper disposition:** `canAccessProject(userId, projectId)` in `src/lib/auth-helpers.ts` was **removed entirely** — not deprecated. Grep confirmed only those two callers; no other consumers. Removed the `canAccessProjectPure` alias import and unused `Project` type import.

Verification: `rg "canAccessProject\(user\.id" src/` returns zero matches.

## DC-02: Asset + Comment field audit

### Audit table (server → Firestore writes)

| File | Fields written | Status |
|---|---|---|
| `src/app/api/upload/signed-url/route.ts` | projectId, folderId, name, type, subtype, mimeType, url, gcsPath, thumbnailUrl, size, uploadedBy, status, version, versionGroupId, createdAt | all already declared |
| `src/app/api/upload/complete/route.ts` | status, width, height, duration, frameRate, thumbnailUrl, **thumbnailGcsPath**, probed | thumbnailGcsPath ADDED; rest already declared |
| `src/app/api/upload/thumbnail/route.ts` (sprite branch) | **spriteStripUrl**, **spriteStripGcsPath** | BOTH ADDED |
| `src/app/api/upload/thumbnail/route.ts` (thumbnail branch) | thumbnailUrl, **thumbnailGcsPath** | thumbnailGcsPath ADDED (same field) |
| `src/app/api/assets/[assetId]/probe/route.ts` | probed, containerFormat, duration, bitRate, videoCodec, width, height, pixelFormat, colorSpace, colorPrimaries, colorTransfer, profile, level, frameRate, videoBitRate, rotation, audioCodec, audioChannels, audioChannelLayout, audioSampleRate, audioBitRate | all already declared |
| `src/app/api/assets/[assetId]/generate-sprite/route.ts` | **spriteStripUrl**, **spriteStripGcsPath** | added above |
| `src/app/api/assets/[assetId]/route.ts` PUT | name, folderId, reviewStatus, **description** | description ADDED |
| `src/app/api/assets/[assetId]/route.ts` DELETE | deletedAt, deletedBy | already declared |
| `src/app/api/assets/copy/route.ts` | full-doc clone + folderId, name, versionGroupId, version, createdAt, uploadedBy | no new fields |
| `src/app/api/assets/unstack-version/route.ts` | versionGroupId, version | already declared |
| `src/app/api/assets/merge-version/route.ts` | versionGroupId, version | already declared |
| `src/app/api/assets/reorder-versions/route.ts` | version | already declared |
| `src/lib/trash.ts` (reads) | reads `thumbnailGcsPath`, `spriteStripGcsPath` | now both declared |

**Added to Asset:** `thumbnailGcsPath?`, `spriteStripUrl?`, `spriteStripGcsPath?`, `description?`.

**Comment.approvalStatus:** Typed as `ReviewStatus` (`'approved' | 'needs_revision' | 'in_review'`). Server-side `src/app/api/comments/route.ts` line 238 validates against exactly those three literals, so using the shared `ReviewStatus` is strictly correct (user's prose suggested a narrower 2-value union, but the persisted value-set is 3 — I followed the code's VALID array).

Transient response-shape fields intentionally NOT added to `Asset`: `signedUrl`, `downloadUrl`, `thumbnailSignedUrl`, `spriteSignedUrl`, `spriteStripSignedUrl`. These are attached in route handlers only, never persisted.

## DC-03: Rename-collision validation

### API contract

**Asset PUT /api/assets/[assetId]** request body includes `name: string`. Validation runs AFTER the whitelist filter, BEFORE the folder-move branch.

**Folder PUT /api/folders/[folderId]** request body includes `name: string`. Validation runs AFTER the whitelist filter, BEFORE the parentId cross-project check.

### Responses

| Case | Status | Body |
|---|---|---|
| newName trims to empty | 400 | `{ error: 'Name cannot be empty', code: 'EMPTY_NAME' }` |
| sibling with same (case-insensitive) name exists | 409 | `{ error: 'An asset named "X" already exists here', code: 'NAME_COLLISION' }` (or `'A folder named "X" ...'`) |
| no collision | passthrough | update proceeds; stored name is trimmed |
| no-op rename (trimmed === current) | passthrough | update proceeds |
| sibling is soft-deleted | passthrough | soft-deleted siblings ignored |

Sibling query: `assets` scoped by `(projectId, folderId ?? null)`, excluding self. Folders scoped by `(projectId, parentId ?? null)`. Match is case-insensitive via `.toLowerCase()` comparison; `deletedAt` presence skips the doc.

**Tests:** `tests/names.test.ts` covers 13 scenarios (7 asset + 6 folder) using a minimal Firestore admin fake — all 6 behaviors per helper plus folder-parent-scoping.

**Test file location deviation:** The plan specified `src/lib/names.test.ts`, but `vitest.config.ts` only includes `tests/**/*.test.ts`. Placed at `tests/names.test.ts` instead so the suite actually runs (Rule 3 — blocking issue).

**Out of scope:** Move-collision at a NEW parent (rename + parentId change in the same PUT) is not validated — the check runs against the CURRENT parent scope. No UI currently emits that combo; deferred to a future plan if needed.

## DC-04: Contextual catch-block logging

Every catch block in `src/app/api/**/*.ts` now logs via `console.error('[VERB /api/path]', err)` (or contextual equivalent for non-route helpers) before returning or continuing.

| File | Catches modified | Prefix pattern |
|---|---|---|
| `admin/projects/route.ts` | 1 | `[GET /api/admin/projects]` |
| `admin/users/route.ts` | 5 | `[GET /POST /PUT /DELETE /api/admin/users]`, inner auth delete |
| `admin/users/[userId]/route.ts` | 4 | `[GET /PATCH /api/admin/users/[userId]]`, inner stats + auth revoke + reactivate |
| `assets/route.ts` | 1 | `[GET /api/assets] comment count query failed` |
| `assets/[assetId]/route.ts` | 3 | `[GET /PUT /api/assets/[assetId]]`, inner sign-versions |
| `assets/[assetId]/probe/route.ts` | 4 | resolveFfprobe × 3 + JSON.parse catch |
| `assets/[assetId]/generate-sprite/route.ts` | 2 | chmod + tmp dir cleanup |
| `comments/route.ts` | 1 | `[GET /api/comments] token verify failed` |
| `exports/route.ts` | 3 | safeUnlink, invalid-JSON body, sign-download fallback |
| `exports/[jobId]/route.ts` | 1 | sign-download fallback |
| `projects/[projectId]/route.ts` | 1 | `[GET /api/projects/[projectId]]` |
| `projects/[projectId]/collaborators/route.ts` | 2 | `[POST /DELETE /api/projects/[projectId]/collaborators]` |
| `review-links/route.ts` | 1 | `[POST /api/review-links]` |
| `review-links/all/route.ts` | 1 | inner comment-count chunk |
| `review-links/[token]/route.ts` | 5 | inner sign × 3 + PUT + DELETE route-level |
| `review-links/[token]/contents/route.ts` | 1 | sign-thumbnail inner |
| `stats/route.ts` | 3 | per-project asset query + review-link chunk + route-level |
| `users/route.ts` | 1 | `[GET /api/users]` |

**Intentional-swallow handling:** Two catches that were intentionally silent with explanatory comments (`admin/users/[userId]` disable-auth block, `exports/route.ts::safeUnlink`) were also updated to log — they now preserve control flow but emit a contextual error. Plan allowed preserving them, but strict reading of the must-haves ("every catch block in src/app/api/**/*.ts logs via console.error with a contextual prefix") made logging universal.

Final sweep: `rg "catch\s*\{|catch\s*\(\s*_\w*\s*\)\s*\{" src/app/api` → zero matches.

No response body or status-code changes; only catch parameter + log insertion.

## Deviations from Plan

1. **Rule 3 — test file location:** Placed `names.test.ts` in `tests/` (project convention) instead of `src/lib/` (plan's suggestion). Vitest config doesn't scan `src/` so the plan's path would have silently skipped the suite.
2. **Claude's discretion — Comment.approvalStatus type:** Used shared `ReviewStatus` (3-value) not a narrower 2-value union. Server validates all 3 literals; declaring a narrower type would mis-describe persisted values.
3. **DC-01 wrapper fully removed:** Plan allowed fall-back to `@deprecated` if any caller was uncoverable — none were. Removed entirely per user instruction ("cleaner than deprecation").
4. **DC-04 universal logging:** Logged two intentional-swallow catches that the plan said could be preserved. Same control flow; just added logs so the final grep returns zero matches without relying on prose-annotated exceptions.

## Verification

- `npx tsc --noEmit` — clean (exit 0)
- `npx vitest run` — 151 tests pass across 4 files (names.test.ts added 13)
- `rg "canAccessProject\(user\.id" src/` — 0 matches
- `rg "thumbnailGcsPath|spriteStripGcsPath" src/types/index.ts` — 2 matches in Asset
- `rg "approvalStatus" src/types/index.ts` — 1 match in Comment
- `rg "validateAssetRename|validateFolderRename" src/app/api` — matches in both PUT handlers
- `rg "catch\s*\{|catch\s*\(\s*_\w*\s*\)\s*\{" src/app/api` — 0 matches

## Commits

- `e556eade` refactor(58-01): consolidate canAccessProject onto pure permissions helper (DC-01)
- `532f7ac4` feat(58-01): declare all server-written Asset fields + Comment.approvalStatus (DC-02)
- `455837c6` feat(58-01): validate rename collisions for assets + folders (DC-03)
- `01cecaa5` refactor(58-01): log contextual errors in all API catch blocks (DC-04)

## Self-Check: PASSED

- FOUND: src/lib/names.ts
- FOUND: tests/names.test.ts
- FOUND: commit e556eade
- FOUND: commit 532f7ac4
- FOUND: commit 455837c6
- FOUND: commit 01cecaa5
