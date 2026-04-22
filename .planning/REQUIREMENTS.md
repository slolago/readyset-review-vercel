# Requirements: readyset-review

**Defined:** 2026-04-21 (v2.3 — app-wide performance polish)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v2.3 Requirements

Synthesized from a 4-stream app-wide perf audit (pages, viewer/player, data layer, bundle). v2.1 fixed the dashboard specifically — v2.3 attacks every OTHER surface.

### Viewer critical path (Phase 74)

- [x] **PERF-10**: `<video>` element uses `preload="metadata"` instead of `preload="auto"`. Eliminates 1–3s of full-file download before first paint on slow connections.
- [x] **PERF-11**: `<video>` element sets `poster={asset.thumbnailUrl}` so the first frame is visible instantly instead of a black box while metadata loads.
- [x] **PERF-12**: `fabric.js` is pre-warmed via a fire-and-forget dynamic import on viewer mount — the first click of "Annotate" no longer waits 200–400ms for the module to download + parse. Still code-split out of the initial bundle.
- [x] **PERF-13**: `VUMeter` + its `AudioContext` + `captureStream()` initialize on first play (or first interaction), not on viewer mount. No 20–50ms wasted on cold load for users who never enable audio metering.
- [x] **PERF-14**: Asset viewer page renders `<VideoPlayer>` as soon as `useAsset()` resolves — comments load in a Suspense boundary with a skeleton, in parallel. Video becomes interactive before the comment thread arrives. (Covers the asset viewer + review page flows.)

### Page loading + Server Components (Phase 75)

- [x] **PERF-15**: `loading.tsx` skeletons added for `/projects`, `/projects/[id]`, `/projects/[id]/folders/[folderId]`, `/projects/[id]/trash`, and `/admin`. The nested-folder Suspense `fallback={null}` is replaced with a skeleton. No blank white screens on drill-down.
- [x] **PERF-16**: Pure presentational components flip from Client to Server where the change is a strict directive-removal (no refactor required). Shipped: `Badge`, `Spinner`, `ReviewHeader`. Pre-existing SC: `ReviewStatusBadge`. Deferred (require client-wrapper extraction, out of scope for surgical flip): `Avatar` (`onError` on next/image), `Breadcrumb` (`useState`/`useRef`/`useEffect`/`onClick`), `Button` (`onClick` via `...props` spread), `FileTypeCard` (`useUserNames` hook + inline `onClick`), `CommentTimestamp` (`onClick` prop), `ProjectCard` (`useState`/`useAuth`/`onClick`). Deferred candidates logged in `.planning/phases/75-page-loading-and-server-components/75-01-SUMMARY.md` for a future optimization pass.
- [x] **PERF-17**: Admin panel eagerly fetches both users AND projects tabs on mount (currently the Projects tab fetches on first click → ~500ms blank state). Layout uses `Promise.all` to fire both on the server component where possible.

### Asset viewer restructure (Phase 76)

- [x] **PERF-18**: Heavy modals are `next/dynamic`-imported with `{ ssr: false }` + skeleton fallback — `ExportModal`, `AssetCompareModal`, `VersionStackModal`, `CreateReviewLinkModal`, `UserDrawer`. Each removes 15–30KB from the route that hosts the trigger until the modal actually opens.
- [x] **PERF-19**: `useComments.addComment` performs optimistic insert into local state; the POST response reconciles the temp ID. No more 100–300ms latency between submit and the comment appearing. Failure rolls back.
- [x] **PERF-20**: `AnnotationCanvas` only mounts its read-only overlay when `displayShapes` is non-empty AND non-`'[]'`. Fabric dispose runs in a dedicated `useEffect` cleanup so rapid comment-switching doesn't accumulate canvas instances. `ExportModal` defers its preview `<video>` `src` until the modal is actually open.
- [x] **PERF-21**: `VersionComparison` dual-player mount uses stable React keys (`compare-A-${assetA.id}` / `compare-B-${assetB.id}`) so toggling compare ↔ single cleanly unmounts and re-mounts each `AnnotationCanvas` + `VUMeter`. No dangling refs, no memory creep.

### Folder browser decomposition (Phase 77)

- [x] **PERF-22**: `useProject(projectId)` fires `fetchProject()` + `fetchFolders(null)` in **parallel** via `Promise.all`, not serially. Eliminates the 200–400ms waterfall on every project root landing.
- [x] **PERF-23**: `FolderBrowser` monolith (2,291 LOC) is decomposed: `AssetGrid`, `AssetListView`, breadcrumb, and header extracted into `React.memo`-wrapped subcomponents so rename-state changes don't cascade through 200+ asset cards. `RenameProvider` scope narrows to wrap only the grid/list surface, not the breadcrumb + header.

### Data layer + bundle + network (Phase 78)

- [x] **PERF-24**: `/api/admin/users`, `/api/admin/projects`, and `/api/review-links/all` use `limit(N)` + cursor-based pagination (`startAfter`). Admin surfaces no longer do unbounded scans; users with 500+ review links no longer OOM.
- [x] **PERF-25**: Firestore composite index added and deployed for comments `(assetId ASC, reviewLinkId ASC)` — kills the in-memory fallback in `src/app/api/comments/route.ts:83–103`. Review-link contents route uses `db.getAll(...)` instead of `Promise.all(.map(doc.get))` for N folder reads (N RPCs → 1). Asset signed-URL fan-out in `/api/review-links/[token]/contents` chunks by 20 instead of unbounded `Promise.all`. `/api/assets` GET adds `Cache-Control: public, max-age=300, stale-while-revalidate=600`.
- [x] **PERF-26**: Google Fonts move from `@import url('https://fonts.googleapis.com/...')` in `globals.css` to `next/font/google` in `src/app/layout.tsx` with `display: swap` — non-blocking font delivery. `next.config.mjs` gets `modularizeImports` for `lucide-react` so each route only bundles the icons it imports.
- [x] **PERF-27**: `<link rel="preconnect">` hints for `firestore.googleapis.com` + `storage.googleapis.com` in `src/app/layout.tsx`. Remaining raw `<img>` tags in `Sidebar.tsx`, `ReviewHeader.tsx`, and `AssetListView.tsx` (outside the v2.1 logo migration) migrate to `next/image`. `date-fns` duration formatting (the only use that's on a hot path) swaps to native `Intl.NumberFormat` or a ~100-line helper — cuts `date-fns` off the critical bundle entirely.

## Absorbed from prior milestones

See `.planning/MILESTONES.md` — v1.7 through v2.2 shipped.

## v3 / Future Requirements

- Server-side cron: Trash auto-purge, stale job sweeper, orphan GCS object cleanup, orphan asset cleanup (projectId references deleted project)
- Presence indicators
- Notifications (in-app + email)
- Per-asset watermarks
- AI auto-tagging + semantic search
- Bulk export
- Real-time project list updates via Firestore onSnapshot (would obsolete PERF-06's fetch-and-cache approach)
- Middleware-based session cookie infra (unlocks true SSR prefetch on dashboard Server Component from v2.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time collaborative cursors | Async workflow |
| Offline mode | Real-time collab is core |
| Mobile app | Web-first |
| SSO beyond Google | Single entry point |
| Custom role matrices | Fixed role set |
| In-browser AE/Photoshop | Review platform, not editor |
| Zip preview | Download to inspect |
| Full event-sourced audit log | Structured logging + Firestore history sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-10 | Phase 74 | Complete |
| PERF-11 | Phase 74 | Complete |
| PERF-12 | Phase 74 | Complete |
| PERF-13 | Phase 74 | Complete |
| PERF-14 | Phase 74 | Complete |
| PERF-15 | Phase 75 | Complete |
| PERF-16 | Phase 75 | Complete |
| PERF-17 | Phase 75 | Complete |
| PERF-18 | Phase 76 | Complete |
| PERF-19 | Phase 76 | Complete |
| PERF-20 | Phase 76 | Complete |
| PERF-21 | Phase 76 | Complete |
| PERF-22 | Phase 77 | Complete |
| PERF-23 | Phase 77 | Complete |
| PERF-24 | Phase 78 | Complete |
| PERF-25 | Phase 78 | Complete |
| PERF-26 | Phase 78 | Complete |
| PERF-27 | Phase 78 | Complete |

**Coverage:**
- v2.3 requirements: 18 total
- Mapped to phases: 18 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 — synthesized from 4-stream app-wide perf audit*
