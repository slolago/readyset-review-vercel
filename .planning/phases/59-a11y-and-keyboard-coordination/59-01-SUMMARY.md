---
phase: 59-a11y-and-keyboard-coordination
plan: 01
subsystem: a11y
tags: [a11y, keyboard, focus-trap, aria, dialog, menu]
requires:
  - React hooks (useEffect, useRef, useId)
provides:
  - useFocusTrap hook (src/hooks/useFocusTrap.ts)
  - useModalOwner hook (src/hooks/useModalOwner.ts)
  - role=dialog + focus trap on Modal
  - role=dialog + focus trap + Escape on UserDrawer
  - keyboard navigation + role=menu on Dropdown
  - document.body.dataset.modalOpen guard on viewer keydown handlers
affects:
  - Modal, UserDrawer, Dropdown, ExportModal, VideoPlayer, VersionComparison
tech-stack:
  added: []
  patterns:
    - module-scope counter for modal-layer ownership
    - roving tabindex for menuitems
    - focus-return to previously-focused element on modal close
key-files:
  created:
    - src/hooks/useFocusTrap.ts
    - src/hooks/useModalOwner.ts
  modified:
    - src/components/ui/Modal.tsx
    - src/components/admin/UserDrawer.tsx
    - src/components/ui/Dropdown.tsx
    - src/components/viewer/ExportModal.tsx
    - src/components/viewer/VideoPlayer.tsx
    - src/components/viewer/VersionComparison.tsx
decisions:
  - UserDrawer hooks are called with `active=true` unconditionally because the parent controls mount/unmount.
  - Dropdown trigger converted from `<div onClick>` to `<button type="button">` for native keyboard activation; `triggerRef` retyped to `HTMLButtonElement`.
  - Added `onMouseEnter` to menuitems to sync `activeIndex` with pointer, so keyboard and mouse hover share the same "active" highlight.
  - `wasOpenRef` flag avoids focusing Dropdown trigger on initial mount; focus-return only fires once the menu has actually been opened at least once.
metrics:
  duration: ~15m
  completed: 2026-04-20
  tasks: 5
  files: 8
---

# Phase 59 Plan 01: A11y + Keyboard Coordination Summary

**One-liner:** Added focus-trap + role=dialog to Modal/UserDrawer, keyboard-navigable role=menu Dropdown, and a module-scope `body.dataset.modalOpen` flag that gates viewer shortcuts while modals/drawers are open.

## What Was Built

1. **`useFocusTrap(ref, active)`** — focuses first focusable on activate, wraps Tab/Shift+Tab, restores focus on cleanup.
2. **`useModalOwner(active)`** — module-scope counter; sets/clears `document.body.dataset.modalOpen`.
3. **Modal** — `role=dialog`, `aria-modal=true`, `aria-labelledby` (when title), focus trap, modal-layer ownership. Existing Escape + overflow-lock preserved.
4. **UserDrawer** — new Escape handler, focus trap, `role=dialog`, `aria-modal`, `aria-labelledby`, modal-layer ownership.
5. **Dropdown** — trigger is now a `<button>` with `aria-haspopup=menu` + `aria-expanded`; panel has `role=menu`; items have `role=menuitem` + roving tabindex. ArrowUp/Down/Home/End, Enter activates, Escape closes + returns focus to trigger.
6. **ExportModal** — registers with `useModalOwner(open)`.
7. **VideoPlayer** (2 handlers) + **VersionComparison** (1 handler) — early-return when `document.body.dataset.modalOpen === 'true'`.

## Commits

- `7672f304` feat(a11y): add useFocusTrap + useModalOwner hooks
- `690d8b71` feat(a11y): Modal role=dialog + focus trap (A11Y-01)
- `7a7485fb` feat(a11y): UserDrawer role=dialog + focus trap + Escape (A11Y-02)
- `b3d45e95` feat(a11y): Dropdown keyboard navigation + ARIA (A11Y-03)
- `0a241c5d` feat(a11y): modal-layer keyboard ownership for viewer handlers (A11Y-04)

## Verification

- `npx tsc --noEmit` clean after every task.
- `npx vitest run` — 151/151 passing (4 suites).
- `grep "dataset.modalOpen" src/components/viewer/{VideoPlayer,VersionComparison}.tsx` — 3 matches (2 in VideoPlayer, 1 in VersionComparison). ✓
- `grep 'role="dialog"' src/components/{ui/Modal.tsx,admin/UserDrawer.tsx}` — both return. ✓
- `grep 'role="menu"' src/components/ui/Dropdown.tsx` — returns. ✓

## Requirements

- A11Y-01 Modal dialog + focus trap ✓
- A11Y-02 UserDrawer dialog + focus trap + Escape ✓
- A11Y-03 Dropdown keyboard nav + ARIA ✓
- A11Y-04 Modal-layer ownership / viewer guard ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- src/hooks/useFocusTrap.ts FOUND
- src/hooks/useModalOwner.ts FOUND
- Modal.tsx role="dialog" FOUND
- UserDrawer.tsx role="dialog" FOUND
- Dropdown.tsx role="menu" FOUND
- VideoPlayer.tsx dataset.modalOpen FOUND (2x)
- VersionComparison.tsx dataset.modalOpen FOUND
- ExportModal.tsx useModalOwner FOUND
- Commits 7672f304, 690d8b71, 7a7485fb, b3d45e95, 0a241c5d — all FOUND in `git log`.
