# Phase 19: review-link-auth-skip - Research

**Researched:** 2026-04-07
**Domain:** Firebase Auth session detection in Next.js 14; review link guest flow UX
**Confidence:** HIGH

## Summary

The review page at `src/app/review/[token]/page.tsx` is a public route that sits outside the `(app)` layout group. It does NOT currently import `useAuth`. When `allowComments` is true, it gates the main UI behind `ReviewGuestForm`, which asks for a name and email and persists the name to `localStorage.frame_guest_name`.

The `AuthProvider` (and therefore `useAuthContext` / `useAuth`) is available at the root layout level (`src/app/layout.tsx`), so `useAuth` is already accessible on the review page — it just is not used there. Firebase's `onAuthStateChanged` fires before the component tree settles, so `loading` will be `true` briefly on first render.

The fix is small and fully contained to the review page: import `useAuth`, wait for `loading` to resolve, and if `user` is present, synthesise a `guestInfo` value from the logged-in user's `name` and `email` rather than showing `ReviewGuestForm`. The `guestInfo` state shape `{ name: string; email: string }` is already compatible with the `User` type fields (`user.name`, `user.email`).

No API changes are needed. No new components are needed. The `ReviewGuestForm` component remains untouched and continues to be shown for genuinely unauthenticated visitors.

**Primary recommendation:** In `ReviewPage`, after auth `loading` resolves, auto-populate `guestInfo` from `user` when the user is logged in, and skip the `ReviewGuestForm` screen entirely.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase | ^10.12.2 | Auth state via `onAuthStateChanged` | Already used in AuthContext |
| Next.js | 14.2.5 | App Router; `AuthProvider` wraps all routes from root layout | Project framework |
| React | ^18 | `useState`, `useEffect` hooks | Project framework |

No new packages are required for this phase.

**Installation:** None needed.

## Architecture Patterns

### How Auth Is Currently Available on the Review Page

```
src/app/layout.tsx          ← AuthProvider wraps everything
  └── src/app/review/[token]/page.tsx  ← public route, no auth guard
        └── (currently does NOT call useAuth)
```

`AuthProvider` subscribes to `onAuthStateChanged`. On the review page:
- `loading: true` → Firebase is resolving the session (brief flicker window)
- `loading: false, user: null` → visitor is not logged in → show guest form
- `loading: false, user: User` → visitor IS logged in → skip guest form

### Pattern: Derive guestInfo from auth state

```typescript
// Source: existing AuthContext.tsx + review page patterns
const { user, loading: authLoading } = useAuth();

// Merge auth-derived identity into guestInfo once auth resolves
useEffect(() => {
  if (!authLoading && user) {
    setGuestInfo({ name: user.name, email: user.email });
  }
}, [authLoading, user]);
```

The `guestInfo` state initialiser currently reads `localStorage.frame_guest_name`. For logged-in users, the `useEffect` will overwrite whatever localStorage held, which is the correct precedence (auth identity beats a cached guest name).

### Pattern: Guard the guestInfo gate with authLoading

The existing gate is:
```typescript
if (!guestInfo && data.reviewLink.allowComments) {
  return <ReviewGuestForm ... />;
}
```

This runs before auth has resolved on first render (when `guestInfo` is null AND `authLoading` is still true). Without guarding on `authLoading`, a logged-in user will briefly see the guest form flicker before the auth state resolves and the `useEffect` fires.

The gate must also check that auth is no longer loading:
```typescript
if (!guestInfo && data.reviewLink.allowComments && !authLoading) {
  return <ReviewGuestForm ... />;
}
```

This makes the review page show the loading spinner (which it already shows while `data` is fetching) until BOTH the review data AND auth state are resolved.

### Recommended Change Surface

Only **one file** needs editing:

```
src/app/review/[token]/page.tsx
```

Changes:
1. Add `useAuth` import.
2. Destructure `{ user, loading: authLoading }` from `useAuth()`.
3. Add a `useEffect` that sets `guestInfo` from `user` when auth resolves and user is logged in.
4. Add `&& !authLoading` to the `ReviewGuestForm` gate condition.

### Anti-Patterns to Avoid

- **Don't replace `guestInfo` with a dual state model** (e.g., separate `isLoggedIn` flag): the existing `guestInfo: { name, email } | null` pattern already carries all needed identity data. Overloading it is simpler.
- **Don't show `ReviewGuestForm` before `authLoading` is false**: this causes a flicker on every page load for logged-in users, which is the exact bug this phase fixes.
- **Don't remove `localStorage` initialisation**: non-logged-in returning guests still benefit from the cached name. The logged-in path simply wins by overwriting it via `useEffect`.
- **Don't touch `ReviewGuestForm` or `handleGuestSubmit`**: both remain correct as-is for the unauthenticated path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state on public page | Custom cookie/session reader | `useAuth()` from `AuthContext` | Already wired via root `AuthProvider`; handles token refresh automatically |
| User identity for comments | Separate guest-name lookup | Derive from `user.name` / `user.email` | `User` type already has these fields |

## Common Pitfalls

### Pitfall 1: Auth loading flicker shows guest form briefly
**What goes wrong:** `guestInfo` starts as `null` (localStorage has no entry), `data` has loaded, `authLoading` is still `true`. The existing gate `!guestInfo && allowComments` renders `ReviewGuestForm` for one render cycle before the auth effect fires.
**Why it happens:** `onAuthStateChanged` is async; it doesn't resolve synchronously.
**How to avoid:** Add `&& !authLoading` to the guest-form gate. During the auth-loading window the page already shows a spinner (because `loading` is true during data fetch), but if data loads before auth resolves the additional guard is the safety net.
**Warning signs:** In dev with a slow network emulation, logged-in users briefly see "Who are you?" before the main review UI appears.

### Pitfall 2: useEffect dependency on `user` object reference
**What goes wrong:** If `user` object reference changes on every render (e.g., reconstructed on each auth tick), the effect fires repeatedly and unnecessarily resets `guestInfo`.
**Why it happens:** `user` is set via `setUser(data.user)` in `AuthContext` — a new object literal each time.
**How to avoid:** The effect should also check `!guestInfo` or compare `user.email` before calling `setGuestInfo`. A simple guard: only set if `guestInfo?.email !== user.email`.

### Pitfall 3: guestInfo already set from localStorage, logged-in user has different name
**What goes wrong:** Returning visitor who was previously a guest, then signed up; localStorage has their old guest name; their account name is different.
**Why it happens:** localStorage initialisation runs synchronously; auth effect runs async.
**How to avoid:** The auth `useEffect` should unconditionally overwrite `guestInfo` when `user` is present, regardless of what localStorage held. Auth identity takes precedence. This is already handled if the effect does a plain `setGuestInfo({ name: user.name, email: user.email })`.

## Code Examples

### Complete change in ReviewPage (conceptual)

```typescript
// Source: existing patterns in src/app/review/[token]/page.tsx + src/hooks/useAuth.ts

// 1. Add import
import { useAuth } from '@/hooks/useAuth';

// 2. Inside ReviewPage():
const { user, loading: authLoading } = useAuth();

// 3. Effect — auto-populate guestInfo when authenticated
useEffect(() => {
  if (!authLoading && user) {
    setGuestInfo({ name: user.name, email: user.email });
  }
}, [authLoading, user]);

// 4. Update the gate (existing line 245 area):
// Before:
//   if (!guestInfo && data.reviewLink.allowComments) {
// After:
if (!guestInfo && data.reviewLink.allowComments && !authLoading) {
  return (
    <div className="min-h-screen bg-frame-bg flex items-center justify-center">
      <ReviewGuestForm projectName={data.projectName} onSubmit={handleGuestSubmit} />
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All review viewers must fill guest form when comments enabled | Logged-in users bypass guest form; identity sourced from Firebase auth | Phase 19 | Better UX for internal team reviewing own work |

## Open Questions

1. **Should logged-in users see a visual indicator of which identity they are commenting as?**
   - What we know: `ReviewHeader` currently shows "Comments enabled" badge but no user identity.
   - What's unclear: Whether showing "Commenting as Jane Smith" is in scope for this phase.
   - Recommendation: Out of scope for Phase 19 (keep it minimal). Can be addressed in a later polish phase.

2. **Should `handleAddComment` also send `authorId` for logged-in users?**
   - What we know: `authorId` on `Comment` is typed `string | null`. Guest comments set it to `null`. The current `handleAddComment` does not forward any `authorId`.
   - What's unclear: Whether linking review-page comments to the real user UID is desired.
   - Recommendation: Keep as-is for Phase 19. The comment API route can be enriched later if needed. The name/email from `user` is sufficient for identity.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure client-side code change within the existing stack).

## Validation Architecture

`workflow.nyquist_validation` is not set to `false` in `.planning/config.json`, so this section applies.

### Test Framework
No automated test framework was detected in the project (no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `pytest.ini`, or `tests/` directory found). Validation is manual.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P19-01 | Logged-in user visiting a review link with comments enabled proceeds directly to the review UI without seeing the guest form | manual | — | N/A |
| P19-02 | Comment posted on review link by logged-in user shows their account name, not a blank/guest name | manual | — | N/A |
| P19-03 | Non-logged-in user visiting the same review link still sees the guest form | manual | — | N/A |
| P19-04 | Logged-in user visiting a review link with comments DISABLED skips guest form (no change needed — was already skipped) | manual | — | N/A |
| P19-05 | No guest-form flicker on initial page load for logged-in users | manual/visual | — | N/A |

### Sampling Rate
- **Per task commit:** Manual browser check — open a review link while logged in, confirm guest form does not appear.
- **Phase gate:** All five manual scenarios above pass before marking phase complete.

### Wave 0 Gaps
None — no new test infrastructure is required. All validation is in-browser manual testing.

## Sources

### Primary (HIGH confidence)
- Direct source code read: `src/app/review/[token]/page.tsx` — current guest form gate logic
- Direct source code read: `src/contexts/AuthContext.tsx` — `useAuth` / `AuthProvider` shape and availability
- Direct source code read: `src/app/layout.tsx` — confirms `AuthProvider` wraps all routes including `/review/*`
- Direct source code read: `src/hooks/useAuth.ts` — thin wrapper re-exporting `useAuthContext`
- Direct source code read: `src/components/review/ReviewGuestForm.tsx` — component interface
- Direct source code read: `src/types/index.ts` — `User.name`, `User.email`, `Comment.authorId`

### Secondary (MEDIUM confidence)
- Firebase Auth v10 docs: `onAuthStateChanged` is async; first emission may be slightly after component mount — standard Firebase behaviour confirmed by existing `AuthContext` loading flag pattern.

## Metadata

**Confidence breakdown:**
- Change surface: HIGH — only one file needs editing, confirmed by reading the source
- Auth availability: HIGH — `AuthProvider` is at root layout, wraps the review route
- Pitfalls: HIGH — flicker pitfall is a known Firebase auth async pattern; dependency pitfall is a common React hooks pattern

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable stack — no fast-moving dependencies involved)
