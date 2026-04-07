---
phase: 15-dashboard-and-storage
plan: "01"
subsystem: dashboard
tags: [stats, api, dashboard, firestore, skeleton-loading]
dependency_graph:
  requires: []
  provides: [GET /api/stats, DashboardStats interface, real stat cards]
  affects: [src/app/(app)/dashboard/page.tsx]
tech_stack:
  added: []
  patterns: [collectionGroup with chunked in-query, Bearer token fetch from client, null-value skeleton pattern]
key_files:
  created:
    - src/app/api/stats/route.ts
  modified:
    - src/app/(app)/dashboard/page.tsx
decisions:
  - collectionGroup used for assets (assets are subcollections under projects)
  - projectIds chunked in batches of 30 to respect Firestore `in` operator limit
  - StatCard value typed as string | null so null triggers animate-pulse skeleton
  - Upload icon kept in import (still used by QuickActions "Upload Assets" button)
metrics:
  duration: ~8 minutes
  completed: "2026-04-07T13:17:45Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 15 Plan 01: Dashboard Real Stats Summary

Real stats wired to dashboard via new GET /api/stats endpoint — projectCount, assetCount, collaboratorCount, and storageBytes all fetched on mount with per-card skeleton loading.

## What Was Built

**Task 1 — GET /api/stats (`src/app/api/stats/route.ts`)**

New API route following the exact same auth pattern as `projects/route.ts`. Logic:
1. Auth check via `getAuthenticatedUser` — 401 if no session
2. Fetches all Firestore projects, filters to those where `ownerId === user.id` or user is in `collaborators`
3. Deduplicates collaborator userIds into a `Set` (excludes the requesting user's own ID)
4. Chunks `projectIds` into groups of 30 and runs `collectionGroup('assets').where('projectId', 'in', chunk)` for each chunk — sums `size` and counts docs
5. Returns `{ projectCount, assetCount, collaboratorCount, storageBytes }`
6. try/catch returns 500 with `{ error: 'Failed to fetch stats' }` on failure

**Task 2 — Dashboard page (`src/app/(app)/dashboard/page.tsx`)**

- Added `useState`, `useEffect` imports
- Added `HardDrive` to lucide-react import (kept `Upload` for QuickActions)
- Added `formatBytes` to utils import
- `DashboardStats` interface declared at module scope
- `getIdToken` destructured from existing `useAuth()` call
- `stats` and `statsLoading` state added; `useEffect` fetches `/api/stats` with Bearer token on mount
- Four stat cards updated:
  - Projects: `loading ? null : projects.length.toString()` (uses existing useProjects loading state)
  - Assets: `statsLoading ? null : stats?.assetCount.toString() ?? '—'`
  - Collaborators: `statsLoading ? null : stats?.collaboratorCount.toString() ?? '—'`
  - Storage: `statsLoading ? null : stats ? formatBytes(stats.storageBytes) : '—'` — replaces old "Uploads" card
- `StatCard` prop type changed from `value: string` to `value: string | null` — null renders `<div className="h-8 w-16 bg-frame-border rounded animate-pulse mb-1" />` in place of the value text

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all four stat cards now return real data from Firestore.

## Verification

- `npx next lint --quiet` — passed with no errors or warnings
- Both files staged and committed as `15f5e11d`
