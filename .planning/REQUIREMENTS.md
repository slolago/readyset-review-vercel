# Requirements: readyset-review

**Defined:** 2026-04-21 (v2.1 — dashboard performance)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v2.1 Requirements

Synthesized from a focused dashboard perf audit (2026-04-21). 3 critical + 3 medium + 3 low findings; grouped by the natural cleave the audit proposed.

### Query Optimizations (Phase 67)

- [x] **PERF-01**: `/api/stats` and `/api/projects` no longer do full `projects` collection scans. Denormalize collaborator UIDs to `Project.collaboratorIds: string[]`, add a Firestore composite index, and query with `where('collaboratorIds', 'array-contains', user.id)` in parallel with the existing `where('ownerId', '==', user.id)`. Includes a one-off backfill script that populates `collaboratorIds` on existing project docs from the existing `collaborators` array.
- [x] **PERF-02**: `/api/stats` asset-count loop runs in parallel via `Promise.all(projectIds.map(...))` instead of sequential `await` inside a `for`. Expected impact: cuts the dominant latency component from O(N projects × 100ms) to O(1 round trip).
- [x] **PERF-03**: `/api/stats` review-link chunked-`in` queries run in parallel. Same fix pattern as PERF-02, applied to the `where('projectId', 'in', chunk)` loop.
- [x] **PERF-04**: `/api/stats` response includes `Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300`. Dashboard remounts within 60s serve the cached stats instantly; stale revalidation happens asynchronously.

### Client Init Waterfall (Phase 68)

- [ ] **PERF-05**: `AuthContext` short-circuits the `/api/auth/session` POST when the Firebase token's UID already matches a cached user object in `sessionStorage`. Cache invalidates on UID change, on explicit logout, and after a TTL. Returning users see the app shell paint without waiting on the session round-trip.
- [ ] **PERF-06**: Project list fetching is lifted to a shared `ProjectsContext`. Dashboard (via `useProjects`) and sidebar (`ProjectTreeNav` via `useProjectTree`) both consume the same state from the context instead of independently fetching `/api/projects` on mount. Single fetch, single Firestore cost, no duplicate network call.

### SSR + Micro-Optimizations (Phase 69)

- [ ] **PERF-07**: Dashboard page is split — a thin Server Component wrapper pre-fetches stats server-side (using the session cookie) and passes them as props to the client shell. First paint includes the numbers; no waterfall for the stats card grid.
- [ ] **PERF-08**: `getAuthenticatedUser` in `src/lib/auth-helpers.ts` caches the user doc lookup in a module-level `Map<uid, {user, exp}>` with a 30s TTL. Concurrent API calls on the same request share one Firestore read instead of re-reading per call.
- [ ] **PERF-09**: Sidebar logo is migrated from the external `readyset.co` CDN to a local static asset under `/public/`. Removes a blocking external fetch on cold load and lets Next.js Image optimize it.

## Absorbed from prior milestones

See `.planning/MILESTONES.md` — v1.7 through v2.0 shipped.

## v3 / Future Requirements

- Server-side cron: Trash auto-purge, stale job sweeper, orphan GCS object cleanup, orphan asset cleanup (projectId references deleted project)
- Presence indicators
- Notifications (in-app + email)
- Per-asset watermarks
- AI auto-tagging + semantic search
- Bulk export
- Real-time project list updates via Firestore onSnapshot (would obsolete PERF-06's fetch-and-cache approach)

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
| PERF-01 | Phase 67 | Complete |
| PERF-02 | Phase 67 | Complete |
| PERF-03 | Phase 67 | Complete |
| PERF-04 | Phase 67 | Complete |
| PERF-05 | Phase 68 | Pending |
| PERF-06 | Phase 68 | Pending |
| PERF-07 | Phase 69 | Pending |
| PERF-08 | Phase 69 | Pending |
| PERF-09 | Phase 69 | Pending |

**Coverage:**
- v2.1 requirements: 9 total
- Mapped to phases: 9 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 — synthesized from dashboard perf audit*
