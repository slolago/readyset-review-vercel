# Phase 68: client-init-waterfall - Context

**Gathered:** 2026-04-21
**Status:** Ready (skip_discuss)

<domain>
Eliminate the ~700ms-1s blank-spinner gate on every page load by short-circuiting the /api/auth/session POST when the Firebase-auth UID already matches a cached user. Unify project list fetching between dashboard + sidebar so they share one fetch via ProjectsContext.
</domain>

<decisions>
### Claude's Discretion

**PERF-05 AuthContext short-circuit:**
- Use `sessionStorage` (not localStorage) — tab-scoped, auto-clears on close. Key `frame_cached_user`.
- Cache shape: `{ user: User, uid: string, cachedAt: number }` — UID to match against Firebase token, `cachedAt` for 24h TTL.
- On mount: if Firebase's `onAuthStateChanged` gives us a user AND sessionStorage has a matching uid cache AND it's within TTL → set user immediately, `setLoading(false)`. Fire the `/api/auth/session` POST in background to refresh the cache, but don't block rendering.
- On cache miss or UID mismatch: existing flow (await the POST).
- On logout or `/api/auth/session` 403 (suspended): clear cache.
- Cache is written when `/api/auth/session` succeeds.

**PERF-06 ProjectsContext:**
- New `src/contexts/ProjectsContext.tsx` that wraps authenticated pages under `(app)/layout.tsx`.
- Provides: `{ projects, loading, error, refetch }`.
- On mount (once per provider lifetime), fires `/api/projects` and caches result.
- `useProjects` hook becomes a thin wrapper around the context consumer.
- `useProjectTree` in sidebar currently calls `useProjects` — it'll naturally consume the same context without code change.
- Invalidation: after project create/rename/delete mutations, components call `refetch()` from context. Grep for current call sites of `useProjects().refetch` to make sure they still work.
</decisions>

<code_context>
- src/contexts/AuthContext.tsx (the gate)
- src/hooks/useAuth.ts
- src/hooks/useProject.ts (exports useProjects)
- src/hooks/useProjectTree.ts (consumes useProjects)
- src/app/(app)/layout.tsx (provider wrap point)
- src/app/api/auth/session/route.ts (server — no change needed)
</code_context>

<specifics>
2 REQs: PERF-05, PERF-06
</specifics>

<deferred>
- Real-time project list via onSnapshot — v3 future
- Server-side session cookie (HTTP-only) for true zero-request returning-user flow — bigger refactor, defer
</deferred>
