# Phase 28: version-stack-dnd — Research

**Researched:** 2026-04-08
**Domain:** HTML5 Drag-and-Drop, Firestore batch writes, React prop threading
**Confidence:** HIGH

---

## Summary

Phase 28 adds a second drag-and-drop action to the asset grid: dropping one asset card onto another merges the dragged asset's version group into the target's version group. The codebase already has a complete folder-move DnD implementation using HTML5 native drag events and a custom MIME type (`application/x-frame-move`). This phase follows an identical pattern, distinguished by a new MIME type (`application/x-frame-version-stack`).

The Firestore version group model is fully understood from reading the production code. `versionGroupId` is always the root asset's doc ID. `version` is an integer stored on every asset doc. Version queries use a single `where('versionGroupId', '==', groupId)` query. A Firestore batch write (max 500 ops) is the correct atomic strategy and is already used in the folder-move PUT handler.

The UI wiring follows the `isDropTarget` / `dragOverFolderId` pattern already established for FolderCard. AssetCard needs three additions: `isDropTarget` prop, `onDragOver` prop, and `onDragLeave` prop. AssetGrid threads these through. FolderBrowser holds the `dragOverAssetId` state and the merge API call handler.

**Primary recommendation:** Mirror the folder-move DnD pattern exactly. New MIME type on `handleItemDragStart`, new state `dragOverAssetId` in FolderBrowser, new `isDropTarget` prop on AssetCard, and a new `POST /api/assets/merge-version` route using a Firestore batch.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P28-01 | `POST /api/assets/merge-version` accepts `{ sourceId, targetId }` | New route file; pattern identical to `copy/route.ts` |
| P28-02 | Reassigns source group members' `versionGroupId` to target's group ID | Firestore batch update; query source group with `where('versionGroupId', '==', sourceGroupId)` |
| P28-03 | Version numbers renumbered: source members get `maxTargetVersion + 1, +2, …` | Fetch target group first, find max version, then assign; sort source group by version asc before renumbering |
| P28-04 | Single Firestore batch write (atomic) | `db.batch()` used in PUT handler; same approach here |
| P28-05 | Self-merge returns 400 | `sourceId === targetId` guard before any Firestore reads |
| P28-06 | Same-group merge returns 400 | Compare `sourceGroupId === targetGroupId` after fetching both docs |
| P28-07 | Route requires authentication | `getAuthenticatedUser(request)` first line, same as all other routes |
| P28-08 | New drag MIME type `application/x-frame-version-stack` added alongside `application/x-frame-move` in `handleItemDragStart` | Two `setData` calls on the same drag event |
| P28-09 | Target card highlights with `border-frame-accent` during hover | `isDropTarget` prop on AssetCard; conditional class same as FolderCard |
| P28-10 | `isDropTarget` prop uses same pattern as FolderCard; `React.memo` safe | Pass from FolderBrowser state, memo boundary crossed via prop change |
| P28-11 | Self-drop and same-stack drop are no-ops | UI guard in `handleAssetDrop`; API also returns 400 |
| P28-12 | Toast "Added [name] to version stack" on success | `toast.success(...)` after API call resolves |
| P28-13 | Source card disappears, target count increments via `refetchAssets` | Call `refetchAssets()` after successful merge |
| P28-14 | Drop onto uploading/pending asset is blocked | Check `asset.status !== 'ready'` in `onDragOver` handler; do not call `preventDefault` |
| P28-15 | Folder-move drag behavior unchanged | Version-stack events check for `application/x-frame-version-stack`; folder handler already checks for `application/x-frame-move` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| HTML5 DnD API | Browser native | Drag events, DataTransfer | Already used for folder-move; no new packages |
| firebase-admin | ^12.2.0 | Server-side Firestore batch | Already used in all API routes |
| react-hot-toast | ^2.4.1 | Success/error toasts | Already used throughout |

### No new packages required

The requirements document explicitly states: "No new npm packages — all features use existing browser APIs and repo code."

---

## Architecture Patterns

### Existing DnD Architecture (folder-move)

The folder-move system works as follows:

1. **`handleItemDragStart` in FolderBrowser** (line 286–291) — sets `application/x-frame-move` data on the event and sets `effectAllowed = 'move'`. It receives a single `itemId` and uses `selectedIds` to carry multi-select context.

2. **`onAssetDragStart` prop thread** — FolderBrowser → AssetGrid (`onAssetDragStart` prop) → AssetCard (`onDragStart` prop). AssetCard calls the forwarded handler via `onDragStart={isUploading ? undefined : onDragStart}`.

3. **`dragOverFolderId` state in FolderBrowser** — tracks which folder is currently highlighted. Set in `handleFolderDragOver`, cleared in `handleFolderDragLeave` and `handleFolderDrop`.

4. **`isDropTarget` prop on FolderCard** — `isDropTarget={dragOverFolderId === folder.id}`. FolderCard applies `border-frame-accent ring-2 ring-frame-accent bg-frame-accent/10` when true.

5. **`handleFolderDrop`** — reads `application/x-frame-move`, calls move API, calls `refetchAssets()` and `fetchFolders()`.

### New DnD Architecture (version-stack) — mirrors folder-move

```
FolderBrowser (orchestrator)
├── dragOverAssetId: string | null   (new state)
├── handleItemDragStart              (modified: add second setData call)
├── handleAssetDragOver(assetId, e)  (new: check x-frame-version-stack, set dragOverAssetId)
├── handleAssetDragLeave(assetId, e) (new: clear dragOverAssetId)
└── handleAssetDrop(assetId, e)      (new: read x-frame-version-stack, call merge API)

AssetGrid (prop thread)
├── dragOverAssetId?: string | null  (new prop)
├── onAssetDragOver?                 (new prop)
├── onAssetDragLeave?                (new prop)
└── onAssetDrop?                     (new prop)

AssetCard (leaf)
├── isDropTarget?: boolean           (new prop — drives border highlight)
├── onDragOver?: (e) => void         (new prop)
├── onDragLeave?: (e) => void        (new prop)
└── onDrop?: (e) => void             (new prop)
```

### Recommended Project Structure
```
src/app/api/assets/merge-version/
└── route.ts              (new — POST handler)

src/components/files/
├── AssetCard.tsx         (modified — isDropTarget, onDragOver, onDragLeave, onDrop props)
├── AssetGrid.tsx         (modified — 4 new props threaded)
└── FolderBrowser.tsx     (modified — dragOverAssetId state, 3 new handlers, modified handleItemDragStart)
```

### Pattern: Dual MIME type on drag start

`handleItemDragStart` in FolderBrowser currently calls one `setData`. For version-stack, add a second call:

```typescript
// FolderBrowser.tsx — handleItemDragStart (modified)
const handleItemDragStart = useCallback((itemId: string, e: React.DragEvent) => {
  const ids = selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId];
  e.dataTransfer.setData('application/x-frame-move', JSON.stringify({ ids }));
  // New: also advertise as version-stack draggable (single asset only)
  e.dataTransfer.setData('application/x-frame-version-stack', JSON.stringify({ id: itemId }));
  e.dataTransfer.effectAllowed = 'move';
}, [selectedIds]);
```

### Pattern: AssetCard drop target highlight

AssetCard currently has this className logic for the outer div:
```typescript
className={`group bg-frame-card border rounded-xl overflow-hidden transition-all ${
  isUploading
    ? 'opacity-60 border-frame-border'
    : isSelected
    ? 'border-frame-accent ring-1 ring-frame-accent hover:bg-frame-cardHover cursor-pointer'
    : 'border-frame-border hover:border-frame-borderLight hover:bg-frame-cardHover cursor-pointer'
}`}
```

Add `isDropTarget` case (highest priority, before isSelected):

```typescript
className={`group bg-frame-card border rounded-xl overflow-hidden transition-all ${
  isUploading
    ? 'opacity-60 border-frame-border'
    : isDropTarget
    ? 'border-frame-accent ring-2 ring-frame-accent bg-frame-accent/10 cursor-pointer'
    : isSelected
    ? 'border-frame-accent ring-1 ring-frame-accent hover:bg-frame-cardHover cursor-pointer'
    : 'border-frame-border hover:border-frame-borderLight hover:bg-frame-cardHover cursor-pointer'
}`}
```

### Pattern: Firestore batch merge (server-side)

```typescript
// POST /api/assets/merge-version
const { sourceId, targetId } = await request.json();

// 1. Guard: self-merge
if (sourceId === targetId) return 400;

// 2. Fetch both docs
const [sourceDc, targetDc] = await Promise.all([
  db.collection('assets').doc(sourceId).get(),
  db.collection('assets').doc(targetId).get(),
]);

// 3. Derive group IDs (root asset may not have versionGroupId stored)
const sourceGroupId = sourceDoc.versionGroupId || sourceId;
const targetGroupId = targetDoc.versionGroupId || targetId;

// 4. Guard: same-group merge
if (sourceGroupId === targetGroupId) return 400;

// 5. Fetch both groups
const [sourceGroupSnap, targetGroupSnap] = await Promise.all([
  db.collection('assets').where('versionGroupId', '==', sourceGroupId).get(),
  db.collection('assets').where('versionGroupId', '==', targetGroupId).get(),
]);

// 6. Include root asset if not in snap (legacy assets without versionGroupId field)
// ... (same pattern as GET /api/assets/[assetId])

// 7. Find max version in target group
const maxTargetVersion = Math.max(...targetDocs.map(d => d.version || 1));

// 8. Sort source group by version asc, assign new version numbers
const sortedSource = [...sourceDocs].sort((a, b) => (a.version || 1) - (b.version || 1));

// 9. Batch write: update all source docs with new versionGroupId and version
const batch = db.batch();
sortedSource.forEach((doc, i) => {
  batch.update(db.collection('assets').doc(doc.id), {
    versionGroupId: targetGroupId,
    version: maxTargetVersion + 1 + i,
  });
});
await batch.commit();
```

**Key implementation notes:**
- The root asset of the source group may not have `versionGroupId` stored in Firestore (legacy). The GET handler (line 43–48) handles this: it checks if the root doc is in the snap, and if not, fetches it directly. The merge route must do the same.
- The root asset of the target group similarly may lack the field. Use `targetDoc.versionGroupId || targetId`.
- Firestore `writeBatch` is limited to 500 operations. Version groups will never approach this limit (typical groups have 2–10 versions).

### Anti-Patterns to Avoid

- **Setting `dragOverAssetId` in AssetCard itself:** State must live in FolderBrowser to be reset on drop/leave. AssetCard is `memo`-wrapped; the only safe update path is via prop.
- **Reading `application/x-frame-version-stack` in `handleFolderDrop`:** Folder drop handler only checks `application/x-frame-move`. Do not read the new MIME type there; the asset drop handler is separate.
- **Calling `preventDefault` on DragOver for uploading targets:** For `status !== 'ready'` targets, do NOT call `e.preventDefault()` — this keeps the `dropEffect = none` cursor and blocks the drop event.
- **Optimistic removal of source card before API response:** The grid is driven by `assets` from `useAssets` hook. Only call `refetchAssets()` on API success. Do not locally mutate the `assets` array.
- **Not handling the root-asset-without-versionGroupId case in the merge route:** Legacy assets may lack this field. Always use `doc.versionGroupId || doc.id` when deriving group IDs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-doc update | Sequential PUT calls | `db.batch()` | Race conditions: two concurrent merges could produce version number collisions |
| Toast notifications | Custom overlay | `react-hot-toast` (already installed) | Consistent UX, already used everywhere |
| Drag state detection | Mouse position math | HTML5 DnD events (`ondragover`/`ondragleave`) | Already the project pattern; avoids reinventing enter/leave counter |

**Key insight:** Firestore batches guarantee atomicity within a single transaction boundary. Two concurrent merge calls cannot interleave version number assignment if both reads and all writes happen inside a single batch. However, the current implementation pattern is read-then-batch (not a transaction), so there is a theoretical TOCTOU window. For this use case (creative review app with low concurrent-merge probability), the batch approach is sufficient and matches the existing codebase pattern.

---

## Common Pitfalls

### Pitfall 1: `dragover` Fires on Every Mouse Move
**What goes wrong:** `onDragOver` is called tens of times per second while the cursor is held over a card. If it triggers a state update each time, the component re-renders constantly.
**Why it happens:** `dragover` must be called `preventDefault()` to allow a drop, so it always fires.
**How to avoid:** Only call `setDragOverAssetId` when the value actually changes. The handler checks `dragOverAssetId !== assetId` before calling setState — or more simply, React's state setter is a no-op if the value is identical. The real fix: FolderBrowser's handler is `useCallback`-wrapped, so it's stable. The `setDragOverFolderId` pattern in the existing code already fires on every `dragover` event without issue (React batches same-value setState calls).
**Warning signs:** Visible lag or console log spam during drag.

### Pitfall 2: Legacy Assets without `versionGroupId` in Firestore
**What goes wrong:** Source or target asset has no `versionGroupId` field (uploaded before versioning was added). The Firestore query `where('versionGroupId', '==', undefined)` returns zero results or throws.
**Why it happens:** The `versionGroupId` field was added in Phase 06-02; older assets may only have it on version > 1 children, not on the root.
**How to avoid:** Always derive group ID as `asset.versionGroupId || asset.id`. Then also fetch the root doc separately if it's missing from the where-query result (the GET handler shows this exact pattern at lines 43–48).
**Warning signs:** Merge succeeds but the source asset remains visible in the grid (root asset was not updated).

### Pitfall 3: `dragLeave` Fires When Cursor Moves Over Child Elements
**What goes wrong:** Moving the cursor from the card border onto the thumbnail image inside the card triggers `dragleave`, clearing `dragOverAssetId` and removing the highlight mid-hover.
**Why it happens:** HTML5 `dragleave` fires on a parent when the cursor enters a child.
**How to avoid:** The folder-move code uses `setDragOverFolderId(null)` directly in `handleFolderDragLeave` without an enter-counter — this works because FolderCard's inner elements are `pointer-events-none` or don't capture drag events. AssetCard has `overflow-hidden` on the thumbnail container and all inner elements have `pointer-events-none` or are captured by the card-level handler. In practice, this is not an issue for cards with `overflow-hidden`. If flickering occurs, add `pointer-events-none` to the inner thumbnail div for the duration of the drag. The FolderCard in this codebase does not use an enter-counter and it works — follow the same approach.
**Warning signs:** Highlight flickers as cursor moves over the thumbnail.

### Pitfall 4: Container `onDrop` Handler Intercepts Asset Drops
**What goes wrong:** The content div in FolderBrowser has `onDrop={handleDrop}` for OS file/folder upload. When an asset is dropped onto another asset card, the event bubbles up and `handleDrop` also fires, triggering a spurious upload attempt.
**Why it happens:** DOM event bubbling.
**How to avoid:** The asset card's `onDrop` handler must call `e.stopPropagation()`. The folder drop handlers do NOT currently call `stopPropagation` (they let the event bubble), but the container `handleDrop` checks for actual file entries and returns early if none found. However, adding `stopPropagation()` to the asset drop handler is the safe, explicit approach.
**Warning signs:** Toast error "Failed to upload" appearing after a version-merge drop.

---

## Firestore Version Group Model (from production code)

| Field | Type | Notes |
|-------|------|-------|
| `version` | `number` | 1-based integer; V1 = first upload |
| `versionGroupId` | `string` | Always the root (V1) asset's Firestore doc ID |

**Group membership query:** `db.collection('assets').where('versionGroupId', '==', groupId).get()`

**Important edge case:** The root asset (V1) itself may not have `versionGroupId` stored as a field in Firestore for assets created before Phase 06-02. The query result may therefore not include the root. The existing GET handler at line 43–48 of `[assetId]/route.ts` shows the exact workaround: check if root ID is in the result set, and if not, fetch it directly.

**Grid display logic (from `GET /api/assets` route, lines 27–38):** Assets are grouped by `versionGroupId`, and only the latest version (`max version`) is shown per group, with `_versionCount` attached.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure code change: HTML5 DnD events, existing Firestore SDK, existing React component tree).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None |
| Quick run command | N/A |
| Full suite command | `next build` (type-check only) |

No test framework is installed in this project (package.json has only `eslint` as devDependency). All validation is manual or via `next build`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P28-01 | POST /api/assets/merge-version exists | manual | `next build` (TypeScript) | ❌ Wave 0 |
| P28-02 | Source group reassigned to target group ID | manual | — | — |
| P28-03 | Version numbers renumbered without collision | manual | — | — |
| P28-04 | Single batch write | code review | — | — |
| P28-05 | Self-merge returns 400 | manual | `curl` | — |
| P28-06 | Same-group merge returns 400 | manual | `curl` | — |
| P28-07 | Auth required | manual | `curl` without token | — |
| P28-08 | Dual MIME type on drag | manual (browser) | — | — |
| P28-09 | Drop target highlight | manual (browser) | — | — |
| P28-10 | isDropTarget prop works through memo | code review | — | — |
| P28-11 | Self-drop no-op | manual (browser) | — | — |
| P28-12 | Toast on success | manual (browser) | — | — |
| P28-13 | Grid refresh after merge | manual (browser) | — | — |
| P28-14 | Uploading asset blocks drop | manual (browser) | — | — |
| P28-15 | Folder-move unchanged | manual (browser) | — | — |

### Wave 0 Gaps
- No test framework to install; use `next build` for TypeScript type checking as the automated gate.
- Manual verification via browser is the primary validation method for all UI requirements.

---

## Sources

### Primary (HIGH confidence)
- `src/components/files/FolderBrowser.tsx` — full drag-to-move implementation, `handleItemDragStart`, `handleFolderDragOver/Leave/Drop`, `dragOverFolderId` state, FolderCard `isDropTarget` pattern
- `src/components/files/AssetCard.tsx` — current props interface, className logic, `memo` wrapper, `isUploading` guard
- `src/components/files/AssetGrid.tsx` — current prop interface, how AssetCard gets `onDragStart`
- `src/app/api/assets/[assetId]/route.ts` — version group query pattern, legacy root-asset workaround, Firestore batch in PUT handler
- `src/app/api/assets/copy/route.ts` — batch write pattern for multi-doc atomic update
- `src/app/api/assets/route.ts` — group-by-versionGroupId display logic, `_versionCount` computation
- `src/types/index.ts` — `Asset` interface with `version: number` and `versionGroupId: string`
- `.planning/REQUIREMENTS.md` — all 15 P28 requirements, file change list, technical constraints
- `.planning/STATE.md` — existing project decisions (MIME type decision, drag payload ownership)

### Secondary (MEDIUM confidence)
- HTML5 DnD spec behavior (dragleave on child elements) — established browser behavior, verified by existing FolderCard implementation working correctly without enter-counter

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json and source files
- Architecture: HIGH — read from production implementation of identical pattern (folder-move)
- Pitfalls: HIGH — derived from actual code paths; pitfall 3 (dragleave) is known browser behavior confirmed by FolderCard working without enter-counter
- Firestore model: HIGH — read directly from `[assetId]/route.ts` and `route.ts`

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable codebase)
