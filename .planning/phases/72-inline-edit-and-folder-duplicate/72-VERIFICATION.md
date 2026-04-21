---
phase: 72-inline-edit-and-folder-duplicate
verified: 2026-04-21T18:21:30Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Click-away cancels rename on all four surfaces (FolderCard grid, FolderListRow list, AssetCard grid, AssetListView list row)"
    expected: "Clicking outside the input on any surface reverts to original name and fires no PUT in Network tab; Enter/check still commits; Escape still cancels"
    why_human: "Pointer-event-ordering and real DOM mount/unmount in the browser can't be exercised by grep/tsc — must see that the previous card's InlineRename unmounts before the new card's sibling onClick runs"
  - test: "Single-active-rename singleton across grid + list + folder + asset mixes"
    expected: "Starting rename B while A is editing makes A's input vanish without a PUT; only one input[type=text] exists in DOM at any time during renaming; works in grid view, list view, and when switching between views mid-rename"
    why_human: "Requires running the app with >=2 folders + >=2 assets and inspecting DOM during active rename; automated verification can only confirm the structural wiring is in place"
  - test: "Folder Duplicate persists + appears in listing"
    expected: "Right-click or three-dots → Duplicate → success toast AND the duplicated folder appears in the current listing on the same tick (no refresh); navigating into it shows subfolder tree + non-deleted assets; Firestore console shows new doc with deletedAt: null"
    why_human: "Requires live Firestore + auth + project with a populated folder to observe the listing-query round-trip and the 201 response driving the toast+refetch sequence"
  - test: "Copy-to-folder regression (side-effect fix)"
    expected: "Copy to a different destination folder produces a visible copy in the destination — same code path as Duplicate, should be repaired by the same two-line fix"
    why_human: "End-to-end UX flow; not checkable without running the app"
---

# Phase 72: inline-edit-and-folder-duplicate Verification Report

**Phase Goal:** Inline rename is safely cancellable and never double-mounted, and folder Duplicate actually persists a copy instead of firing a success toast on nothing.

**Verified:** 2026-04-21T18:21:30Z
**Status:** human_needed — all automated checks pass; four behavioral flows require live browser verification.
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

Truths derived from ROADMAP.md Success Criteria + both PLAN frontmatters.

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Clicking outside the inline rename input cancels and reverts the name | ✓ VERIFIED | `InlineRename.tsx:47-56` attaches `document.addEventListener('pointerdown', handlePointerDown)` that calls `onCancelRef.current()` when target is outside `containerRef` |
| 2 | Only Enter key / check button commits; blur and outside-click never commit | ✓ VERIFIED | `InlineRename.tsx:75-83` — Enter calls `commit()`, Escape calls `onCancel()`; no `onBlur` handler exists. Check button at line 88 calls `commit`. Pointerdown listener calls `onCancel`, never `commit` |
| 3 | Escape still cancels the rename | ✓ VERIFIED | `InlineRename.tsx:79-82` — Escape key branch calls `onCancel()` |
| 4 | Only one rename input active across the whole FolderBrowser at any time | ✓ VERIFIED | `RenameController` context at `FolderBrowser.tsx:69-87`; `RenameProvider` wraps `FolderBrowserInner` at line 92; all four card types derive `isRenaming = activeId === myRenameKey` |
| 5 | Starting a rename on B while A is editing cancels A first | ✓ VERIFIED | Setting `activeId` in one card forces `isRenaming=false` in any other card on next render → its `<InlineRename>` unmounts. Guarded `closeRename()` at `FolderBrowser.tsx:1618`, `2005`, `AssetCard.tsx:70`, `AssetListView.tsx:251` prevents stale-cancel races |
| 6 | Folder Duplicate creates a persistent copy that appears in current listing without refresh | ✓ VERIFIED | `deepCopyFolder` (`folders.ts:42-51`) now writes `deletedAt: null` on root folder doc, matching the composite-indexed `where('deletedAt', '==', null)` query at `folders/route.ts:54`. `handleDuplicateFolder` (`FolderBrowser.tsx:899-916`) awaits the 201 and calls `fetchFolders()` |
| 7 | Duplicate preserves full subfolder tree and non-deleted assets | ✓ VERIFIED | `folders.ts:126-133` subfolder `.set` also includes `deletedAt: null`; BFS + per-level `Promise.all` unchanged; asset copy loop at 93-113 unchanged |
| 8 | Duplicate uses source name verbatim (no "copy" prefix) | ✓ VERIFIED | `folders.ts:43` uses `overrideName ?? rootData.name`; `handleDuplicateFolder` at `FolderBrowser.tsx:905` posts only `{ folderId }` with no `name` → source name preserved. Parity with asset duplicate (Phase 39) |
| 9 | Success toast fires only after 201, error toast on failure | ✓ VERIFIED | `FolderBrowser.tsx:907-914` — `toast.success` gated on `res.ok`; `toast.error` in else branch and catch block |

**Score:** 9/9 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/components/ui/InlineRename.tsx` | Document-level pointerdown listener, stable `onCancelRef`, `containerRef` gated | ✓ VERIFIED | 103 lines. `useEffect` at 47-56 attaches/detaches pointerdown; ref stability at 39-40; container ref on outer `<div>` at 68. `onClick={(e) => e.stopPropagation()}` preserved |
| `src/components/files/FolderBrowser.tsx` | `RenameController` context + `RenameProvider` + `useRenameController` exported | ✓ VERIFIED | Context defined 69-87, provider wraps `FolderBrowserInner` at 89-97. `FolderCard` at 1613-1618 + `FolderListRow` at 2002-2005 consume it. `InlineRename` used at lines 1841 and 2131 |
| `src/components/files/AssetCard.tsx` | Imports `useRenameController` from `./FolderBrowser`; replaces local `isRenaming` state | ✓ VERIFIED | Import at 22; controller consumed 67-70; `handleRename` calls `setActiveId(myRenameKey)` at 171; commit-finally at 192 and `<InlineRename onCancel>` at 649 call `closeRename` |
| `src/components/files/AssetListView.tsx` | Same controller wiring for list rows | ✓ VERIFIED | Import at 29; controller 248-251; `onRename` action at 419 uses `setActiveId`; commit-finally at 304 and `<InlineRename onCancel>` at 503 use `closeRename` |
| `src/lib/folders.ts` | `deletedAt: null` on both `.set()` calls in `deepCopyFolder` | ✓ VERIFIED | Root at line 50, subfolder at line 132. Two occurrences total, matching the plan's `<done>` criteria |

All artifacts pass Level 1 (exists), Level 2 (substantive, not stubs), Level 3 (wired, imports + usages present in all consumers).

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `InlineRename.tsx` | `document` | `addEventListener('pointerdown', …)` added on mount, removed on unmount; calls `onCancel` when target outside container | ✓ WIRED | Lines 47-56. Uses `onCancelRef` to avoid re-attaching on every parent render |
| `FolderCard` / `FolderListRow` / `AssetCard` / `AssetListView` row | `FolderBrowser` rename context | `useRenameController()` → `{ activeId, setActiveId }`; each card renders `<InlineRename>` only when `activeId === myRenameKey` and calls `setActiveId(myRenameKey)` to start | ✓ WIRED | All four cards: FolderBrowser.tsx:1613, 2002; AssetCard.tsx:67; AssetListView.tsx:248. All four render `<InlineRename>` gated on `isRenaming` and all four pass `closeRename` as `onCancel` |
| `deepCopyFolder` | `GET /api/folders` composite-indexed query | Firestore `where('deletedAt', '==', null)` requires every folder doc to carry the field explicitly. Both `.set()` calls now include `deletedAt: null` | ✓ WIRED | `folders.ts:50` (root), `folders.ts:132` (subfolder). Listing query at `folders/route.ts:46, 54`. The in-memory fallback at 58-72 already accepted absent fields, so both read paths now handle the write shape identically |
| `handleDuplicateFolder` | `/api/folders/copy` route | POST `{ folderId }`, await 201, toast + `fetchFolders` | ✓ WIRED | `FolderBrowser.tsx:899-916`. Route at `/api/folders/copy/route.ts` validates, calls `deepCopyFolder`, returns `{ folder, counts }` with 201 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `InlineRename.tsx` | `draft` state rendered in input | Initial value from prop, mutated via `onChange`, read in `commit()` passed to `onCommit(next)` | Yes — caller receives trimmed string | ✓ FLOWING |
| `FolderCard` / `FolderListRow` | `isRenaming` | `activeId === myRenameKey` from context | Yes — context state is a real `useState` at `FolderBrowser.tsx:80` | ✓ FLOWING |
| `AssetCard` / `AssetListView` row | `isRenaming` | Same context consumer, cross-file import | Yes — same `useState` source | ✓ FLOWING |
| Folder listing (post-duplicate) | New folder doc from Firestore | `deepCopyFolder` → `newRootRef.set({ …, deletedAt: null })` → `GET /api/folders` composite query → `fetchFolders()` refetch → `setFolders` state | Yes — write shape now matches read contract | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| TypeScript cleanly compiles after all changes | `npx tsc --noEmit` | Exit 0, no output | ✓ PASS |
| Unit test baseline preserved (171 tests per CLAUDE.md) | `npm test` | 7 files, 171/171 passing in 2.40s | ✓ PASS |
| `deletedAt: null` written in exactly the two places the plan required | Grep `deletedAt: null` in `src/lib/folders.ts` | 2 occurrences (root + subfolder) | ✓ PASS |
| No stale `setIsRenaming` left over after migration to controller | Grep `setIsRenaming` in `src/components/` | 0 occurrences | ✓ PASS |
| No stale `renameValue` / `renameInputRef` after FolderCard migration | Grep `renameValue\|renameInputRef` in FolderBrowser.tsx | 0 occurrences | ✓ PASS |
| Both task commits present in history | `git log --oneline` | `e807854e`, `0aba2f75`, `97afb310`, `6144a673` all present | ✓ PASS |
| Live folder duplicate end-to-end | — | Requires running server + live Firestore | ? SKIP — deferred to human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| EDIT-01 | 72-01 | Click-away cancels rename; only confirm affordance commits; single-active-rename across whole browser | ✓ SATISFIED | Truths 1-5 verified; structural wiring confirmed across all four card types; behavioral confirmation routed to human |
| FS-01 | 72-02 | Folder Duplicate produces a real persistent copy visible in listing; toast only after persistence; parity with asset duplicate naming | ✓ SATISFIED | Truths 6-9 verified; two-line `deletedAt: null` fix is present; listing query contract confirmed; end-to-end DB+UI flow routed to human |

No orphaned requirements — REQUIREMENTS.md maps EDIT-01 + FS-01 to Phase 72, both are claimed by plans, both are implemented.

### Anti-Patterns Found

Scanned the five modified files (`InlineRename.tsx`, `FolderBrowser.tsx`, `AssetCard.tsx`, `AssetListView.tsx`, `folders.ts`) for TODO/FIXME/stub patterns and hardcoded empty values in the changed regions.

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | None found in Phase 72 changes | — | — |

Pre-existing `return null` / `return []` patterns elsewhere in these files are unrelated to Phase 72 edits (React conditional returns, enumeration defaults). No new stubs introduced.

### Human Verification Required

The four flows listed in the frontmatter `human_verification` block cannot be proven without a running app + live Firestore. They all exercise DOM/event-loop/database round-trips that grep + tsc cannot reach. Every structural precondition is verified, so if any of these fail in practice the gap will be behavioral (race condition, bundler cycle, Firestore index deploy state) rather than missing code.

### Gaps Summary

None. All nine derived truths have verified supporting artifacts and wired key links. Four truths (1, 4, 5, 6) cover behaviors where the structural wiring is confirmed but the user-observable outcome requires browsing a live instance — surfaced as `human_needed` rather than `gaps_found` because the implementation is in the tree and nothing is missing.

---

_Verified: 2026-04-21T18:21:30Z_
_Verifier: Claude (gsd-verifier)_
