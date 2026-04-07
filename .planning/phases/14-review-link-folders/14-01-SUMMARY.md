---
phase: 14-review-link-folders
plan: "01"
subsystem: review-links
tags: [routing, read-only, review-links, asset-browser]
dependency_graph:
  requires: []
  provides:
    - /projects/[projectId]/review-links list page
    - /projects/[projectId]/review-links/[token] asset view
    - ReviewLinkFolderBrowser component
  affects:
    - src/components/review/
    - src/app/(app)/projects/[projectId]/
tech_stack:
  added: []
  patterns:
    - useParams for dynamic route params in App Router
    - localStorage-persisted viewMode toggled via header buttons
    - Read-only asset display via hideActions={true} on AssetCard
    - Suspense wrapper with inner component for useParams client usage
key_files:
  created:
    - src/components/review/ReviewLinkFolderBrowser.tsx
    - src/app/(app)/projects/[projectId]/review-links/page.tsx
    - src/app/(app)/projects/[projectId]/review-links/[token]/page.tsx
  modified: []
decisions:
  - Used custom inline breadcrumb nav in ReviewLinkFolderBrowser (Link + ChevronRight) instead of Breadcrumb component — Breadcrumb component auto-generates folder hrefs and requires projectId + items with no href control; custom nav gives exact /review-links href
  - List page defaults viewMode to 'list' (more appropriate for a directory of links with date column); token page defaults to 'grid'
  - In list mode, AssetListView is used as-is with no mutation callbacks — row context menus won't show delete/rename since those callbacks are omitted
metrics:
  duration_minutes: 15
  completed_date: "2026-04-07"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
---

# Phase 14 Plan 01: Review-Link Folder Routes — List and Asset Views Summary

Two new routes + a shared component that make review links browsable as virtual folders from inside the authenticated project view, with full grid/list toggle and read-only asset display.

## What Was Built

### ReviewLinkFolderBrowser (`src/components/review/ReviewLinkFolderBrowser.tsx`)

A `'use client'` component that fetches `/api/review-links/[token]` (no auth — public endpoint), displays assets in grid or list view, handles 401 (password-protected) with a fallback message, and preserves view mode in localStorage per token.

Grid mode renders `AssetCard` components directly with `hideActions={true}` to suppress the three-dot dropdown and context menu. List mode delegates to `AssetListView` with no mutation callbacks.

### Review-Links List Page (`src/app/(app)/projects/[projectId]/review-links/page.tsx`)

Fetches all review links for the project via `GET /api/review-links?projectId=...` with a Bearer token from `useAuth().getIdToken()`. Renders:
- **Grid mode**: folder-style `ReviewLinkCard` components (inline component) showing name, scope, and creation date
- **List mode**: table rows with Name, Scope, and Created columns
- **Empty state**: centered icon + message

### Token Route Shell (`src/app/(app)/projects/[projectId]/review-links/[token]/page.tsx`)

Minimal Suspense wrapper around an inner component that extracts `projectId` and `token` from `useParams()` and renders `ReviewLinkFolderBrowser`.

## Verification

- `npx next lint --quiet` — no errors
- `npm run build` — exits 0, both routes appear:
  - `/projects/[projectId]/review-links` — 3.53 kB
  - `/projects/[projectId]/review-links/[token]` — 3.18 kB

## Deviations from Plan

### Auto-adapted — Breadcrumb component incompatibility

The existing `Breadcrumb` component (`src/components/ui/Breadcrumb.tsx`) accepts `items: Array<{ id: string | null; name: string }>` and auto-generates hrefs as `/projects/[projectId]/folders/[id]` or `/projects/[projectId]`. It cannot produce `/projects/[projectId]/review-links` hrefs. A custom inline breadcrumb using `<Link>` + `<ChevronRight>` was used instead. Functionally equivalent; no plan deviation in output.

## Known Stubs

None — all data is wired to live API endpoints.

## Self-Check

- [x] `src/components/review/ReviewLinkFolderBrowser.tsx` — created
- [x] `src/app/(app)/projects/[projectId]/review-links/page.tsx` — created
- [x] `src/app/(app)/projects/[projectId]/review-links/[token]/page.tsx` — created
- [x] Commit `886217cd` — feat(14-01): add review-links folder routes

## Self-Check: PASSED
