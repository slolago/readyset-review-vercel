---
phase: 70-context-menu-behavior
plan: 01
subsystem: files-browser
tags: [context-menu, ux, react-hooks]
requires: []
provides:
  - ContextMenuProvider
  - useContextMenuController
  - Measured-viewport-flip ContextMenu
affects:
  - src/components/files/FolderBrowser.tsx
  - src/components/files/AssetCard.tsx
  - src/components/files/AssetListView.tsx
tech-stack:
  added: []
  patterns:
    - "React Context singleton for enforcing single-open menus"
    - "useLayoutEffect post-mount measurement with getBoundingClientRect for viewport-aware positioning"
key-files:
  created: []
  modified:
    - src/components/ui/ContextMenu.tsx
    - src/components/files/FolderBrowser.tsx
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetListView.tsx
decisions:
  - "Provider renders a single <ContextMenu />, making two-menus-open physically impossible"
  - "Legacy ContextMenu export preserved for backwards compatibility; new code uses the provider"
  - "Flip math uses getBoundingClientRect after visibility:hidden first paint — prevents flash at wrong position without display:none (which would zero the rect)"
requirements-completed: [CTX-02, CTX-03]
---

# Phase 70 Plan 01: Context Menu Viewport Flip + Singleton Invariant Summary

Upgrade `ContextMenu` to measure itself post-mount with `getBoundingClientRect`, flip across both axes when it would overflow the viewport, and clamp inside an 8px padding; introduce `ContextMenuProvider` + `useContextMenuController` so the whole file browser renders at most one context menu at a time. Four call-sites migrated off per-component local state.

## What Changed

### `src/components/ui/ContextMenu.tsx`
- **Measured viewport flip (CTX-02):** Replaced the hardcoded `MENU_W = 200` / `MENU_H = items.length * 36 + …` estimates with a `useLayoutEffect` that reads the real rendered size via `getBoundingClientRect`. The effect computes `left`/`top`, flips horizontally if `left + width + pad > innerWidth`, flips vertically if `top + height + pad > innerHeight`, then clamps inside an 8px viewport padding in case a flipped menu still overflows (e.g. menu taller than viewport).
- **Flash prevention:** Initial render is `visibility: hidden` until the layout effect measures and commits the final position. Not `display: none` — that would make `getBoundingClientRect` return a 0×0 rect.
- **Singleton API (CTX-03):** Added `ContextMenuProvider` and `useContextMenuController()`. Provider holds a single `{ key, position, items } | null` state and renders exactly one `<ContextMenu />`. `open(key, position, items)` unconditionally overwrites state — calling `open('asset-a', …)` then `open('folder-b', …)` swaps atomically, no stacking possible. Hook throws if used outside the provider.
- Legacy `ContextMenu` export kept intact — no callers broken.

### `src/components/files/FolderBrowser.tsx`
- Split into outer `FolderBrowser` (renders `<ContextMenuProvider><FolderBrowserInner {...props} /></ContextMenuProvider>`) and renamed existing function body to `FolderBrowserInner`. Provider wraps all descendants (AssetGrid → AssetCard, AssetListView row, FolderCard, canvas).
- **Canvas menu:** removed `canvasMenu` `useState` + `closeCanvasMenu` `useCallback`; `onContextMenu` on the content div now calls `ctxMenu.open('canvas', …)` with the inline items array. Deleted the `{canvasMenu && <ContextMenu … />}` render block.
- **FolderCard:** removed local `contextMenu` state; `onContextMenu` calls `ctxMenu.open('folder-${folder.id}', …)` with the inline items array. Deleted the `{contextMenu && <ContextMenu … />}` render block.
- Import diff: removed `ContextMenu` + `MenuItem` (neither used after refactor), added `ContextMenuProvider` + `useContextMenuController`.

### `src/components/files/AssetCard.tsx`
- Removed local `contextMenu` state; `onContextMenu` calls `ctxMenu.open('asset-${asset.id}', …)` with the inline items array. Deleted the `{contextMenu && !hideActions && <ContextMenu … />}` render block.
- Import diff: swapped `ContextMenu` + `MenuItem` imports for `useContextMenuController`.

### `src/components/files/AssetListView.tsx`
- `AssetListRow`: removed local `contextMenu` state; `onContextMenu` calls `ctxMenu.open('row-${asset.id}', …)` with the inline items array. Deleted the `{contextMenu && <ContextMenu … />}` render block.
- Import diff: swapped `ContextMenu` import for `useContextMenuController`.

## Acceptance-Criteria Check Results

### Task 1 — Measured viewport flip
- `grep getBoundingClientRect src/components/ui/ContextMenu.tsx` → line 56 ✓
- `grep useLayoutEffect src/components/ui/ContextMenu.tsx` → line 3 (import) + line 54 ✓
- `grep -E "MENU_W\s*=\s*200|MENU_H\s*=" src/components/ui/ContextMenu.tsx` → zero matches ✓
- `grep visibility src/components/ui/ContextMenu.tsx` → line 71 ✓
- `npx tsc --noEmit` → no errors ✓

### Task 2 — Provider + hook
- `grep "export function ContextMenuProvider" src/components/ui/ContextMenu.tsx` → 1 match (line 109) ✓
- `grep "export function useContextMenuController" src/components/ui/ContextMenu.tsx` → 1 match (line 132) ✓
- `grep createContext src/components/ui/ContextMenu.tsx` → line 3 (import) + line 107 ✓
- `grep "export function ContextMenu" src/components/ui/ContextMenu.tsx` → line 22 (legacy preserved) ✓
- `npx tsc --noEmit` → no errors ✓

### Task 3 — Call-site migration
- `grep useContextMenuController src/components/files/FolderBrowser.tsx` → 3 matches (import + FolderBrowserInner + FolderCard) ✓
- `grep useContextMenuController src/components/files/AssetCard.tsx` → 2 matches (import + hook call) ✓
- `grep useContextMenuController src/components/files/AssetListView.tsx` → 2 matches (import + hook call) ✓
- `grep ContextMenuProvider src/components/files/FolderBrowser.tsx` → import + wrapping JSX ✓
- `grep -E "useState<\s*\{\s*x:\s*number;\s*y:\s*number\s*\}\s*\|\s*null\s*>\s*\(\s*null\s*\)"` across all 3 files → zero matches (all four local contextMenu states removed) ✓
- `grep ContextMenu src/components/files/AssetCard.tsx` → only `useContextMenuController` import remains (no `ContextMenu` component import) ✓
- `npx tsc --noEmit` → no errors ✓
- `npm run lint` → no new warnings attributable to this plan (pre-existing img/useCallback warnings unchanged) ✓

## Test Results

- `npm test` → **171 / 171 passed** (7 test files: names, jobs, format-date, file-types, permissions, review-links, permissions-api). Suite is backend/unit-level; no pre-existing tests target the ContextMenu component, so this is a no-regression check only.
- `npx tsc --noEmit` → clean.
- `npm run lint` → only pre-existing warnings; no new issues introduced.

## Edge Cases Discovered During Migration

- `FolderBrowser.tsx` split into outer wrapper + `FolderBrowserInner` was necessary because hooks (including `useContextMenuController`) can only consume context from an ancestor — not from the same component that provides it. The outer `FolderBrowser` renders the provider; the inner component and all descendants (FolderCard, AssetCard, AssetListView row) consume it.
- The `MenuItem` type import was unused after the refactor in `FolderBrowser.tsx` (only provider/hook are needed) and was removed per plan instructions.
- No changes required to the existing `ContextMenu` component's Escape / outside-click / scroll / blur listeners — because the provider renders exactly one instance, those document-level listeners apply globally to that single menu.

## Links Satisfied

- **CTX-02** — viewport flip: real rendered rect measured with `getBoundingClientRect` in `useLayoutEffect`, horizontal + vertical flip + final clamp inside 8px padding.
- **CTX-03** — single-open invariant: provider renders exactly one `<ContextMenu />`; `open()` unconditionally replaces state, so right-clicking a different target swaps the menu atomically. Escape + outside-click preserved via existing component-level listeners.
