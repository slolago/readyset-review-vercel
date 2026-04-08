# readyset-review

Frame.io V4 clone — internal media review platform.

## What This Is

A fully-featured media review platform for internal teams: upload video/image assets, organize into projects and folders, annotate with time-stamped comments, share via review links, and compare versions side-by-side.

## Core Value

Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## Current Milestone: v1.4 Review & Version Workflow

**Goal:** Sharper version control, asset approval statuses, and smarter review link creation for production QC pipelines.

**Target features:**
- Version stack management — unstack + reorder versions (not just delete)
- Asset status labels — APPROVED/other statuses on assets for QC identification
- Smart copy to review folder — copy latest version only (not full stack)
- Copy without comments — option to strip comments when copying to Client Facing Folder
- Selection-based review links — generate review links from a specific asset selection
- Compare view audio & comments — click version label to switch audio; show that version's comments
- Move to folder — "Move to" context menu option to relocate assets between folders

## Current State (v1.3 — shipped 2026-04-08)

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

### Active

- [ ] VSTK-01: Version stack unstack + reorder
- [ ] STATUS-01: Asset status labels (APPROVED/etc.)
- [ ] REVIEW-01: Smart copy — latest version only
- [ ] REVIEW-02: Copy without comments option
- [ ] REVIEW-03: Selection-based review links
- [ ] COMPARE-01: Compare view audio switch by click
- [ ] COMPARE-02: Compare view shows focused version's comments
- [ ] MOVE-01: Move to folder context menu option

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

*Last updated: 2026-04-08 — v1.4 milestone started*
