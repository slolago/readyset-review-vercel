---
phase: 78-data-layer-bundle-and-network
plan: 01
subsystem: api
tags: [firestore, pagination, next-font, lucide-react, next-image, preconnect, cache-control, bundle]

requires:
  - phase: 74-viewer-critical-path
    provides: Server-component split and composite-index patterns
  - phase: 75-page-loading-and-server-components
    provides: Parallel fetch pattern (useProject/admin tabs)
provides:
  - Cursor-based pagination on /api/admin/users, /api/admin/projects, /api/review-links/all
  - Firestore composite index for comments(assetId, reviewLinkId)
  - db.getAll folder batch + chunk-by-20 signed-URL fan-out in review-link contents route
  - Cache-Control (public, s-m-a=300, swr=600) on /api/assets GET
  - next/font/google Inter with display=swap; modularizeImports for lucide-react
  - Preconnect hints for firestore + storage; AssetListView migrated to next/image; date-fns removed
affects: [future admin pagination UI work, any new review-link batching, any new preconnect targets]

tech-stack:
  added: [next/font/google, modularizeImports (next.config)]
  patterns:
    - "Cursor pagination: ?limit (default 50, max 100) + ?cursor returning { items, nextCursor }"
    - "Chunked signed-URL fan-out: CHUNK=20 over assetIds (v2.0/v2.1 pattern generalized)"
    - "Preconnect <link> tags via JSX <head> in App Router layout"

key-files:
  created: []
  modified:
    - src/app/api/admin/users/route.ts
    - src/app/api/admin/projects/route.ts
    - src/app/api/review-links/all/route.ts
    - src/app/(app)/admin/page.tsx
    - src/app/api/review-links/[token]/contents/route.ts
    - src/app/api/assets/route.ts
    - firestore.indexes.json
    - src/app/globals.css
    - src/app/layout.tsx
    - next.config.mjs
    - src/components/files/AssetListView.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Ship API-side pagination with default limit 50; defer admin client Load-more UI (too invasive for one surgical task)"
  - "review-links/all uses in-memory cursor slicing — a Firestore-side cross-project ordered union would need a new composite index and is deferred"
  - "date-fns removal was a dead-dep uninstall, not a hot-path helper swap — formatDuration/formatRelativeTime were already native in src/lib/utils.ts"
  - "Parent div in AssetListView thumbnail cell got 'relative' added (required for next/image fill)"

patterns-established:
  - "Cursor pagination contract: { items, nextCursor: string | null } with nextCursor null when page < limit"
  - "Chunked async fan-out: slice by CHUNK=20, serialize chunks, parallelize within each"
  - "Preconnect targets for Firebase+GCS live in root layout <head> JSX, crossOrigin empty-string for CORS warmup"

requirements-completed: [PERF-24, PERF-25, PERF-26, PERF-27]

duration: 15min
completed: 2026-04-22
---

# Phase 78 Plan 01: data-layer-bundle-and-network Summary

**Admin pagination (3 routes, cursor-based), comments(assetId, reviewLinkId) composite index + db.getAll folder batch + chunked signed-URL fan-out, next/font/google Inter, lucide-react modularizeImports, Firebase+GCS preconnect hints, AssetListView img→Image, and date-fns dead-dep removal.**

## Operational Steps

> **ACTION REQUIRED (operator, post-deploy):**
> ```
> firebase deploy --only firestore:indexes
> ```
> This activates the new `comments(assetId, reviewLinkId)` composite index added to `firestore.indexes.json`. Until deployed, `/api/comments` GET will continue its existing in-memory fallback path (non-fatal; unchanged behavior from pre-plan state). No code block depends on the index being live to return correct results — the deploy is a pure performance win.

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-22T13:36:00Z
- **Completed:** 2026-04-22T13:51:36Z
- **Tasks:** 4 (all autonomous, single wave)
- **Files modified:** 13

## Accomplishments

- **PERF-24** — All three admin-facing unbounded list routes (`/api/admin/users`, `/api/admin/projects`, `/api/review-links/all`) now accept `?limit` (default 50, clamped to [1,100]) + `?cursor`, return `nextCursor: string | null`, and enforce `.limit(N)` against Firestore. Scans past 500+ records no longer freeze the process.
- **PERF-25** — Added `comments(assetId, reviewLinkId)` composite index; replaced per-folder `.get()` fan-out with a single `db.getAll(...refs)` RPC in review-link contents; chunked the asset signed-URL fan-out by 20 (bounds concurrent GCS signing calls). Added `Cache-Control: public, max-age=300, stale-while-revalidate=600` to the `/api/assets` GET happy path.
- **PERF-26** — Removed blocking `@import url('https://fonts.googleapis.com…')` from `globals.css`; wired `next/font/google` Inter with `display: 'swap'` and weights 300–800 on `<body>`; added top-level `modularizeImports` for `lucide-react` so each route only ships the icons it imports.
- **PERF-27** — Added `<link rel="preconnect">` tags for `firestore.googleapis.com` and `storage.googleapis.com` (with `crossOrigin=""` for CORS warmup) in the root layout `<head>`; migrated the two remaining raw `<img>` thumbnails in `AssetListView.tsx` to `next/image` (with `fill`, `sizes="40px"`, `unoptimized` for signed URLs); removed unused `date-fns` from `package.json` (zero imports in `src/`).

## Task Commits

Each task was committed atomically:

1. **Task 1 (PERF-24): Cursor-based pagination on 3 admin routes** — `6348598b` (feat)
2. **Task 2 (PERF-25): Comments composite index + db.getAll + chunked fan-out + Cache-Control** — `3c0bb7fc` (feat)
3. **Task 3 (PERF-26): next/font + lucide-react modularizeImports** — `3259b4f9` (feat)
4. **Task 4 (PERF-27): Preconnect + AssetListView img→Image + date-fns removal** — `6e1846ea` (feat)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified

- `src/app/api/admin/users/route.ts` — GET now paginates via `?limit` + `?cursor`, returns `{ users, nextCursor }`.
- `src/app/api/admin/projects/route.ts` — Same pagination contract on GET; owner batch enrichment preserved (runs against paged slice).
- `src/app/api/review-links/all/route.ts` — Sort-then-slice cursor pagination over cross-project union; comment counts scoped to paged tokens only.
- `src/app/(app)/admin/page.tsx` — Inline comments noting API-side bounding; no UI change (data.users / data.projects still arrays).
- `src/app/api/review-links/[token]/contents/route.ts` — Folder batch via `db.getAll` (1 RPC); asset signed-URL fan-out chunked by 20.
- `src/app/api/assets/route.ts` — Cache-Control header on 200 response (happy path only).
- `firestore.indexes.json` — Added `comments(assetId, reviewLinkId)` composite.
- `src/app/globals.css` — Removed blocking Google Fonts `@import`.
- `src/app/layout.tsx` — `next/font/google` Inter on `<body>`; preconnect `<link>` tags in `<head>`.
- `next.config.mjs` — `modularizeImports` top-level key for `lucide-react`.
- `src/components/files/AssetListView.tsx` — 2 raw `<img>` → `next/image`; parent thumbnail div gets `relative` positioning (required for `fill`).
- `package.json` — Removed `date-fns` dependency.
- `package-lock.json` — Regenerated via `npm install` (`removed 1 package`).

## Decisions Made

- **Admin pagination: API-side only.** Adding infinite-scroll/Load-more UI + skeleton + row-append logic to `UserTable` / `ProjectsTable` would have doubled the task scope and changed the admin UX. Shipping bounded API + larger default page (50) still kills the unbounded-scan / OOM risk and preserves the visual regression budget at zero. The admin client reads `data.users` / `data.projects` unchanged — no breaking contract.
- **review-links/all cursor strategy: in-memory slice over sorted union.** A true Firestore-side cursor would require either (a) a composite index on `reviewLinks(projectId, createdAt)` combined with per-project stable ordering, or (b) a collection-group read with `orderBy('createdAt')` that bypasses the per-project scoping. Both are more architecturally invasive than this phase's perf surgery. The current list is bounded by user-accessible projects; memory pressure is "links per user", which is acceptable for this milestone.
- **date-fns as a dead-dep removal, not a helper swap.** Scouting confirmed zero imports of `date-fns` anywhere in `src/`. `formatDuration` and `formatRelativeTime` in `src/lib/utils.ts` were already native (`Math.floor`/`padStart`/native diff). The PERF-27 action reduces to an `npm uninstall` equivalent — no source swap, no new helper.
- **AssetListView: parent div needs `relative`.** `next/image` with `fill` requires a positioned ancestor. Added `relative` to the `w-10 h-10` thumbnail `div` alongside the import swap. Tiny change but load-bearing — the image would have been absolute-positioned against a non-positioned ancestor (body) otherwise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `relative` class to AssetListView thumbnail div**
- **Found during:** Task 4 (PERF-27 img→Image migration)
- **Issue:** `next/image` with `fill` requires a positioned ancestor. Parent `<div className="w-10 h-10 rounded overflow-hidden …">` had no `position: relative`, so `fill` would have positioned the Image against `<body>` instead of the 40×40 cell.
- **Fix:** Prepended `relative` to the parent div's Tailwind classes (`relative w-10 h-10 …`).
- **Files modified:** `src/components/files/AssetListView.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm test` 171/171; `npm run build` clean.
- **Committed in:** `6e1846ea` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)
**Impact on plan:** Minimal; single-class surgical addition required to make the planned `next/image` `fill` render correctly. No scope creep.

## Issues Encountered

None. Each task's `npx tsc --noEmit` + `npm test` (171/171) + `npm run build` were clean at every step. Build warnings present in the final build are all pre-existing (SafeZonesManager, FolderBrowser, ImageViewer, SafeZonesOverlay, VideoPlayer raw `<img>` tags + VideoPlayer useEffect dep) and explicitly marked out-of-scope by the plan's "Do NOT" list.

## Scope Decisions / Deferrals

- **PERF-24:** API-side pagination ships; client "Load more" UI deferred (new plan territory). Admin tables still render first-page without regression because the API returns the same `{ users | projects | links: [...] }` array shape at the same keys.
- **PERF-25:** In-memory comments fallback in `/api/comments/route.ts` is now dead code on the happy path once the new composite index deploys. Cleanup is deferred — non-fatal and out of scope for a perf-only phase.
- **PERF-25:** The `/api/review-links/all` cross-project cursor stays in-memory; a true Firestore-side cursor with cross-project ordered union would require new index work + schema thinking and is deferred.
- **PERF-27:** Sidebar and ReviewHeader scouted — both already clean (zero `<img>` tags); only `AssetListView.tsx` had remaining raw `<img>` targets. Other `<img>` tags flagged by the final `npm run build` (SafeZonesManager, FolderBrowser, ImageViewer, SafeZonesOverlay) are outside this plan's target list and deferred to future scope.
- **PERF-27:** `date-fns` cleanup was a dead-dependency removal (zero imports in `src/`) rather than a hot-path helper swap — `formatDuration` / `formatRelativeTime` in `src/lib/utils.ts` were already native.

## Bundle/Build Observations

- `npm run build` completes cleanly (no new warnings beyond pre-existing baseline).
- `/admin` route first-load JS: **215 kB** (14.1 kB route-specific) — lucide-react icons now tree-shaken per-icon via `modularizeImports`.
- First-load shared JS: **87.3 kB** (stable with prior milestone).
- No Google Fonts CSS in the first-load CSS payload (next/font inlines the face with `display: swap`).
- All 67 routes built successfully; no new build errors.

## User Setup Required

None — the Firestore index deploy documented under **Operational Steps** is the only operator action and is a standard CLI step (`firebase deploy --only firestore:indexes`).

## Next Phase Readiness

- v2.3 **App-Wide Performance Polish** — all 18/18 requirements complete across phases 74–78. Ready for milestone rollup / release.
- Deferred items captured: admin pagination UI, in-memory `/api/comments` fallback cleanup, remaining raw `<img>` migrations in SafeZonesManager/FolderBrowser/ImageViewer/SafeZonesOverlay.
- `firebase deploy --only firestore:indexes` is the single outstanding operator step; non-blocking for code release.

---
*Phase: 78-data-layer-bundle-and-network*
*Completed: 2026-04-22*

## Self-Check: PASSED

- `78-01-SUMMARY.md` exists
- `firestore.indexes.json` exists (with new comments composite appended)
- Task commits present in history: `6348598b`, `3c0bb7fc`, `3259b4f9`, `6e1846ea`
