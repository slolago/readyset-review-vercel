# Technology Stack — v1.4 Review & Version Workflow

**Project:** readyset-review
**Researched:** 2026-04-08
**Scope:** Additive changes only. Existing stack (Next.js 14, Firebase, GCS, Tailwind, Video.js, Fabric.js, Radix UI, Zustand, Lucide) is validated and not re-examined here.

---

## Verdict: No New npm Packages Required

Every v1.4 feature can be built with what is already installed. The analysis below justifies this for each feature and identifies the exact code surfaces that need to change.

---

## Feature-by-Feature Stack Analysis

### VSTK-01: Version stack unstack + reorder

**What it needs:** A UI listing the versions in a stack with drag-to-reorder and an "Unstack" action per version, plus API routes to commit the changes.

**Stack decision: Native HTML5 drag-and-drop + new API route. No new library.**

The project already uses HTML5 drag-and-drop for asset-to-folder moves (`AssetListView.tsx`) and asset-to-asset version merging (`merge-version/route.ts`). A vertical sortable list inside the existing `Modal` component uses the identical `onDragStart`/`onDrop`/`onDragOver` primitives with no new dependencies.

The Firestore data model (`versionGroupId` + integer `version`) already carries everything needed:
- **Reorder:** Batch write assigning new sequential `version` values to all docs in the group.
- **Unstack (extract one):** Batch write setting the extracted asset's `versionGroupId` to its own document ID and renumbering the remaining group members.

**New API route needed:** `POST /api/assets/unstack` — receives `{ assetId, versionGroupId }`, runs the extract-and-renumber batch. (Reorder can go through the same route as a `positions` array, or be a separate `POST /api/assets/reorder-versions`.)

**New component:** `VersionStackModal` — renders version list with drag handles using existing `Modal` wrapper.

**Rejected alternative:** `@dnd-kit/sortable` or `react-beautiful-dnd` — overkill for a bounded list (max ~15 items) inside a modal with no scroll-conflict edge cases. The existing drag model is already understood project-wide.

---

### STATUS-01: Asset status labels (APPROVED / PENDING / NEEDS_CHANGES)

**What it needs:** A new optional field on `Asset`, UI to display the label on asset cards, and the ability to set it from the context menu or viewer.

**Stack decision: Type extension + existing `updateAsset` helper. No new library.**

Add `reviewStatus?: 'approved' | 'pending' | 'needs_changes' | 'none'` to the `Asset` type in `src/types/index.ts`. The existing `PUT /api/assets/[assetId]` route accepts `Partial<Asset>`, so no new route is needed to write the value.

The existing `Badge` UI component (`src/components/ui/Badge.tsx`) handles status chips with color variants — extend its color props if needed rather than creating a new component.

Note: `allowApprovals` on `ReviewLink` is a separate concept (enables guest-facing approve/reject actions). STATUS-01 is the internal QC label visible to collaborators at all times. Both can coexist on the same asset: the review link approval action can write to `reviewStatus` when a guest approves/rejects, closing the loop.

**No new Firestore collection.** A field on the existing `assets` document is sufficient. `reviewStatus` will not be filtered at collection-query level in v1.4 (displayed per-asset only), so no new composite index is needed.

---

### REVIEW-01: Smart copy — latest version only

**What it needs:** When copying a version stack to a folder (e.g., "Client Facing"), copy only the highest-version asset rather than the entire stack.

**Stack decision: One new parameter on existing `/api/assets/copy` route. No new library.**

The current `copy/route.ts` already fetches all group members and batch-creates them. Adding `latestOnly?: boolean` to the request body requires: query group members, sort by `version` descending, take `[0]`, create a single-asset group. This is ~10 lines of conditional logic inside the existing route.

No new endpoint. No new type. One flag.

---

### REVIEW-02: Copy without comments option

**What it needs:** Assurance that the copy does not carry over comments, surfaced to the user as an explicit UI option.

**Stack decision: No backend change. UI-only affordance.**

Reading `copy/route.ts` confirms it copies only `assets` documents — it never touches the `comments` collection. "Copy without comments" is already the default behavior of every copy. The only deliverable is adding a checkbox/label to the copy modal so users understand this is intentional. No API change, no type change.

---

### REVIEW-03: Selection-based review links

**What it needs:** Generate a review link scoped to a specific set of manually selected asset IDs rather than an entire folder.

**Stack decision: Type extension + route update. No new library.**

Add `assetIds?: string[]` to the `ReviewLink` type. In the review link creation modal, when assets are selected in the grid, pass those IDs. In `POST /api/review-links`, accept and persist the array. In the review link resolver (`GET /api/review-links/[token]/route.ts`), when `assetIds` is present, fetch those specific assets rather than querying by `folderId`.

Firestore does not have a native "fetch by array of document IDs" query, but `Promise.all(assetIds.map(id => db.collection('assets').doc(id).get()))` is the correct pattern for up to ~100 IDs — well within the range of a manual asset selection. This pattern is already used implicitly in other routes in this codebase.

The `CreateReviewLinkModal` already receives `folderId` as a prop; it can additionally receive `assetIds?: string[]`. The grid already tracks `isSelected` per asset. The wiring is passing selectedIds from the toolbar down to the modal.

---

### COMPARE-01: Compare view audio switch by clicking version label

**What it needs:** In side-by-side mode, clicking a version label unmutes that side's audio and mutes the other.

**Stack decision: State refactor inside `VersionComparison.tsx` only. No new library.**

`VersionComparison.tsx` currently has a single shared `muted` boolean state and a unified audio toggle. This feature requires splitting into independent `mutedA`/`mutedB` state variables. The version label buttons (which already exist as clickable elements for the picker) gain a secondary action: set `mutedA = false, mutedB = true` or vice versa when a label is clicked. The `videoARef`/`videoBRef` refs already support independent `muted` property control.

No changes needed outside `VersionComparison.tsx`.

---

### COMPARE-02: Compare view shows focused version's comments

**What it needs:** A comment panel in the compare view that shows comments for whichever side is currently focused/active.

**Stack decision: Reuse existing `CommentSidebar` component. Layout refactor only.**

`CommentSidebar` at `src/components/viewer/CommentSidebar.tsx` already accepts an `assetId` prop and handles its own comment fetching via `useComments`. In the compare view, add `focusedSide: 'A' | 'B'` state, derive `focusedAsset` from it, and render `<CommentSidebar assetId={focusedAsset.id} ... />` adjacent to the video area.

The compare view currently uses the full viewport width. Adding a comment panel requires a flex-row layout split: video comparison area (flex-1) + comment panel (fixed width, e.g., 320px). This is a CSS layout change in `VersionComparison.tsx`, not a logic change. The `focusedSide` can be set by clicking either video panel or either version label (which is the same click as COMPARE-01).

---

### MOVE-01: Move to folder context menu option

**What it needs:** A "Move to" item in `AssetCard`'s context menu that opens a folder picker and then moves the asset (and its entire version group) to the selected folder.

**Stack decision: New `MoveToModal` component using existing `FolderBrowser` + `Modal`. No new library.**

The `AssetCard` props interface already declares `onRequestMove?: () => void` — the hook is in place. The context menu `items` array in `AssetCard` needs one new entry calling `onRequestMove`.

The backend already handles group-atomic folder moves: `PUT /api/assets/[assetId]` with `{ folderId }` detects the `folderId` field and batch-updates all siblings (confirmed in `[assetId]/route.ts` lines 60–75).

A new `MoveToModal` component wraps `FolderBrowser` (already built for the "Copy to" flow in `AssetCard`) in the existing `Modal` with a "Move here" confirm button. This is a parallel implementation of the same copy-modal pattern, with a different API call.

**Rejected alternative:** `@radix-ui/react-context-menu` for a proper submenu. The nested "Move to → [folder list]" pattern would benefit from a proper submenu, but the existing `ContextMenu` component + a modal picker gives the same UX with no new dependency. A modal is actually friendlier for folder browsing than a flat submenu.

---

## Consolidated Change Surface

| File | Action | Ticket(s) |
|------|--------|-----------|
| `src/types/index.ts` | Add `reviewStatus` to `Asset`; add `assetIds` to `ReviewLink` | STATUS-01, REVIEW-03 |
| `src/app/api/assets/unstack/route.ts` | New route: extract one asset from group, renumber rest | VSTK-01 |
| `src/app/api/assets/reorder-versions/route.ts` | New route: accept ordered array, batch-write new version integers | VSTK-01 |
| `src/app/api/assets/copy/route.ts` | Add `latestOnly` param | REVIEW-01 |
| `src/app/api/review-links/route.ts` | Accept + persist `assetIds` array | REVIEW-03 |
| `src/app/api/review-links/[token]/route.ts` | Filter assets by `assetIds` when present | REVIEW-03 |
| `src/components/files/VersionStackModal.tsx` | New modal: list versions, drag-to-reorder, unstack button | VSTK-01 |
| `src/components/files/MoveToModal.tsx` | New modal: folder picker for moves | MOVE-01 |
| `src/components/files/AssetCard.tsx` | Add "Move to" context menu item | MOVE-01 |
| `src/components/files/AssetGrid.tsx` | Wire up selectedAssetIds → CreateReviewLinkModal | REVIEW-03 |
| `src/components/review/CreateReviewLinkModal.tsx` | Accept `assetIds` prop, show selection count | REVIEW-03 |
| `src/components/viewer/VersionComparison.tsx` | Per-side audio state; focusedSide + CommentSidebar panel | COMPARE-01, COMPARE-02 |
| `src/components/ui/Badge.tsx` | Extend color variants for review status labels | STATUS-01 |
| `package.json` | No changes | — |

---

## What NOT to Add

**`@dnd-kit/sortable` or `react-beautiful-dnd`:** The version reorder list is bounded (max ~15 items), lives inside a modal without scroll conflicts, and the existing HTML5 drag model is already established throughout the codebase. A library would add bundle weight and force a pattern change.

**`@radix-ui/react-context-menu`:** The custom `ContextMenu` component handles all v1.4 needs (viewport-flip, escape-dismiss, portal rendering). A "Move to" submenu sounds attractive but a modal folder picker gives better UX for nested folder navigation anyway.

**A separate `assetStatuses` Firestore collection:** A field on the existing asset document is correct. A separate collection would add query complexity, a new listener, and an extra index with no benefit at this data scale.

**Server-side copy of comments:** Comments are already not copied by the copy route. REVIEW-02 is a UI-only affordance with zero backend work.

---

## Firestore Index Notes

- `reviewStatus` is not queried at collection level in v1.4 — no new index.
- `assetIds`-scoped review links fetch by document ID (individual `doc().get()` calls), not by query — no new index.
- All existing `assets` queries (`projectId + folderId + createdAt`) are unchanged.

---

## Current Stack (Unchanged)

| Technology | Version | Role |
|------------|---------|------|
| Next.js | 14.2.5 | App Router, API routes |
| React | 18 | UI |
| Firebase | ^10.12.2 | Auth |
| firebase-admin | ^12.2.0 | Server-side Firestore |
| @google-cloud/storage | ^7.11.2 | GCS signed URLs |
| Tailwind CSS | ^3.4.1 | Styling |
| fabric | ^5.3.0 | Annotation canvas |
| lucide-react | ^0.395.0 | Icons |
| @radix-ui/react-dropdown-menu | ^2.0.6 | Dropdown menus |
| @radix-ui/react-dialog | ^1.0.5 | Dialogs |
| @radix-ui/react-select | ^2.0.0 | Select inputs |
| @radix-ui/react-tooltip | ^1.0.7 | Tooltips |
| @radix-ui/react-avatar | ^1.0.4 | Avatars |
| @radix-ui/react-progress | ^1.0.3 | Progress bars |
| zustand | ^4.5.2 | Global state |
| react-hot-toast | ^2.4.1 | Toast notifications |
| date-fns | ^3.6.0 | Date formatting |
| nanoid | ^5.0.7 | Token/ID generation |
| react-dropzone | ^14.2.3 | File upload drop zone |
| clsx + tailwind-merge | ^2.x | Class name utilities |
| cookies-next | ^4.1.0 | Cookie handling |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| No new packages required | HIGH | Full codebase read; every needed primitive already present |
| Firestore batch patterns (unstack/reorder) | HIGH | `merge-version/route.ts` confirms the exact same pattern |
| `assetIds` fetch via `doc().get()` per ID | HIGH | Pattern used implicitly in existing version-fetching code |
| Native drag-to-reorder in modal | HIGH | Same drag events already used in `AssetListView` and `FolderBrowser` |
| `CommentSidebar` reuse in compare view | HIGH | Props interface confirmed; `assetId` is the only required input |
| REVIEW-02 is backend-free | HIGH | `copy/route.ts` confirmed to never touch `comments` collection |

---

## Sources

- Codebase: `src/types/index.ts` — full `Asset` and `ReviewLink` shapes
- Codebase: `src/app/api/assets/copy/route.ts` — confirms comments are never copied
- Codebase: `src/app/api/assets/merge-version/route.ts` — confirms Firestore batch pattern for version group manipulation
- Codebase: `src/app/api/assets/[assetId]/route.ts` — confirms group-atomic `folderId` move in PUT handler
- Codebase: `src/app/api/review-links/route.ts` — current `ReviewLink` creation shape
- Codebase: `src/components/viewer/VersionComparison.tsx` — per-side video refs and mute state
- Codebase: `src/components/files/AssetCard.tsx` — `onRequestMove` already in props interface
- Codebase: `src/components/ui/ContextMenu.tsx`, `Modal.tsx`, `Dropdown.tsx`, `Badge.tsx` — existing UI primitives
- `package.json` — confirmed full dependency set
- `.planning/PROJECT.md` — v1.4 requirements and key decisions
