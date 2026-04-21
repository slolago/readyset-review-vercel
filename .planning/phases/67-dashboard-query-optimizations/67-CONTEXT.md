# Phase 67: dashboard-query-optimizations - Context

**Gathered:** 2026-04-21
**Status:** Ready (skip_discuss)

<domain>
Eliminate the dominant Firestore latency on the dashboard load path. Replace full collection scans with indexed array-contains queries, parallelize sequential N+1 loops, add stale-while-revalidate cache headers.
</domain>

<decisions>
### Claude's Discretion
- **PERF-01 denorm**: keep existing `Project.collaborators: Collaborator[]` intact (UI needs name/email/role objects). Add a parallel `Project.collaboratorIds: string[]` field that mirrors just the UIDs. Maintain it on every collaborator mutation (add/remove/update role): use a Firestore transaction that updates both fields atomically.
- **PERF-01 index**: composite index on `projects(collaboratorIds ARRAY_CONTAINS)` — actually Firestore only needs a single-field index for `array-contains` alone, but if combined with other filters (orderBy createdAt, etc), a composite is needed. Check existing usage.
- **PERF-01 backfill**: new `scripts/backfill-collaborator-ids.mjs` following the v2.0 pattern. Idempotent (skip docs that already have the field).
- **PERF-02/03 parallelization**: straightforward `Promise.all(projectIds.map(...))` replacing for-loops.
- **PERF-04 cache header**: `Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300` on `/api/stats` response.
- Query consolidation: `/api/projects` and `/api/stats` can share a helper — `fetchAccessibleProjects(userId)` in a new `src/lib/projects-access.ts` — that runs the `Promise.all([ownerQuery, collaboratorIdsQuery])` once and dedupes. Both routes call it.
</decisions>

<code_context>
Relevant files:
- src/app/api/stats/route.ts (full scan line 13, N+1 loop line 30-48, chunked loop 52-63, no cache headers)
- src/app/api/projects/route.ts (full scan line 20)
- src/app/api/projects/[projectId]/collaborators/route.ts (writes `collaborators` array — needs to also update `collaboratorIds`)
- src/lib/permissions.ts (canAccessProject reads `collaborators` — keep working alongside)
- src/types/index.ts (Project interface — add `collaboratorIds?: string[]`)
- firestore.indexes.json
- scripts/ (existing backfills: backfill-deleted-at-null.mjs, backfill-comment-count.mjs — follow pattern)
</code_context>

<specifics>
4 REQs: PERF-01..04
</specifics>

<deferred>
- Shared cache layer (Redis/edge KV) for /api/stats — SWR + Vercel CDN is enough for now
- Real-time updates via onSnapshot — deferred to v3
</deferred>
