# Phase 32: smart-copy-options - Research

**Researched:** 2026-04-08
**Domain:** Asset copy flow — version stack filtering, comment exclusion, modal UX
**Confidence:** HIGH

## Summary

Phase 32 enhances the existing "Copy to" flow in `AssetCard` to give users two controls: (1) a "Latest version only" toggle that, when enabled, copies only the head version instead of the full stack; and (2) a visible static note that comments are not copied to the destination.

The entire copy pipeline already exists. `AssetCard` owns the `showCopyToModal` state, fetches folders, and calls `POST /api/assets/copy`. The API currently copies all versions unconditionally. The work for this phase is:
- Replace the bare `AssetFolderPickerModal` (folder-tree only) with a new `SmartCopyModal` that adds the toggle and the comments note.
- Extend `POST /api/assets/copy` to accept a `latestVersionOnly: boolean` flag; when true, filter `allVersions` down to just the highest-version entry before writing the batch.

Comments are never written into the copy by the existing API — the `copyData` spread copies only `Asset` fields, never `Comment` documents. So the "comments are not copied" behaviour is already correct; the only work is making this visible to the user via a static UI note.

**Primary recommendation:** Build `SmartCopyModal` inside `AssetCard.tsx` (co-located with `AssetFolderPickerModal`), add `latestVersionOnly` param to the copy API, and update `handleCopyTo` in `AssetCard` to pass the flag.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | User can copy an asset to a review folder with a "latest version only" option (skips older versions in the stack) | Asset.version number + versionGroupId already on all docs; API sorts by version ascending; filter to `allVersions.slice(-1)` is sufficient |
| REVIEW-02 | User can copy an asset to a review folder with a "without comments" option (comments are not copied; UI communicates this clearly) | Comments are never copied by existing API; only a static info note in the modal UI is needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14 | API route extension | Project baseline |
| Firebase Admin SDK | — | Firestore batch write | Existing copy API pattern |
| React | 18 | Modal component state | Project baseline |
| Tailwind CSS | 3 | Dark-theme styling | Project baseline |
| lucide-react | — | Toggle / Info icons | Already imported in AssetCard |

No new npm packages required.

### Anti-Patterns to Avoid
- **New standalone file for SmartCopyModal:** `AssetFolderPickerModal` and `VersionStackModal` both live at the bottom of `AssetCard.tsx`. Follow the same co-location convention — `SmartCopyModal` goes in the same file.
- **Separate API route for smart copy:** Extend the existing `POST /api/assets/copy` with a query param or body field; do not create a parallel route.

## Architecture Patterns

### Existing Copy Flow (to be extended)

```
AssetCard
  openCopyTo()
    → GET /api/folders?projectId=...&all=true
    → setAllFolders(data.folders)
    → setShowCopyToModal(true)

AssetFolderPickerModal  (REPLACE with SmartCopyModal)
  onPick(targetFolderId)
    → handleCopyTo(targetFolderId)  (EXTEND to pass latestVersionOnly)
      → POST /api/assets/copy { assetId, targetFolderId, latestVersionOnly? }

POST /api/assets/copy
  → fetch all versions by versionGroupId
  → if latestVersionOnly: keep only max-version entry
  → batch.set() for each kept version
```

### Data Model — What Determines "Latest Version"

The copy API at `src/app/api/assets/copy/route.ts` lines 34-35 already does:
```typescript
allVersions.sort((a, b) => (a.version || 1) - (b.version || 1));
```
After sorting ascending, the last element (`allVersions[allVersions.length - 1]`) is the head version. When `latestVersionOnly` is true, replace the full array with `[allVersions[allVersions.length - 1]]`.

The copied single version must still receive a fresh `versionGroupId` (so it is a standalone asset in the destination, version number 1). Set its `version` field to `1`.

### Version Count Shown in AssetCard Toggle

The toggle should only be visible when `versionCount > 1`. `versionCount` in `AssetCard` is:
```typescript
const versionCount = (asset as any)._versionCount || 1;
```
`_versionCount` is set by `GET /api/assets` when grouping; it equals the number of versions in the stack. Pass `versionCount` down to `SmartCopyModal` so it can show or hide the toggle.

### SmartCopyModal — Props Interface

```typescript
interface SmartCopyModalProps {
  folders: Folder[];
  versionCount: number;      // from asset._versionCount — controls toggle visibility
  onPick: (folderId: string | null, latestVersionOnly: boolean) => void;
  onClose: () => void;
}
```

Internal state: `latestVersionOnly: boolean` (default `true` when versionCount > 1, matching the most common review-folder use case).

### handleCopyTo Signature Change

```typescript
// Before
const handleCopyTo = async (targetFolderId: string | null) => { ... }

// After
const handleCopyTo = async (targetFolderId: string | null, latestVersionOnly: boolean) => {
  // ...
  body: JSON.stringify({ assetId: asset.id, targetFolderId, latestVersionOnly }),
  // ...
}
```

### API Extension

In `src/app/api/assets/copy/route.ts`:

```typescript
// Before (line 11)
const { assetId, targetFolderId, name } = await request.json();

// After
const { assetId, targetFolderId, name, latestVersionOnly } = await request.json();
```

After sorting, add:
```typescript
const versionsToCopy = latestVersionOnly
  ? [allVersions[allVersions.length - 1]]
  : allVersions;
```

When copying a single version with `latestVersionOnly`:
- Set `version: 1` on the copied document (it is now a standalone V1 in the destination).
- The `newGroupId` is still a fresh `db.collection('assets').doc().id` — no change there.

### "Comments not copied" Note Placement

Static informational note below the folder tree and above the action buttons:
```tsx
<p className="text-xs text-frame-textMuted flex items-start gap-1.5 mt-2">
  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
  Comments are not copied to the destination folder.
</p>
```
`Info` is available from `lucide-react`. No state needed — it is always visible.

### Recommended File Changes

```
src/
├── components/files/
│   └── AssetCard.tsx          # Replace AssetFolderPickerModal with SmartCopyModal;
│                              #   update handleCopyTo signature;
│                              #   pass versionCount to SmartCopyModal
└── app/api/assets/
    └── copy/route.ts          # Accept latestVersionOnly; filter allVersions accordingly;
                               #   set version: 1 on single-version copy
```

No new files required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Folder tree in SmartCopyModal | New recursive tree | Reuse the existing `buildTree` logic from `AssetFolderPickerModal` | Already handles indent depth and root option |
| Version count detection | New Firestore query inside modal | `asset._versionCount` already set by GET /api/assets | No extra round-trip needed |
| Toggle component | Custom toggle | Tailwind-styled `<input type="checkbox">` or simple button toggle | No new dependency needed; existing pattern in codebase |

**Key insight:** Comments are architecturally separate from assets in Firestore (`comments` collection keyed by `assetId`). The copy API only writes to the `assets` collection — comments are never carried along. REVIEW-02 is purely a UI disclosure task.

## Common Pitfalls

### Pitfall 1: Forgetting to set version: 1 on a latestVersionOnly copy
**What goes wrong:** The copied asset carries its original `version` number (e.g., 3). In the destination folder it appears as a standalone asset with `version: 3`, which is confusing and breaks the "V1" display.
**Why it happens:** The copy API spreads all fields from the source document, including `version`.
**How to avoid:** Explicitly set `version: 1` in `copyData` when `latestVersionOnly` is true (or always, since a single-version copy is always V1 of a new group).
**Warning signs:** Destination AssetCard shows "V3" badge when only one version was copied.

### Pitfall 2: Toggle visible for single-version assets
**What goes wrong:** The "Latest version only" toggle appears even when the asset has no version stack, confusing users.
**Why it happens:** `versionCount` defaults to 1 for standalone assets; if the toggle renders regardless of count, it is misleading.
**How to avoid:** Render the toggle only when `versionCount > 1`. Check `(asset as any)._versionCount || 1` before opening `SmartCopyModal`.
**Warning signs:** Toggle shown on assets with no version badge.

### Pitfall 3: newGroupId used for a single-version copy leaves versionGroupId pointing to non-existent group
**What goes wrong:** Setting `versionGroupId: newGroupId` on a single copied asset is correct — it becomes the group root of a new single-item group. But if you reuse the source asset's `versionGroupId`, the destination asset would appear to belong to the source stack.
**Why it happens:** Developer copies the existing multi-version logic without adjusting the group ID.
**How to avoid:** Always generate a fresh `newGroupId = db.collection('assets').doc().id` regardless of `latestVersionOnly`. The current API already does this correctly.
**Warning signs:** Destination asset's version stack modal shows source assets.

### Pitfall 4: AssetFolderPickerModal call site not updated
**What goes wrong:** `showCopyToModal` still renders the old `AssetFolderPickerModal` instead of the new `SmartCopyModal`. The two modals have different `onPick` signatures.
**Why it happens:** The render block at the bottom of `AssetCard` (line 459-465) uses `AssetFolderPickerModal` directly.
**How to avoid:** Replace `AssetFolderPickerModal` with `SmartCopyModal` at the render site and update the `onPick` handler signature.
**Warning signs:** TypeScript error on `onPick` argument count mismatch.

## Code Examples

### Updated handleCopyTo in AssetCard
```typescript
// Source pattern: src/components/files/AssetCard.tsx
const handleCopyTo = async (targetFolderId: string | null, latestVersionOnly: boolean) => {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/assets/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assetId: asset.id, targetFolderId, latestVersionOnly }),
    });
    if (res.ok) {
      toast.success('Copied');
      onCopied?.();
    } else {
      toast.error('Copy failed');
    }
  } catch {
    toast.error('Copy failed');
  } finally {
    setShowCopyToModal(false);
  }
};
```

### latestVersionOnly filter in copy API
```typescript
// Source pattern: src/app/api/assets/copy/route.ts
const { assetId, targetFolderId, name, latestVersionOnly } = await request.json();
// ... fetch + sort allVersions ascending ...
const versionsTocopy = latestVersionOnly
  ? [allVersions[allVersions.length - 1]]
  : allVersions;

const batch = db.batch();
for (const ver of versionstoopy) {
  const newRef = db.collection('assets').doc();
  const copyData: any = {
    ...ver,
    folderId: destinationFolderId,
    name: ver.id === assetId ? (name ?? `Copy of ${ver.name}`) : ver.name,
    versionGroupId: newGroupId,
    version: versionsToopy.length === 1 ? 1 : ver.version,  // reset to 1 for single-version copy
    createdAt: Timestamp.now(),
    uploadedBy: user.id,
  };
  delete copyData.id;
  batch.set(newRef, copyData);
}
```

### SmartCopyModal skeleton
```typescript
// New component co-located in src/components/files/AssetCard.tsx
function SmartCopyModal({
  folders,
  versionCount,
  onPick,
  onClose,
}: SmartCopyModalProps) {
  const [latestVersionOnly, setLatestVersionOnly] = useState(versionCount > 1);
  const tree = buildTree(null, 0);   // same buildTree helper as AssetFolderPickerModal

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <h3 className="text-sm font-semibold text-white">Copy to folder</h3>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Version toggle — only when stack > 1 */}
        {versionCount > 1 && (
          <div className="px-5 py-3 border-b border-frame-border flex items-center justify-between">
            <span className="text-sm text-white">Latest version only</span>
            <input type="checkbox" checked={latestVersionOnly} onChange={(e) => setLatestVersionOnly(e.target.checked)} />
          </div>
        )}

        {/* Folder tree */}
        <div className="max-h-56 overflow-y-auto py-2">
          {/* root + tree rows identical to AssetFolderPickerModal */}
        </div>

        {/* Comments note */}
        <div className="px-5 py-3 border-t border-frame-border">
          <p className="text-xs text-frame-textMuted flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Comments are not copied to the destination folder.
          </p>
        </div>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AssetFolderPickerModal (folder tree only) | SmartCopyModal (folder tree + version toggle + comments note) | Phase 32 | Users can control version scope and see comment behaviour |
| Copy API copies all versions unconditionally | Copy API accepts `latestVersionOnly` flag | Phase 32 | Only head version travels to review folder when requested |

## Open Questions

1. **Should `latestVersionOnly` default to true or false?**
   - What we know: The success criteria say the toggle is "presented" — no prescribed default.
   - What's unclear: Which is the more common review-folder use case.
   - Recommendation: Default `true` when `versionCount > 1` — review folders typically want only the latest cut; users can uncheck to copy the full stack.

2. **Should Duplicate (same-folder copy) also get the smart options?**
   - What we know: `handleDuplicate` hardcodes no `targetFolderId` and no options.
   - What's unclear: Requirements are silent on duplicate.
   - Recommendation: Leave duplicate unchanged; REVIEW-01/02 scope the smart options to the "Copy to" flow only.

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
| REVIEW-01 | "Latest version only" toggle appears only for version-stack assets | manual | `npm run build` (TS check) | N/A |
| REVIEW-01 | When toggle on: only head version in destination folder | manual | `npm run build` | N/A |
| REVIEW-01 | When toggle off: all versions in destination folder | manual | `npm run build` | N/A |
| REVIEW-02 | Comments note always visible in SmartCopyModal | manual | `npm run build` | N/A |
| REVIEW-02 | Destination folder has zero comments after copy | manual | `npm run build` | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` — TypeScript gate, catches prop signature mismatches
- **Phase gate:** Manual browser walkthrough of all 4 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
None — no new test files required. TypeScript compilation is the automated gate.

## Sources

### Primary (HIGH confidence)
- Direct code read: `src/components/files/AssetCard.tsx` — full component; `openCopyTo`, `handleCopyTo`, `AssetFolderPickerModal`, `versionCount` derivation
- Direct code read: `src/app/api/assets/copy/route.ts` — full route; version sort, batch write, no comment copying
- Direct code read: `src/types/index.ts` — `Asset.version: number`, `Asset.versionGroupId: string`, `Comment.assetId: string`
- Direct code read: `src/components/ui/Modal.tsx` — existing modal pattern for styling reference
- Direct code read: `.planning/STATE.md` — decisions: "Smart copy = reference copy + GCS delete guard (not full GCS object copy)"
- Direct code read: `.planning/REQUIREMENTS.md` — REVIEW-01, REVIEW-02 definitions
- Direct code read: `.planning/ROADMAP.md` — Phase 32 success criteria, plan hint "32-01: SmartCopyModal + latestVersionOnly param on copy API"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing project infrastructure
- Architecture: HIGH — entire copy pipeline traced from AssetCard through API; change surface is small and well-bounded
- Pitfalls: HIGH — identified from direct code inspection and data-model analysis

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable codebase; no fast-moving external dependencies)
