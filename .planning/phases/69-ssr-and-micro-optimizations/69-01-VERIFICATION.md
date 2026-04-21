---
phase: 69
plan: 01
status: human_needed
---

# Phase 69 Plan 01 Verification

**Status:** `human_needed` — Lighthouse / live-session verification requires a deployed build with authenticated access. The static verifications below have all passed; the runtime perf numbers need a human on a browser.

## Automated (PASSED)

- [x] `npx tsc --noEmit` — clean
- [x] `npx vitest run` — 171/171 green
- [x] No `readyset.co` references remain in `src/**/*.{ts,tsx}`
- [x] `public/logo-horizontal.png` present (2.6 KB valid PNG, 192×48)
- [x] `/api/stats` logic no longer duplicated — both the route and the Server Component import `fetchDashboardStats` from `src/lib/dashboard-stats.ts`
- [x] `getAuthenticatedUser` cache hit path verified by code inspection: `verifyIdToken` still runs first, cache only seeded after disabled-check passes, 30s TTL enforced
- [x] `invalidateUserCache(uid)` wired into `/api/auth/session` after the name/avatar update
- [x] `next.config.mjs` `images.remotePatterns` no longer lists `readyset.co`

## Manual (TO DO on live session)

### PERF-07 — dashboard SSR split

- [ ] Load `/dashboard` as authenticated user. Expected behavior: **identical to pre-phase-69** (client fetches stats after mount) because `initialStats=null` in the current Firebase-cookieless flow. No regression is the bar.
- [ ] Check network tab: exactly one `GET /api/stats` call on mount. No duplicates.
- [ ] Trigger a refetch path (manual refresh / mutation invalidation, once those hooks exist) — verify it still hits `/api/stats` and re-renders numbers.
- [ ] Optional: with DevTools network throttling to Slow 3G, confirm the stat cards still render their skeleton → real-number transition (no blank page, no hydration-mismatch warning in the console).

### PERF-08 — user-doc cache

- [ ] Cold start (fresh lambda / `next dev` restart): load `/dashboard`. First `/api/stats` + `/api/projects` fire — expected 1 `users/{uid}` Firestore read (the second call hits the cache). Verify via GCP Firestore usage dashboard or a temporary `console.log` in the cache-hit branch.
- [ ] Within 30s, refresh or trigger another authenticated API call — expected 0 additional `users/{uid}` reads (cache hit).
- [ ] After 30s idle, trigger another call — expected 1 fresh read (TTL expired).
- [ ] Admin-suspend test: as admin, set `disabled: true` on a test user in Firestore. Within ≤30s, the suspended user's next API call returns 401 (disabled users are never cached; `getAuthenticatedUser` always re-reads for them). Confirm.
- [ ] Profile update test: change the Google account name/avatar, re-auth, call any authenticated API — the response reflects the new name (cache was invalidated by the session endpoint).

### PERF-09 — local logo + LCP

- [ ] Run Lighthouse on `/login` (mobile, Slow 4G). Expected:
  - LCP element is the logo `<img>` on the hero panel (it already was).
  - LCP time improves vs baseline (no DNS + TLS handshake to `readyset.co`, now a same-origin optimized image).
  - LCP element uses `srcset` with AVIF/WebP variants (Next.js Image optimization active — this is the main win vs `unoptimized`).
- [ ] Network tab on cold load: no request to `readyset.co`. Logo comes from `/_next/image?url=%2Flogo-horizontal.png...`.
- [ ] Visual: logo renders identically to pre-phase-69 in Sidebar, login hero, login mobile, and ReviewHeader.

## Rollback Note

If any of these regress:
- **PERF-07 regression:** revert commit `194d8f66` — restores the old inline `/api/stats` logic + client-only dashboard.
- **PERF-08 regression:** revert commit `43fc39b1` — restores the uncached `getAuthenticatedUser`.
- **PERF-09 regression:** revert commit `1161029e` — restores the external-CDN logo references + `readyset.co` in `next.config.mjs`.

All three commits are independent and can be reverted in isolation.
