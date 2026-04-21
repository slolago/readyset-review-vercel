---
phase: 69
plan: 01
subsystem: dashboard-perf
tags: [ssr, perf, auth-cache, static-assets]
requires: [67-01]
provides: [shared-stats-helper, server-component-dashboard, user-doc-cache, local-logo]
affects:
  - src/app/(app)/dashboard/page.tsx
  - src/app/(app)/dashboard/DashboardClient.tsx
  - src/app/api/stats/route.ts
  - src/lib/dashboard-stats.ts
  - src/lib/auth-helpers.ts
  - src/app/api/auth/session/route.ts
  - src/components/layout/Sidebar.tsx
  - src/app/login/page.tsx
  - src/components/review/ReviewHeader.tsx
  - next.config.mjs
  - public/logo-horizontal.png
decisions:
  - Shipped Server Component split with initialStats=null fallback — Firebase has no server-readable session cookie by default, so the SSR prefetch activates when session-cookie middleware lands in v3. Structural win is live: /api/stats and the Server Component share one helper.
  - 30s TTL on user-doc cache — short enough that admin suspends propagate within one window, long enough to dedupe concurrent request fan-out. Disabled users never cached (fresh disabled check on first hit).
  - Logo priority prop added on above-the-fold usages (sidebar, login). unoptimized dropped everywhere so Next.js Image can serve AVIF/WebP.
  - Removed readyset.co from next.config.mjs remotePatterns — no remaining references.
metrics:
  duration: ~15 minutes
  completed: 2026-04-21
  tasks: 3
  commits: 3
---

# Phase 69 Plan 01: SSR and Micro-Optimizations Summary

Final v2.1 dashboard-perf polish: extracted the stats computation into a shared helper, split the dashboard into Server Component + client shell, added an in-process 30s cache for the user-doc Firestore read, and migrated the Ready Set logo from the external CDN to a local `public/` asset.

## Commits

| Task | REQ     | SHA        | Description                                          |
| ---- | ------- | ---------- | ---------------------------------------------------- |
| 1    | PERF-07 | `194d8f66` | extract stats helper + server component split       |
| 2    | PERF-08 | `43fc39b1` | getAuthenticatedUser 30s TTL user-doc cache         |
| 3    | PERF-09 | `1161029e` | migrate sidebar logo to local asset                 |

## What Shipped

### PERF-07: Stats helper + Server Component split

- New `src/lib/dashboard-stats.ts` exports `fetchDashboardStats(user): Promise<DashboardStats>`. All the asset-count / storage-bytes / review-link-count / collaborator-set logic that used to live inline in `/api/stats/route.ts` now lives here.
- `/api/stats/route.ts` is a thin wrapper: auth → `fetchDashboardStats(user)` → JSON with the Phase 67 SWR Cache-Control header preserved.
- `src/app/(app)/dashboard/page.tsx` is now a Server Component. It renders `<DashboardClient initialStats={...} />`. `DashboardClient.tsx` (new file, extracted from the old `page.tsx`) reads the `initialStats` prop via `useState` + `useRef` — when seeded, the initial `/api/stats` fetch on mount is skipped.
- **Pragmatic fallback today:** Firebase doesn't set a server-readable session cookie by default, so `initialStats` is `null` in production — the client fetches as before, no regression. The structural payoff (no query-logic duplication between route + SC) is live. A future session-cookie middleware can populate `initialStats` server-side and the SSR prefetch activates with zero client changes.

### PERF-08: User-doc cache in auth-helpers

- Module-level `Map<uid, {user, exp}>` with a 30s TTL. On `getAuthenticatedUser`:
  - `verifyIdToken` runs first (always — cheap, and the gate against spoofed UIDs).
  - Cache hit + not expired → return cached user, skip Firestore read.
  - Miss or expired → Firestore read → populate cache → return.
- Disabled users are **never cached** — the disabled check always runs fresh, and re-enabling a user takes effect immediately.
- Exported `invalidateUserCache(uid)`. Wired into `/api/auth/session` after the name/avatar update so the next read sees fresh data.
- **Trade-off:** admin-initiated suspends propagate with up to 30s latency. Acceptable (suspension is rare, 30s is short, the session endpoint already blocks establishing new sessions for disabled users).

### PERF-09: Local logo asset

- Downloaded `https://readyset.co/wp-content/uploads/2025/09/01.logo-horizontal.png` (192×48 PNG, 2.6 KB) → `public/logo-horizontal.png`.
- Updated 4 consumer sites: `Sidebar.tsx`, `login/page.tsx` (desktop hero + mobile), `ReviewHeader.tsx`. All now reference `/logo-horizontal.png`.
- `unoptimized` prop dropped everywhere — Next.js Image now serves optimized AVIF/WebP variants with automatic responsive sizing.
- `priority` prop added on above-the-fold logos (sidebar, login desktop + mobile) to flag them as LCP candidates.
- Removed `readyset.co` from `next.config.mjs` `images.remotePatterns` — no remaining references in `src/`.

## Verification

- `npx tsc --noEmit` — clean after each task.
- `npx vitest run` — 171/171 green after each task (no test count change; the affected surface has no dedicated unit tests, which is expected for this structural-refactor phase).
- `grep -r 'readyset.co' src/` — no matches.
- `ls public/logo-horizontal.png` — present, 2.6 KB, valid PNG.

Live Lighthouse verification (LCP improvement from local logo + SSR activation when middleware lands) is deferred to the VERIFICATION.md — requires a running session and a deployed build.

## Deviations from Plan

**None.** All 3 tasks executed as specified. Minor self-directed additions:

1. **[Rule 2 — correctness]** Wired `invalidateUserCache(uid)` into `/api/auth/session` after the name/avatar write. The plan mentioned "the session endpoint can call on logout" but the current codebase has no logout endpoint — instead, the session endpoint mutates the user doc on every login refresh, and a stale cache there would serve old name/avatar. Invalidating on that write is the correctness fix.
2. **[Rule 2 — cleanup]** Removed `readyset.co` from `next.config.mjs` `images.remotePatterns` after the last reference was migrated. Keeping it in the allowlist was dead config.

## Known Stubs

None. All three requirements are fully shipped functionally; the only "not fully active" piece is the SSR prefetch prop value (`initialStats=null` today), which is documented in `page.tsx` as intentional and gated on v3 middleware work — the architecture is ready, the data channel is the gate.

## Self-Check: PASSED

- `src/lib/dashboard-stats.ts` — FOUND
- `src/app/(app)/dashboard/DashboardClient.tsx` — FOUND
- `public/logo-horizontal.png` — FOUND
- Commit `194d8f66` — FOUND
- Commit `43fc39b1` — FOUND
- Commit `1161029e` — FOUND
