# Phase 11: nice-to-have - Research

**Researched:** 2026-04-06
**Domain:** React context menus, localStorage guest flow, short token generation, review page UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Guest Name Prompt**
- Shown only on external review pages (`/review/[token]` route), never in the main app
- Modal blocks access to review content until name is submitted
- Name stored in localStorage key `frame_guest_name`
- If localStorage already has a name, skip the prompt entirely
- Guest name used in the comment author field (instead of "Guest")
- No backend storage — purely client-side localStorage

**Short Review Link Tokens**
- Token format: 6-8 alphanumeric chars (e.g. `xK3mP9`, `aB7qR2wL`)
- Generated on the server at review link creation time using nanoid or similar
- New links get short tokens; existing links (UUID-based) continue working — no migration
- Firestore doc ID remains the token itself (established in Phase 5 bug fix)
- No collision detection needed at this scale (62^6 ≈ 56 billion combinations)

**Right-Click Context Menu — Asset/Folder Cards**
- Triggered via `onContextMenu` handler on the card container
- Prevents browser default context menu with `e.preventDefault()`
- Menu rendered as a fixed-position overlay at `{x: e.clientX, y: e.clientY}`
- Same actions as existing MoreHorizontal dropdown plus: Open, Move to, Download, Get link
- Divider before Delete
- Dismisses on: click outside menu, Escape key, scroll
- Must work in both grid view (AssetCard/FolderCard) and list view (AssetListRow/FolderCard)
- Reuse existing action handlers — context menu is a second trigger surface, not a replacement

**Right-Click Context Menu — Empty Canvas**
- Triggered by `onContextMenu` on the FolderBrowser content wrapper, but only if the event target is NOT a card (`[data-selectable]`) or descendant
- Same fixed-position overlay pattern as item context menu
- Actions: New Folder, Upload files, Upload folder
- Dismisses same way as item context menu

**Context Menu Component**
- Single reusable `<ContextMenu>` component (`src/components/ui/ContextMenu.tsx`)
- Props: `items: MenuItem[]`, `position: {x, y}`, `onClose: () => void`
- `MenuItem`: `{ label, icon?, onClick, dividerBefore?, disabled? }`
- Portal-rendered into document.body to escape any `overflow:hidden` ancestors
- Style consistent with existing Dropdown component (same dark bg, same item hover)

### Claude's Discretion
- Exact positioning logic (flip-to-avoid-viewport-edge)
- Whether to use a global context menu state provider or per-component local state
- Download implementation detail (anchor with `download` attr vs. `fetch` + `createObjectURL`)

### Deferred Ideas (OUT OF SCOPE)
- Server-side guest name persistence
- Keyboard navigation within context menu (arrow keys, Enter)
- Context menu on asset in review page
- Migrating existing UUID review link tokens to short tokens
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-11A | Guest name prompt on `/review/[token]` — shown first visit, skipped if localStorage has name, name used as comment author | ReviewGuestForm already exists but always shows; add localStorage check before rendering it |
| REQ-11B | Short review link tokens — 6-8 alphanumeric chars via nanoid, new links only, existing UUID links keep working | nanoid 5.0.7 already installed; replace custom `generateToken()` in `src/lib/utils.ts` used by review-links POST route |
| REQ-11C | Right-click context menu on asset/folder cards — Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete | New `ContextMenu` portal component; wire `onContextMenu` into AssetCard, FolderCard (inside FolderBrowser), AssetListRow |
| REQ-11D | Right-click context menu on empty canvas — New Folder, Upload files, Upload folder | Add `onContextMenu` to FolderBrowser content `div`; check `e.target` closest `[data-selectable]` to skip card right-clicks |
</phase_requirements>

---

## Summary

Phase 11 delivers four focused UX enhancements across the review page and file browser. All four features build on existing infrastructure with minimal new dependencies.

**REQ-11A (Guest name prompt):** The review page (`/review/[token]/page.tsx`) already has a `ReviewGuestForm` component that collects name + email via `guestInfo` state. The only change is to pre-populate `guestInfo` from `localStorage.getItem('frame_guest_name')` on mount (skipping the form if a name is cached) and to persist the submitted name back to localStorage. The form currently requires both name and email — the decision is name only, so the email field should be removed or made optional.

**REQ-11B (Short tokens):** `nanoid` 5.0.7 is already in `package.json`. The current `generateToken()` in `src/lib/utils.ts` produces a 32-char custom random string. The POST handler for review links (`src/app/api/review-links/route.ts`) calls `generateToken()` on line 47. Replacing that with `nanoid(8)` (from `nanoid` package, URL-safe alphabet, 8 chars) is the entire change. Existing UUID-based Firestore doc IDs continue to resolve because the GET/DELETE route uses `db.collection('reviewLinks').doc(token)` — a direct doc lookup that works for any string ID.

**REQ-11C + REQ-11D (Context menus):** The core pattern is a single reusable `ContextMenu` portal component rendered via `ReactDOM.createPortal` into `document.body`. This escapes `overflow:hidden` on the content wrapper. The component receives `items`, `position: {x, y}`, and `onClose`. Each card (AssetCard, FolderCard inside FolderBrowser, AssetListRow) adds `onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, item); }}`. The FolderBrowser content div adds the canvas right-click handler with a target guard.

**Primary recommendation:** Build in 3 plans — (1) ContextMenu component + wire into cards + canvas handler, (2) guest name localStorage integration, (3) short token swap.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nanoid | 5.0.7 (already installed) | Short unique ID generation | Crypto-random, URL-safe, tree-shakeable; already a project dependency |
| ReactDOM.createPortal | built-in (React 18) | Render context menu outside DOM hierarchy | Standard escape hatch for menus that need to clear overflow constraints |
| localStorage | Web API | Persist guest name client-side | No backend required; survives page reload; cleared by user explicitly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | existing | Icons for context menu items | Already used by Dropdown; maintain visual consistency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nanoid(8) | Custom `generateToken()` shortened | nanoid is crypto-random via `crypto.getRandomValues`; custom loop uses `Math.random()` which is not cryptographically secure — nanoid is strictly better |
| ReactDOM.createPortal | Absolute position within card | Portal avoids z-index/overflow bugs; card-relative positioning breaks when cards are inside clipped containers |
| localStorage | sessionStorage | localStorage persists across tabs and sessions — correct for "don't ask again on same browser" behavior |

**Installation:** No new packages needed. `nanoid` is already in `package.json` at `^5.0.7`.

**Version verification:** `npm view nanoid version` → 5.1.5 (latest). Project has `^5.0.7` which resolves to `5.x` — satisfactory.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/ui/
│   ├── ContextMenu.tsx      # NEW — reusable portal context menu
│   └── Dropdown.tsx         # EXISTING — reference for visual style
├── components/files/
│   ├── AssetCard.tsx        # MODIFY — add onContextMenu
│   ├── AssetListView.tsx    # MODIFY — add onContextMenu to AssetListRow
│   └── FolderBrowser.tsx    # MODIFY — FolderCard + canvas right-click
├── app/
│   └── review/[token]/
│       └── page.tsx         # MODIFY — localStorage guest name check
└── app/api/review-links/
    └── route.ts             # MODIFY — use nanoid(8) for token
```

### Pattern 1: ContextMenu Portal Component

**What:** A fixed-position overlay rendered into `document.body` via `ReactDOM.createPortal`. Listens for `mousedown` outside and `keydown Escape` to dismiss. Positions itself at cursor coordinates with optional viewport-edge flip.

**When to use:** Any right-click trigger that needs to escape `overflow:hidden` ancestors.

**Example:**
```typescript
// src/components/ui/ContextMenu.tsx
'use client';

import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  dividerBefore?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Viewport-edge flip: if menu would overflow right/bottom, shift it
  const MENU_W = 180;
  const MENU_H = items.length * 36 + 16; // estimate
  const x = position.x + MENU_W > window.innerWidth ? position.x - MENU_W : position.x;
  const y = position.y + MENU_H > window.innerHeight ? position.y - MENU_H : position.y;

  const menu = (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
      className="bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && i > 0 && (
            <div className="my-1 border-t border-frame-border" />
          )}
          <button
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={cn(
              'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left',
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover',
              item.disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}
```

### Pattern 2: Per-Component Context Menu State

**What:** Each card component (AssetCard, FolderCard, AssetListRow) manages its own `contextMenu: { x: number; y: number } | null` state. No global provider needed.

**When to use:** Components that already own their action handlers (rename, delete, copy, etc.). Local state avoids prop-drilling context-menu position through parent.

**Example:**
```typescript
// Inside AssetCard (add alongside existing state)
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

// On the card container div:
onContextMenu={(e) => {
  e.preventDefault();
  e.stopPropagation(); // prevent FolderBrowser canvas handler from also firing
  setContextMenu({ x: e.clientX, y: e.clientY });
}}

// At render bottom (alongside existing modals):
{contextMenu && (
  <ContextMenu
    position={contextMenu}
    onClose={() => setContextMenu(null)}
    items={[
      { label: 'Open', icon: <ExternalLink className="w-4 h-4" />, onClick: () => onClick?.() },
      { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRename },
      { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: handleDuplicate },
      { label: 'Copy to', icon: <Copy className="w-4 h-4" />, onClick: openCopyTo },
      { label: 'Move to', icon: <Move className="w-4 h-4" />, onClick: () => onRequestMove?.() },
      { label: 'Download', icon: <Download className="w-4 h-4" />, onClick: handleDownload },
      { label: 'Get link', icon: <Link className="w-4 h-4" />, onClick: handleGetLink },
      { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: handleDelete, danger: true, dividerBefore: true },
    ]}
  />
)}
```

### Pattern 3: Canvas Right-Click Guard

**What:** FolderBrowser content wrapper gets `onContextMenu`. The handler checks if the right-click was on or inside a `[data-selectable]` element — if so, do nothing (the card will handle it via `e.stopPropagation()`). If on empty canvas, show the canvas context menu.

**When to use:** FolderBrowser content div is the correct attachment point; cards must call `e.stopPropagation()` on their own `onContextMenu` to prevent bubbling.

**Example:**
```typescript
// FolderBrowser content div:
onContextMenu={(e) => {
  const card = (e.target as HTMLElement).closest('[data-selectable]');
  if (card) return; // card's own handler fires; don't double-open
  e.preventDefault();
  setCanvasMenu({ x: e.clientX, y: e.clientY });
}}

// Canvas menu:
{canvasMenu && (
  <ContextMenu
    position={canvasMenu}
    onClose={() => setCanvasMenu(null)}
    items={[
      { label: 'New Folder', icon: <Plus className="w-4 h-4" />, onClick: () => setShowCreateFolder(true) },
      { label: 'Upload files', icon: <Upload className="w-4 h-4" />, onClick: () => fileInputRef.current?.click() },
      { label: 'Upload folder', icon: <FolderOpen className="w-4 h-4" />, onClick: () => folderInputRef.current?.click() },
    ]}
  />
)}
```

### Pattern 4: localStorage Guest Name — Bypass ReviewGuestForm

**What:** On mount in `/review/[token]/page.tsx`, read `localStorage.getItem('frame_guest_name')`. If truthy, set `guestInfo` directly without showing `ReviewGuestForm`. On form submit, write name to localStorage before calling `setGuestInfo`.

**Example:**
```typescript
// In ReviewPage, replace the existing guestInfo useState init:
const [guestInfo, setGuestInfo] = useState<{ name: string; email: string } | null>(() => {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('frame_guest_name');
  return saved ? { name: saved, email: '' } : null;
});

// Wrapper around onSubmit:
const handleGuestSubmit = (info: { name: string }) => {
  localStorage.setItem('frame_guest_name', info.name);
  setGuestInfo({ name: info.name, email: '' });
};
```

### Pattern 5: Short Token Generation

**What:** Replace `generateToken()` call in `src/app/api/review-links/route.ts` with `nanoid(8)`.

**Example:**
```typescript
// src/app/api/review-links/route.ts
import { nanoid } from 'nanoid';

// Replace: const token = generateToken();
const token = nanoid(8); // 8 alphanumeric chars, crypto-random
```

The `nanoid` default alphabet is `A-Za-z0-9_-` (URL-safe, 64 chars). If strictly alphanumeric is required (no `_` or `-`), use `customAlphabet`:
```typescript
import { customAlphabet } from 'nanoid';
const nanoidAlphanumeric = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 8);
const token = nanoidAlphanumeric();
```

### Pattern 6: Download Action

**What:** `signedUrl` is already available on the asset object (injected by the assets API). An anchor element with `download` attribute and `href=signedUrl` will trigger a browser download. GCS signed URLs serve the file directly.

**Caveat:** GCS signed URLs without `response-content-disposition` header may open in browser instead of downloading. The simplest fix is `fetch(signedUrl)` + `createObjectURL` pattern, or passing `?response-content-disposition=attachment` on the signed URL at generation time. The CONTEXT.md marks download implementation as Claude's Discretion.

**Recommended approach:** Create a small `handleDownload` function using anchor + `download` attr. If the browser opens instead of downloads, fall back to fetch+blob.

### Anti-Patterns to Avoid
- **Global context menu state in a React context provider:** Unnecessary complexity for this use case. Per-card local state is cleaner and already how modals are handled (see `showCopyToModal`, `showVersionModal` in AssetCard).
- **Adding `onContextMenu` to the card's wrapper in the parent (FolderBrowser grid) instead of inside the card component:** This breaks encapsulation; each card already owns its action handlers.
- **Forgetting `e.stopPropagation()` on card `onContextMenu`:** Without it, both the card handler AND the canvas handler fire, opening two menus.
- **Not using `ReactDOM.createPortal`:** Positioning with `position: absolute` relative to the card will clip inside `overflow:hidden` containers or appear at wrong z-levels.
- **Reading localStorage during SSR:** Next.js renders server-side; `typeof window === 'undefined'` guard required in any localStorage access, or use a `useState` lazy initializer which runs client-only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Short random IDs | Custom `Math.random()` loop | `nanoid` (already installed) | `Math.random()` is not cryptographically secure; nanoid uses `crypto.getRandomValues` |
| Portal rendering | Manual DOM manipulation / `document.createElement` | `ReactDOM.createPortal` | React manages lifecycle, event bubbling, cleanup automatically |
| Outside-click detection | Complex coordinate math | `mousedown` listener on `document` + `ref.current.contains(e.target)` | Standard pattern, already used in Dropdown.tsx |

---

## Common Pitfalls

### Pitfall 1: Two context menus opening simultaneously
**What goes wrong:** Right-clicking on a card opens both the card context menu AND the canvas context menu.
**Why it happens:** `onContextMenu` bubbles from card up to the FolderBrowser content wrapper unless stopped.
**How to avoid:** Each card's `onContextMenu` handler must call `e.stopPropagation()`. The canvas handler checks `e.target.closest('[data-selectable]')` as a belt-and-suspenders guard.
**Warning signs:** Canvas menu opens when right-clicking a card; two menus rendered simultaneously.

### Pitfall 2: Context menu renders off-screen
**What goes wrong:** Right-clicking near the right or bottom edge places the menu outside the viewport.
**Why it happens:** Using raw `e.clientX / e.clientY` as menu top-left without checking viewport bounds.
**How to avoid:** Before rendering, check `position.x + MENU_W > window.innerWidth` and flip accordingly. See Pattern 1 example.
**Warning signs:** Menu partially invisible when right-clicking near screen edges.

### Pitfall 3: Context menu not dismissed on scroll
**What goes wrong:** User scrolls while menu is open; menu floats at fixed position no longer aligned to the item.
**Why it happens:** `fixed` position is correct but scroll doesn't trigger `mousedown` or `keydown`.
**How to avoid:** Add `window.addEventListener('scroll', onClose, true)` in the `useEffect` (capturing phase to catch scroll in any ancestor). See Pattern 1 example.
**Warning signs:** Menu lingers after page scroll.

### Pitfall 4: localStorage read during SSR
**What goes wrong:** `localStorage is not defined` error in Next.js.
**Why it happens:** `useState` initializer with `localStorage.getItem()` runs during server-side render.
**How to avoid:** Wrap in `typeof window === 'undefined'` guard or use lazy `useState(() => { if (typeof window === 'undefined') return null; ... })`.
**Warning signs:** Build-time error or hydration mismatch in review page.

### Pitfall 5: ReviewGuestForm currently requires email
**What goes wrong:** The guest-name decision says "name only stored in localStorage" but `ReviewGuestForm` requires both name and email, and validates email format.
**Why it happens:** The form was built before this phase's decision narrowed to name-only localStorage storage.
**How to avoid:** The form can continue to collect email for comment metadata (it already passes email to `handleAddComment`). The localStorage only stores the name (`frame_guest_name`). The localStorage bypass should only skip the form if name is already known — email will be empty on subsequent visits. Consider whether empty email is acceptable for comment display; if so, no form change needed.
**Warning signs:** Guests on repeat visits have no email in comments. This is acceptable per the decision.

### Pitfall 6: Move to in card context menu requires FolderBrowser's MoveModal
**What goes wrong:** "Move to" for a single asset requires the MoveModal (which lives inside FolderBrowser) and needs `allFolders` to be pre-loaded.
**Why it happens:** AssetCard doesn't have its own Move to flow — only the multi-select bar in FolderBrowser does.
**How to avoid:** Either (a) lift a `onRequestMove` callback from FolderBrowser into AssetCard/FolderCard (same pattern as `onCopied`, `onDeleted`), and reuse FolderBrowser's `handleOpenMoveModal` / `MoveModal`, or (b) add a local MoveModal instance in AssetCard similar to `AssetFolderPickerModal`. Option (a) is cleaner since the move handler is already in FolderBrowser. Single-item move can set `selectedIds` to `{asset.id}` then call `handleOpenMoveModal`.
**Warning signs:** "Move to" context menu item does nothing or opens empty folder list.

---

## Code Examples

### nanoid short token (server-side)
```typescript
// src/app/api/review-links/route.ts
import { customAlphabet } from 'nanoid';

const generateShortToken = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  8
);

// In POST handler, replace generateToken():
const token = generateShortToken();
```

### localStorage guest name read (SSR-safe)
```typescript
// In /review/[token]/page.tsx
const [guestInfo, setGuestInfo] = useState<{ name: string; email: string } | null>(() => {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('frame_guest_name');
  return saved ? { name: saved, email: '' } : null;
});

const handleGuestSubmit = (info: { name: string; email: string }) => {
  localStorage.setItem('frame_guest_name', info.name);
  setGuestInfo(info);
};
```

### Matching Dropdown visual style in ContextMenu
The existing `Dropdown.tsx` uses these Tailwind classes — ContextMenu must match:
- Container: `bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in`
- Normal item: `text-frame-textSecondary hover:text-white hover:bg-frame-cardHover`
- Danger item: `text-red-400 hover:bg-red-500/10`
- Divider: `my-1 border-t border-frame-border`
- Item layout: `w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID review link tokens | Short 8-char alphanumeric tokens | Phase 11 | Shorter URLs; 62^8 = 218 trillion combos; no collision risk at scale |
| Always-show guest name form | Skip if localStorage has name | Phase 11 | Better repeat-visitor UX; one-time entry per browser |

**Deprecated/outdated:**
- `generateToken()` in `src/lib/utils.ts`: Still used by other callers (check before removing). The review-links POST route will switch to `nanoid` directly; `generateToken()` itself can remain for other uses.

---

## Environment Availability

Step 2.6: SKIPPED — no external tool dependencies. All changes are code/config only. `nanoid` is already installed.

---

## Open Questions

1. **Does the guest-name localStorage bypass apply when `allowComments` is false?**
   - What we know: The review page currently skips `ReviewGuestForm` entirely when `allowComments` is false (see `if (!guestInfo && data.reviewLink.allowComments)`).
   - What's unclear: Whether to also skip localStorage write when comments are disabled.
   - Recommendation: Only attempt localStorage read/write when `allowComments` is true. If comments are disabled the form never shows and name is irrelevant.

2. **"Get link" for an asset — what URL is copied?**
   - What we know: The context menu should have "Get link". For a review page asset it could copy the signed URL or the asset viewer URL within the app.
   - What's unclear: The CONTEXT.md says "copy asset URL or review link to clipboard" — ambiguous.
   - Recommendation: In the main app, "Get link" on an asset copies the internal URL (`/projects/{projectId}/assets/{assetId}`). For a folder card, it could copy the review link for that folder if one exists, or open the Create Review Link modal.

3. **Move to single item from context menu — prop threading needed**
   - What we know: MoveModal + allFolders + handleMoveSelected all live in FolderBrowser.
   - What's unclear: How to trigger single-item move from within AssetCard's context menu without major refactor.
   - Recommendation: Pass an `onRequestMove?: () => void` prop from FolderBrowser into AssetCard/FolderCard. FolderBrowser sets selectedIds to `{id}` then opens MoveModal. This is consistent with how `onCopied`, `onDeleted` callbacks work.

---

## Key Findings

### What Already Exists (saves work)
- `ReviewGuestForm` component already exists at `src/components/review/ReviewGuestForm.tsx` — only the localStorage integration is needed, not a new modal
- `guestInfo` state already threads name+email into `handleAddComment` — no comment API changes needed
- `data-selectable={asset.id}` already on AssetCard's root div and AssetListRow's `<tr>` — canvas guard can use `closest('[data-selectable]')`
- `nanoid` 5.0.7 already in `package.json` — no install step
- `fileInputRef` and `folderInputRef` already exist in FolderBrowser with `.click()` wired to Upload buttons — canvas menu reuses these directly
- `setShowCreateFolder` already exists in FolderBrowser — canvas menu reuses it
- FolderCard is defined inside `FolderBrowser.tsx` (not a separate file) — context menu must be added there
- Dropdown visual classes are documented and consistent — ContextMenu mirrors them exactly

### New Work Required
- `src/components/ui/ContextMenu.tsx` — new portal component (~60 lines)
- AssetCard: add `contextMenu` state + `onContextMenu` handler + render `<ContextMenu>`; new `onRequestMove?` prop
- FolderBrowser/FolderCard: add `contextMenu` state + `onContextMenu` handler; thread `onRequestMove` callback
- AssetListView/AssetListRow: add `onContextMenu` handler + render `<ContextMenu>`; needs `onAssetContextMenu` prop from FolderBrowser
- FolderBrowser content div: add canvas `onContextMenu` + `canvasMenu` state
- `/review/[token]/page.tsx`: add localStorage read/write around guest form
- `src/app/api/review-links/route.ts`: swap `generateToken()` for `nanoid(8)`

---

## Validation Architecture

`workflow.nyquist_validation` key absent from `.planning/config.json` — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest/vitest/playwright config found in project root |
| Config file | none |
| Quick run command | manual verification via browser |
| Full suite command | manual verification via browser |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-11A | First-time visitor sees guest name form; repeat visitor skips it | manual | — | N/A |
| REQ-11B | New review links have 8-char alphanumeric token; old UUID links still resolve | manual | — | N/A |
| REQ-11C | Right-click on asset/folder card opens context menu at cursor position | manual | — | N/A |
| REQ-11D | Right-click on empty canvas shows New Folder / Upload actions | manual | — | N/A |

### Wave 0 Gaps
No automated test infrastructure exists in this project. All verification is manual browser testing via Playwright MCP (per `.planning/STATE.md` — "Using Playwright MCP for visual verification before pushing").

---

## Sources

### Primary (HIGH confidence)
- Direct source file reads: `src/components/ui/Dropdown.tsx`, `src/components/files/AssetCard.tsx`, `src/components/files/FolderBrowser.tsx`, `src/components/files/AssetListView.tsx`, `src/app/review/[token]/page.tsx`, `src/components/review/ReviewGuestForm.tsx`, `src/app/api/review-links/route.ts`, `src/lib/utils.ts`
- `package.json` — confirmed nanoid 5.0.7 installed
- `.planning/phases/11-nice-to-have/11-CONTEXT.md` — locked decisions
- React 18 docs: `ReactDOM.createPortal` — built-in, no version concern

### Secondary (MEDIUM confidence)
- nanoid npm registry: version 5.1.5 latest; project's `^5.0.7` resolves within range

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nanoid confirmed installed, React portal is built-in
- Architecture: HIGH — all source files read directly; existing patterns identified
- Pitfalls: HIGH — identified from direct code inspection (e.g. stopPropagation gap, ReviewGuestForm email requirement, MoveModal coupling)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable domain; no fast-moving dependencies)
