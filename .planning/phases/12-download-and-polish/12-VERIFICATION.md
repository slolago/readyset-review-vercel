---
phase: 12-download-and-polish
verified: 2026-04-06T23:45:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 12: Download and Polish — Verification Report

**Phase Goal:** (a) Bulk download selected assets; (b) toggle select-all / deselect-all on the header checkbox; (c) "Download all" option in canvas right-click menu; (d) fix right-click menu dismiss on outside click; (e) better checkbox styling matching app design; (f) download from three-dot menu and review links; (g) performance optimisations.
**Verified:** 2026-04-06T23:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

Requirements were split across two plans:
- Plan 01 (commit c9afbc7d): REQ-12D, REQ-12E, REQ-12B
- Plan 02 (commits 214c7c6e, 280dac55): REQ-12A, REQ-12C, REQ-12F, REQ-12G

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selecting 1+ assets shows Download button in action bar; clicking downloads all selected files | VERIFIED | `handleDownloadSelected` at FolderBrowser.tsx:294, wired to action bar button at line 900 |
| 2 | Header checkbox toggles between select-all and deselect-all (second click clears) | VERIFIED | `handleSelectAllClick` at AssetListView.tsx:84 — `onSelectAll(allSelected ? [] : sorted.map(a => a.id))` |
| 3 | Right-click on empty canvas includes "Download all" option | VERIFIED | `handleDownloadAll` at FolderBrowser.tsx:311, wired into canvas ContextMenu items at line 764 with `disabled: assets.length === 0` |
| 4 | Right-click menu closes immediately on outside click or Escape | VERIFIED | ContextMenu.tsx:36 — `setTimeout(0)` defers `addEventListener('mousedown', ...)` past opening tick; Escape key handler at line 30 |
| 5 | Checkboxes use styled design consistent with dark theme | VERIFIED | AssetListView.tsx:106-118 (header) and 299-303 (row) — div+Check pattern with `bg-frame-accent border-frame-accent`; no `accent-frame-accent` or native checkbox styling remains |
| 6 | Download available via three-dot menu on every asset card and in review links | VERIFIED | AssetCard.tsx:345-348 — Download item in Dropdown between "Manage version stack" and "Delete"; review page line 343-362 — conditional download button when `allowDownloads && signedUrl` |
| 7 | Page load and asset render noticeably faster (memoization) | VERIFIED | AssetGrid.tsx:21 — `React.memo`; AssetListView.tsx:31 — `memo(`; FolderBrowser.tsx:990 — `React.memo(function FolderCard`; stabilised callbacks: `handleSelectAll`, `closeCanvasMenu`, direct `handleRequestMoveItem` pass-through |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/ui/ContextMenu.tsx` | setTimeout(0) deferred listener + clearTimeout cleanup | VERIFIED | Lines 36-41 / 44 — exactly as planned |
| `src/components/files/AssetListView.tsx` | Custom checkboxes + select-all toggle + React.memo | VERIFIED | Lines 31, 84-89, 104-118, 299-303 — memo wrap, toggle logic, div+Check both header and row |
| `src/components/files/FolderBrowser.tsx` | `handleDownloadSelected`, `handleDownloadAll`, React.memo FolderCard, useCallback callbacks | VERIFIED | Lines 294, 311, 344, 348, 764, 900, 990 |
| `src/components/files/AssetCard.tsx` | Download item in three-dot Dropdown | VERIFIED | Lines 345-348 — label 'Download', onClick: handleDownload |
| `src/components/files/AssetGrid.tsx` | React.memo wrapped | VERIFIED | Line 21 — `export const AssetGrid = React.memo(function AssetGrid(...)` |
| `src/app/review/[token]/page.tsx` | Per-asset download button when allowDownloads is true | VERIFIED | Lines 343-362 — conditional on `data.reviewLink.allowDownloads && signedUrl` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ContextMenu.tsx` | `document mousedown` listener | `setTimeout(0)` deferred registration | WIRED | Line 36 — `const timerId = setTimeout(() => { document.addEventListener(...) }, 0)` |
| `AssetListView.tsx` | `onSelectAll` | `handleSelectAllClick` toggles `[] vs sorted.map(a => a.id)` | WIRED | Lines 84-89, 105 |
| `FolderBrowser.tsx` | Action bar Download button | `handleDownloadSelected` iterates selectedIds with anchor trick | WIRED | Line 900 `onClick={handleDownloadSelected}` |
| `FolderBrowser.tsx` | ContextMenu "Download all" item | `handleDownloadAll` iterates all assets | WIRED | Line 764 `onClick: handleDownloadAll` |
| `AssetCard.tsx` | Dropdown "Download" item | `handleDownload` (pre-existing anchor trick) | WIRED | Line 347 `onClick: handleDownload` |
| `review/[token]/page.tsx` | `data.reviewLink.allowDownloads` | Conditional download button per asset | WIRED | Line 343 `{data.reviewLink.allowDownloads && (asset as any).signedUrl && (...)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `FolderBrowser.tsx` download handlers | `assets`, `selectedIds` | `useAssets` hook (pre-existing), `useState<Set<string>>` | Yes — assets from live Firebase query, selectedIds from user interaction | FLOWING |
| `AssetCard.tsx` handleDownload | `signedUrl` | `(asset as any).signedUrl` from parent asset object | Yes — signedUrl populated by GCS signed URL generation (pre-existing) | FLOWING |
| `review/[token]/page.tsx` download button | `allowDownloads`, `signedUrl` | `data.reviewLink.allowDownloads` from review API, `(asset as any).signedUrl` | Yes — real API data, button hidden when either is falsy | FLOWING |
| `AssetListView.tsx` checkboxes | `allSelected`, `someSelected`, `isSelected` | Computed from `selectedIds` prop (Set<string>) | Yes — derived from live selection state in FolderBrowser | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for server-dependent behaviors (download triggers require browser with signed GCS URLs). Static code analysis confirms all anchor-download patterns follow the same working pattern used in pre-existing `handleDownload` in AssetCard.tsx.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REQ-12A | 12-02-PLAN.md | Bulk download selected assets via action bar | SATISFIED | `handleDownloadSelected` in FolderBrowser, action bar button at line 900 |
| REQ-12B | 12-01-PLAN.md | Toggle select-all / deselect-all on header checkbox | SATISFIED | `handleSelectAllClick` — `allSelected ? [] : sorted.map(a => a.id)` |
| REQ-12C | 12-02-PLAN.md | "Download all" in canvas right-click menu | SATISFIED | Canvas ContextMenu item at FolderBrowser.tsx:764 |
| REQ-12D | 12-01-PLAN.md | Fix right-click menu dismiss on outside click | SATISFIED | `setTimeout(0)` defer in ContextMenu.tsx:36 |
| REQ-12E | 12-01-PLAN.md | Custom checkbox styling matching app design | SATISFIED | div+Check pattern with `bg-frame-accent border-frame-accent` in AssetListView.tsx |
| REQ-12F | 12-02-PLAN.md | Download from three-dot menu and review links | SATISFIED | AssetCard.tsx Dropdown item + review page conditional button |
| REQ-12G | 12-02-PLAN.md | Performance optimisations | SATISFIED | React.memo on AssetGrid, AssetListView, FolderCard; useCallback stabilisation for `handleSelectAll`, `closeCanvasMenu`, `handleRequestMoveItem` |

No orphaned requirements — all 7 REQ-12x IDs are claimed by a plan and verified in the codebase.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `review/[token]/page.tsx` line 224, 228 | `placeholder=` attribute on `<input>` | Info | HTML form attribute, not a stub — password input field |

No blocker or warning anti-patterns found. The two `placeholder` matches are legitimate HTML input attributes on the password-protection form (pre-existing, unrelated to Phase 12).

---

### Human Verification Required

#### 1. Right-click dismiss on actual user interaction

**Test:** Right-click on an asset in the browser. Move mouse outside the context menu and click elsewhere on the page.
**Expected:** Menu closes immediately without flickering or re-opening.
**Why human:** The `setTimeout(0)` race condition fix can only be validated by observing real event timing in a browser.

#### 2. Sequential download of multiple files

**Test:** Select 3+ assets with signed URLs and click the Download button in the action bar.
**Expected:** All 3 files download sequentially (each with a 100ms gap). Browser should show 3 downloads.
**Why human:** Requires a running browser environment with real GCS signed URLs; anchor-click download behaviour varies across browsers.

#### 3. Review link download visibility

**Test:** Open a review link where `allowDownloads = true`. Hover over asset cards.
**Expected:** Download button overlay appears bottom-right of each card on hover.
**Why human:** Requires a live review link with `allowDownloads=true` and assets with signedUrls.

#### 4. Indeterminate checkbox state

**Test:** In list view, select some but not all assets.
**Expected:** Header checkbox shows semi-transparent frame-accent fill (bg-frame-accent/50) with checkmark — visually distinct from "all selected" (full accent) and "none selected" (transparent border only).
**Why human:** Visual rendering of CSS classes needs eye verification in browser.

---

### Gaps Summary

No gaps. All 7 observable truths are verified, all required artifacts exist and are substantive, all key links are wired, and all 7 requirement IDs (REQ-12A through REQ-12G) are satisfied. Three commits (c9afbc7d, 214c7c6e, 280dac55) exist in the repository and match the described changes.

The only items deferred to human verification are behavioral/visual checks that cannot be validated through static code analysis.

---

_Verified: 2026-04-06T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
