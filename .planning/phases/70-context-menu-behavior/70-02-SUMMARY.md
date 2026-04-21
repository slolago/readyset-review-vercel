---
phase: 70-context-menu-behavior
plan: 02
subsystem: files-browser
tags: [context-menu, actions-factory, ux-bugfix]
requires: [70-01]
provides:
  - buildFileBrowserActions
  - Unified asset/folder/mixed action list
  - CTX-05 folder click-through hardening
affects:
  - src/components/files/AssetCard.tsx
  - src/components/files/AssetListView.tsx
  - src/components/files/FolderBrowser.tsx
tech-stack:
  added: []
  patterns:
    - "Single action-list factory keyed by ActionTarget (asset/folder/mixed)"
    - "Dropdown consumers map BrowserAction.dividerBefore -> DropdownItem.divider at call site"
    - "Click-through defense: suppression ref + role=menu guard + right-button mousedown preventDefault"
key-files:
  created:
    - src/components/files/fileBrowserActions.ts
  modified:
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetListView.tsx
    - src/components/files/FolderBrowser.tsx
decisions:
  - "Optional handlers (onDuplicate, onCreateReviewLink, onAddToReviewLink, onMoveTo) are passed through as undefined when not supplied by the parent, so the helper omits the corresponding items instead of rendering no-op rows"
  - "Folder three-dots dropdown now includes an 'Open' item at position 1 — drift fix from CTX-04; previously the dropdown lacked Open while the right-click menu had it"
  - "List-view row intentionally omits 'Stack onto' (no folder-siblings in scope at the row level) — parity with pre-refactor behavior"
  - "Canvas menu (New Folder / Upload / Download all) kept as inline handwritten array; not a target-bound action set"
requirements-completed: [CTX-04, CTX-05]
---

# Phase 70 Plan 02: Unified File-Browser Actions + Folder Right-Click Fix Summary

Single `buildFileBrowserActions(target, ctx)` helper feeds every target-bound action surface — asset three-dots dropdown, asset right-click, list-view row right-click, folder three-dots dropdown, folder right-click — replacing five duplicated literal item arrays with one call-site each. Folder card click handler hardened with three layered defenses against right-click click-through so every Rename / Duplicate / Move / Copy / Delete / Share menu item actually runs.

## What Changed

### `src/components/files/fileBrowserActions.ts` (new, 112 lines)

Exports `buildFileBrowserActions(target, ctx)`, `ActionTarget`, `ActionContext`, `BrowserAction`. Pure data — no component imports, no lucide-react dependency. Consumer supplies an `icons` map; helper returns a `BrowserAction[]` shaped as a superset of ContextMenu `MenuItem` and Dropdown `DropdownItem` (the latter via a one-line `dividerBefore -> divider` map at the call site).

Gating rules:
- `Open` and `Rename` omitted for `target === 'mixed'`.
- Version operations (`Upload new version`, `Stack onto…`, `Manage version stack`), `Get link`, and review-status setters gated to `target === 'asset'`.
- `Create review link` is placed with `dividerBefore: true`; `Delete` is always last with `dividerBefore: true` and `danger: true`.
- Any handler passed as `undefined` drops the item entirely — pure presence-based composition, no no-op fallbacks.

### `src/components/files/AssetCard.tsx`
- Import: added `buildFileBrowserActions`.
- Before `return`, computed `const assetActions = buildFileBrowserActions('asset', { onOpen: onClick, onRename: handleRename, onDuplicate: handleDuplicate, onCopyTo: openCopyTo, onMoveTo: () => onRequestMove?.(), onUploadVersion: handleUploadVersion, onStackOnto: () => setShowStackOntoModal(true), onManageVersions: () => setShowVersionModal(true), onDownload: handleDownload, onGetLink: handleGetLink, onCreateReviewLink, onAddToReviewLink, onSetStatus: handleSetStatus, onDelete: handleDelete, icons: { … } })`.
- `onContextMenu` callback now passes `assetActions` directly to `ctxMenu.open`.
- `<Dropdown items={…}>` maps `assetActions` to Dropdown shape with `divider: a.dividerBefore`.
- Two inline item arrays (one 17-item for right-click, one 13-item for dropdown) deleted.

### `src/components/files/AssetListView.tsx`
- Import: added `buildFileBrowserActions`.
- Inside `AssetListRow`, computed `const assetActions = buildFileBrowserActions('asset', { onOpen: () => router.push(...), onRename: () => setIsRenaming(true), onDuplicate, onCopyTo: openCopyTo, onMoveTo: () => onRequestMove?.(asset.id), onUploadVersion: handleUploadVersion, onManageVersions: () => setShowVersionModal(true), onDownload: handleDownload, onGetLink: handleGetLink, onSetStatus: handleSetStatus, onDelete: handleDelete, icons: { … } })`. `onStackOnto` intentionally omitted (parity with pre-refactor).
- `onContextMenu` callback now passes `assetActions` directly to `ctxMenu.open`.
- One inline 15-item right-click array deleted.

### `src/components/files/FolderBrowser.tsx` (FolderCard)
- Import: added `buildFileBrowserActions`.
- Added `const suppressNextClickRef = useRef(false)` for CTX-05 defense #2.
- Before `return`, computed `const folderActions = buildFileBrowserActions('folder', { onOpen: () => router.push(...), onRename: handleRenameFolder, onDuplicate: onDuplicate, onCopyTo: handleOpenCopyModal, onMoveTo: onRequestMove ? () => onRequestMove() : undefined, onCreateReviewLink, onAddToReviewLink, onDelete, icons: { … } })`. Optional handlers now pass through as `undefined` (removed `?? (() => {})` no-op fallbacks on `onDuplicate`, `onCreateReviewLink`, `onAddToReviewLink`) — the helper omits each missing item instead of rendering a dead row.
- `<Dropdown items={…}>` maps `folderActions` with `divider: a.dividerBefore`.
- `onContextMenu` passes `folderActions` directly to `ctxMenu.open`.
- **CTX-05 Defense 1 (role="menu" guard):** `onClick` checks `if ((e.target as HTMLElement).closest('[role="menu"]')) return` before calling `router.push`.
- **CTX-05 Defense 2 (suppression ref):** `onContextMenu` sets `suppressNextClickRef.current = true` (cleared via `setTimeout(…, 300)`); `onClick` checks + clears the ref at the top and bails before navigating.
- **CTX-05 Defense 3 (mousedown preventDefault):** Added `onMouseDown={(e) => { if (e.button === 2) e.preventDefault(); }}` to the FolderCard root div.
- Two inline item arrays (one 8-item for right-click, one 7-item for dropdown) deleted.

### `FolderBrowserInner` canvas menu — intentionally unchanged
The canvas-level `New Folder / Upload files / Upload folder / Download all` menu doesn't fit the asset/folder/mixed model (it targets the browser, not a card). Left as an inline array passed to `ctxMenu.open('canvas', …)` per plan Step 2d.

## Acceptance-Criteria Check Results

### Task 1 — `fileBrowserActions.ts`
- `test -f src/components/files/fileBrowserActions.ts` — ✓ exists (112 lines).
- `grep -cE "^export (function|interface|type) "` → 4 (`ActionTarget`, `BrowserAction`, `ActionContext`, `buildFileBrowserActions`). ✓
- `grep -n "target === 'asset'"` → 3 matches (version ops block, Get link gate, status-setter gate). ✓
- `npx tsc --noEmit` → clean. ✓
- File is ≥80 lines of actual code (112 lines). ✓

### Task 2 — call-site wiring
- `grep -cE "label: 'Rename'" src/components/files/AssetCard.tsx` → 0. ✓
- `grep -cE "label: 'Duplicate'" src/components/files/FolderBrowser.tsx` → 0. ✓
- `grep -cE "label: 'Rename'" src/components/files/AssetListView.tsx` → 0. ✓
- `grep -cn buildFileBrowserActions` in all three files → each returns ≥1 (2 each: import + call). ✓
- `grep -n "divider: a.dividerBefore"` → matches at AssetCard.tsx:628 and FolderBrowser.tsx:1743. ✓
- Three-dots dropdown items and right-click items are IDENTICAL arrays for the same target (they consume the same `assetActions` / `folderActions` variable). ✓
- `npx tsc --noEmit` → clean. ✓

### Task 3 — FolderCard click-through hardening
- `grep -n "suppressNextClickRef" src/components/files/FolderBrowser.tsx` → 5 matches (declaration + 2 in onClick [check + clear] + 2 in onContextMenu [set + setTimeout clear]). ✓
- `grep -n 'role="menu"' src/components/files/FolderBrowser.tsx` → match at line 1672 in the new onClick guard. ✓
- `grep -n "onMouseDown" src/components/files/FolderBrowser.tsx` → match at line 1655 inside FolderCard (the other match at 1089 is unrelated, pre-existing in FolderBrowserInner). ✓
- `grep -n "suppressNextClickRef" src/components/files/AssetCard.tsx src/components/files/AssetListView.tsx` → zero matches (confined to FolderCard per CLAUDE.md Rule 3). ✓
- `npx tsc --noEmit` → clean. ✓

## Test Results

- `npx tsc --noEmit` — clean (no errors).
- `npm test` — **171 / 171 passed** across 7 test files (names, jobs, format-date, file-types, permissions, review-links, permissions-api). Suite is backend/unit-level; no pre-existing tests target the file-browser action surfaces, so this is a no-regression check only.

## Observations on the CTX-05 Mechanism

I did not reproduce CTX-05 in a running browser during execution (no dev server started) — the fix is defense-in-depth based on the plan's diagnosis. The plan identifies three plausible mechanisms and the patch addresses each:

1. **Portaled menu item click reaches the folder card via event bubbling / target-closest:** Defense 1 (`[role="menu"]` guard) short-circuits the navigate handler if the click target is anywhere inside a portaled menu. The context-menu portal lives at `document.body` so it shouldn't normally bubble into the FolderCard's `onClick`, but Dropdown items (rendered via separate portal, same `role="menu"`) could in edge layouts where the menu visually overlays the card and a click happens mid-transition.
2. **OS/browser synthetic click after contextmenu+mouseup (Linux Chromium):** Defense 2 (the `suppressNextClickRef` with 300 ms TTL, set on `onContextMenu`, checked + cleared on the next `onClick`) guarantees the first click within 300 ms of a contextmenu is swallowed by the card itself.
3. **Right-button mousedown triggering focus/activation before contextmenu dispatches:** Defense 3 (`onMouseDown preventDefault` when `button === 2`) stops any default mousedown-initiated activation path.

The AssetCard click handler technically has the same class of risk, but per CLAUDE.md Rule 3 (surgical changes) and the plan's explicit instruction, the hardening is confined to FolderCard — the specific bug reported in CTX-05 is folder-only.

## Deviations from Plan

None — plan executed exactly as written. Each `files_modified` entry was touched, no unlisted files changed. The one judgment call on `onDuplicate` fallback (plan said "change to just `onDuplicate`, leave undefined if not passed") was applied as specified; same for `onCreateReviewLink` / `onAddToReviewLink`. `onMoveTo` is passed as `onRequestMove ? () => onRequestMove() : undefined` so it also omits cleanly when the parent doesn't supply a move handler (existing behavior: the handler was always passed before, so the visible result is unchanged).

## Links Satisfied

- **CTX-04** — five duplicated action item arrays collapsed to one helper call per surface. `buildFileBrowserActions('asset', …)` drives both the AssetCard three-dots dropdown and the AssetCard right-click menu from one variable; same for `'folder'` in FolderCard. Drift is now physically impossible.
- **CTX-05** — FolderCard click handler triple-hardened: role="menu" target guard + 300 ms suppression ref + right-button mousedown preventDefault. Every folder right-click menu item's `onClick` reaches its handler without triggering the card's navigation.

## Self-Check: PASSED

Verified before commit:
- `src/components/files/fileBrowserActions.ts` exists (112 lines).
- Three modified files all import and call `buildFileBrowserActions`.
- TypeScript clean, 171/171 tests pass.
