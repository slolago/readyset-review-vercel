# Architecture: v1.4 Review & Version Workflow

**Project:** readyset-review
**Researched:** 2026-04-08
**Confidence:** HIGH — all integration points verified against live codebase

---

## Existing Architecture Snapshot

### Firestore Schema (current)

```
assets/{assetId}
  projectId, folderId, name, type, mimeType, url, gcsPath,
  thumbnailUrl, thumbnailGcsPath, duration, width, height, size,
  uploadedBy, status: 'uploading'|'ready', version, versionGroupId,
  versionOrder (unused in current queries), createdAt, frameRate?

comments/{commentId}
  assetId, projectId, reviewLinkId?, authorId, authorName, authorEmail?,
  text, timestamp?, annotation?, resolved, parentId, createdAt

reviewLinks/{token}   (token IS the doc ID)
  token, projectId, folderId, name, createdBy, expiresAt, allowComments,
  allowDownloads, allowApprovals, showAllVersions, password?, createdAt
```

### API Routes (current)

```
GET/POST  /api/assets                  — list (grouped by version), batch upload sign
GET/PUT/DELETE /api/assets/[assetId]   — single asset; PUT handles folderId batch-move
POST      /api/assets/merge-version    — atomic batch merge of two version stacks
POST      /api/assets/copy             — copies entire version stack to target folder
GET       /api/assets/size             — folder size badge
GET/POST  /api/review-links            — list/create, folderId-scoped
GET/PATCH/DELETE /api/review-links/[token]
GET/POST  /api/comments
PUT/DELETE /api/comments/[commentId]
GET/POST  /api/folders
GET/PUT/DELETE /api/folders/[folderId]
```

### Key Component Facts

- **VersionStackModal** lives inside `AssetCard.tsx` as a collocated function. It fetches versions via `GET /api/assets/[assetId]` and currently renders delete-only.
- **FolderBrowser** owns all multi-select state, move modal state, and the `handleMoveSelected` function that calls `PUT /api/assets/[assetId]` with `{ folderId }`. The PUT route already batch-moves all versions in the group atomically.
- **AssetCard** owns the context menu and calls `onRequestMove()` which propagates up to FolderBrowser.handleRequestMoveItem — the move-to-folder wiring already exists at the browser level; what's missing is confirming the prop wire is connected.
- **VersionComparison** receives `versions: Asset[]` (pre-fetched, already have `signedUrl`). It has no comment-awareness; `muted` is a single shared boolean, not per-side.
- **CreateReviewLinkModal** takes `{ projectId, folderId }` and sends them to `POST /api/review-links`. No concept of `assetIds`.
- **`GET /api/review-links/[token]`** resolves assets via Firestore query on `(projectId, folderId, status=ready)`. It does NOT support filtering by an assetIds array.
- The `AssetStatus` type alias currently equals `'uploading' | 'ready'` — this is the upload lifecycle status, NOT a review QC status. The names will collide; the new QC field must use a different name.

---

## Feature-by-Feature Integration Analysis

---

### 1. Version Stack Unstack + Reorder (VSTK-01)

**What changes**

The `VersionStackModal` inside `AssetCard.tsx` currently renders a static list with delete-only. It needs drag-to-reorder and an "Unstack" (eject) action per version.

**Firestore changes**

No new fields required. `version` (integer) already defines order within the group. Reordering means updating `version` numbers across all members of the group in a batch. Unstacking means:
1. Set the ejected asset's `versionGroupId` to its own `id` (or remove the field — query fallback handles `asset.id` as groupId when field is absent).
2. Set `version = 1` on the ejected asset.

The existing `merge-version` route shows exactly this pattern in reverse — the batch there is the template.

**New API routes**

Two new routes:
- `POST /api/assets/reorder-versions` — body: `{ groupId, orderedIds: string[] }` — batch-writes new version numbers 1..N in the given order.
- `POST /api/assets/unstack-version` — body: `{ assetId }` — removes asset from its group, resets to standalone.

Both need auth + `canAccessProject` checks. Both use `db.batch()`.

**Component changes**

`VersionStackModal` (collocated in `AssetCard.tsx`) — modify in place:
- Add drag-to-reorder rows. Use HTML5 drag API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) on each version row. Keep state as `orderedVersions: Asset[]`, derive new order on drop.
- Add "Unstack" button (eject icon) per row — disabled when only one version in group.
- On reorder commit (drag end or explicit Save button), call `POST /api/assets/reorder-versions`.
- On unstack, call `POST /api/assets/unstack-version`, then call `onDeleted?.()` to trigger parent grid refetch.
- Optimistic UI: update local `orderedVersions` state immediately; revert on API error.

**No new top-level components** — all changes contained to the collocated modal function.

**Dependencies:** None. Build this first — it has no dependencies on other v1.4 features.

---

### 2. Asset Status Field (STATUS-01)

**What changes**

The existing `AssetStatus = 'uploading' | 'ready'` type is the upload lifecycle. The new QC status is a separate concept.

**Firestore changes**

Add optional field to the `assets` collection:

```
reviewStatus?: 'approved' | 'needs_revision' | 'pending'
```

Default is absent/undefined, which the UI treats as `'pending'`. Do NOT name it `status` (collision with existing upload lifecycle field). The new type lives in `src/types/index.ts`:

```typescript
export type ReviewStatus = 'approved' | 'needs_revision' | 'pending';
// Add to Asset interface:
reviewStatus?: ReviewStatus;
```

**API changes**

`PUT /api/assets/[assetId]` already accepts arbitrary `updates` and writes them to Firestore. A `reviewStatus` update works today with zero API changes, because the PUT handler does `await db.collection('assets').doc(params.assetId).update(updates)`.

A dedicated status endpoint is cleaner for explicit validation: `PUT /api/assets/[assetId]/status` — body: `{ reviewStatus }`. Validates value is in the enum. Optional but recommended.

**Component changes**

- `AssetCard` — ADD a colored status badge in the info section. Badge colors: green = approved, amber = needs_revision, grey/none = pending. Click badge opens a small popover with 3 status options.
- `AssetCard` context menu — ADD "Set status" item.
- `AssetListView` — ADD a status column.
- `AssetGrid` / `FolderBrowser` — ADD a status filter bar above the grid. Filter state lives in `FolderBrowser` as `statusFilter: ReviewStatus | 'all'`. Filtering is client-side against the already-fetched `assets` array.
- `types/index.ts` — ADD `ReviewStatus` type, add `reviewStatus?: ReviewStatus` to `Asset`.

**Dependencies:** None. Can build independently. Recommended second.

---

### 3. Smart Copy to Review (REVIEW-01 + REVIEW-02)

**What changes**

Current `POST /api/assets/copy` copies the entire version stack. The new "smart copy" copies only the latest version and optionally presents a "strip comments" option.

**Firestore changes**

None. The copy operation creates new asset documents. For "strip comments," the copy simply does not copy comment documents (comments are a separate collection keyed by `assetId`; copies get new IDs so comments never follow copies — this is already the existing behavior).

**API changes**

Extend `POST /api/assets/copy` with one new optional body param:
- `latestVersionOnly?: boolean` — when true, only copy the asset with the highest `version` number in the stack (instead of all).

"Strip comments" requires no backend change since comments never copy today.

Modified copy logic when `latestVersionOnly: true`:
```typescript
// allVersions is sorted ascending by version
const toActuallyCopy = latestVersionOnly
  ? [allVersions[allVersions.length - 1]]
  : allVersions;
// Set version = 1 and new versionGroupId on the single copy
```

**Component changes**

Replace the simple folder-pick flow in `AssetCard` with a `SmartCopyModal` that shows:
- Folder picker (reuse existing inline folder list from `openCopyTo`)
- Toggle: "Latest version only" (default on)
- Toggle: "Without comments" (cosmetic label only — comments never copy; shown for user clarity)
- Copy button

`SmartCopyModal` is a new component (~80 lines). Can be collocated in `AssetCard.tsx` or extracted to `components/files/SmartCopyModal.tsx`.

**Dependencies:** None. REVIEW-01/02 are a single unit.

---

### 4. Selection-Based Review Links (REVIEW-03)

**What changes**

Review links are currently scoped to `folderId | null`. The new scope is an explicit `assetIds: string[]`.

**Firestore changes**

Add optional field to `reviewLinks` collection:

```
assetIds?: string[]   // when present, link shows only these specific assets
```

When `assetIds` is set, `folderId` should be null (or set to the source folder for breadcrumb context). The resolution logic in the token GET route checks `assetIds` first.

```typescript
// Add to ReviewLink interface (types/index.ts):
assetIds?: string[];
```

**API changes**

`POST /api/review-links` — accept optional `assetIds: string[]` in body and store in Firestore.

`GET /api/review-links/[token]` — modify asset resolution:
```typescript
if (link.assetIds?.length) {
  // db.collection('assets').where('__name__', 'in', link.assetIds).get()
  // Note: Firestore 'in' is capped at 30; batch into chunks for >30
} else {
  // existing folderId-scoped query (unchanged)
}
```

**Component changes**

- `FolderBrowser` — when `selectedIds.size > 0`, show "Create review link from selection" in the selection action toolbar (currently has Delete, Download, Compare). Click opens `CreateReviewLinkModal` with `assetIds` prop.
- `CreateReviewLinkModal` — add optional `assetIds?: string[]` prop. When provided, show "Scoped to X assets" label instead of folder picker section. Pass `assetIds` to `POST /api/review-links` body.

**Dependencies:** None from other v1.4 features.

---

### 5. Compare View Audio & Comments (COMPARE-01 + COMPARE-02)

**What changes**

`VersionComparison` currently has a single shared `muted` boolean and no comment display. Need per-side audio control and per-version comment panel.

**Firestore changes**

None. Comments are already fetchable via `GET /api/comments?assetId=X`.

**API changes**

None. `GET /api/comments` already accepts `assetId` query param.

**Component changes — VersionComparison.tsx**

Significant internal refactor; no prop interface change (still receives `versions: Asset[]`):

**COMPARE-01 — per-side audio:**
- Replace `muted: boolean` with `mutedA: boolean, mutedB: boolean`.
- `VersionLabel` subcomponent (already exists) gains a mute toggle icon button.
- "Click version label to switch audio" behavior: clicking the label for side B unmutes B and mutes A; clicking side A does the reverse. Implement as `handleLabelAudioToggle(side: 'A' | 'B')`.
- `videoARef.current.muted = mutedA`, `videoBRef.current.muted = mutedB` in the relevant `useEffect`.

**COMPARE-02 — per-version comments:**
- Add state: `commentsA: Comment[], commentsB: Comment[], commentsLoading: boolean`.
- `useEffect` on `[selectedIdA, selectedIdB]` — parallel fetch `GET /api/comments?assetId={selectedIdA}` and `GET /api/comments?assetId={selectedIdB}`. Requires `useAuth` hook for token.
- Add a comment panel below the video. Simplest approach: a tab row ("V{A.version} comments" | "V{B.version} comments") showing the relevant list. Active tab tracks the "audio-active" side.
- `Comment` type is already in `src/types/index.ts`.

**Data flow note:** `VersionComparison` receives `versions: Asset[]` from `GET /api/assets/[assetId]` which already returns the full version set. Comment fetch is additive local state.

**Dependencies:** Build COMPARE-01 (audio) before COMPARE-02 (comments) — the "active side" concept set up for audio is reused to drive comment panel tab selection.

---

### 6. Move to Folder (MOVE-01)

**What changes**

The "Move to" option already appears in `AssetCard`'s context menu and calls `onRequestMove?.()`. `FolderBrowser.handleRequestMoveItem` already responds by setting `selectedIds` to just that asset and opening the move modal. `handleMoveSelected` calls `PUT /api/assets/[assetId]` with `{ folderId }`. The PUT route already batch-moves all versions.

**In other words: the full move-to-folder pipeline already exists.** The question is whether the prop wire is connected.

The chain to verify:
```
FolderBrowser → <AssetGrid onRequestMove={handleRequestMoveItem} ... />  ← verify
AssetGrid     → <AssetCard onRequestMove={() => onRequestMove(asset.id)} ... />  ← exists
AssetCard     → ContextMenu "Move to" onClick={() => onRequestMove?.()}  ← exists
```

If `FolderBrowser` already passes `onRequestMove` to `AssetGrid`, MOVE-01 is complete. If not, the fix is one line: add `onRequestMove={handleRequestMoveItem}` to the `<AssetGrid>` JSX in `FolderBrowser`.

**API changes:** None.

**Firestore changes:** None.

**Dependencies:** None. Verify first in the build — may be a no-op feature.

---

## Firestore Schema Diff (v1.3 → v1.4)

| Collection | Field | Change | Type | Notes |
|------------|-------|--------|------|-------|
| `assets` | `reviewStatus` | ADD | `'approved' \| 'needs_revision' \| 'pending'` | Optional; absence = pending |
| `reviewLinks` | `assetIds` | ADD | `string[]` | Optional; when present, folderId scope is bypassed |

No other schema changes required. Existing `version` and `versionGroupId` fields cover all VSTK-01 needs.

---

## API Route Diff (v1.3 → v1.4)

| Route | Method | Change | Purpose |
|-------|--------|--------|---------|
| `/api/assets/reorder-versions` | POST | NEW | Batch-update version numbers for a group in given order |
| `/api/assets/unstack-version` | POST | NEW | Eject one asset from its version group |
| `/api/assets/copy` | POST | MODIFY | Add `latestVersionOnly?: boolean` param |
| `/api/assets/[assetId]/status` | PUT | NEW (optional) | Validated reviewStatus update with enum check |
| `/api/review-links` | POST | MODIFY | Accept and store `assetIds?: string[]` |
| `/api/review-links/[token]` | GET | MODIFY | Resolve assets from `assetIds` array when present |

---

## Component Diff (v1.3 → v1.4)

### Modified Components

| Component | File | Nature of Change |
|-----------|------|-----------------|
| `VersionStackModal` | `AssetCard.tsx` (collocated) | Add drag-to-reorder rows, Unstack button, Save order action |
| `AssetCard` | `components/files/AssetCard.tsx` | Add reviewStatus badge + picker, replace copy modal with SmartCopyModal |
| `AssetListView` | `components/files/AssetListView.tsx` | Add reviewStatus column |
| `FolderBrowser` | `components/files/FolderBrowser.tsx` | Add status filter bar; add "Create review link from selection" toolbar action |
| `VersionComparison` | `components/viewer/VersionComparison.tsx` | Per-side audio mute state; comment fetch + display per selected version |
| `CreateReviewLinkModal` | `components/review/CreateReviewLinkModal.tsx` | Accept `assetIds?` prop; send to API; show scoped label |
| `types/index.ts` | `src/types/index.ts` | Add `ReviewStatus` type; update `Asset` and `ReviewLink` interfaces |

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SmartCopyModal` | `components/files/SmartCopyModal.tsx` or collocated in `AssetCard.tsx` | Copy options: latest-version-only toggle, strip-comments label, folder picker |
| `ReviewStatusBadge` | Inline in `AssetCard` or `components/files/ReviewStatusBadge.tsx` | Colored pill badge with click-to-change popover |
| `CompareCommentPanel` | Collocated in `VersionComparison.tsx` | Renders comment list for one version side in compare view |

---

## Suggested Build Order

```
1. MOVE-01     — verify prop wire; likely 0-1 lines, clears the requirement
2. VSTK-01     — version stack reorder + unstack (2 new API routes + modal UI)
3. STATUS-01   — reviewStatus type + badge + filter (touches many files, each small)
4. REVIEW-01/02 — smart copy (1 API param + SmartCopyModal)
5. REVIEW-03   — selection review links (schema + 2 API changes + modal prop)
6. COMPARE-01  — per-side audio mute in VersionComparison
7. COMPARE-02  — per-version comments in VersionComparison
```

**Ordering rationale:**
- MOVE-01 first: lowest risk, may already work entirely, surfaces quickly.
- VSTK-01 second: self-contained, new API routes + modal behavior, good warm-up.
- STATUS-01 third: new type + Firestore field + UI badge — many files but each change is small and independent.
- REVIEW-01/02 fourth: one API param change + one new modal component — low risk.
- REVIEW-03 fifth: depends on understanding the copy patterns established in REVIEW-01/02; Firestore and API changes are straightforward.
- COMPARE-01/02 last: most self-contained (changes stay inside VersionComparison.tsx) but most complex internal state work — best done with all other features cleared.

---

## Cross-Cutting Concerns

### Optimistic UI Pattern

The codebase uses a consistent pattern: call API, on success call `onDeleted?.()` / `onVersionUploaded?.()` / `onCopied?.()` to trigger `refetchAssets()` in FolderBrowser. For VSTK-01 reordering: update local `orderedVersions` state immediately, then call API; on error, refetch to revert.

### Batch Atomicity Pattern

All multi-asset writes use `db.batch()` (established in merge-version and PUT with folderId). VSTK-01 reorder and unstack must follow this pattern.

### Auth Pattern

All API routes: `getAuthenticatedUser(request)` then `canAccessProject(user.id, projectId)`. New routes must follow the same pattern exactly.

### reviewStatus vs status Naming

The existing `AssetStatus = 'uploading' | 'ready'` maps to the `status` field in Firestore. The new QC field must be `reviewStatus` everywhere — in Firestore documents, in the TypeScript `Asset` interface, and in API request/response bodies — to avoid collision.

### Firestore in-query Limit for assetIds

Firestore `where('__name__', 'in', ids)` is capped at 30 items per clause. Review selection-based links with more than 30 assets need multiple batched queries merged client-side. In practice, review selections are small, but the batch logic should be in place from the start.
