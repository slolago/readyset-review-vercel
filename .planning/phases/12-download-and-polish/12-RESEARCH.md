# Phase 12: download-and-polish - Research

**Researched:** 2026-04-06
**Domain:** React file browser — download mechanics, checkbox UX, context menu dismiss, React performance
**Confidence:** HIGH (all findings from direct source-code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Bulk download:** `selectedIds` lives in `FolderBrowser`; floating action bar shows when `selectedIds.size > 0`; each file downloaded via `<a download>` anchor click; iterate sequentially with short delay; no zip bundling.
- **Select-all toggle:** header checkbox calls `onSelectAll([])` if all are already selected, otherwise `onSelectAll(allIds)`; indeterminate state preserved; pass `allSelected` boolean to component.
- **Download all (canvas context menu):** add "Download all" item to canvas `ContextMenu` in `FolderBrowser`; iterate over all `assets` in state.
- **Right-click menu dismiss fix:** `useEffect` in `ContextMenu.tsx` must add document listener after current event loop tick (`setTimeout(..., 0)`) or as-is but verified; add `window.scroll` + `window.blur` listeners; verify Escape key.
- **Checkbox styling:** `appearance-none` + Tailwind `checked:` variants; unchecked = `border-white/30 bg-transparent`; checked = `bg-[#7a00df] border-[#7a00df]` + white checkmark; apply in `AssetListView.tsx` and header; also grid view if applicable.
- **Download from three-dot menu:** `handleDownload` in `AssetCard` uses `signedUrl`; if GCS URL won't send `Content-Disposition: attachment`, use `fetch → blob → createObjectURL → anchor.click()` pattern.
- **Review link download button:** on `/review/[token]/page.tsx`, show per-asset download button when `reviewLink.allowDownloads === true`.
- **Performance:** `React.memo` on `AssetGrid`, `AssetListView`, `FolderCard`; `useCallback` for handlers; `useMemo` for sorted/filtered list; stable `useEffect` dep arrays; no architectural changes.

### Claude's Discretion

- Exact positioning of the Download action bar (floating overlay vs. top toolbar).
- Whether to show a progress indicator for multi-file downloads.
- Specific performance targets (no hard latency numbers required).

### Deferred Ideas (OUT OF SCOPE)

- Zip bundling for multi-file downloads.
- Download progress bar / notification toast.
- Download history / tracking.
- Performance: code-splitting, Suspense boundaries.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-12A | Bulk download — action bar Download button downloads all selected assets | Download anchor pattern; `selectedIds` already in `FolderBrowser`; action bar JSX already exists at line 848 |
| REQ-12B | Select-all toggle — header checkbox deselects all on second click; indeterminate preserved | `AssetListView` already has `allSelected`/`someSelected`/`handleSelectAllClick` logic; only needs `onSelectAll([])` branch when `allSelected` |
| REQ-12C | "Download all" in canvas right-click menu | Canvas `ContextMenu` items array in `FolderBrowser` at line 720; add item + handler iterating `assets` |
| REQ-12D | Right-click menu dismiss fix | `ContextMenu.tsx` already has `mousedown` + `keydown` + `scroll` listeners; real issue is event capture timing — `setTimeout(0)` fix on listener registration |
| REQ-12E | Checkbox styling — dark theme, frame-accent | Current checkboxes use `accent-frame-accent` (browser accent hack); replace with `appearance-none` + Tailwind `checked:` variants |
| REQ-12F | Download from three-dot menu + review links | `AssetCard.handleDownload` already implemented; three-dot `Dropdown` items lack Download; review page at line 340 renders `AssetCard` without `allowDownloads` awareness |
| REQ-12G | Performance — memoize components, stable dep arrays | `AssetGrid`, `AssetListView` not currently wrapped in `React.memo`; `FolderBrowser` creates inline callbacks |
</phase_requirements>

---

## Summary

Phase 12 is a polish phase: seven discrete improvements across the file browser and review links. All changes are isolated edits — no new API routes, no new data models, no new pages. Every modification targets an existing component.

The download pattern is already implemented in `AssetListRow.handleDownload` (line 245–256 of `AssetListView.tsx`) and `AssetCard.handleDownload` (line 170–179): create an `<a download>` element, set `href` and `download`, click it, remove it. The bulk download handler in `FolderBrowser` simply needs to iterate selected asset IDs and call the same pattern.

The `ContextMenu` dismiss race condition is subtle but already partially fixed. Current code in `ContextMenu.tsx` registers `mousedown`/`keydown`/`scroll` listeners synchronously inside `useEffect`. The race is that the right-click event that opens the menu is a `mousedown`; the portal renders into `document.body` synchronously but `useEffect` fires after paint — so the listener IS added after the opening event. This should work. The actual problem is most likely that `onClose` is a new function reference on every render (passed as an inline arrow from `setCanvasMenu(null)` / `setContextMenu(null)`), causing `useEffect` to re-register listeners on every render. Wrapping `onClose` callers in `useCallback` OR adding `setTimeout(0)` before adding the listener both fix it.

The checkbox styling change is purely CSS: swap `accent-frame-accent` for `appearance-none` + custom Tailwind variants. The `checked:` pseudo-class variant is available in Tailwind v3 (this project uses `tailwindcss ^3.4.1`). A white SVG checkmark is best injected via `bg-[url(…)]` with an inline SVG data URI — no additional packages needed.

The review page download button is a minimal JSX addition: check `data.reviewLink.allowDownloads`, and if true render a download `<button>` per asset in the grid (line ~340) using the same `<a download>` pattern.

**Primary recommendation:** Plan 4 discrete plans — (1) download mechanics (REQ-12A, 12C, 12F including review link), (2) select-all toggle + checkbox styling (REQ-12B, 12E), (3) right-click dismiss fix (REQ-12D), (4) performance memoization (REQ-12G).

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| React | 18 | Component framework | `memo`, `useCallback`, `useMemo` |
| Next.js | 14.2.5 | App framework | App Router, `'use client'` |
| Tailwind CSS | ^3.4.1 | Styling | `appearance-none`, `checked:` variants |
| lucide-react | ^0.395.0 | Icons | `Download` icon already imported in `AssetCard`, `AssetListView` |
| react-hot-toast | ^2.4.1 | Toasts | Already used throughout |

### No New Packages Required

All seven requirements are achievable with zero new dependencies.

---

## Architecture Patterns

### Recommended Plan Structure

```
12-01-PLAN.md — Download mechanics (REQ-12A, 12C, 12F)
12-02-PLAN.md — Select-all toggle + checkbox styling (REQ-12B, 12E)
12-03-PLAN.md — Context menu dismiss fix (REQ-12D)
12-04-PLAN.md — Performance memoization (REQ-12G)
```

### Pattern 1: Programmatic File Download (browser anchor trick)

Already implemented in `AssetListRow.handleDownload` and `AssetCard.handleDownload`. Pattern is:

```typescript
// Source: AssetListView.tsx lines 245–256 (verified by direct read)
const handleDownload = () => {
  const url = signedUrl || thumbnailSignedUrl;
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = asset.name;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
```

For GCS signed URLs that return `Content-Type` without `Content-Disposition: attachment`, the browser may display the file instead of downloading. The fetch-blob fallback forces a download:

```typescript
// Fetch-blob fallback for GCS URLs without Content-Disposition: attachment
const forcedDownload = async (url: string, filename: string) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
};
```

**When to use which:** Use the direct anchor trick for assets that already open in the viewer (they work). Use the fetch-blob fallback for GCS image/video URLs where the `Content-Disposition` header is absent. Since GCS signed URLs in this project don't appear to set `Content-Disposition` by default, the fetch-blob pattern is safer for new download entry points (action bar, review page). Existing handlers in `AssetCard` and `AssetListRow` already use direct anchor and appear to work.

### Pattern 2: Bulk Download with Sequential Delay

Browsers throttle simultaneous downloads. Sequential iteration with a small delay (50–100ms) between files avoids cancellation:

```typescript
// In FolderBrowser — bulk download handler
const handleDownloadSelected = async () => {
  const selectedAssets = assets.filter(a => selectedIds.has(a.id));
  for (const asset of selectedAssets) {
    const url = (asset as any).signedUrl as string | undefined;
    if (!url) continue;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay to avoid browser throttling simultaneous downloads
    await new Promise(r => setTimeout(r, 100));
  }
};
```

### Pattern 3: Tailwind Custom Checkbox (dark theme)

Tailwind v3 supports `checked:` variant and `appearance-none`. The white checkmark is best expressed as a data-URI SVG background:

```tsx
// Replace: className="w-4 h-4 accent-frame-accent cursor-pointer"
// With:
<input
  type="checkbox"
  className={`
    w-4 h-4 rounded cursor-pointer
    appearance-none
    border border-white/30 bg-transparent
    checked:bg-[#7a00df] checked:border-[#7a00df]
    checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white"><path d="M6.5 11.5L3 8l1.4-1.4L6.5 8.7l5.1-5.1L13 5z"/></svg>')]
    checked:bg-center checked:bg-no-repeat checked:bg-contain
    transition-colors
  `}
/>
```

Note: The SVG data URI approach requires that Tailwind's JIT purge doesn't strip the `bg-[url(...)]` class. Since the class is written inline in JSX, JIT will include it. However, for maintainability, defining it as a `@layer utilities` custom class in `globals.css` is cleaner.

Alternative: use a `relative` container with an absolutely-positioned `<Check>` Lucide icon that is `opacity-0` when unchecked and `opacity-100` when checked — more maintainable, already used for `AssetCard` grid checkboxes (lines 248–259 of `AssetCard.tsx`).

**AssetCard already uses the div+Check approach** for grid checkboxes. AssetListView currently uses native `<input type="checkbox" className="accent-frame-accent">`. For consistency, apply the same div+Check pattern to list view rows, or use `appearance-none` + `checked:` variants for the simpler `<input>` approach.

### Pattern 4: ContextMenu Dismiss — Root Cause and Fix

Current `ContextMenu.tsx` (lines 25–41) registers listeners inside `useEffect` with `[onClose]` dep array. The problem: `onClose` is a new inline arrow function reference on every parent render (e.g., `onClose={() => setCanvasMenu(null)}`), which causes the `useEffect` to tear down and re-register listeners on every render — including the one triggered by the right-click event itself.

**Fix options (choose one):**

Option A — `setTimeout(0)` in ContextMenu useEffect:
```typescript
useEffect(() => {
  const handleMouseDown = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) onClose();
  };
  // Defer listener registration to avoid catching the opening mousedown
  const timerId = setTimeout(() => {
    document.addEventListener('mousedown', handleMouseDown);
  }, 0);
  return () => {
    clearTimeout(timerId);
    document.removeEventListener('mousedown', handleMouseDown);
  };
}, [onClose]);
```

Option B — Stable `onClose` reference in callers (wrap `setCanvasMenu(null)` in `useCallback` in `FolderBrowser`):
```typescript
// In FolderBrowser:
const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);
// Then pass: onClose={closeCanvasMenu}
```

Option B is architecturally cleaner (fix the caller, not the component). Option A is safer as a one-place fix that defends against all callers. **Recommend Option A** since `ContextMenu` is used across multiple components (`AssetCard`, `AssetListView`, `FolderBrowser`).

### Pattern 5: React.memo on Child Components

`AssetGrid` and `AssetListView` receive stable props from `FolderBrowser` but are not currently memoized. Since FolderBrowser has significant state, wrapping them prevents unnecessary re-renders:

```typescript
// AssetGrid.tsx
export const AssetGrid = React.memo(function AssetGrid({ ... }: AssetGridProps) { ... });

// AssetListView.tsx
export const AssetListView = React.memo(function AssetListView({ ... }: AssetListViewProps) { ... });
```

`useCallback` must be applied to all handler props passed down, otherwise `React.memo` won't help (new function ref = re-render). The key handlers in FolderBrowser that need `useCallback`:
- `toggleSelect` — already wrapped in `useCallback` (line 249)
- `handleItemDragStart` — already wrapped in `useCallback` (line 259)
- `refetchAssets` — comes from `useAssets`, already a stable callback
- `fetchFolders` — already wrapped in `useCallback` (line 109)
- `handleRequestMoveItem` — already wrapped in `useCallback` (line 305)

The inline arrow wrappers passed to `AssetGrid`/`AssetListView` for `onRequestMove` (e.g., `(assetId: string) => handleRequestMoveItem(assetId)`) are NOT stable — they create a new function on every render. These should either be passed directly or wrapped in `useCallback`.

### Anti-Patterns to Avoid

- **Triggering many downloads simultaneously:** Browsers (especially Chrome) silently cancel downloads beyond 10 simultaneous. Always use sequential loop with delay.
- **Setting `a.download` without `a.href` on cross-origin URLs:** The `download` attribute is ignored for cross-origin URLs. GCS signed URLs are cross-origin from the app domain. This means the `download` attribute hint is advisory only — the browser may open in a new tab. The fetch-blob pattern ALWAYS forces download regardless of CORS.
- **Using `accent-*` for checkbox colour in complex designs:** `accent-color` sets browser native checkbox colour but cannot be combined with custom border radius or hover styles. `appearance-none` is required for full custom control.
- **Wrapping components in `React.memo` without stabilizing handler props:** Memoization is a no-op if any prop changes on every render. Check all props, especially callback functions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Download forcing | Custom HTTP proxy to add Content-Disposition | `fetch → blob → createObjectURL → <a download>` | Already works client-side; no server needed |
| Custom checkbox rendering | New checkbox component from scratch | `appearance-none` + Tailwind `checked:` variants, or reuse `div + Check` pattern from AssetCard | AssetCard already has working pattern (lines 248–259) |
| Toast for download | Custom notification | `react-hot-toast` already in project | Already installed and used |

---

## Common Pitfalls

### Pitfall 1: GCS Signed URLs Are Cross-Origin — `download` Attribute Ignored

**What goes wrong:** Developer adds `a.download = asset.name` expecting the browser to download the file. Browser opens it in a new tab instead.
**Why it happens:** The HTML5 `download` attribute only forces a download for same-origin URLs. GCS URLs (`storage.googleapis.com/...`) are cross-origin from the Next.js app domain.
**How to avoid:** Use the fetch-blob pattern for any URL that will be opened from the app domain but hosted on GCS. The pattern converts a cross-origin URL into a same-origin blob URL.
**Warning signs:** File opens in browser tab rather than downloading; no download dialog appears.

### Pitfall 2: ContextMenu onClose Reference Instability

**What goes wrong:** `ContextMenu` re-registers its `mousedown` listener on every parent render, catching the opening click.
**Why it happens:** Inline `onClose={() => setState(null)}` creates a new function reference on every render; `useEffect([onClose])` re-runs.
**How to avoid:** Wrap `onClose` callers in `useCallback` in the parent, OR use `setTimeout(0)` inside `ContextMenu.useEffect`.
**Warning signs:** Context menu closes immediately after opening, OR stays open and requires double-click to close.

### Pitfall 3: React.memo Is a No-Op When Props Are Unstable

**What goes wrong:** `React.memo(AssetGrid)` doesn't reduce re-renders because parent FolderBrowser passes inline arrow functions for each callback.
**Why it happens:** `(assetId) => handleRequestMoveItem(assetId)` creates a new function on every render even though `handleRequestMoveItem` is stable.
**How to avoid:** Pass callbacks directly when signatures match: `onRequestMove={handleRequestMoveItem}`. When signature adapters are needed, wrap in `useCallback` with stable deps.
**Warning signs:** React DevTools Profiler shows AssetGrid re-rendering on every FolderBrowser render.

### Pitfall 4: Select-All Toggle Passes Wrong Array

**What goes wrong:** `onSelectAll` receives `sorted.map(a => a.id)` (filtered/sorted slice) but caller in FolderBrowser does `setSelectedIds(new Set(ids))` — if `sorted` omits folders, folders are never deselected.
**Why it happens:** `AssetListView` only sees assets, not folders. Select-all only affects assets.
**How to avoid:** This is the current behaviour and is acceptable. Document that select-all / deselect-all only affects visible assets in list view; folder selection is only via checkbox click or rubber-band.

### Pitfall 5: Tailwind `checked:bg-[url(...)]` Purged in Production

**What goes wrong:** Custom `checked:bg-[url(...)]` class works in dev but disappears in prod build.
**Why it happens:** If the class is computed/templated rather than written as a complete string, Tailwind JIT won't detect it.
**How to avoid:** Write the full class string as a literal, or use `@layer utilities` in `globals.css` to define a named utility. Prefer the `div + Lucide Check` pattern (already used in `AssetCard`) which avoids this problem entirely.

---

## Code Examples

### Current Action Bar in FolderBrowser (lines 847–872)

```tsx
// Source: FolderBrowser.tsx lines 847–872 (direct read)
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 bg-frame-card border border-frame-border rounded-2xl shadow-2xl">
    <span className="text-sm text-white font-medium mr-1">{selectedIds.size} selected</span>
    <button onClick={handleOpenMoveModal} ...>Move</button>
    <button onClick={handleDeleteSelected} ...>Delete</button>
    <button onClick={() => setSelectedIds(new Set())} ...><X /></button>
  </div>
)}
```

Add "Download" button between "Move" and "Delete" — consistent button styling.

### Current Canvas Context Menu (lines 716–726)

```tsx
// Source: FolderBrowser.tsx lines 716–726 (direct read)
{canvasMenu && (
  <ContextMenu
    position={canvasMenu}
    onClose={() => setCanvasMenu(null)}
    items={[
      { label: 'New Folder', icon: <Plus />, onClick: () => setShowCreateFolder(true) },
      { label: 'Upload files', icon: <Upload />, onClick: () => fileInputRef.current?.click() },
      { label: 'Upload folder', icon: <FolderOpen />, onClick: () => folderInputRef.current?.click() },
    ]}
  />
)}
```

Add `{ label: 'Download all', icon: <Download />, onClick: handleDownloadAll }` — where `handleDownloadAll` iterates `assets` array (already in scope).

### Current Select-All Logic in AssetListView (lines 81–89)

```typescript
// Source: AssetListView.tsx lines 81–89 (direct read)
const allSelected = sorted.length > 0 && sorted.every(a => selectedIds?.has(a.id));
const someSelected = !allSelected && sorted.some(a => selectedIds?.has(a.id));

function handleSelectAllClick(e: React.MouseEvent) {
  e.stopPropagation();
  if (onSelectAll) {
    onSelectAll(allSelected ? [] : sorted.map(a => a.id));
  }
}
```

This logic is **already correct**. `onSelectAll([])` is called when `allSelected` is true. The bug is in the checkbox `onClick` handler (line 108–110): it calls `handleSelectAllClick` but the `<input>` also has `onChange={() => {}}` which suppresses the native toggle. Verify the click reaches `handleSelectAllClick` — it should, since `onClick` is set. If toggle isn't working, the issue is a missing `onSelectAll` prop being passed from FolderBrowser (line 811 passes `onSelectAll={(ids) => setSelectedIds(new Set(ids))}`). This is also correct. **Select-all toggle may already work** — needs verification before writing new code.

### AssetCard Checkbox (already custom-styled, lines 248–259)

```tsx
// Source: AssetCard.tsx lines 248–259 (direct read)
<div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
  isSelected ? 'bg-frame-accent border-frame-accent' : 'bg-black/60 border-white/60 backdrop-blur-sm'
}`}>
  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
</div>
```

This is the pattern to replicate in `AssetListView` row checkboxes and the header select-all.

### Review Page Asset Grid (lines 339–344)

```tsx
// Source: /review/[token]/page.tsx lines 339–344 (direct read)
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
  {data.assets.map((asset) => (
    <AssetCard key={asset.id} asset={asset} onClick={() => handleSelectAsset(asset)} />
  ))}
</div>
```

For REQ-12F: add a download button overlay or below each card, conditional on `data.reviewLink.allowDownloads`. Since `AssetCard` doesn't expose a download prop, either (a) add an `allowDownload` prop to `AssetCard` or (b) render a separate download button alongside each `AssetCard`. Option (b) avoids modifying `AssetCard` and keeps review-page concerns isolated.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `accent-color` CSS for checkbox | `appearance-none` + custom Tailwind | Tailwind v3+ | Full control over checkbox appearance |
| `window.open(url)` for download | `<a download href={url}>` + fetch-blob fallback | Always | `download` attribute gives filename hint; blob ensures forced download |

---

## Open Questions

1. **Does select-all toggle already work?**
   - What we know: The logic in `AssetListView.handleSelectAllClick` at line 84–89 correctly calls `onSelectAll([])` when `allSelected`. The prop is wired in `FolderBrowser` line 811.
   - What's unclear: Whether the reported bug is the toggle logic or a rendering issue.
   - Recommendation: The planner should add a "verify first, fix if needed" task step. The code looks correct — the fix may be zero lines.

2. **GCS signed URL Content-Disposition behaviour**
   - What we know: Existing `handleDownload` in `AssetCard` and `AssetListRow` uses the direct anchor pattern and reportedly works for navigation (user can view assets). Whether GCS sends `Content-Disposition: attachment` is unknown without runtime testing.
   - What's unclear: Whether existing downloads trigger a save dialog or open in tab.
   - Recommendation: Implement the fetch-blob fallback only for the new download entry points (action bar bulk download, review page button). Leave existing `AssetCard`/`AssetListRow` handlers as-is unless bugs are reported.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 12 is purely client-side component changes with no new external dependencies, CLI tools, databases, or services required. All downloads use browser-native APIs (`fetch`, `URL.createObjectURL`, `<a download>`).

---

## Validation Architecture

No test framework is installed in this project (no jest, vitest, or pytest entries in `package.json`; no test files found in `src/`). Only linting via `eslint-config-next`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None |
| Quick run command | `npm run lint` (only linting available) |
| Full suite command | `npm run build` (type-check + build) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-12A | Download button appears when items selected; clicking downloads files | manual-only | — | N/A |
| REQ-12B | Header checkbox toggles select-all / deselect-all; indeterminate on partial | manual-only | — | N/A |
| REQ-12C | Right-click canvas → "Download all" downloads every folder asset | manual-only | — | N/A |
| REQ-12D | Right-click menu closes on outside click | manual-only | — | N/A |
| REQ-12E | Checkboxes show frame-accent fill when checked | manual-only | `npm run build` (TS type errors would surface) | N/A |
| REQ-12F | Three-dot Download works; review page shows download button when allowDownloads=true | manual-only | — | N/A |
| REQ-12G | No TS errors introduced by React.memo / useCallback changes | `npm run build` | `npm run build` | N/A |

**Manual-only justification:** No test infrastructure exists. All REQs require browser interaction (file downloads, click events, visual checkbox states). Unit tests for these would require jsdom + @testing-library/react which are not installed.

### Sampling Rate
- **Per task commit:** `npm run lint`
- **Per wave merge:** `npm run build`
- **Phase gate:** `npm run build` green + manual verification of each REQ before `/gsd:verify-work`

### Wave 0 Gaps

None — no test infrastructure to create. Phase relies on lint + build for automated checks, manual browser testing for functional verification.

---

## Sources

### Primary (HIGH confidence)

- Direct source read: `src/components/files/FolderBrowser.tsx` — selection state, action bar, canvas context menu, asset render
- Direct source read: `src/components/files/AssetListView.tsx` — select-all logic, checkbox rendering, row download handler
- Direct source read: `src/components/files/AssetCard.tsx` — three-dot menu, custom grid checkbox, download handler
- Direct source read: `src/components/ui/ContextMenu.tsx` — full dismiss implementation (mousedown + keydown + scroll)
- Direct source read: `src/app/review/[token]/page.tsx` — review page asset grid, `allowDownloads` field available
- Direct source read: `tailwind.config.ts` — confirmed Tailwind v3, `frame-accent: #7a00df`
- Direct source read: `package.json` — confirmed React 18, Next.js 14.2.5, Tailwind ^3.4.1, no test framework

### Secondary (MEDIUM confidence)

- Tailwind v3 `appearance-none` + `checked:` variant support: documented in Tailwind v3 release, confirmed by project's Tailwind version
- Browser `download` attribute cross-origin restriction: MDN Web Docs standard (well-known, HIGH confidence)
- Fetch-blob download pattern: standard browser API, widely documented

---

## Metadata

**Confidence breakdown:**
- Download mechanics: HIGH — implementation pattern already exists in codebase; verified by direct read
- Select-all toggle: HIGH — logic already correct in source; may need verification not new code
- Checkbox styling: HIGH — Tailwind v3 confirmed; AssetCard pattern already in codebase as reference
- ContextMenu dismiss: HIGH — root cause identified by code inspection; two verified fix approaches
- React.memo performance: HIGH — specific lines identified for wrapping; inline handler instability pattern confirmed
- Review page download: HIGH — `allowDownloads` field confirmed on `ReviewLink` type; no API changes needed

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable tech; no external dependencies)
