# readyset-review

Frame.io V4 clone — internal media review platform.

## What This Is

A fully-featured media review platform for internal teams: upload video/image assets, organize into projects and folders, annotate with time-stamped comments, share via review links, and compare versions side-by-side.

## Core Value

Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## Current Milestone: v2.3 App-Wide Performance Polish

**Goal:** Synthesize findings from a 4-stream app-wide perf audit into a coordinated set of fixes targeting every slow surface outside the dashboard (which v2.1 already addressed). Asset viewer + review page + folder browser + admin + data-layer + bundle — everything gets tuned.

**Target features (18 REQs across 5 phases):**
- Viewer critical path — video `preload="metadata"`, thumbnail poster, Fabric pre-warm, VUMeter/AudioContext lazy init, Suspense split for comments
- Page loading + Server Components — add `loading.tsx` skeletons on routes that show blank space, convert pure presentational components (Avatar/Badge/Spinner/Breadcrumb/FileTypeCard/etc.) to Server Components, eager-fetch admin tabs
- Asset viewer restructure — dynamic-import heavy modals (ExportModal, AssetCompareModal, VersionStackModal, CreateReviewLinkModal, UserDrawer), optimistic comment add, AnnotationCanvas read-only cleanup, VersionComparison key structure
- Folder browser decomposition — parallelize `useProject` fetches, split 2,291-LOC FolderBrowser into memoized sub-components, narrow RenameProvider scope
- Data layer + bundle + network — admin pagination (users + projects + review-links/all), comments composite index for `(assetId, reviewLinkId)`, review-link contents chunking + folder `getAll` batch reads, Cache-Control on `/api/assets`, `next/font` for fonts, `modularizeImports` for lucide-react, preconnect hints, raw `<img>` → `<Image>`, date-fns duration → native Intl

**Prior milestones:** v2.1 Dashboard Performance (shipped 2026-04-21), v2.2 Dashboard & Annotation UX Fixes (shipped 2026-04-21). See [milestones/](milestones/).

**Goal:** Attack the 5 systemic architectural patterns surfaced by a deep pipeline-lifecycle + unhappy-path audit. Move the platform from "stack of features that work in happy cases" to "production-grade system that degrades gracefully under format weirdness, concurrent mutations, stale metadata, and unbounded asset counts". No new user-facing features — this milestone rebuilds foundations.

**Target features:**
- Pipeline observability — job status tracking + retry for probe/sprite/export/thumbnail; UI surfaces in-flight + failed jobs instead of silent `.catch(console.warn)`; GCS-object verification before marking upload `ready`; dedupe duplicate sprite triggers
- Transactional mutations — merge-version / unstack-version / reorder-versions / auto-versioning under `db.runTransaction()` so concurrent users never corrupt stacks; folder-delete-during-upload guard
- Signed URL caching — stop regenerating GCS signed URLs per-request; cache with expiry on asset doc; review-link loads stop triggering 200+ signing calls per guest
- Firestore composite indexes — eliminate full-collection scans in list/upload/trash paths; denormalize `commentCount` onto asset docs; query by `(projectId, folderId, deletedAt)` instead of fetch-then-filter
- Format edge cases — export handles HEVC/AV1/VP9/ProRes cleanly with TTL + stale-job sweeper; image-metadata falls back to ffprobe for HEIC/AVIF; sprite frame spacing adapts to real duration
- Security + upload validation — bcrypt review-link passwords, POST body (not query string), GCS.exists() verify before `ready`, reject zero-byte uploads, MIME validation
- Dead data + contract cleanup — remove `url` phantom field, unify sprite URL naming, complete `UploadCompleteRequest` type, useAssets AbortController, folder-ancestry uses `path[]`, provisional-metadata pattern (client dims marked as "pending probe")

**Prior milestones:** v1.7 Review UX & Access Rewrite (shipped 2026-04-20), v1.8 Asset Pipeline & Visual Polish (shipped 2026-04-20), v1.9 Hardening & Consistency Audit (shipped 2026-04-20). See [milestones/](milestones/).

## Current State (v1.4 — shipped 2026-04-14)

- **Asset management** — upload, drag-to-move, version stacks (drag-and-drop merge), context menus (rename/copy/duplicate), bulk download, list + grid views
- **Video player** — SMPTE timecode (frame-accurate), safe zones overlay (14 platforms, adjustable opacity), VU meter, version switcher, download button
- **Asset viewer sidebar** — Comments tab + Info tab (filename, type, size, duration, resolution, aspect ratio, FPS, uploader name, date, version)
- **Asset comparison** — select 2 assets → full-screen side-by-side modal with shared play/pause, scrubber, and per-side audio toggle
- **Grid view** — comment count badges, version count badges, thumbnail previews
- **Review links** — short tokens, guest name prompt, allow downloads/approvals toggles, folder sharing, virtual folder browser, auth-skip for logged-in users
- **Collaboration** — name-based autocomplete invite search, collaborator roles, guest read-only enforcement
- **Navigation** — collapsible sidebar with project tree, breadcrumb nav, folder size badges, dashboard real stats
- **Admin** — user management, all-projects view with owner info, role-based access

## Stack

- Next.js 14 App Router + TypeScript
- Firebase Auth (Google OAuth) + Firebase Admin
- Firestore (database)
- Google Cloud Storage (file storage + signed URLs, dual URL strategy for inline/download)
- Tailwind CSS dark theme (#0d0d0d bg, #6c5ce7 accent purple)
- Video.js for video playback
- Fabric.js for canvas annotations

## Repositories

- origin: slolago/readyset-review
- vercel: slolago/readyset-review-vercel

## Requirements

### Validated

- ✓ SMPTE timecode frame-step accuracy — v1.3 (bypass rAF threshold for discrete seeks)
- ✓ Safe zones opacity control — v1.3
- ✓ Comment count badge in grid view — v1.3
- ✓ File info tab (resolution, duration, FPS, uploader, etc.) — v1.3
- ✓ Synchronized asset comparison modal — v1.3
- ✓ Drag-and-drop version stacking — v1.3 (atomic Firestore batch merge)
- ✓ Breadcrumb navigation — v1.2
- ✓ Drag-to-move assets/folders — v1.2
- ✓ Asset context menus (rename, copy, duplicate) — v1.2
- ✓ Review link management (create, edit, delete, folder-scoped) — v1.2
- ✓ Bulk download — v1.2
- ✓ List view with date column — v1.2
- ✓ Admin panel (all projects + user management) — v1.2
- ✓ Safe zones overlay (14 platforms) — v1.2
- ✓ VU meter — v1.2
- ✓ Auth-skip for review links — v1.2
- ✓ Collaborator invite autocomplete — v1.2
- ✓ Asset download button in viewer — v1.2

### Active (v1.6)

- [ ] FPS-02: FPS detection produces correct rate on new uploads (not 31fps)
- [ ] RVLINK-03: Show-all-versions works for single-video and folder review links
- [ ] CMT-01: Resolved comments show checkmark instead of disappearing
- [ ] CMT-02: Comment editing allowed for original author only
- [ ] CMT-03: Links in comments are clickable and don't overflow the box
- [ ] CMT-04: Range comments with in-out markers on timeline
- [ ] ANNOT-01: Annotation drawings clear when switching between versions
- [ ] ANNOT-02: Arrow tool does not conflict with freehand selection
- [ ] COMPARE-03: Compare slider works reliably (no freeze, plays both videos)
- [ ] COMPARE-04: Compare view shows clear audio source indicator + easy switching
- [ ] VER-01: Version selector dropdown shows upload date/time per version
- [ ] VU-02: VU meter wider for number legibility
- [ ] CTX-01: Right-click "review link" shows context menu (doesn't open folder)
- [ ] HOVER-01: Video hover preview — cursor scrubbing over thumbnails
- [ ] RVLINK-04: Review links can be created on individual videos (not just folders)

### Out of Scope

- Mobile app — web-first approach
- ffprobe server-side codec/FPS extraction — browser `requestVideoFrameCallback` is sufficient for upload-time FPS; codec display deferred
- Offline mode — real-time collaboration is core value

## Key Decisions

| Decision | Outcome | Phase |
|----------|---------|-------|
| Bypass rAF TIME_THRESHOLD for frame-step with direct `setCurrentTime` | ✓ Good — frame digit updates instantly, playback unaffected | 23 |
| Opacity slider resets to 100% on every zone change (not just deselect) | ✓ Good — predictable, no hidden carry-over state | 24 |
| Comment badge hidden (not zero-displayed) when count is 0 | ✓ Good — cleaner grid, matches design intent | 25 |
| FPS stored as `frameRate?: number` on Asset type, measured via `requestVideoFrameCallback` | ✓ Good — typed, no `any` cast; graceful fallback if API unavailable | 26 |
| Comparison modal reuses signed URLs from grid state — no extra API call | ✓ Good — instant open, no round-trip cost | 27 |
| Dual MIME type on drag start (`x-frame-move` + `x-frame-version-stack`) | ✓ Good — handlers can distinguish intent without ambiguity | 28 |
| `e.stopPropagation()` in handleAssetDrop prevents OS upload handler | ✓ Good — critical for correct drop routing | 28 |
| Atomic Firestore batch for version group merge | ✓ Good — no version number collisions even under concurrency | 28 |
| `isDropTarget` placed before `isSelected` in className ternary | ✓ Good — drop highlight has higher visual priority than selection | 28 |
| Token as Firestore doc ID for review links | ✓ Good — consistent lookup vs query | v1.2 |

## Context

~6,000 LOC TypeScript added in v1.3 across 56 files. All features use existing browser APIs and repo code — no new npm packages added.

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-04-21 — v2.3 milestone started*
