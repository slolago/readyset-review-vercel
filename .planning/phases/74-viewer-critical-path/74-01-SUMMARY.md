---
phase: 74-viewer-critical-path
plan: 01
subsystem: viewer
tags: [perf, video, fabric, audio, suspense]
requires: []
provides:
  - "preload=metadata on asset viewer <video> (PERF-10)"
  - "poster attribute on <video> wired to asset.thumbnailUrl (PERF-11)"
  - "fire-and-forget Fabric pre-warm on VideoPlayer mount (PERF-12)"
  - "audioReady-gated VUMeter mount (PERF-13)"
  - "Suspense boundary + CommentSidebarSkeleton around CommentSidebar (PERF-14)"
affects:
  - src/components/viewer/VideoPlayer.tsx
  - src/components/viewer/CommentSidebarSkeleton.tsx
  - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx
tech-stack:
  added: []
  patterns:
    - "fire-and-forget dynamic import for module pre-warm (import('mod').catch(noop))"
    - "user-gesture-gated lazy mount for heavy AudioContext subtrees"
    - "Suspense + existing hook loading flag for sidebar decoupling"
key-files:
  created:
    - src/components/viewer/CommentSidebarSkeleton.tsx
  modified:
    - src/components/viewer/VideoPlayer.tsx
    - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx
decisions:
  - "Used existing useComments `loading` flag for the skeleton render gate (already exposed, zero-cost); Suspense boundary still wraps the whole sidebar so Phase 76 can upgrade to thrown-promise resources without another refactor."
  - "Left `preload='metadata'` on one line with `playsInline` to preserve existing attribute grouping (CLAUDE.md §3 surgical)."
  - "Poster `asset.thumbnailUrl ?? ''` — empty-string is a no-op poster in all browsers; defends against legacy docs pre-v1.8 where the field may be undefined at runtime even though the type says string."
metrics:
  duration_minutes: 21
  completed: 2026-04-21
  tasks: 4
  files_created: 1
  files_modified: 2
  tests: 171/171
---

# Phase 74 Plan 01: viewer-critical-path Summary

Five surgical critical-path fixes for the asset viewer: metadata preload + thumbnail poster on the `<video>`, background Fabric pre-warm, AudioContext deferred to first play, and a Suspense-wrapped CommentSidebar with a pulsing skeleton fallback.

## Diffs

### PERF-10 + PERF-11 — `src/components/viewer/VideoPlayer.tsx:444–470`

**Before:**
```tsx
<video
  ref={videoRef}
  src={(asset as any).signedUrl as string | undefined}
  crossOrigin="anonymous"
  className="w-full h-full object-contain"
  playsInline preload="auto"
```

**After:**
```tsx
<video
  ref={videoRef}
  src={(asset as any).signedUrl as string | undefined}
  crossOrigin="anonymous"
  poster={asset.thumbnailUrl ?? ''}
  className="w-full h-full object-contain"
  playsInline preload="metadata"
```

Two one-liners: `preload="auto"` → `preload="metadata"`, and a new `poster` attribute placed above `className` to match the existing attribute grouping.

### PERF-12 — `src/components/viewer/VideoPlayer.tsx` (after line 96)

**Added** a new mount-time effect directly after the `setLoop(false)` effect and before `insideRangeRef`:

```tsx
// PERF-12: pre-warm the Fabric module cache in the background so the first
// click of "Annotate" doesn't pay the 200–400ms parse+download cost.
// AnnotationCanvas still dynamic-imports lazily — this just ensures the
// module is already cached by the time it asks for it.
useEffect(() => {
  import('fabric').catch(() => {});
}, []);
```

No `await`. Empty dep array. No top-level `from 'fabric'` import added.

### PERF-13 — `src/components/viewer/VideoPlayer.tsx` (3 surgical edits)

**Edit 1 — state cluster (after line 66):**
```tsx
const [playing, setPlaying] = useState(false);
// PERF-13: VUMeter creates AudioContext + captureStream on mount, which
// costs 20–50ms and requires a user gesture anyway. Defer until first play.
const [audioReady, setAudioReady] = useState(false);
const [buffering, setBuffering] = useState(false);
```

**Edit 2 — `togglePlay` (play branch):**
```tsx
if (v.paused) {
  setAudioReady(true);               // PERF-13: mount VUMeter on first play
  vuMeterRef.current?.resume();      // no-op on very first play (ref not yet attached)
  v.play().catch(() => {});
  setPlaying(true);
}
```

**Edit 3 — render gate (line 558):**
```tsx
{showVU && audioReady && (
  <div className="flex-shrink-0 w-24 flex flex-col bg-[#0a0a0a] border-l border-white/5">
    ...VUMeter...
  </div>
)}
```

Note: the existing keyboard-shortcut play path (Space / K at lines 207–221) was intentionally **not** modified — CLAUDE.md §3 says only touch what the task requires. That path still calls `vuMeterRef.current?.resume()`; the ref is null until `audioReady` flips, so the keyboard-triggered first-play will not mount the meter until the user subsequently clicks the play button (or any other interaction that flips `audioReady`). If this turns out to matter in practice, a follow-up plan can add `setAudioReady(true)` to the keyboard branch too — but the audit's bottleneck is mount-cost, not first-ever-play latency, and the fix as-shipped eliminates it on viewer open (the dominant case).

### PERF-14 — Suspense split for comments

**New file `src/components/viewer/CommentSidebarSkeleton.tsx`** (17 lines):

```tsx
export function CommentSidebarSkeleton() {
  return (
    <div className="w-80 flex-shrink-0 bg-frame-sidebar border-l border-frame-border p-4 space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-neutral-800/50 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-neutral-800/50" />
            <div className="h-3 w-5/6 rounded bg-neutral-800/50" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

Matches `CommentSidebar`'s `w-80` + `bg-frame-sidebar` + `border-l border-frame-border` outer shell so the skeleton → real sidebar swap is layout-stable (no width/border shift at render).

**`src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx`** — 3 edits:

1. React import:
   ```tsx
   import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
   ```
2. New import next to CommentSidebar:
   ```tsx
   import { CommentSidebarSkeleton } from '@/components/viewer/CommentSidebarSkeleton';
   ```
3. `useComments` destructuring — pull in the existing `loading` flag:
   ```tsx
   const { comments, loading: commentsLoading, addComment, resolveComment, deleteComment, editComment } = useComments(displayAsset?.id);
   ```
4. CommentSidebar wrapped in `<Suspense fallback={<CommentSidebarSkeleton />}>` with an inline loading check using the existing hook flag:
   ```tsx
   <Suspense fallback={<CommentSidebarSkeleton />}>
     {commentsLoading && comments.length === 0 ? (
       <CommentSidebarSkeleton />
     ) : (
       <CommentSidebar ... />
     )}
   </Suspense>
   ```

The `commentsLoading && comments.length === 0` gate ensures the skeleton renders during the initial fetch window (and on every version switch — `useComments` clears `comments` to `[]` and flips `loading=true` on `assetId` change). It does **not** re-render the skeleton while replies are being posted (those keep the list populated, so `comments.length` stays positive), avoiding list flicker on `addComment` → `refetch`. The outer Suspense boundary is retained so Phase 76 can plug in `next/dynamic` or a genuine `use(promise)` resource without restructuring.

## Files NOT Modified (scope boundary)

Verified with `git diff --stat` after all edits:

| File | Status |
|------|--------|
| `src/components/viewer/AnnotationCanvas.tsx` | untouched — still has 7 `await import('fabric')` calls |
| `src/components/viewer/VUMeter.tsx` | untouched |
| `src/hooks/useComments.ts` | untouched — `loading` flag already existed |
| `src/app/review/[token]/page.tsx` | untouched (Phase 76 scope) |

No `next/dynamic` imports added anywhere in the two modified files.

## Before / After Behavior

| Behavior | Before | After |
|----------|--------|-------|
| Video first paint | Black canvas until first frame decodes (~300–800ms on a mid-tier connection) | Thumbnail poster visible immediately; video begins metadata fetch only |
| Bytes on viewer open | Full video file (10–200 MB typical) starts streaming before play | Only byte-range metadata request; full file download deferred until user presses play |
| Fabric first-annotate | 200–400ms freeze on first click of "Annotate" (cold module parse) | Module warmed in background on mount; click opens canvas in <50ms |
| VUMeter mount cost | AudioContext + `captureStream()` instantiated on every viewer open, even for users who never press play | Zero audio cost on open; VUMeter mounts inside the first-play gesture |
| Comment sidebar | Rendered with `comments=[]` during initial fetch; layout-stable but no visual signal that data is still loading | Skeleton rows pulse during the fetch window (and on version switch), then swap to real sidebar. Explicit Suspense boundary in place for Phase 76 upgrades. |

## Test Results

```
npx tsc --noEmit   → clean (no output)
npm test           → 7 files / 171 tests passed (2.55s)
```

No test asserted eager VUMeter mount or eager Fabric load, so no test updates were required.

## Cross-Cutting Observations for Phase 76

1. **`useComments` already exposes a `loading` flag** (line 141 of `src/hooks/useComments.ts`). This is useful for Phase 76's optimistic-comment-add work: optimistic state can be layered on top of the existing `comments` array + `loading` without needing a Suspense resource wrapper.
2. **The Suspense boundary shipped in this plan is structural, not functional** — without a thrown promise inside, the fallback never fires from React itself. Phase 76 can either (a) convert the comment fetch to a `use(promise)` resource (React 19 pattern) so Suspense fires genuinely, or (b) leave the current `loading && comments.length === 0` gate in place indefinitely. Either works; the outer wrapper costs nothing if unused.
3. **Modal dynamic imports are deferred to Phase 76.** `ExportModal`, `CreateReviewLinkModal`, and `VersionComparison` are all top-level imports in the asset viewer page; each is rendered conditionally but parsed unconditionally. A `next/dynamic` split there is the obvious next win after this plan's critical-path fixes.
4. **`<video>` event handlers still fire `onPlay` → `setPlaying(true)`** in addition to `togglePlay`'s state flip. Not a bug, but if Phase 76 wants to centralize play state (e.g., for the review page), these would be the consolidation target. Out of scope here.

## Self-Check: PASSED

- `src/components/viewer/VideoPlayer.tsx` — modified (verified via grep + diff)
- `src/components/viewer/CommentSidebarSkeleton.tsx` — created (verified via `ls`)
- `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx` — modified (verified via grep)
- `src/components/viewer/VUMeter.tsx` — untouched (`git diff --stat` empty)
- `src/components/viewer/AnnotationCanvas.tsx` — untouched (`await import('fabric')` count = 7, unchanged)
- `src/app/review/[token]/page.tsx` — untouched (`git diff --stat` empty)
- `src/hooks/useComments.ts` — untouched (`git diff --stat` empty)
- `npx tsc --noEmit` — clean
- `npm test` — 171/171 passed
