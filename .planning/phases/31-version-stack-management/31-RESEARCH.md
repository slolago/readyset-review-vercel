# Phase 31: version-stack-management - Research

**Researched:** 2026-04-08
**Domain:** Firestore version group mutation (unstack + reorder) + VersionStackModal drag-to-reorder UI
**Confidence:** HIGH

## Summary

Phase 31 adds two operations to the existing version stack: unstacking a single version (VSTK-01) and reordering versions within the modal via drag (VSTK-02). Both operations require Firestore writes and a refreshed VersionStackModal UI.

The existing `VersionStackModal` lives in `AssetCard.tsx` and already renders a list of versions with a delete button per row. It fetches from `GET /api/assets/[assetId]` which returns `{ asset, versions }`. The modal has a delete handler but no unstack or reorder handler. Phase 31 extends this modal in-place — no new component file needed — while adding two new API routes:

1. `POST /api/assets/unstack-version` — removes one asset from the group, sets its `versionGroupId` to its own `id` (making it standalone), and re-numbers the remaining stack 1..N.
2. `POST /api/assets/reorder-versions` — accepts an ordered array of asset IDs and re-assigns version numbers 1..N in that order, using a Firestore **transaction** (not a batch) because the read-before-write needs to guard against stale state.

The STATE.md blockers section already documents the two critical constraints: use a Firestore transaction (not batch) for reorder, and set `versionGroupId = asset.id` (never null) on unstack. Both are locked guidance and must be followed.

After either operation the modal re-fetches via the existing `fetchVersions()` helper, and `onDeleted()` is called to trigger the parent grid refresh so the unstacked asset reappears as a standalone card.

**Primary recommendation:** Two new API routes (unstack-version, reorder-versions) + extend VersionStackModal with Unstack buttons and HTML5 drag handles — no new npm packages.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VSTK-01 | User can unstack a version from a group (it becomes a standalone asset) | New `POST /api/assets/unstack-version` route; modal already has per-row action area; after unstack `onDeleted()` triggers grid refresh so the new standalone asset appears |
| VSTK-02 | User can reorder versions within a stack (drag to reassign version numbers) | HTML5 drag-and-drop on modal rows (same pattern as grid DnD); new `POST /api/assets/reorder-versions` route using Firestore transaction; version numbers re-assigned 1..N after each reorder |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14.2.5 | Two new API routes | Project baseline |
| Firebase Admin SDK | 12.x | Firestore transaction + batch writes | Project baseline; transaction required per STATE.md |
| React | 18 | Modal drag state (dragIndex, hoverIndex) | Project baseline |
| Tailwind CSS | 3.x | Drag-handle and row highlight styles | Project baseline |
| lucide-react | 0.395.0 | `GripVertical` (drag handle icon), `Unlink` (unstack icon) | Already installed |

No new npm packages required for this phase.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native HTML5 drag-and-drop for row reorder | @dnd-kit/core or react-beautiful-dnd | DnD libraries give better accessibility and smooth animations; however the project has never added a DnD library and all existing drag UX uses native events — stay consistent, no new dependency |
| Firestore transaction for reorder | Firestore batch | Batch does not guard stale reads — STATE.md explicitly flags this; transaction is the correct choice here |
| New standalone VersionStackModal component file | Extend in-place inside AssetCard.tsx | The modal is already self-contained at the bottom of AssetCard.tsx with full props access; extracting adds churn with no benefit at this scale |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/assets/
│   ├── unstack-version/route.ts    (new)
│   └── reorder-versions/route.ts  (new)
└── components/files/
    └── AssetCard.tsx               (extend VersionStackModal in-place)
```

### Pattern 1: Unstack API Route
**What:** Remove one asset from its group, make it standalone, re-compact remaining version numbers.
**When to use:** User clicks Unstack on a version row in the modal.

Key logic steps:
1. Validate `assetId` in request body.
2. Fetch the target asset — read its `versionGroupId` (the group root ID).
3. Fetch all members of the group (`where('versionGroupId', '==', groupId)` + include the root if missing from query results).
4. If only 1 member remains after removing the target, the stack dissolves — no renumbering needed (the last asset stays as-is with its own `versionGroupId`).
5. Use a Firestore **batch** (acceptable here — no read-before-write guard needed; we already read all members above):
   - Target asset: set `versionGroupId = asset.id` (its own ID), set `version = 1`.
   - Remaining members: re-assign `version` 1..N in ascending order of their current version.
6. Respond `{ unstacked: assetId, remaining: N }`.

**Critical:** `versionGroupId` on the unstacked asset must be set to `asset.id`, never `null` or `undefined`. This matches the convention that a standalone asset's groupId equals its own ID.

```typescript
// Conceptual shape — Source: project codebase pattern (merge-version/route.ts)
const batch = db.batch();

// Detach the unstacked asset — becomes its own standalone stack
batch.update(db.collection('assets').doc(assetId), {
  versionGroupId: assetId,
  version: 1,
});

// Re-compact remaining members 1..N
remaining.sort((a, b) => a.version - b.version);
remaining.forEach((m, i) => {
  batch.update(db.collection('assets').doc(m.id), { version: i + 1 });
});

await batch.commit();
```

### Pattern 2: Reorder API Route
**What:** Accept an ordered array of asset IDs; re-assign version numbers 1..N in that order.
**When to use:** User drops a version row to a new position in the modal.

Key logic steps:
1. Validate `orderedIds: string[]` in request body (must be non-empty, all strings).
2. Use a Firestore **transaction** (not batch — STATE.md mandate):
   - Inside transaction: read all docs for the provided IDs.
   - Verify all belong to the same `versionGroupId` — reject if not (prevents cross-group reorder).
   - Write `version = index + 1` for each asset in order.
3. Respond `{ reordered: N }`.

```typescript
// Conceptual shape — Source: STATE.md blocker + project codebase pattern
await db.runTransaction(async (tx) => {
  const refs = orderedIds.map((id) => db.collection('assets').doc(id));
  const docs = await Promise.all(refs.map((r) => tx.get(r)));

  // Verify consistent group membership
  const groupIds = new Set(docs.map((d) => d.data()?.versionGroupId || d.id));
  if (groupIds.size > 1) throw new Error('Cross-group reorder not allowed');

  docs.forEach((doc, i) => {
    tx.update(doc.ref, { version: i + 1 });
  });
});
```

### Pattern 3: VersionStackModal Drag-to-Reorder UI
**What:** Add `draggable` attribute and `onDragStart`/`onDragOver`/`onDrop` handlers to each version row.
**When to use:** VSTK-02 implementation inside the existing VersionStackModal component.

State needed (inside VersionStackModal):
```typescript
const [dragIndex, setDragIndex] = useState<number | null>(null);
const [hoverIndex, setHoverIndex] = useState<number | null>(null);
```

Row handler flow:
1. `onDragStart` — set `dragIndex` to this row's index.
2. `onDragOver` — `e.preventDefault()` to allow drop; set `hoverIndex`.
3. `onDrop` — if `dragIndex !== hoverIndex`, reorder local `versions` array optimistically, then call `POST /api/assets/reorder-versions` with the new ordered ID array.
4. `onDragEnd` — reset `dragIndex` and `hoverIndex` to null.

Visual cues: add `GripVertical` icon as drag handle on left side of each row; apply `border-frame-accent` to the hover-target row.

Optimistic update: swap versions in local state immediately, then fire the API. On error, call `fetchVersions()` to restore server state.

### Pattern 4: Unstack Button in Modal Row
**What:** Add an Unstack button to each version row (alongside the existing delete button).
**Condition:** Only show when `versions.length > 1` (same guard as the existing delete button).

Use `Unlink` icon from lucide-react (or `Layers` with a minus) — `Unlink` communicates "detach from group" clearly. Clicking calls `POST /api/assets/unstack-version`, then:
- Remove the unstacked version from local `versions` state.
- If `version.id === asset.id` (the card's root asset was unstacked), call `onDeleted()` and `onClose()` — the parent grid will re-fetch and the card will disappear from the stack.
- Otherwise just update local state and call `onDeleted()` to refresh the grid so the unstacked asset appears as a new standalone card.

### Anti-Patterns to Avoid
- **Setting `versionGroupId = null` on unstack:** The project convention is `versionGroupId === asset.id` for standalone assets. The grid query uses `versionGroupId` to group; null breaks grouping logic.
- **Using a Firestore batch for reorder:** Batches don't guard stale reads. If two users reorder concurrently a batch will silently overwrite. Use `db.runTransaction`.
- **Not re-compacting version numbers after unstack:** A gap (e.g., V1, V3) creates confusing UI. Always re-assign 1..N on both operations.
- **Forgetting the root asset isn't in the `where('versionGroupId', '==', groupId)` result:** The root asset may not have `versionGroupId` stored (older assets). The existing `merge-version/route.ts` handles this with an explicit include check — replicate the same pattern.
- **Closing the modal without refreshing the grid after unstack:** The unstacked asset must reappear as a standalone card. Always call `onDeleted()` after a successful unstack so the parent refetches.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop sortable list | Custom pointer-event tracker | Native HTML5 `draggable` + `onDragOver`/`onDrop` | Already the project pattern; no extra dependency |
| Concurrency-safe multi-doc update | Firestore batch | `db.runTransaction()` | STATE.md mandates transaction for reorder to guard stale reads |
| Version number compaction | Custom sort + gap fill | Simple `array.sort().forEach((m, i) => version = i+1)` | The pattern is trivial and already used in merge-version route |

## Common Pitfalls

### Pitfall 1: Root Asset Missing from versionGroupId Query
**What goes wrong:** `where('versionGroupId', '==', groupId)` does not return the root/group-founder asset if it was created before the versionGroupId field was added.
**Why it happens:** Older assets may have `versionGroupId` stored as their own ID but the field was set inconsistently.
**How to avoid:** After the query, check whether the root asset ID is already in results. If not, fetch it explicitly and include it. This is the existing pattern in `merge-version/route.ts` and `GET /api/assets/[assetId]`.
**Warning signs:** The grid shows N-1 versions after a merge, or unstack leaves a phantom version in Firestore.

### Pitfall 2: Stale Version Numbers After Partial Failure
**What goes wrong:** An unstack or reorder API call partially writes some docs before failing — leaves version numbers in a mixed state.
**Why it happens:** Firestore batch writes are atomic across docs (all succeed or all fail) but a transaction abort may leave partial side effects if not structured correctly.
**How to avoid:** Use `db.batch()` for unstack (all writes go in one batch.commit()) and `db.runTransaction()` for reorder. Both are atomic — if `commit()` or the transaction throws, no partial writes land.

### Pitfall 3: Modal Does Not Reflect Grid After Unstack
**What goes wrong:** User clicks Unstack, the modal updates locally, but the underlying grid still shows the old stack card with the old `_versionCount`.
**Why it happens:** `onDeleted()` was not called after the successful unstack.
**How to avoid:** Always call `onDeleted?.()` after a successful unstack. The parent page refetches assets on `onDeleted`, which re-computes `_versionCount` and reorders the grid.

### Pitfall 4: Drag Reorder Fires on Single-Item Stack
**What goes wrong:** Dragging is enabled even when there is only one version, causing a no-op API call.
**Why it happens:** The `draggable` attribute was applied unconditionally.
**How to avoid:** Conditionally set `draggable={versions.length > 1}` on each row, consistent with the existing `versions.length > 1` guard on delete/unstack buttons.

### Pitfall 5: Version Number Display Shows V0
**What goes wrong:** If `version` field is missing or zero on an asset, the badge renders `V0`.
**Why it happens:** The unstack route writes `version: 1` for the detached asset, but the remaining assets may start from index 0 if the `forEach` uses zero-based indexing.
**How to avoid:** Always use `i + 1` in the version assignment loop (1-based).

## Code Examples

### Fetch versions in VersionStackModal (existing pattern)
```typescript
// Source: src/components/files/AssetCard.tsx — VersionStackModal.fetchVersions
const res = await fetch(`/api/assets/${asset.id}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
setVersions(data.versions); // already sorted by version number ascending
```

### Root asset inclusion guard (existing pattern from merge-version)
```typescript
// Source: src/app/api/assets/merge-version/route.ts
if (!sourceMembers.some((m) => m.id === sourceId)) {
  sourceMembers.push({ id: sourceId, version: source.version || 1 });
}
```

### Firestore transaction (reorder)
```typescript
// Source: STATE.md blocker — "Use Firestore transaction (not batch) for reorder"
await db.runTransaction(async (tx) => {
  const refs = orderedIds.map((id) => db.collection('assets').doc(id));
  const docs = await Promise.all(refs.map((r) => tx.get(r)));
  docs.forEach((doc, i) => tx.update(doc.ref, { version: i + 1 }));
});
```

### HTML5 drag-reorder state pattern (modal rows)
```typescript
// Standard native DnD sort — no library needed
const [dragIdx, setDragIdx] = useState<number | null>(null);
const [hoverIdx, setHoverIdx] = useState<number | null>(null);

function handleDrop(targetIdx: number) {
  if (dragIdx === null || dragIdx === targetIdx) return;
  const reordered = [...versions];
  const [moved] = reordered.splice(dragIdx, 1);
  reordered.splice(targetIdx, 0, moved);
  setVersions(reordered);
  setDragIdx(null);
  setHoverIdx(null);
  // Fire POST /api/assets/reorder-versions with reordered.map(v => v.id)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Firestore batch for all multi-doc writes | Transaction for read-before-write scenarios | STATE.md v1.4 blocker | Prevents stale-read collisions on concurrent reorder |
| Delete-only version management | Unstack + reorder (non-destructive) | Phase 31 | Users no longer have to delete versions they want to detach |

## Open Questions

1. **Should unstacking the root asset (the one whose ID is the groupId) re-assign the groupId to the next version in the stack?**
   - What we know: The group ID is always the root asset's Firestore doc ID. If the root is unstacked, the remaining members still have `versionGroupId = rootId`, but that doc now belongs to a different (standalone) asset.
   - What's unclear: Whether the remaining group can continue to use the old root's ID as the groupId, or whether all remaining members need `versionGroupId` rewritten to the new "first" member's ID.
   - Recommendation: Keep the old groupId as the group anchor — it is just a string key used for querying. No renaming needed. The detached root gets `versionGroupId = its own new standalone id`. The remaining members keep their existing `versionGroupId`. This avoids a cascading rename.
   - **Confirmation needed at plan time:** Verify the `GET /api/assets/[assetId]` query still finds all remaining members after the root is detached. Since it queries `where('versionGroupId', '==', groupId)`, and the remaining members still have the old groupId, the query will still work correctly. The detached root just won't appear because its `versionGroupId` is now its own ID (a different value). This is correct behavior.

## Environment Availability

Step 2.6: SKIPPED — phase is purely code/config changes; no external dependencies beyond the existing Firestore connection.

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files or test directories in repo |
| Config file | none |
| Quick run command | n/a — no automated test infrastructure |
| Full suite command | n/a |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VSTK-01 | Unstacking removes asset from group; it reappears standalone in grid; remaining versions renumbered gaplessly | manual smoke | n/a — no test infra | N/A |
| VSTK-02 | Drag reorder updates version numbers 1..N gaplessly; order persists after modal close and re-open | manual smoke | n/a — no test infra | N/A |

### Sampling Rate
- **Per task commit:** Manual browser verification (open VersionStackModal, exercise the feature)
- **Per wave merge:** Manual smoke — unstack one version; confirm grid refresh; confirm version numbers compact
- **Phase gate:** Both success criteria confirmed before `/gsd:verify-work`

### Wave 0 Gaps
None — no automated test infrastructure exists in this project and none is expected. All validation is manual browser smoke testing consistent with prior phases.

## Sources

### Primary (HIGH confidence)
- `src/app/api/assets/merge-version/route.ts` — existing version stacking API, root-asset inclusion guard pattern, batch write pattern
- `src/app/api/assets/[assetId]/route.ts` — version fetch logic, group query, `versionGroupId` convention
- `src/app/api/assets/route.ts` — grid grouping logic confirming `versionGroupId || asset.id` convention
- `src/components/files/AssetCard.tsx` — VersionStackModal component (existing delete handler, fetchVersions, row structure)
- `.planning/STATE.md` — Blockers section: transaction (not batch) for reorder; versionGroupId = asset.id on unstack; gapless renumber after every mutation
- `package.json` — No DnD library installed; confirms native HTML5 drag-and-drop is the correct approach

### Secondary (MEDIUM confidence)
- Firebase Admin SDK docs — `db.runTransaction()` API for Firestore server-side transactions (consistent with project Admin SDK usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; no new installs
- Architecture: HIGH — route structure mirrors existing merge-version pattern; modal extension is in-place; all constraints documented in STATE.md
- Pitfalls: HIGH — root-asset-missing-from-query pitfall is already solved and documented in existing code; transaction-vs-batch pitfall is explicitly called out in STATE.md

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain — Firestore transaction API and HTML5 DnD are not changing)
