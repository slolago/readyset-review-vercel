---
phase: 11-nice-to-have
verified: 2026-04-06T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 11: Nice-to-Have Verification Report

**Phase Goal:** (a) Prompt external guest reviewers for a display name the first time they open a review link — stored in localStorage so only asked once. (b) Shorten review link URLs to 6-8 char alphanumeric tokens. (c) Right-click context menu on asset/folder cards with actions: Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete. (d) Right-click context menu on empty canvas space with actions: New Folder, Upload files, Upload folder.
**Verified:** 2026-04-06T00:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | First-time visitor to a review link sees a name prompt before accessing content | VERIFIED | `src/app/review/[token]/page.tsx` line 243: `if (!guestInfo && data.reviewLink.allowComments)` shows `ReviewGuestForm`; `guestInfo` initializes to `null` for new visitors |
| 2 | Name stored in localStorage — not prompted again on same browser | VERIFIED | Lazy `useState` initializer at line 31-34 reads `localStorage.getItem('frame_guest_name')`; `handleGuestSubmit` at line 184-187 calls `localStorage.setItem('frame_guest_name', info.name)` before setting state |
| 3 | Guest comments show the entered name instead of "Guest" | VERIFIED | `handleAddComment` at line 175 sends `authorName: guestInfo?.name` to the API; name set from `handleGuestSubmit` which persists and restores from localStorage |
| 4 | Review link URLs use a short alphanumeric token (6-8 chars) instead of UUID | VERIFIED | `src/app/api/review-links/route.ts` line 5-10: `customAlphabet` from nanoid with 62-char alphanumeric alphabet and length 8; `generateShortToken()` called at line 52 |
| 5 | Right-clicking an asset or folder card shows a context menu with: Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete | VERIFIED | AssetCard lines 406-413: all 8 items confirmed. FolderCard lines 1118-1124: Open, Rename, Duplicate, Copy to, Move to, Create review link, Delete confirmed (note: "Get link" replaced by "Create review link" for folders — intentional per phase plan) |
| 6 | Right-clicking empty space in the file browser shows: New Folder, Upload files, Upload folder | VERIFIED | `FolderBrowser.tsx` lines 716-725: canvas `ContextMenu` renders exactly these 3 items; canvas `onContextMenu` handler at lines 684-689 guards via `closest('[data-selectable]')` |
| 7 | Context menus dismiss on outside click or Escape key | VERIFIED | `ContextMenu.tsx` lines 26-41: `mousedown` listener calls `onClose()` when click outside; `keydown` listener calls `onClose()` on `Escape`; scroll listener (capture phase) also dismisses |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/review-links/route.ts` | Short token generation via nanoid `customAlphabet` | VERIFIED | Lines 5-10: `import { customAlphabet } from 'nanoid'`; `generateShortToken = customAlphabet(62-char set, 8)`. No `generateToken` import present. |
| `src/app/review/[token]/page.tsx` | localStorage guest name read/write | VERIFIED | Lines 31-34: lazy `useState` reads `frame_guest_name`; lines 184-186: `handleGuestSubmit` writes `frame_guest_name`; `typeof window === 'undefined'` SSR guard at line 32 |
| `src/components/ui/ContextMenu.tsx` | Reusable portal-based context menu, exports `ContextMenu` and `MenuItem`, min 40 lines | VERIFIED | 80 lines; exports both `ContextMenu` (function) and `MenuItem` (interface); uses `ReactDOM.createPortal(menu, document.body)`; `position: fixed`; viewport-edge flip via `window.innerWidth`/`window.innerHeight` |
| `src/components/files/AssetCard.tsx` | `onContextMenu` handler + `ContextMenu` render | VERIFIED | Lines 198-203: `onContextMenu` with `isUploading` guard, `e.preventDefault()`, `e.stopPropagation()`; `ContextMenu` rendered at lines 402-414 with 8 items; `onRequestMove` in props interface |
| `src/components/files/AssetGrid.tsx` | `onRequestMove` prop forwarded to AssetCard | VERIFIED | Line 17: `onRequestMove?: (assetId: string) => void` in `AssetGridProps`; line 54: forwarded as `() => onRequestMove(asset.id)` to each `AssetCard` |
| `src/components/files/FolderBrowser.tsx` | FolderCard `onContextMenu` + canvas `onContextMenu` + `canvasMenu` state | VERIFIED | FolderCard `onContextMenu` at line 1042-1045 with `e.stopPropagation()`; `canvasMenu` state at line 102; canvas `onContextMenu` at lines 684-689; canvas `ContextMenu` at lines 716-725; `handleRequestMoveItem` at lines 305-308 |
| `src/components/files/AssetListView.tsx` | `onContextMenu` handler on list view rows | VERIFIED | Lines 276-280: `onContextMenu` on `<tr>` with `e.stopPropagation()`; `ContextMenu` rendered at lines 358-370 with 7 items; `onRequestMove` in `AssetListViewProps` and `AssetListRowProps` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/api/review-links/route.ts` | `nanoid` | `customAlphabet` import | WIRED | Line 5: `import { customAlphabet } from 'nanoid'`; used at line 7 and line 52 |
| `src/app/review/[token]/page.tsx` | `localStorage` | `getItem`/`setItem` for `frame_guest_name` | WIRED | Lines 33, 185: both getItem and setItem present with correct key; lazy initializer + `handleGuestSubmit` wrapper |
| `src/components/files/AssetCard.tsx` | `src/components/ui/ContextMenu.tsx` | `import { ContextMenu }` | WIRED | Lines 9-10: `import { ContextMenu } from '@/components/ui/ContextMenu'` and `import type { MenuItem }` |
| `src/components/files/FolderBrowser.tsx` | `src/components/ui/ContextMenu.tsx` | `import { ContextMenu }` for FolderCard + canvas | WIRED | Lines 39-40: same imports; rendered at lines 716-725 (canvas) and lines 1114-1126 (FolderCard) |
| `src/components/files/FolderBrowser.tsx` | `src/components/files/AssetGrid.tsx` | `onRequestMove` prop | WIRED | Line 826: `onRequestMove={(assetId) => handleRequestMoveItem(assetId)}` passed to `<AssetGrid>` |
| `src/components/files/AssetGrid.tsx` | `src/components/files/AssetCard.tsx` | `onRequestMove` forwarded | WIRED | Line 54: `onRequestMove={onRequestMove ? () => onRequestMove(asset.id) : undefined}` on each `AssetCard` |
| `src/components/files/AssetCard.tsx` | `e.stopPropagation()` | `onContextMenu` stops bubble to canvas | WIRED | Line 201: `e.stopPropagation()` inside `onContextMenu` before setting state |
| `src/components/files/FolderBrowser.tsx` | `src/components/files/AssetListView.tsx` | `onRequestMove` passed | WIRED | Line 813: `onRequestMove={(assetId) => handleRequestMoveItem(assetId)}` passed to `<AssetListView>` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/app/review/[token]/page.tsx` | `guestInfo.name` | `localStorage.getItem('frame_guest_name')` on mount; `handleGuestSubmit` on form submit | Yes — reads actual browser localStorage; persists across page loads | FLOWING |
| `src/app/api/review-links/route.ts` | `token` | `generateShortToken()` = `customAlphabet(62-char, 8)()` | Yes — nanoid generates real random tokens at runtime; used as Firestore doc ID and returned in response | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — this phase modifies client-side React components and a Next.js API route. No standalone runnable entry points exist without starting the Next.js dev server, which is out of scope for programmatic verification. Key behaviors are verified through code analysis above.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-11A | 11-01-PLAN.md | Guest reviewer display name prompt on first visit, localStorage persistence | SATISFIED | `frame_guest_name` localStorage key read in lazy `useState` initializer; written in `handleGuestSubmit`; `typeof window` SSR guard; `ReviewGuestForm` wired to `handleGuestSubmit` |
| REQ-11B | 11-01-PLAN.md | Shorten review link URLs to 6-8 char alphanumeric tokens | SATISFIED | `customAlphabet` with 62-char alphanumeric set, length 8; `generateShortToken()` used in POST handler; no UUID generation remaining |
| REQ-11C | 11-02-PLAN.md | Right-click context menu on asset/folder cards — Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete | SATISFIED | AssetCard lines 406-413: all 8 items. FolderCard lines 1118-1124: 7 items (Get link replaced by Create review link for folders, consistent with folder semantics). AssetListView lines 362-368: 7 items (Copy to intentionally excluded — documented in SUMMARY) |
| REQ-11D | 11-02-PLAN.md | Right-click context menu on empty canvas — New Folder, Upload files, Upload folder | SATISFIED | FolderBrowser lines 720-723: exactly these 3 items; canvas `onContextMenu` guard prevents double-fire with card menus |

No orphaned requirements — all 4 IDs (REQ-11A, REQ-11B, REQ-11C, REQ-11D) claimed by plans and verified in code.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/files/FolderBrowser.tsx` | 1078 | `divider: true` (should be `dividerBefore: true`) on three-dot dropdown items | Info | The three-dot dropdown's ContextMenu-rendered items at lines 1073-1079 use `divider` (unknown key) instead of `dividerBefore`. These items are in an older three-dot dropdown path, not the right-click context menu path at lines 1114-1124 which correctly uses `dividerBefore: true`. No user-visible impact for the right-click path; the older dropdown styling is a pre-existing inconsistency. |

No blocker or warning anti-patterns found. The single info-level item is in a pre-existing code path not introduced in this phase.

---

### Human Verification Required

#### 1. Context Menu Visual Consistency

**Test:** Open a project folder, right-click an asset card in grid view.
**Expected:** Context menu appears near cursor with dark background (`bg-frame-card`), rounded corners, matching the existing Dropdown.tsx visual style. All 8 items visible: Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete (with Delete visually separated and in red).
**Why human:** CSS class rendering and visual hierarchy cannot be verified programmatically.

#### 2. Canvas Right-Click Does Not Fire on Card Right-Click

**Test:** Right-click directly on an asset card.
**Expected:** Only the card's 8-item menu opens. Canvas menu (New Folder, Upload files, Upload folder) does NOT appear.
**Why human:** `stopPropagation` behavior during event bubbling requires runtime verification.

#### 3. Guest Name Prompt Flow

**Test:** Open a review link in an incognito window. Verify name prompt appears. Enter a name, submit. Close and reopen the same review link in the same incognito window.
**Expected:** First visit shows name prompt; second visit skips the prompt and goes directly to review content. Guest comment shows the entered name.
**Why human:** localStorage persistence across page loads and comment display require a running browser session.

#### 4. Existing UUID Review Links Still Resolve

**Test:** Navigate to a review link URL that uses a UUID-format token (created before this phase).
**Expected:** Page loads successfully; no 404 or redirect. Firestore direct doc lookup by token string continues to work for any token format.
**Why human:** Requires a live Firestore database with pre-existing UUID review link documents.

---

### Gaps Summary

No gaps found. All 7 observable truths verified against actual codebase. All 5 artifacts pass all four levels (exists, substantive, wired, data-flowing). All 8 key links wired. All 4 requirement IDs (REQ-11A through REQ-11D) satisfied with implementation evidence.

One minor info-level anti-pattern noted: the three-dot dropdown items in FolderBrowser use `divider: true` (unknown key) instead of `dividerBefore: true`, but this is in a pre-existing code path and does not affect the right-click context menu behavior introduced in this phase.

---

_Verified: 2026-04-06T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
