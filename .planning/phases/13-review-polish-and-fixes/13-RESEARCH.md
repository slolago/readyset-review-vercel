# Phase 13: review-polish-and-fixes - Research

**Researched:** 2026-04-07
**Domain:** GCS signed URLs, React portals / overflow clipping, guest access control
**Confidence:** HIGH

## Summary

Phase 13 targets three distinct but small bugs in the review link experience. All three bugs are well-understood after reading the actual source, and none require third-party research — they are implementation gaps in existing code.

**Bug A (Downloads):** The current `generateReadSignedUrl` function generates a plain read URL with no `Content-Disposition` header, so browsers open the file inline instead of saving it. The fix is to add a `responseDisposition: 'attachment; filename="<name>"'` option when signing URLs for download. This option is confirmed present in the installed `@google-cloud/storage` v7.19.0 type definitions and implementation, where it maps to the `response-content-disposition` query parameter on the signed URL.

**Bug B (Dropdown clipping):** The `Dropdown` component renders its menu with `position: absolute; top: full` inside the `AssetCard` thumbnail `<div>`, which carries `overflow-hidden`. This parent clips the dropdown menu before it can render visibly. The fix is a portal-based approach: render the dropdown panel into `document.body` using `ReactDOM.createPortal`, positioned via `getBoundingClientRect()`. Alternatively, a simpler fix is to remove `overflow-hidden` from the thumbnail container and replace the radius-clipping with a wrapper technique — but portals are cleaner because the same issue could arise anywhere the card is embedded.

**Bug C (Guest read-only):** On the review page, `AssetCard` is rendered directly with no `isGuest` prop gating. The `AssetCard` component always renders its three-dot `Dropdown` (Rename, Copy to, Duplicate, Upload new version, Manage version stack, Delete) on the card's thumbnail hover area. On the review page, guests see — and can trigger — the full editing menu. The page does check `data.reviewLink.allowDownloads` before showing a dedicated download button, but the `AssetCard`'s own `Dropdown` is passed through unconditionally. The fix is to not render `AssetCard`'s editing dropdown in the review context, or to pass a restricted item list.

**Primary recommendation:** Fix all three bugs via targeted edits: (A) add a `generateDownloadSignedUrl` helper in `gcs.ts` that sets `responseDisposition`, call it selectively from the review-link and asset routes when downloads are intended; (B) use `ReactDOM.createPortal` in `Dropdown.tsx` to escape overflow containment; (C) add an `isReadOnly` / `hideActions` prop to `AssetCard` that suppresses the three-dot menu, and pass it from the review page.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google-cloud/storage` | 7.19.0 (installed) | GCS signed URL generation | Already used; `responseDisposition` confirmed present |
| `react-dom` | bundled with React 18 | `ReactDOM.createPortal` | Canonical React escape hatch for overlay elements |
| Next.js | 14.2.5 | App framework | Already used |

**Installation:** No new packages required.

---

## Architecture Patterns

### Bug A: Download Signed URL

The `generateReadSignedUrl` function in `src/lib/gcs.ts` currently takes only `gcsPath` and `expiresInMinutes`. The `@google-cloud/storage` v4 `getSignedUrl` config accepts `responseDisposition?: string` (type-confirmed from installed package at `node_modules/@google-cloud/storage/build/cjs/src/file.d.ts`). When set, it appends `response-content-disposition=<value>` to the signed URL query string, causing GCS to serve the `Content-Disposition` header with that value. Browsers interpret `attachment; filename="<name>"` as a save-to-disk instruction.

Two strategies are available:

**Strategy 1 — New function in gcs.ts (recommended):** Add `generateDownloadSignedUrl(gcsPath, filename, expiresInMinutes)` that calls `getSignedUrl` with `responseDisposition: \`attachment; filename="${filename}"\``. Call this from the review-link route (and the assets route) when signing URLs specifically for download. The existing `generateReadSignedUrl` (no disposition) continues to be used for in-browser playback/preview.

**Strategy 2 — Client-side fetch+blob:** Have the download button call a `/api/download?assetId=...` endpoint that proxies the GCS bytes and sets `Content-Disposition` in the API response headers. This avoids needing a separate signed URL but adds server-side bandwidth cost for every download.

Strategy 1 is preferred: no extra bandwidth through the server, clean separation between read URLs and download URLs.

**Pattern:**
```typescript
// src/lib/gcs.ts — new function
export async function generateDownloadSignedUrl(
  gcsPath: string,
  filename: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);

  const safeName = filename.replace(/"/g, '\\"');
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseDisposition: `attachment; filename="${safeName}"`,
  });

  return url;
}
```

In `src/app/api/review-links/[token]/route.ts`, when `link.allowDownloads` is true, sign with `generateDownloadSignedUrl` instead of `generateReadSignedUrl`. When `allowDownloads` is false, sign with `generateReadSignedUrl` so the video/image still plays inline.

The review page currently uses a single `signedUrl` per asset for both preview (thumbnail load, VideoPlayer src) and download (the download button). To keep preview working, the API needs to return **two** URLs when downloads are enabled: `signedUrl` (read, no disposition — used by the player) and `downloadUrl` (attachment disposition — used only by the download button).

The download button in `page.tsx` (line 347) already reads `(asset as any).signedUrl`. After the fix it should read `(asset as any).downloadUrl` when present, falling back to `signedUrl`.

### Bug B: Dropdown Clipping (overflow-hidden parent)

**Root cause confirmed:** The `Dropdown` component inside `AssetCard` sits inside `<div className="... overflow-hidden">` (the thumbnail container at line 213 of `AssetCard.tsx`). Since the dropdown menu is `position: absolute; top: 100%`, it is clipped by that ancestor's overflow boundary.

**Pattern — ReactDOM.createPortal:**

The dropdown panel should be rendered into `document.body` so it escapes all ancestor overflow constraints. Position is computed from the trigger element's `getBoundingClientRect()`.

```typescript
// src/components/ui/Dropdown.tsx — portal approach
import { createPortal } from 'react-dom';
import { useRef, useState, useEffect } from 'react';

// Inside the component, replace the absolute-positioned panel with:
const [rect, setRect] = useState<DOMRect | null>(null);
const triggerRef = useRef<HTMLDivElement>(null);

// When open, compute position from trigger
useEffect(() => {
  if (open && triggerRef.current) {
    setRect(triggerRef.current.getBoundingClientRect());
  }
}, [open]);

// Panel rendered via portal
{open && rect && typeof document !== 'undefined' && createPortal(
  <div
    style={{
      position: 'fixed',
      top: rect.bottom + 6,
      right: align === 'right' ? window.innerWidth - rect.right : undefined,
      left: align === 'left' ? rect.left : undefined,
      zIndex: 9999,
    }}
    className="bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
  >
    {/* items */}
  </div>,
  document.body
)}
```

`position: fixed` with `top: rect.bottom + offset` and `right: window.innerWidth - rect.right` positions the menu below and right-aligned with the trigger, independent of any scroll or overflow ancestor.

**Outside-click handling** must account for the portal: the existing `mousedown` handler on `ref.current` will not contain the portal panel. The handler needs to also check whether the click target is inside the portal panel. Use a separate `ref` for the panel div.

**Anti-pattern to avoid:** Using `overflow: visible` on the thumbnail container — this breaks the rounded corner mask and causes the video element to bleed outside the card bounds.

### Bug C: Guest Read-Only on Review Page

**Current state:** `AssetCard` is rendered at line 342 of `page.tsx` with only `asset` and `onClick` props. No props disable the three-dot `Dropdown`. The dropdown always renders on hover and shows: Rename, Copy to, Duplicate, Upload new version, Manage version stack, Download, Delete. Guests on the review page can see and click all of these.

The API calls inside `AssetCard` (rename, delete, copy, duplicate, upload) all use `getIdToken()` from `useAuth()`, which will return `null` for unauthenticated guests, so the operations would fail with 401. However the UI still shows the options, which is confusing and wrong.

**Fix approach — `hideActions` prop on AssetCard:**

Add a `hideActions?: boolean` prop to `AssetCard`. When true, suppress the three-dot `Dropdown` and the `ContextMenu`. The download action in the review page is handled by a separate button outside `AssetCard`, so there is no need to render a partial menu.

```typescript
// AssetCard interface addition
hideActions?: boolean;

// In the JSX — wrap the Dropdown render:
{!isUploading && !hideActions && (
  <div className="absolute top-2 right-2 ...">
    <Dropdown ... />
  </div>
)}
```

The `ContextMenu` (right-click) on the card div should also be suppressed when `hideActions` is true:
```typescript
onContextMenu={isUploading || hideActions ? undefined : (e) => { ... }}
```

In `page.tsx`, pass `hideActions` to all `AssetCard` instances rendered within the review page:
```tsx
<AssetCard asset={asset} onClick={() => handleSelectAsset(asset)} hideActions />
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Escape overflow clipping | Custom CSS hacks (overflow: visible, z-index escalation) | `ReactDOM.createPortal` | Portal is the canonical React solution; CSS hacks break card thumbnail clipping |
| Force-download from GCS | Proxy endpoint that streams bytes | `responseDisposition` on signed URL | Zero server bandwidth; GCS serves directly with correct headers |
| Guest access control | Separate guest-only component duplicating AssetCard | `hideActions` prop on existing AssetCard | Less duplication; review page already renders AssetCard |

---

## Common Pitfalls

### Pitfall 1: Using one signed URL for both playback and download
**What goes wrong:** If `responseDisposition: attachment` is added to the single `signedUrl`, the `<video src="...">` element in `VideoPlayer` will receive a download-disposition URL. Some browsers will refuse to play a video from a URL that has `Content-Disposition: attachment`, or will trigger a save dialog instead of playing.
**Why it happens:** The API currently returns one `signedUrl` used for both the player and the download button.
**How to avoid:** Return two distinct URLs: `signedUrl` (no disposition, for playback) and `downloadUrl` (with disposition, for saving). The API route must generate both when `allowDownloads` is true. The `page.tsx` download button should use `downloadUrl`.

### Pitfall 2: Portal dropdown not closing on outside click
**What goes wrong:** The current `mousedown` handler checks `ref.current.contains(e.target)`. Once the menu is portaled to `document.body`, the menu panel is NOT a descendant of `ref.current`. Clicking menu items triggers the outside-click handler and closes the menu before `onClick` fires.
**Why it happens:** Portal children are outside the trigger's DOM subtree even though they're logically "inside" the component.
**How to avoid:** Add a second `panelRef` for the portaled panel div and update the outside-click handler: close only when the click is outside BOTH `ref.current` AND `panelRef.current`.

### Pitfall 3: Portal positioning on scroll
**What goes wrong:** `fixed` positioning via `getBoundingClientRect()` is computed once at open time. If the page scrolls after the menu opens (unlikely in this UI but possible), the menu drifts.
**Why it happens:** `fixed` positions relative to viewport, but if the user scrolls while the dropdown is open the trigger moves but the menu does not.
**How to avoid:** Add a `scroll` and `resize` event listener that closes the dropdown when either fires, or recomputes `rect`. Given this is an asset grid page with predictable scroll behavior, closing on scroll is sufficient.

### Pitfall 4: `a.download` attribute not forcing download for cross-origin URLs
**What goes wrong:** The current download button in `page.tsx` creates `<a href="signedUrl" download="name">`. The `download` attribute only works for same-origin URLs. GCS signed URLs are on `storage.googleapis.com` — a different origin. Browsers ignore the `download` attribute for cross-origin links.
**Why it happens:** Browser security policy restricts `download` attribute to same-origin URLs.
**How to avoid:** The `responseDisposition` approach on the signed URL is the correct fix because it sets the header server-side (GCS), making the browser save the file regardless of the `download` attribute. The `a.download` attribute can be kept as a fallback hint but the disposition header is what actually triggers the save dialog.

### Pitfall 5: Filename encoding in Content-Disposition
**What goes wrong:** Asset filenames may contain spaces, Unicode, or special characters. An unencoded filename in `Content-Disposition` can cause malformed headers.
**Why it happens:** HTTP header value parsing is strict.
**How to avoid:** Use RFC 5987 encoding for non-ASCII names, or at minimum escape double-quotes. For this codebase, a simple `filename.replace(/"/g, '\\"')` handles the most common case. For robust handling, consider `encodeURIComponent` plus the `filename*=UTF-8''` syntax, but simple escaping covers 99% of real filenames here.

---

## Code Examples

### Confirmed type signature from installed package
```typescript
// From node_modules/@google-cloud/storage/build/cjs/src/file.d.ts (v7.19.0)
interface GetSignedUrlConfig {
  contentType?: string;
  expires: string | number | Date;
  accessibleAt?: string | number | Date;
  extensionHeaders?: http.OutgoingHttpHeaders;
  promptSaveAs?: string;
  responseDisposition?: string;   // <-- confirmed present
  responseType?: string;
  queryParams?: Query;
}
```

### Current download button in review page (line 343-358 of page.tsx)
```typescript
// Current — uses a.download which is ignored cross-origin
{data.reviewLink.allowDownloads && (asset as any).signedUrl && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      const url = (asset as any).signedUrl as string;
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.name;     // ignored for cross-origin GCS URLs
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }}
  >
    Download
  </button>
)}
```

### Current generateReadSignedUrl (gcs.ts lines 39-54)
```typescript
// No responseDisposition — browser opens inline
export async function generateReadSignedUrl(
  gcsPath: string,
  expiresInMinutes: number = 720
): Promise<string> {
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    // no responseDisposition → Content-Disposition not set → browser plays inline
  });
  return url;
}
```

### Current Dropdown position (Dropdown.tsx lines 40-44)
```typescript
// Positioned absolute inside overflow-hidden parent — gets clipped
<div
  className={cn(
    'absolute top-full mt-1.5 z-50 bg-frame-card ...',
    align === 'right' ? 'right-0' : 'left-0'
  )}
>
```

---

## Implementation Plan Summary

Three targeted edits, best done as three separate plans:

**Plan 01 — Download fix:**
1. Add `generateDownloadSignedUrl(gcsPath, filename, expiresInMinutes)` to `src/lib/gcs.ts`
2. In `src/app/api/review-links/[token]/route.ts`: when `link.allowDownloads` is true, generate both `signedUrl` (read, no disposition) and `downloadUrl` (attachment disposition) per asset
3. In `src/app/review/[token]/page.tsx`: update download button to use `(asset as any).downloadUrl ?? (asset as any).signedUrl`
4. In `src/components/files/AssetCard.tsx`: update `handleDownload` to prefer `(asset as any).downloadUrl`
5. In `src/components/files/AssetListView.tsx`: same update to `handleDownload`

**Plan 02 — Dropdown portal fix:**
1. Rewrite `src/components/ui/Dropdown.tsx` to use `ReactDOM.createPortal` for the menu panel
2. Compute `fixed` position from `triggerRef.current.getBoundingClientRect()`
3. Update outside-click handler to check both trigger ref and panel ref
4. Add scroll/resize listener that closes the dropdown

**Plan 03 — Guest read-only:**
1. Add `hideActions?: boolean` prop to `AssetCardProps` in `AssetCard.tsx`
2. Wrap the `Dropdown` render and `onContextMenu` handler with `!hideActions` guard
3. In `src/app/review/[token]/page.tsx`: pass `hideActions` to all `AssetCard` renders

---

## Open Questions

1. **Should `AssetCard.tsx` in the main (authenticated) app also get download URLs?**
   - What we know: `AssetCard.handleDownload` uses `signedUrl` which has no disposition. Authenticated users may also hit the same "opens in browser" issue via the main app.
   - What's unclear: Whether the main-app download was working before (possibly browsers handle `a.download` on same-origin differently, or the internal asset viewer uses a different mechanism).
   - Recommendation: Fix `handleDownload` in `AssetCard` and `AssetListView` to prefer `downloadUrl` if present, falling back to `signedUrl`. The asset API routes (`/api/assets/route.ts` and `/api/assets/[assetId]/route.ts`) could also be updated to return `downloadUrl`, but this is lower priority — main-app users are authenticated and less likely to hit the issue.

2. **Does the review page need to support download from the viewer (single asset open) state?**
   - What we know: The download button only appears in the grid view (asset list). When a single asset is open in the viewer, there is no download affordance on the review page.
   - What's unclear: Whether this is intentional or an oversight.
   - Recommendation: Out of scope for this phase. The grid download button fix covers the reported issue.

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. All fixes are code edits to existing files using already-installed packages.

---

## Validation Architecture

No test framework is installed in this project (no `jest`, `vitest`, `playwright`, or test directories found). Validation is manual.

### Phase Requirements to Verify Manually

| Req | Behavior | How to Verify |
|-----|----------|---------------|
| A | Download button saves file to disk | Open a review link, hover an asset, click Download — file should appear in Downloads folder, not open a browser tab |
| A | Video player still plays inline | After download URL fix, confirm the VideoPlayer still plays — `signedUrl` (no disposition) must still be returned |
| B | Three-dot menu visible on asset cards in review page | Hover an asset card in the review page — the `...` button appears and the dropdown panel is not clipped |
| B | Dropdown works in main app too | Verify AssetCard three-dot menu still opens in the authenticated project browser |
| C | No editing actions visible to guest | On review page as guest, hover asset card — no `...` button, no context menu on right-click |
| C | Guest can still leave comments | Confirm CommentSidebar is still functional (readOnly controlled by `allowComments` flag, unchanged) |

### Wave 0 Gaps

None — no test infrastructure exists. All verification is manual browser testing.

---

## Sources

### Primary (HIGH confidence)
- Installed package `node_modules/@google-cloud/storage/build/cjs/src/file.d.ts` — confirmed `responseDisposition?: string` in `GetSignedUrlConfig`
- Installed package `node_modules/@google-cloud/storage/build/cjs/src/file.js` — confirmed maps to `queryParams['response-content-disposition']`
- Direct source reading: `src/lib/gcs.ts`, `src/app/api/review-links/[token]/route.ts`, `src/app/review/[token]/page.tsx`, `src/components/ui/Dropdown.tsx`, `src/components/files/AssetCard.tsx`

### Secondary (MEDIUM confidence)
- React docs (training knowledge, stable API): `ReactDOM.createPortal` is the canonical solution for rendering outside overflow-containing ancestors — consistent with React 18 documentation

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Bug A (download): HIGH — `responseDisposition` confirmed in installed package types and implementation; root cause (cross-origin `a.download` ignored) is well-documented browser behavior
- Bug B (dropdown clipping): HIGH — `overflow-hidden` on thumbnail container confirmed by source reading; portal approach is canonical React
- Bug C (guest read-only): HIGH — confirmed by reading page.tsx and AssetCard.tsx; no auth guard on AssetCard props in review context

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no external dependencies)
