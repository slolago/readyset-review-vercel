# Phase 33: selection-review-links - Research

**Researched:** 2026-04-08
**Domain:** Review link creation — asset selection scope, Firestore schema extension, review page guard
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-03 | User can generate a review link scoped to a manually selected set of assets (not the full folder) | `ReviewLink` type in `src/types/index.ts` currently lacks `assetIds`; adding it and branching the GET handler is the full data-model surface. Selection state (`selectedIds: Set<string>`) already lives in `FolderBrowser` and drives the existing multi-select toolbar. |
</phase_requirements>

## Summary

Phase 33 lets users generate a review link for a hand-picked subset of assets rather than an entire folder. The work spans three areas: (1) a new `assetIds?: string[]` field on the `ReviewLink` Firestore document; (2) branching the review-link GET handler to use `Promise.all(getDoc)` instead of a collection query when `assetIds` is present; and (3) wiring the existing multi-select toolbar in `FolderBrowser` to open `CreateReviewLinkModal` with the selected IDs, plus rendering a placeholder in the review page when a linked asset has been deleted.

The existing multi-select infrastructure is complete. `FolderBrowser` already tracks `selectedIds: Set<string>` and renders a fixed bottom toolbar with action buttons (Compare, Move, Download, Delete). Adding a "Create review link" button to this toolbar is a one-line change. `CreateReviewLinkModal` already accepts `projectId` and `folderId`; it needs a new optional `assetIds?: string[]` prop. The GET handler already branches on `link.folderId`; it needs a second branch for `link.assetIds`.

The review page (`src/app/review/[token]/page.tsx`) renders the full asset grid directly — it already has no folder browser sidebar. The "no folder browser" success criterion is already satisfied for the review page; the folder browser is only visible in the internal review-link management page (`ReviewLinkFolderBrowser`), which uses the authenticated app shell. No routing or layout changes are needed.

**Primary recommendation:** Add `assetIds?: string[]` to the `ReviewLink` type, branch the GET handler with `Promise.all(getDoc)`, add the toolbar button to `FolderBrowser`, extend `CreateReviewLinkModal` with an `assetIds` prop, and add a deleted-asset placeholder in the review page grid.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14 | API route extension + review page | Project baseline |
| Firebase Admin SDK | — | Firestore `getDoc` per-ID fetch | Existing pattern; `in` query capped at 30 |
| React | 18 | Toolbar button + modal prop extension | Project baseline |
| Tailwind CSS | 3 | Placeholder card styling | Project baseline |
| lucide-react | — | Link / Share icon for toolbar button | Already imported in FolderBrowser |

No new npm packages required.

### Anti-Patterns to Avoid
- **Firestore `in` query for assetIds:** The `in` operator is capped at 30 items. The 50-asset cap for this feature means this would break for selections of 31–50. STATE.md explicitly documents: "Phase 33 (REVIEW-03): Firestore `in` query capped at 30 — use `Promise.all(getDoc)` instead."
- **Storing folderId alongside assetIds:** When `assetIds` is set, `folderId` should be `null` (or ignored). Mixing both in the same document creates ambiguous branching in the GET handler.
- **New review page route:** The existing `/review/[token]` page already renders with no folder browser sidebar. Do not create a parallel route for selection-scoped links.

## Architecture Patterns

### Recommended File Changes
```
src/
├── types/index.ts                         # Add assetIds?: string[] to ReviewLink
├── app/api/review-links/
│   ├── route.ts                           # Accept assetIds in POST body; store on doc
│   └── [token]/route.ts                   # Branch: if assetIds → Promise.all(getDoc)
├── components/review/
│   └── CreateReviewLinkModal.tsx          # Add assetIds?: string[] prop; send in POST body
├── components/files/
│   └── FolderBrowser.tsx                  # Toolbar: add "Review link" button; pass selectedIds
└── app/review/[token]/page.tsx            # Deleted-asset placeholder in grid
```

No new files required.

### Pattern 1: ReviewLink Schema Extension

Add `assetIds?: string[]` to the `ReviewLink` type. When populated it means the link exposes exactly those asset IDs, regardless of folder.

```typescript
// src/types/index.ts
export interface ReviewLink {
  id: string;
  token: string;
  projectId: string;
  folderId: string | null;
  assetIds?: string[];          // NEW — if set, link is scoped to these IDs only
  name: string;
  createdBy: string;
  expiresAt: Timestamp | null;
  allowComments: boolean;
  allowDownloads?: boolean;
  allowApprovals?: boolean;
  showAllVersions?: boolean;
  password?: string;
  createdAt: Timestamp;
}
```

### Pattern 2: POST /api/review-links — Accept assetIds

```typescript
// src/app/api/review-links/route.ts  (POST handler)
const { name, projectId, folderId, allowComments, password, expiresAt,
        allowDownloads, allowApprovals, showAllVersions,
        assetIds } = await request.json();   // NEW

const data: Record<string, unknown> = {
  token,
  name,
  projectId,
  folderId: folderId || null,
  assetIds: assetIds?.length ? assetIds : null,   // NEW — null when not a selection link
  createdBy: user.id,
  allowComments: allowComments !== false,
  allowDownloads: allowDownloads === true,
  allowApprovals: allowApprovals === true,
  showAllVersions: showAllVersions === true,
  expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
  createdAt: Timestamp.now(),
};
```

### Pattern 3: GET /api/review-links/[token] — Branch on assetIds

The critical change: when `link.assetIds` is present, fetch each asset individually using `Promise.all(getDoc)` instead of a collection query. This sidesteps the Firestore `in` query 30-item cap and handles the 50-asset ceiling correctly.

```typescript
// src/app/api/review-links/[token]/route.ts
let assetsWithUrls: any[];

if (link.assetIds && link.assetIds.length > 0) {
  // Selection-scoped link — fetch by individual doc IDs
  const docs = await Promise.all(
    link.assetIds.map((id: string) => db.collection('assets').doc(id).get())
  );
  assetsWithUrls = await Promise.all(
    docs.map(async (d) => {
      if (!d.exists) {
        // Asset was deleted — return a placeholder
        return { id: d.id, _deleted: true };
      }
      const asset = { id: d.id, ...d.data() } as any;
      if (asset.status !== 'ready') return null;   // skip uploading assets
      if (asset.gcsPath) {
        try { asset.signedUrl = await generateReadSignedUrl(asset.gcsPath); } catch {}
      }
      if (asset.thumbnailGcsPath) {
        try { asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailGcsPath); } catch {}
      }
      if (asset.gcsPath && link.allowDownloads) {
        try { asset.downloadUrl = await generateDownloadSignedUrl(asset.gcsPath, asset.name); } catch {}
      }
      return asset;
    })
  );
  // Remove null entries (non-ready assets) but keep _deleted placeholders
  assetsWithUrls = assetsWithUrls.filter(Boolean);
} else {
  // Existing folder-scoped or project-scoped path (unchanged)
  let assetsQuery = db.collection('assets').where('projectId', '==', link.projectId).where('status', '==', 'ready');
  if (link.folderId) {
    assetsQuery = assetsQuery.where('folderId', '==', link.folderId) as any;
  }
  const assetsSnap = await assetsQuery.get();
  assetsWithUrls = await Promise.all(
    assetsSnap.docs.map(async (d) => {
      const asset = { id: d.id, ...d.data() } as any;
      // ... existing signed URL logic ...
      return asset;
    })
  );
}
```

Note: The existing version-grouping logic (lines 64-74 of the current GET handler) should only run for folder-scoped links. Selection-scoped links expose the exact selected assets — no grouping by `versionGroupId`.

### Pattern 4: CreateReviewLinkModal — assetIds Prop

```typescript
// src/components/review/CreateReviewLinkModal.tsx
interface CreateReviewLinkModalProps {
  projectId: string;
  folderId?: string | null;
  assetIds?: string[];          // NEW — if set, creates a selection-scoped link
  onClose: () => void;
}
```

In `handleCreate`, pass `assetIds` to the POST body:

```typescript
body: JSON.stringify({
  name,
  projectId,
  folderId: assetIds?.length ? null : (folderId || null),  // folderId is null for selection links
  assetIds: assetIds?.length ? assetIds : undefined,
  allowComments,
  allowDownloads,
  allowApprovals,
  showAllVersions,
  password: password || undefined,
}),
```

If `assetIds` is populated, the modal can display an informational note: "This link will only expose the X selected assets."

### Pattern 5: FolderBrowser Toolbar — Review Link Button

The existing toolbar at `FolderBrowser.tsx` lines 978-1028 adds buttons for Compare, Move, Download, Delete. Add a "Review link" button after Compare, with a 50-asset guard:

```tsx
{/* Review link from selection */}
{(() => {
  const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
  const count = selectedAssets.length;
  const overCap = count > 50;
  return (
    <button
      onClick={() => {
        if (overCap) {
          toast.error('Select 50 or fewer assets to create a review link');
          return;
        }
        setSelectionReviewIds(Array.from(selectedIds));
        setShowReviewModal(true);
      }}
      title={overCap ? 'Select 50 or fewer assets' : 'Create review link from selection'}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        overCap
          ? 'text-white/30 bg-frame-border cursor-not-allowed'
          : 'text-white bg-frame-accent hover:bg-frame-accent/80'
      }`}
    >
      <LinkIcon className="w-3.5 h-3.5" />
      Review link
    </button>
  );
})()}
```

A new `selectionReviewIds` state (or passing `Array.from(selectedIds)` directly at the call site) is needed to pass to `CreateReviewLinkModal`. The simplest approach is to compute `Array.from(selectedIds)` inline when rendering the modal:

```tsx
{showReviewModal && (
  <CreateReviewLinkModal
    projectId={projectId}
    folderId={selectionReviewIds ? null : folderId}
    assetIds={selectionReviewIds ?? undefined}
    onClose={() => { setShowReviewModal(false); setSelectionReviewIds(null); }}
  />
)}
```

This requires a new `selectionReviewIds: string[] | null` state in `FolderBrowser`.

### Pattern 6: Deleted-Asset Placeholder in Review Page

In `src/app/review/[token]/page.tsx`, the asset grid renders `data.assets.map(...)`. When `_deleted: true` is on an asset, render a placeholder instead of `AssetCard`:

```tsx
{data.assets.map((asset: any) =>
  asset._deleted ? (
    <div
      key={asset.id}
      className="aspect-video bg-frame-card border border-frame-border/50 rounded-xl flex flex-col items-center justify-center gap-2 opacity-50"
    >
      <Film className="w-8 h-8 text-frame-textMuted" />
      <p className="text-xs text-frame-textMuted">Asset unavailable</p>
    </div>
  ) : (
    <div key={asset.id} className="relative group">
      <AssetCard asset={asset} onClick={() => handleSelectAsset(asset)} hideActions />
      {/* ... download button ... */}
    </div>
  )
)}
```

`Film` is already imported in the review page.

### Anti-Patterns to Avoid
- **Using Firestore `in` query for assetIds:** Capped at 30. Must use `Promise.all(getDoc)` — explicitly noted in STATE.md.
- **Applying version-grouping logic to selection links:** Selection links expose exact assets chosen by the user. Applying `groups.get(groupId)` de-duplication would silently remove assets from the review link.
- **Disabling the button vs. warning:** Success criterion 4 says "disables or warns". Showing a toast and keeping the button visually in a disabled style (but not `disabled` attribute) is simpler and consistent with how the Compare button works in the existing toolbar.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-ID asset fetching | Custom batch query | `Promise.all(db.collection('assets').doc(id).get())` | Firestore `in` query capped at 30; `getDoc` per-ID is the standard workaround |
| Review link modal | New modal component | Extend existing `CreateReviewLinkModal` with `assetIds` prop | Modal already handles name, toggles, copy-link UX — adding a prop is 10 lines |
| Deleted-asset detection | Separate API or tombstone collection | `!doc.exists` check in GET handler; `_deleted: true` marker in response | Simple, zero-storage, correct |
| 50-asset cap enforcement | Server-side Firestore transaction | Client-side count check in toolbar button | Cap is a UX limit, not a data-integrity rule; server validates `assetIds.length <= 50` as a second guard |

**Key insight:** The `Promise.all(getDoc)` pattern scales correctly to 50 assets with ~50 parallel Firestore reads — each read is a document lookup by ID, which is O(1) in Firestore. This is faster and simpler than a collection query with filtering.

## Common Pitfalls

### Pitfall 1: Firestore `in` query for assetIds
**What goes wrong:** Using `db.collection('assets').where('__name__', 'in', assetIds)` silently drops any IDs beyond the 30th. A selection of 40 assets produces a review link with only 30 assets, with no error.
**Why it happens:** Developers default to collection queries; `in` operator limit is easy to miss.
**How to avoid:** Always use `Promise.all(getDoc)` for assetIds. STATE.md has already called this out. The GET handler must branch on `link.assetIds` before reaching any collection query.
**Warning signs:** Review link shows fewer assets than selected; count mismatch silently accepted.

### Pitfall 2: Version-grouping applied to selection-scoped assets
**What goes wrong:** The existing GET handler groups assets by `versionGroupId` and returns only the head version. If applied to selection links, a user who selects V2 and V3 of the same stack gets only V3 in the review link.
**Why it happens:** The grouping block runs unconditionally in the current handler. The `assetIds` branch must return assets exactly as fetched, with no grouping step.
**How to avoid:** Keep the grouping logic inside the folder-scoped branch only. The assetIds branch returns the docs array directly after URL signing.
**Warning signs:** User selects 3 assets, review link shows only 2.

### Pitfall 3: folderId not nulled when assetIds is set
**What goes wrong:** POST stores both `folderId` and `assetIds` on the Firestore document. The GET handler checks `link.folderId` first and falls through to the folder query, ignoring `assetIds`.
**Why it happens:** The POST handler spreads all fields without clearing `folderId` for selection links.
**How to avoid:** In `CreateReviewLinkModal`, send `folderId: null` when `assetIds?.length > 0`. In the GET handler, check `link.assetIds` before `link.folderId`.
**Warning signs:** Selection link returns all folder assets instead of selected assets.

### Pitfall 4: Review page crashes on deleted asset
**What goes wrong:** `AssetCard` receives a partial object with `_deleted: true` but no `name`, `type`, or other required fields, causing a runtime error or blank card.
**Why it happens:** The asset grid maps over all `data.assets` entries without checking `_deleted`.
**How to avoid:** Check `asset._deleted` before rendering `AssetCard`. Render the placeholder div instead. This check must be in both the review page (`/review/[token]`) and the internal `ReviewLinkFolderBrowser` if selection links are ever accessible through that component.
**Warning signs:** Review page throws `Cannot read properties of undefined (reading 'type')`.

### Pitfall 5: `selectionReviewIds` stale when modal is reopened
**What goes wrong:** `FolderBrowser` stores `selectionReviewIds` in state. If the user dismisses the modal, changes the selection, then reopens it, the modal may show the old IDs.
**Why it happens:** The state is set once and not cleared on close.
**How to avoid:** Reset `selectionReviewIds` to `null` in the modal's `onClose` handler. Compute the array fresh from `selectedIds` each time the button is clicked (before setting state).
**Warning signs:** Review link creates a link scoped to previously selected assets after re-selecting.

## Code Examples

### GET handler — full assetIds branch
```typescript
// Source: src/app/api/review-links/[token]/route.ts
if (link.assetIds && link.assetIds.length > 0) {
  const docs = await Promise.all(
    (link.assetIds as string[]).map((id) => db.collection('assets').doc(id).get())
  );
  assetsWithUrls = (
    await Promise.all(
      docs.map(async (d) => {
        if (!d.exists) return { id: d.id, _deleted: true };
        const asset = { id: d.id, ...d.data() } as any;
        if (asset.status !== 'ready') return null;
        if (asset.gcsPath) {
          try { asset.signedUrl = await generateReadSignedUrl(asset.gcsPath); } catch {}
        }
        if (asset.thumbnailGcsPath) {
          try { asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailGcsPath); } catch {}
        }
        if (asset.gcsPath && link.allowDownloads) {
          try { asset.downloadUrl = await generateDownloadSignedUrl(asset.gcsPath, asset.name); } catch {}
        }
        return asset;
      })
    )
  ).filter(Boolean);
} else {
  // existing folder/project query branch — unchanged
}
```

### FolderBrowser toolbar addition
```tsx
// Source pattern: FolderBrowser.tsx multi-select toolbar (around line 978)
{(() => {
  const count = selectedIds.size;
  const overCap = count > 50;
  return (
    <button
      onClick={() => {
        if (overCap) {
          toast.error('Select 50 or fewer assets to create a review link');
          return;
        }
        setSelectionReviewIds(Array.from(selectedIds));
        setShowReviewModal(true);
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        overCap ? 'text-white/30 bg-frame-border cursor-not-allowed' : 'text-white bg-frame-accent hover:bg-frame-accent/80'
      }`}
    >
      <LinkIcon className="w-3.5 h-3.5" />
      Review link
    </button>
  );
})()}
```

### Deleted-asset placeholder in review page
```tsx
// Source pattern: src/app/review/[token]/page.tsx asset grid
{data.assets.map((asset: any) =>
  asset._deleted ? (
    <div
      key={asset.id}
      className="aspect-video bg-frame-card border border-dashed border-frame-border/50 rounded-xl flex flex-col items-center justify-center gap-2 opacity-40"
    >
      <Film className="w-8 h-8 text-frame-textMuted" />
      <p className="text-xs text-frame-textMuted">Asset removed</p>
    </div>
  ) : (
    <div key={asset.id} className="relative group">
      <AssetCard asset={asset} onClick={() => handleSelectAsset(asset)} hideActions />
      {/* download button — unchanged */}
    </div>
  )
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Review link always scoped to folder or full project | Review link can also be scoped to exact asset IDs | Phase 33 | Users can share curated subsets without creating a new folder |
| GET handler uses single collection query | GET handler branches: collection query for folder links, `Promise.all(getDoc)` for selection links | Phase 33 | Handles up to 50 assets correctly without hitting Firestore `in` limit |
| CreateReviewLinkModal accepts only folderId | Modal also accepts assetIds | Phase 33 | Same modal handles both creation paths |

## Open Questions

1. **Should `ReviewLinkFolderBrowser` (internal app view) handle `_deleted` placeholders?**
   - What we know: `ReviewLinkFolderBrowser` is used in the authenticated app to preview a review link's contents. It calls the same GET endpoint. If a selection link has a deleted asset, it will receive `_deleted: true` objects.
   - What's unclear: Whether internal users need the placeholder in this view, or if they should see nothing.
   - Recommendation: Add the same `_deleted` check to `ReviewLinkFolderBrowser` for consistency and to prevent crashes. The component currently maps assets directly to `AssetCard` without a guard.

2. **Should the 50-asset cap be enforced server-side as well?**
   - What we know: STATE.md says "Selection review link asset cap = 50 max for v1.4". Client blocks submission. Server currently does no cap check.
   - What's unclear: Requirements don't specify server-side enforcement.
   - Recommendation: Add a server-side guard in the POST handler: `if (assetIds?.length > 50) return 400`. Low cost, prevents cap bypass via direct API calls.

3. **Does the "no folder browser sidebar" criterion apply to the authenticated internal view?**
   - What we know: The public `/review/[token]` page has no folder browser already. The internal view (`ReviewLinkFolderBrowser`) does show a header breadcrumb but no tree sidebar.
   - What's unclear: Whether the criterion targets the public page or both.
   - Recommendation: The public review page already satisfies this. No layout change needed for either page.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this phase is code/config-only changes using existing Firestore + Next.js infrastructure).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test suite detected) |
| Config file | none |
| Quick run command | `npm run dev` then exercise in browser |
| Full suite command | `npm run build` (TypeScript compilation gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVIEW-03 | Selecting multiple assets reveals toolbar "Review link" button | manual | `npm run build` | N/A |
| REVIEW-03 | Generated review link exposes only selected assets | manual | `npm run build` | N/A |
| REVIEW-03 | Review link page has no folder browser sidebar | manual | `npm run build` | N/A |
| REVIEW-03 | Selecting > 50 assets disables/warns the review link action | manual | `npm run build` | N/A |
| REVIEW-03 | Deleted-asset shows placeholder, review page does not crash | manual | `npm run build` | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` — TypeScript gate; catches type errors on new `assetIds` prop, `ReviewLink` interface change, modal prop signature
- **Phase gate:** Manual browser walkthrough of all 5 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
None — no new test files required. TypeScript compilation is the automated gate.

## Sources

### Primary (HIGH confidence)
- Direct code read: `src/types/index.ts` — full `ReviewLink` interface; `Asset` type; `folderId: string | null`
- Direct code read: `src/app/api/review-links/route.ts` — POST handler; existing fields stored on doc
- Direct code read: `src/app/api/review-links/[token]/route.ts` — GET handler; full asset-fetch + version-grouping logic
- Direct code read: `src/app/review/[token]/page.tsx` — review page layout; no folder browser sidebar confirmed
- Direct code read: `src/components/review/CreateReviewLinkModal.tsx` — full modal; existing props interface
- Direct code read: `src/components/files/FolderBrowser.tsx` (lines 74, 978-1028) — `selectedIds` state; multi-select toolbar pattern
- Direct code read: `src/components/review/ReviewLinkFolderBrowser.tsx` — internal review link preview; `AssetCard` map without `_deleted` guard
- Direct code read: `.planning/STATE.md` — decisions: "Phase 33 (REVIEW-03): Firestore in query capped at 30 — use Promise.all(getDoc) instead"; "Selection review link asset cap = 50 max for v1.4"
- Direct code read: `.planning/REQUIREMENTS.md` — REVIEW-03 definition
- Direct code read: `.planning/ROADMAP.md` — Phase 33 success criteria; plan hints "33-01: assetIds schema on ReviewLink + API branch + CreateReviewLinkModal prop"; "33-02: Selection toolbar action + review link page guard (no folder browser, delete placeholder)"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing project infrastructure
- Architecture: HIGH — full pipeline traced from FolderBrowser selection through API to review page; all file locations confirmed by direct code inspection
- Pitfalls: HIGH — Firestore `in` cap pitfall is pre-documented in STATE.md; version-grouping and deleted-asset pitfalls identified by direct route inspection

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable codebase; no fast-moving external dependencies)
