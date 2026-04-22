# Milestones

## v2.3 App-Wide Performance Polish (Shipped: 2026-04-22)

**Phases completed:** 5 phases (74–78), 5 plans
**Tests:** 171/171 green throughout
**Source:** 4-stream parallel app-wide perf audit (pages / viewer / data layer / bundle), 2026-04-21

**What shipped (18 REQs, PERF-10..27):**

1. **Phase 74 viewer-critical-path** — `<video>` `preload="metadata"` + thumbnail `poster` (no more black box, no full-file preload); fire-and-forget `import('fabric').catch(() => {})` on VideoPlayer mount pre-warms Fabric so first Annotate click is <50ms; `audioReady` state gates `<VUMeter>` mount (AudioContext no longer boots on viewer open, only on first play); asset viewer wraps `CommentSidebar` in `<Suspense fallback={<CommentSidebarSkeleton />}>` so video is interactive before comments resolve.
2. **Phase 75 page-loading-and-server-components** — 5 `loading.tsx` skeletons shipped for `/projects`, `/projects/[id]`, `/projects/[id]/folders/[folderId]`, `/projects/[id]/trash`, `/admin` via shared `Skeleton` primitive; 3 Server Component flips (Badge, Spinner, ReviewHeader) shipped — 6 other candidates deferred with valid technical reasons (onClick props, useState, custom hooks) per CLAUDE.md §3; admin eagerly fetches users + projects in parallel on mount (tab click is now instant).
3. **Phase 76 asset-viewer-restructure** — 5 heavy modals (`ExportModal`, `AssetCompareModal`, `VersionStackModal`, `CreateReviewLinkModal`, `UserDrawer`) migrated to `next/dynamic` with `ModalSkeleton` fallback across 7 trigger sites — each removes 15–30KB from the hosting route's initial bundle; `useComments.addComment` rewritten for optimistic insert with tempId + `.map` reconciliation on response + 3-path rollback on error (preserves `Promise<boolean>` public API); `ImageViewer` tightened read-only AnnotationCanvas guard to `displayShapes && displayShapes !== '[]'`; `VersionComparison` dual-player mount got 4 stable React keys (`compare-A-${id}` / `compare-B-${id}`) so toggle cleanup works.
4. **Phase 77 folder-browser-decomposition** — `useProject` mount uses `Promise.all([fetchProject(), fetchFolders(null)])` instead of sequential; scouting found AssetGrid + AssetListView were already `React.memo`-wrapped — the real bug was inline arrow callbacks defeating the memo. Extracted `handleCreateReviewLinkForAsset` + `handleAddToReviewLinkForAsset` to `useCallback` so the existing memo takes effect. `RenameProvider` moved from top-level wrapper down into `FolderBrowserInner` wrapping only the content div — header + breadcrumb render outside the provider's re-render scope.
5. **Phase 78 data-layer-bundle-and-network** — Cursor-based pagination (`.limit(N).startAfter(cursor)` + `nextCursor` response) on `/api/admin/users`, `/api/admin/projects`, `/api/review-links/all` (default 50, max 100); new Firestore composite index `comments(assetId, reviewLinkId)`; review-link contents route swaps `Promise.all(.map(doc.get))` → `db.getAll(...)` for folder batch (N RPCs → 1); asset signed-URL fan-out chunks by 20; `/api/assets` GET returns `Cache-Control: public, max-age=300, stale-while-revalidate=600`; Google Fonts migrated from `@import url()` in `globals.css` to `next/font/google` Inter with `display: 'swap'` in `layout.tsx`; `modularizeImports` for `lucide-react` added to `next.config.mjs` so icons split per-route; preconnect `<link>` hints for `firestore.googleapis.com` + `storage.googleapis.com` shipped in root layout; 2 raw `<img>` tags in `AssetListView.tsx` migrated to `next/image`; `date-fns` removed from dependencies (scouting found zero uses in `src/` — `formatDuration` was already native).

**Notable planner scouting pivots (CLAUDE.md §1 — surface tradeoffs, not guess):**
- Phase 77 dropped 2 of 4 originally-scoped tasks after discovering AssetGrid + AssetListView were already memoized. Shifted from "add memo" to "fix the callbacks defeating existing memo" — correct root cause.
- Phase 78 discovered `date-fns` had zero src/ imports — shipped as pure dep removal, not code swap.
- Phase 78 discovered Sidebar + ReviewHeader had no raw `<img>` tags (already migrated in v2.1 + Phase 75) — only AssetListView's 2 thumbnails remained.

**New files (high-value):**
- `src/components/ui/Skeleton.tsx`, `src/components/ui/ModalSkeleton.tsx`
- `src/components/viewer/CommentSidebarSkeleton.tsx`
- 5 `loading.tsx` files under `src/app/(app)/*`

**Operational follow-up:**
- `firebase deploy --only firestore:indexes` — activates the new `comments(assetId, reviewLinkId)` composite index. Existing in-memory fallback keeps `/api/comments` correct until deployed.

**Expected impact:** Asset viewer reaches interactivity ~800ms–1.5s sooner on cold video load. Annotation mode opens instantly on first click. Comment submit feels instant (~50ms optimistic). Admin pages scale past 500+ records. Heavy modals (~100KB combined) no longer ship in initial route bundles. Font loading non-blocking; icon bundle per-route instead of global.

**Pending human verification:** Phase 75, 76 flagged `human_needed` — runtime UX spot-checks (skeleton visibility per route, admin tab instant feel, optimistic comment latency, compare-toggle memory cleanup). Concrete items listed in each phase's `VERIFICATION.md`.

---

## v2.2 Dashboard & Annotation UX Fixes (Shipped: 2026-04-21)

**Phases completed:** 4 phases (70–73), 6 plans
**Tests:** 171/171 green throughout
**Source:** 9 concrete UI/UX bugs reported from hands-on use of the dashboard file browser, inline rename flow, and drawing-mode canvas

**The 9 bugs it closed:**

1. Context menu overflows viewport in grid view (CTX-02)
2. Click-away / Escape don't close context menu; menus stack (CTX-03)
3. Right-click menu inconsistent with three-dots / floating bar; differs across asset vs folder in mixed selection (CTX-04)
4. Folder right-click falls through to "open folder" instead of running the action (CTX-05)
5. List view toggle broken when folder contains only folders (VIEW-01)
6. Asset three-dots unreachable in grid view — hover preview steals cursor (VIEW-02)
7. Click-away during rename doesn't cancel; multiple rename inputs stack (EDIT-01)
8. Folder Duplicate shows success toast but doesn't persist (FS-01)
9. Fabric.js single-object transforms only move — scale/rotate only work on multi-select (DRAW-01)

**Key accomplishments:**

1. **Phase 70 context-menu-behavior:** New `ContextMenuProvider` + `useContextMenuController` singleton holds one `{key, position, items} | null` state — two menus open at once is physically impossible. `useLayoutEffect` + `getBoundingClientRect` + 8px viewport clamp for flip math. New `src/components/files/fileBrowserActions.ts::buildFileBrowserActions('asset'|'folder'|'mixed', selection, ctx)` pure-data factory feeds three-dots Dropdown AND right-click menu at 5 call-sites — drift impossible. FolderCard click-through hardened with 3 layered defenses (role="menu" target guard + 300ms suppressNextClickRef + right-button onMouseDown preventDefault).
2. **Phase 71 grid-view-affordances:** Folders block in `FolderBrowser.tsx` now branches on `viewMode` with new `FolderListView` + `FolderListRow` components; `AssetListView` toggle works in folders-only folders. `AssetCard` actions wrapper raised to `z-20` (consistent with job indicators); sprite overlay / scrub bar / loading spinner marked `pointer-events-none` so scrub still works via bubble but three-dots stays reachable.
3. **Phase 72 inline-edit-and-folder-duplicate:** `<InlineRename>` gained a document-level `pointerdown` listener that cancels on click-away using a stable `onCancelRef`. New `RenameController` context + `RenameProvider` wrap `FolderBrowserInner`; all 4 rename-capable surfaces (FolderCard, FolderListRow, AssetCard, AssetListView) consume the controller — opening rename on B cancels A automatically. Hand-rolled inputs on FolderCard + FolderListRow migrated to the shared primitive. `src/lib/folders.ts::deepCopyFolder` now writes `deletedAt: null` on both `.set(...)` calls — root cause: the Phase 63 composite-indexed listing query filters `where('deletedAt', '==', null)` which excludes docs missing the field entirely. Same fix also repairs "Copy to folder" which was silently broken.
4. **Phase 73 drawing-mode-transforms:** One-line fix in `src/components/viewer/AnnotationCanvas.tsx:163` — restoring `obj.evented = true` alongside `obj.selectable = true` in the `'select'` tool branch. Root cause: the tool-switch effect force-sets `evented = false` on every object before each tool change; the `'select'` case restored `selectable` but not `evented`. Fabric.js single-object control-handle hit-testing requires `evented = true` — with it missing, handles fell through to the canvas-level move handler. Multi-select worked because `ActiveSelection` wraps objects in a separate evented group.

**New files (high-value):** `src/components/files/fileBrowserActions.ts`, `ContextMenuProvider` + `useContextMenuController` primitives in `src/components/ui/ContextMenu.tsx`, `RenameController` context + `FolderListView`/`FolderListRow` components in `src/components/files/FolderBrowser.tsx`.

**Scope discipline (CLAUDE.md §3 — surgical):**
- Phase 73 fix was one character. Planner scouted for `lockScalingX/Y/Rotation` / `setControlsVisibility` / `hasControls` — all zero matches, ruling out the obvious "intentional lock" hypothesis before proposing the minimal diff.
- Phase 72-02 fix was 4 insertions. Planner scouted the route + handler + listing query and traced the bug back to the helper, not the user-hypothesized "missing API".
- No features added beyond bug scope. No speculative abstractions. 828 / 289 LOC across 8 src files.

**Expected impact:** The 9 reported bugs fixed at their structural root. Context menu UX moves from "unreliable, stacks, overflows, broken on folders" to "predictable, single menu, viewport-clipped, works everywhere." Folder duplicate moves from "silent no-op with false toast" to "real copy + listing update + failure toast on error." Drawing mode moves from "movement-only for single objects" to "full Fabric.js transforms regardless of selection size."

**Pending human verification:** All 4 phases flagged `human_needed` — structural code is correct, but final success criteria require live browser testing of pointer events, viewport geometry, Firestore round-trips, and Fabric.js hit-testing. Concrete test items listed in each phase's `VERIFICATION.md`.

---

## v2.1 Dashboard Performance (Shipped: 2026-04-21)

**Phases completed:** 3 phases (67–69), 3 plans
**Tests:** 171/171 green throughout
**Source:** Focused dashboard perf audit — 3 critical + 3 medium + 3 low findings

**The 3 criticals it attacked:**

1. `/api/stats` and `/api/projects` doing full `projects` collection scans (cost scaled with total DB projects, not user's own)
2. `/api/stats` sequential N+1 asset-count loop — 15 projects = 15 serial Firestore RPCs = 750ms-2.5s
3. `AuthContext` blocking all rendering with `/api/auth/session` POST — 700ms-1s blank spinner every page load

**Key accomplishments:**

1. **Phase 67 dashboard-query-optimizations:** Denormalized `Project.collaboratorIds: string[]` for indexed `array-contains` queries. New `src/lib/projects-access.ts::fetchAccessibleProjects` shared helper runs `Promise.all([ownerQuery, collaboratorIdsQuery])` with id-dedup — used by both `/api/projects` and `/api/stats`. Both stats loops (asset-count + review-link chunks) now use `Promise.all` fan-out. `Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300` header on stats response. One-off backfill + composite Firestore index. All 5 write paths that touch `collaborators` now atomically update `collaboratorIds` too (create, collaborator add/remove, admin ownership transfer, admin project-access add/remove).
2. **Phase 68 client-init-waterfall:** `AuthContext` caches the user object in `sessionStorage` keyed by UID with 24h TTL. Returning users paint the app shell immediately (cache hit) while a background POST refreshes in parallel — no blocking gate. Cache invalidates on logout, on UID mismatch, on suspended-user 403, on explicit clear. New `ProjectsContext` wraps `(app)/layout.tsx` as provider; `useProjects` hook rewritten as a thin context consumer so dashboard + sidebar both read the same state from a single `/api/projects` fetch per page load.
3. **Phase 69 ssr-and-micro-optimizations:** Extracted `src/lib/dashboard-stats.ts::fetchDashboardStats` shared by `/api/stats` and a new Server Component dashboard page. Dashboard split into `page.tsx` (Server Component, resolves auth server-side when possible) + `DashboardClient.tsx` (client shell with `initialStats` prop). `getAuthenticatedUser` caches user doc reads in a module-level `Map<uid, {user, exp}>` with 30s TTL; session endpoint calls `invalidateUserCache` on name/avatar updates so refreshes see fresh data. Sidebar logo migrated from `readyset.co` external CDN to local `public/logo-horizontal.png`; `readyset.co` removed from `next.config.mjs` remotePatterns; `unoptimized` dropped and `priority` added to above-the-fold usages.

**New files (high-value):** `src/lib/projects-access.ts`, `src/lib/dashboard-stats.ts`, `src/contexts/ProjectsContext.tsx`, `src/app/(app)/dashboard/DashboardClient.tsx`, `scripts/backfill-collaborator-ids.mjs`, `public/logo-horizontal.png`.

**Operational steps executed (2026-04-21):**
- `firebase deploy --only firestore:indexes` — composite index `projects(collaboratorIds ARRAY, updatedAt DESC)` deployed
- `scripts/backfill-collaborator-ids.mjs` — 18 projects updated with denormalized UIDs
- v2.0 sprite regeneration backfill — 64/74 videos have sprite-v2.jpg (rest are orphans pointing to deleted projects, or timeouts on large clips)

**Expected impact:** `/api/stats` from ~2-5s down to ~50-200ms (CDN cache) / ~400ms (cold). First-paint for returning users from ~1-1.5s down to <200ms (sessionStorage cache skips the session gate). Duplicate `/api/projects` fetch eliminated.

**Pending human verification:** Live Lighthouse run on the deployed dashboard (Phase 69 flagged `human_needed`). SSR prefetch is architecturally in place but activates only when middleware-based session cookie infra ships in v3.

---

## v2.0 Architecture Hardening (Shipped: 2026-04-20)

**Phases completed:** 7 phases (60–66), 7 plans
**Tests:** 156 → 171 (+15)
**Source:** Deep pipeline-lifecycle + unhappy-path audit — 5 critical + 8 medium + 4 low findings, 5 systemic patterns

**Systemic patterns attacked:**

1. Fire-and-forget jobs with no observability → Phase 60
2. Signed URLs regenerated per-request → Phase 62
3. Full-collection scans instead of composite indexes → Phase 63
4. `batch()` where `runTransaction()` is needed → Phase 61
5. Client metadata stale window → Phase 66 (provisional-metadata pattern)

**Key accomplishments:**

1. **Phase 60 pipeline-observability:** Generalized `Job` model + `src/lib/jobs.ts` lifecycle helpers. Probe/sprite/thumbnail/export write `{type, status, startedAt, completedAt, error?, attempt}` to Firestore `jobs` collection. `GET /api/assets/[id]/jobs` + `POST /api/jobs/[id]/retry` endpoints. AssetCard renders an amber dot while running, red dot + tooltip on failed, retry button. Client-side duplicate sprite trigger removed (OBS-03). `upload/complete` verifies GCS object exists + size>0 before marking `ready` (OBS-04). Sprite route re-reads fresh duration from Firestore (OBS-05).
2. **Phase 61 transactional-mutations:** merge-version, unstack-version, upload/signed-url auto-versioning all wrapped in `db.runTransaction()` — concurrent writes can no longer produce duplicate version numbers. `fetchGroupMembersTx` helper in version-groups.ts. folderId live-check in signed-url (TXN-04) prevents orphaned uploads into soft-deleted folders.
3. **Phase 62 signed-url-caching:** `signedUrl` + `signedUrlExpiresAt` + thumbnail + sprite caching on asset doc. New `src/lib/signed-url-cache.ts::getOrCreateSignedUrl` regenerates only within 30 min of expiry. `/api/assets` and `/api/review-links/[token]` both go through the cache. A 200-asset review link no longer fires 200 GCS signing calls per guest page load. Sync batched write-back to persist fresh URLs.
4. **Phase 63 firestore-indexes-and-denorm:** New `firestore.indexes.json` with composite indexes on `assets(projectId, folderId, deletedAt)`, `folders(projectId, parentId, deletedAt)`, `comments(assetId, parentId, createdAt)`. `commentCount` denormalized onto asset doc with `FieldValue.increment(±1)` inside transactions. List endpoints use indexed queries with graceful fallback + `console.warn` if index not deployed.
5. **Phase 64 format-edge-cases:** Export copy path now accepts `mov+h264+aac` (was rejecting). `sweepStaleJobs()` marks any running job >2min old as failed (catches SIGKILL'd functions). `image-metadata.ts` falls back to ffprobe for HEIC/AVIF/HDR when `image-size` returns null. Sprite frame spacing adapts: clamped to 0.1..duration-0.1s for <3s clips; normal 0.02..0.98 span otherwise.
6. **Phase 65 security-and-upload-validation:** `bcryptjs` hashing (cost 10) on review-link passwords with transparent legacy migration (plaintext match → fire-and-forget rehash). `x-review-password` header replaces `?password=` query string (backwards-compat with deprecation warning). MIME validation on `upload/complete` — GCS content-type must be on ACCEPTED_MIME allow-list with octet-stream fallback to asset.mimeType.
7. **Phase 66 dead-data-and-contracts:** Removed `Asset.url` phantom field (bucket is private, no one reads it). Unified sprite URL naming on `spriteSignedUrl` across list + on-demand paths. Expanded `UploadCompleteRequest` type with `frameRate` + `thumbnailGcsPath` + `mimeType`. `useAssets.fetchAssets` gets AbortController. `folderIsAccessible` uses `Folder.path[]` array for O(1) ancestry (replaces N sequential Firestore reads). Sprite generation properly awaits `writer.once('close')` + `reader.cancel()` on size-exceeded path. Videos tagged `probed: false` on upload so UI differentiates "no probe yet" vs "probe complete".

**New files (high-value):** `src/lib/jobs.ts`, `src/lib/signed-url-cache.ts`, `src/lib/review-links.ts` (serializeReviewLink → Phase 54, extended here), `src/lib/review-password.ts` (bcrypt), `firestore.indexes.json`, `src/app/api/assets/[assetId]/jobs/route.ts`, `src/app/api/jobs/[jobId]/retry/route.ts`, `src/hooks/useAssetJobs.ts`.

**Operational follow-ups:**
- Deploy `firestore.indexes.json` via `firebase deploy --only firestore:indexes`
- Existing review-link passwords will self-migrate to bcrypt on first verify
- No migration script needed for other changes — backward-compatible

---

## v1.9 Hardening & Consistency Audit (Shipped: 2026-04-20)

**Phases completed:** 6 phases (54–59), 6 plans
**Timeline:** Single-session sprint, 2026-04-20
**Source:** Four parallel full-app audits (UX, backend/security, file-management flows, viewer/player) surfaced 21 CRITICAL / 33 MEDIUM / 21 LOW findings. v1.9 attacked the top 37 across 6 phases.

**Key accomplishments:**

1. **Phase 54 — security-hardening:** `/api/debug` gated behind admin + stripped of credential hints; `/api/safe-zones GET` authenticated; `disabled` user check moved into `getAuthenticatedUser` (closes the ~1h ID-token window on suspend); `PATCH /api/review-links/[token]` extended to cover every editable flag (password, expiresAt, all allow-*, showAllVersions); `serializeReviewLink` helper strips password in every response path; `approvalStatus` now persists on comment POST; guest comment GET uses compound Firestore query with composite-index fallback.
2. **Phase 55 — bulk-mutations-and-soft-delete:** Version-stack aware DELETE (`?allVersions=true`); deep folder copy (`src/lib/folders.ts::deepCopyFolder`, BFS with Promise.all per level); `Promise.allSettled` on bulk move + bulk status with per-item error reporting; drag-to-stack clears source from selectedIds; soft-delete filter sweep on stats, copy, size, review-link root/drill-down/contents.
3. **Phase 56 — viewer-alignment:** ExportModal receives `initialIn`/`initialOut` from the parent so marked loop range pre-fills trim bar; 0-duration waiting state; review-page routes documents (PDF/HTML) to DocumentViewer/HtmlViewer + other types to FileTypeCard; range-comment click unifies with shared `rangeIn`/`rangeOut` (loop + composer + export all read the same state); VUMeter AudioContext ref-counts and closes on last unmount; VersionComparison duration effects re-subscribe on version swap.
4. **Phase 57 — ux-and-dashboard:** Dashboard Quick Actions routed (Browse → `/projects`, Upload → `?action=upload`, Invite → `?action=invite`); review-link guest resolve/delete work end-to-end (server + client); new `<InlineRename />` primitive adopted in grid + list views (no more `window.prompt`); UserTable delete via `useConfirm`; Collaborators stat card on dashboard; review-link expiry banner + dedicated expired screen; guest name + email persisted in single `frame_guest_info` JSON with back-compat.
5. **Phase 58 — data-consistency:** Deprecated async `canAccessProject` wrapper removed; all callers migrated to pure function; `Asset` declares `thumbnailGcsPath`/`spriteStripUrl`/`spriteStripGcsPath`/`description`; `Comment.approvalStatus` typed; new `src/lib/names.ts` with `validateAssetRename`/`validateFolderRename` + 13 tests; name-collision returns 409 on rename; every `catch` in API routes logs with contextual `[ROUTE VERB]` prefix.
6. **Phase 59 — a11y-and-keyboard-coordination:** New `useFocusTrap` + `useModalOwner` hooks; Modal + UserDrawer render `role="dialog"`, `aria-modal="true"`, trap Tab focus, Escape closes; Dropdown full keyboard nav (arrow keys, Enter, Escape) + `role="menu"`/`role="menuitem"` + `aria-haspopup`; VideoPlayer + VersionComparison + ExportModal keydown handlers early-return when `document.body.dataset.modalOpen === 'true'` — no more shortcut leak across layers.

**New files (high-value):** `src/lib/review-links.ts` (serializeReviewLink), `src/lib/folders.ts` (deepCopyFolder), `src/lib/names.ts` (rename collision validators), `src/components/ui/InlineRename.tsx`, `src/hooks/useFocusTrap.ts`, `src/hooks/useModalOwner.ts`.

**Tests:** 138 → 151 (+13 name validation tests, all green).

**Deferred to v2 / Future (21 lower-severity audit findings):** Modal `size="full"` + AssetCompareModal migration, Dropdown/ContextMenu divider API unification, useAssets AbortController, ReviewHeader flag pills, hash-sort folders, N+1 fixes in hardDeleteFolder, Trash auto-purge cron, inline design-file preview.

**Pending:** Live QA walkthroughs on phases 56 + 57 verifications (flagged human_needed — AudioContext leak under real navigation, review-page document routing, guest resolve/delete end-to-end).

---

## v1.8 Asset Pipeline & Visual Polish (Shipped: 2026-04-20)

**Phases completed:** 5 phases (49–53), 5 plans
**Timeline:** Single-session sprint, 2026-04-20

**Key accomplishments:**

1. **Phase 49 — metadata-accuracy:** ffprobe skipped on images; new `src/lib/image-metadata.ts` extracts dimensions server-side via `image-size` (pure-JS, no native binary). Client reads dimensions from original File via `createImageBitmap` (not downscaled canvas). New `src/lib/format-date.ts` with `coerceToDate` handles every Timestamp shape (`toDate`, `{seconds,nanoseconds}`, `{_seconds,_nanoseconds}`, ISO, epoch, Date) — kills "Invalid Date". FileInfoPanel renders image-appropriate section (no Container/Pixel format/Color space/Bitrate rows for images). 13 new unit tests.
2. **Phase 50 — review-links-repair:** Root cause: `/api/review-links` did `.where(projectId).orderBy(createdAt)` which required an undeployed composite Firestore index → 500 → clients read "empty". Dropped `orderBy`, sort in memory (mirrors `/api/review-links/all`). Added `!res.ok` guards on 3 client callsites so empty state no longer masquerades as success on error. 9 new integration tests.
3. **Phase 51 — file-type-expansion:** New `src/lib/file-types.ts` centralizes MIME/extension classification for 6 types: video, image, document (PDF/HTML), archive (ZIP), font (TTF/OTF/WOFF/WOFF2), design (AI/PSD/AEP/FIG). Server + client allow-lists unified. New viewer components: `DocumentViewer` (PDF iframe), `HtmlViewer` (sandboxed iframe), `FileTypeCard` (icon + metadata + Download). Grid + list cards render type-specific icons instead of broken thumbnails.
4. **Phase 52 — trash-and-recovery:** Soft-delete for assets and folders (`deletedAt`, `deletedBy` fields). DELETE endpoints now soft-delete; hard-delete logic extracted to `src/lib/trash.ts` (`hardDeleteAsset`, `hardDeleteFolder`). New endpoints: GET `/api/projects/[id]/trash`, POST `/api/trash/restore`, POST `/api/trash/permanent-delete`, POST `/api/trash/empty`. New `/projects/[id]/trash` page with Restore + Permanent Delete + Empty Trash. Restore auto-reparents to project root when the original folder is also deleted.
5. **Phase 53 — visual-polish:** 8 VIS bugs closed — Modal `overflow-hidden` clips the accent line; new `/api/folders/[id]/preview-assets` + tiled folder thumbnails; rename uses Check/X confirm buttons (blur no longer commits); `object-contain` preserves asset aspect ratio; single version count badge; ReviewStatusBadge wrapped in `bg-black/50 backdrop-blur-sm` for contrast on bright thumbs; CreateReviewLinkModal contents contained; Dashboard Quick Actions have distinct hrefs (`/projects`, `/projects?action=upload`, `/projects?action=invite`).

**New files (high-value):** `src/lib/image-metadata.ts`, `src/lib/format-date.ts`, `src/lib/file-types.ts`, `src/lib/trash.ts`, `src/components/viewer/{DocumentViewer,HtmlViewer,FileTypeCard}.tsx`, 4 trash API routes, 1 folder preview-assets API route, 1 trash UI page.

**Pending:** Human verification walkthroughs for phases 49, 51, 52, 53 (automated tests all green; live uploads required for end-to-end checks).

---

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
