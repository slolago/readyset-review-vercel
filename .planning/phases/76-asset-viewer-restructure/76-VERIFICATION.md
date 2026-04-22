---
phase: 76-asset-viewer-restructure
verified: 2026-04-21T09:40:00Z
status: human_needed
score: 4/4 must-haves verified (2 truths need human runtime confirmation)
human_verification:
  - test: "Submit a new comment in the asset viewer and confirm it appears within ~50ms, then verify the optimistic entry is replaced by the server-assigned comment id (swap stays in the same sibling position). Then simulate a network error (DevTools offline) and confirm the comment rolls back and the toast.error('Failed to post comment') fires."
    expected: "Comment appears instantly, reconciles to server id in place (no flash, no reorder). Offline submit: comment disappears, error toast fires."
    why_human: "Timing (~50ms perceived latency) and observable UI swap are subjective runtime checks — grep confirms the temp-id / reconcile / rollback code paths exist and types compile, but only a human can validate the user-perceived behaviour."
  - test: "Open an asset with at least two versions, toggle compare mode on, pick different versions per side, then toggle compare off. Inspect the React tree / memory panel to confirm there are no orphaned <video>, AnnotationCanvas, or AudioContext instances after the toggle-off."
    expected: "Both compare-mode <video> elements unmount cleanly when compareMode flips off (parent conditional unmount); changing a single side remounts only that side (stable compare-A/compare-B keys)."
    why_human: "DevTools memory / retained-instance inspection cannot be done via grep. Code-path evidence is present (4 stable keys + parent conditional gate), but confirming zero dangling refs requires runtime observation."
---

# Phase 76: asset-viewer-restructure Verification Report

**Phase Goal:** Heavy modals dynamic-import on demand, comments feel instant via optimistic updates, annotation overlay lifecycle is clean, version compare toggles without dangling resources.
**Verified:** 2026-04-21T09:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | ExportModal, AssetCompareModal, VersionStackModal, CreateReviewLinkModal, UserDrawer are not in the initial bundle of the routes that host their triggers | VERIFIED | 7 `const X = dynamic(...)` declarations across the 5 trigger files; 0 static named imports of the 5 modals remain |
| 2 | Submitting a comment appears optimistically ~50ms and reconciles with server response; failure rolls back | VERIFIED (code) / NEEDS HUMAN (runtime) | `useComments.ts:66` creates `tempId`, `:85` inserts optimistic, `:108` reconciles by `.map`, `:100/112/118` rollback; parentId carried at `:79` |
| 3 | Read-only AnnotationCanvas doesn't mount when displayShapes is empty/`'[]'`; Fabric dispose runs on unmount | VERIFIED | ImageViewer `:163` + `:208` both gated with `displayShapes && displayShapes !== '[]'`; VideoPlayer `:509` + `:550` already had the guard; AnnotationCanvas `:93-101` uses `useLayoutEffect` cleanup calling `fabricRef.current.dispose()` |
| 4 | Compare ↔ single toggle leaves no dangling Fabric / VUMeter / AudioContext refs | VERIFIED (code) / NEEDS HUMAN (runtime) | 4 stable keys in VersionComparison (`:803, :816, :833, :852`); parent page conditionally mounts the whole component at `:313-314` — toggling `compareMode` off unmounts the tree, driving the keyed `<video>` unmounts through existing cleanup paths |

**Score:** 4/4 truths verified by code inspection; 2 require human runtime confirmation for perceived latency and memory inspection.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/components/ui/ModalSkeleton.tsx` | Shared loading skeleton for next/dynamic modal fallbacks | VERIFIED | Exists, 9 LOC, exports `ModalSkeleton`, imports `Skeleton` from Phase 75. Imported by 5 trigger files. |
| `src/hooks/useComments.ts` | Optimistic addComment with temp ID + reconciliation + rollback | VERIFIED | `addComment` rewritten lines 48-121; `tempId` prefix, optimistic insert, `.map` reconciliation, 3 rollback paths (non-2xx, missing `body.comment`, throw). `fetchComments`/`resolveComment`/`deleteComment`/`editComment` unchanged. |
| `src/components/viewer/VersionComparison.tsx` | Stable per-side keys on dual video mount | VERIFIED | 4 `key={\`compare-{A|B}-${asset{A|B}.id}\`}` at lines 803, 816, 833, 852 (video pair + image pair). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| 7 modal import sites | `next/dynamic()` wrapper | `dynamic(() => import(...).then(m => m.Modal), { ssr: false, loading: ModalSkeleton })` | WIRED | 7 matches: AssetCard:30, AssetListView:36, FolderBrowser:57+61, admin/page:13, asset/page:22+26. 0 static named imports remain. All 5 files import `next/dynamic` and `ModalSkeleton`. |
| `useComments.addComment` | `setComments` with temp ID + reconcile with server response | optimistic local state update before POST | WIRED | `tempId` at :66; `setComments([...prev, optimistic])` at :85 BEFORE the `fetch('/api/comments', POST)` at :93; `.map` reconcile at :108. |
| AnnotationCanvas mount (read-only) | `displayShapes` guard | `displayShapes && displayShapes !== '[]'` | WIRED | 4 matches across ImageViewer (163, 208) + VideoPlayer (509, 550). |
| ExportModal hidden preview video | deferred src | `src={open ? previewUrl : undefined}` | WIRED (via alternate mechanism) | Plan's Task 3 Step 4 permitted the skip-branch. ExportModal.tsx:223 has `if (!open) return null` — the entire preview `<video>` subtree is excluded from the DOM when closed. Equivalent gating, no `open ? previewUrl : undefined` ternary needed. |
| VersionComparison dual video mount | stable React keys | `key={\`compare-A-${assetA.id}\`}` / `key={\`compare-B-${assetB.id}\`}` | WIRED | 4 matches at VersionComparison.tsx:803, 816, 833, 852. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `useComments` | `comments` state | Optimistic insert + POST `/api/comments` reconciliation | Yes — `body.comment` extracted from real API response at :106 | FLOWING |
| `VersionComparison` | `assetA`, `assetB` (media sources) | `versions` prop from parent asset page | Yes — versions array derived from `useAsset().versions` | FLOWING |
| `ModalSkeleton` | (pure presentational) | N/A | N/A — stateless component | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript compilation clean | `npx tsc --noEmit` | Exit 0, no output | PASS |
| Test suite regression | `npm test` | 7 files / 171 tests passed (names, format-date, jobs, file-types, permissions, review-links, permissions-api) | PASS |
| Dynamic imports count | `grep -rE "const (ExportModal\|AssetCompareModal\|VersionStackModal\|CreateReviewLinkModal\|UserDrawer) = dynamic" src/` | 7 matches | PASS |
| Static named imports gone | `grep -rE "^import \{ (ExportModal\|AssetCompareModal\|VersionStackModal\|CreateReviewLinkModal\|UserDrawer) \}" src/` | 0 matches | PASS |
| Optimistic pattern present | `grep "tempId\|temp-" src/hooks/useComments.ts` | 7 matches (lines 64, 65, 66, 68, 100, 108, 112, 118) | PASS |
| Compare keys present | `grep "key=\{\`compare-(A\|B)-" src/components/viewer/VersionComparison.tsx` | 4 matches (803, 816, 833, 852) | PASS |
| ImageViewer guards tightened | `grep "displayShapes && displayShapes !== '\\[\\]'" src/components/viewer/ImageViewer.tsx` | 2 matches (163, 208) | PASS |
| VideoPlayer guards preserved | `grep "displayShapes && displayShapes !== '\\[\\]'" src/components/viewer/VideoPlayer.tsx` | 2 matches (509, 550) | PASS |
| Task commits in git | `git rev-parse 9358e142 41ee0771 6f9c393e 35e2f5e1` | All 4 hashes resolved | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PERF-18 | 76-01 | Heavy modals are `next/dynamic`-imported with `{ ssr: false }` + skeleton fallback — 5 modals named | SATISFIED | 7 dynamic-import sites wired to ModalSkeleton; 0 static named imports remain |
| PERF-19 | 76-01 | `useComments.addComment` performs optimistic insert; POST response reconciles temp ID; failure rolls back | SATISFIED (code) / NEEDS HUMAN (runtime) | Code path verified; runtime perceived latency + error-toast flow needs human observation |
| PERF-20 | 76-01 | `AnnotationCanvas` only mounts read-only overlay when `displayShapes` is non-empty AND non-`'[]'`; Fabric dispose on unmount; ExportModal defers preview `<video>` `src` until modal is open | SATISFIED | ImageViewer guard tightened; VideoPlayer guards intact; AnnotationCanvas useLayoutEffect dispose intact; ExportModal `if (!open) return null` at :223 equivalently gates the preview video (plan-sanctioned skip-branch) |
| PERF-21 | 76-01 | `VersionComparison` dual-player mount uses stable React keys so toggling compare ↔ single cleanly unmounts each AnnotationCanvas + VUMeter | SATISFIED (code) / NEEDS HUMAN (runtime) | 4 stable keys present; parent unmount path confirmed; memory-level zero-dangling-refs needs DevTools observation |

No orphaned requirements — REQUIREMENTS.md maps PERF-18..21 to Phase 76, and all four are declared in the plan's `requirements:` field.

### Anti-Patterns Found

None. Modified files contain no TODO/FIXME/XXX/HACK/PLACEHOLDER markers. No empty-return stubs, no console-log-only handlers, no hardcoded empty data. The optimistic `addComment` uses real fetch + state paths; `ModalSkeleton` renders a real animate-pulse block; dynamic imports all resolve to named exports of existing non-stub components.

### Human Verification Required

Two items flagged for human runtime confirmation (code paths all verified):

#### 1. Optimistic comment latency + rollback

**Test:** Submit a new comment in the asset viewer. Observe it appears within ~50ms. Verify the optimistic entry gets replaced in-place by the real comment (same sibling position). Then go offline in DevTools, submit a second comment, and verify it rolls back and the error toast appears.
**Expected:** Comment appears instantly; post-fetch swap is invisible; offline submit rolls back with `toast.error('Failed to post comment')`.
**Why human:** Perceived latency and UI swap feel are subjective; grep confirms the code paths exist and compile.

#### 2. Compare toggle memory cleanup

**Test:** Open an asset with ≥2 versions, toggle compare on, change a version on one side, toggle compare off. In React DevTools / memory panel, confirm no orphaned `<video>`, `AnnotationCanvas`, or `AudioContext` instances remain.
**Expected:** Per-side version change remounts only that side; compare-off unmounts both cleanly; no retained VU meter / Fabric refs.
**Why human:** Memory / retained-instance inspection is a runtime check. Code evidence (4 stable keys + parent conditional gate) is present.

### Gaps Summary

No blocking gaps. All must-haves satisfied by code inspection; TypeScript clean; 171/171 tests passing. Two truths (optimistic-comment UX, compare-toggle memory) have full code-path evidence but depend on runtime observation for final confirmation — these are routed to human verification rather than flagged as gaps.

The ExportModal preview `src` handling deviates from the plan's literal `src={open ? previewUrl : undefined}` pattern but uses an equivalent gating mechanism (`if (!open) return null`) that the plan explicitly allowed ("Otherwise: no change (modal mount gates the src naturally). Task Summary must state which case applied."). The SUMMARY.md documents this correctly.

---

_Verified: 2026-04-21T09:40:00Z_
_Verifier: Claude (gsd-verifier)_
