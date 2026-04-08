# Feature Landscape — v1.4 Review & Version Workflow

**Domain:** Media review / video production QC platform (Frame.io clone)
**Researched:** 2026-04-08
**Confidence:** HIGH (codebase verified) / MEDIUM (UX patterns, Frame.io docs via search)

---

## Existing Codebase Snapshot (what we're building on)

Key facts that constrain every feature below:

- `Asset.status` is currently `'uploading' | 'ready'` — no QC status field exists yet
- `ReviewLink` is folder-scoped only (`folderId: string | null`) — no asset-ID list field exists
- `VersionStackModal` only shows delete per version — no reorder or unstack
- `VersionComparison` has one global muted toggle; audio is actually always muted on side B (hardcoded `muted` on `videoBRef`); no comment sidebar at all in compare view
- `AssetCard` context menu already has "Move to" item calling `onRequestMove` — the callback is wired in `AssetGrid` but the actual folder-picker + API move is not implemented
- `AssetFolderPickerModal` already exists (used for "Copy to") — reusable for "Move to"
- `CreateReviewLinkModal` already has `showAllVersions` toggle — no "latest only" or "strip comments" options

---

## Table Stakes

Features that production teams expect in any serious media review tool. Absence makes the product feel unfinished.

| Feature | Why Expected | Complexity | Codebase Hook |
|---------|--------------|------------|---------------|
| VSTK-01a: Unstack individual version | Frame.io legacy + V4 both support it. Users need to rescue a misplaced file from a stack without deleting it. | Medium | Extend `VersionStackModal`; new API endpoint to detach version from `versionGroupId` |
| VSTK-01b: Reorder versions within a stack | Frame.io V4 added PATCH reorder in 2025. Editors expect V1/V2/V3 labels to reflect chronological or intentional order. Without this, version numbers get confusing when files are merged in the wrong order. | Medium-High | Drag-to-reorder in `VersionStackModal`; new API to update `version` numbers atomically |
| STATUS-01: APPROVED / status label on asset card | Frame.io has shipped "Needs Review", "In Progress", "Approved" since at least v2. A green APPROVED badge on a thumbnail is the single clearest QC signal in a grid. | Low-Medium | New `labelStatus` field on `Asset` type; badge in `AssetCard` thumbnail overlay |
| MOVE-01: "Move to..." folder picker | Already scaffolded in context menu and `AssetGrid`. Drag-to-move exists for grid drop targets. Context menu "Move to" stub exists but does nothing. Users expect right-click → Move to → folder tree. | Low | `AssetFolderPickerModal` is reusable; just needs a Move API route and the parent to wire `onRequestMove` |
| COMPARE-01: Click version label to switch active audio | Current compare view: audio hardcoded muted on side B. The single audio toggle mutes/unmutes side A only. This is a known gap — in Frame.io, clicking either version label makes that side the "audio source." | Medium | Change `VersionComparison` to track `activeAudioSide: 'A' | 'B'`; apply `muted` based on it |
| COMPARE-02: Compare view shows active version's comments | Frame.io V4's Comparison Viewer explicitly supports "leave comments on either version." Without this, compare mode is a dead end for QC — no feedback possible. | High | Requires passing `projectId` + `assetId` into `VersionComparison`; render `CommentSidebar` filtered to active version |

---

## Differentiators

Features beyond baseline that add meaningful workflow value for production QC pipelines. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| REVIEW-03: Selection-based review link | Frame.io V4 supports sharing specific assets from anywhere. Folder-scoped links force users to create folders just to share a subset. Selection-based links enable "share exactly these 3 hero shots" without folder reorganization. | Medium-High | `ReviewLink` needs an `assetIds: string[]` field alongside `folderId`; review page logic must union both |
| REVIEW-01: Smart copy — latest version only | When copying a version-stacked asset to Client Facing Folder, copying the whole stack is noise. "Latest only" copies only the highest-version asset. Reduces clutter for clients. | Low-Medium | `POST /api/assets/copy` needs a `latestVersionOnly: boolean` flag; server looks up stack and copies only the max-version asset |
| REVIEW-02: Copy without comments | Stripping comments on copy-to-client-folder is a common production gate. The client should not see internal notes ("ADD LOGO HERE") when they receive the deliverable copy. | Low | `POST /api/assets/copy` needs a `stripComments: boolean` flag; server skips the comment-copy step if set |
| STATUS-01b: Status filter in grid | Once APPROVED labels exist, users want to filter "show only unapproved" to find remaining work. A single-click filter chip above the grid is standard in Filestage and Frame.io. | Low-Medium | Client-side filter on the assets array; no API change needed |

---

## Anti-Features

Things that would seem natural to add but should be explicitly avoided in v1.4.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom status label editor (user-defined statuses) | Frame.io V4 offers 32 custom metadata fields. This is significant scope and requires a settings UI, migration logic, and display logic for arbitrary strings. V1.4 is about QC workflow, not metadata customization. | Ship 4 fixed statuses: APPROVED, NEEDS_REVISION, IN_REVIEW, PENDING. That covers 95% of QC pipelines. |
| Multi-approver workflow / approval gates | Workfront-style sequential approval chains are a product unto themselves. They require roles, notifications, deadlines, escalation. Out of scope. | The `allowApprovals` toggle on review links + APPROVED status label covers the lightweight use case adequately. |
| Real-time comment sync in compare view | Live comment updates via Firestore subscription in the compare overlay would require a new subscription + presence system. The compare view is a focused diff tool, not a live collaboration surface. | Fetch comments once on side-switch; manual refresh if needed. |
| Bulk status change (select all, then approve) | Adds selection state management in a second context, checkbox orchestration, and batch Firestore writes. Not worth the scope for v1.4. | Single-asset status change from context menu or asset viewer is sufficient. |
| Version stack merge across folders | Merging versions from different folders raises complex ownership/path questions. | Keep drag-to-stack limited to same-folder assets, as it is today. |

---

## Feature Details by Ticket

### VSTK-01a — Unstack Individual Version

**Expected UX:** In the "Version stack" modal, each row has two actions: Delete (existing) and Unstack. "Unstack" removes the version from the group but does NOT delete the file — it becomes a standalone asset in the same folder. Version numbers of remaining stack members are re-normalized.

**Edge cases:**
- Unstacking when only 2 versions remain: the remaining asset also becomes standalone, stack is dissolved.
- Unstacking the "group representative" asset (the one whose `id` is the stack head): group head should transfer to the next highest version.
- UI: disable Unstack when only 1 version remains (same guard as Delete).

**API:** `POST /api/assets/{id}/unstack` sets `versionGroupId = asset.id` (its own ID), sets `version = 1`, re-normalizes others in the stack.

---

### VSTK-01b — Reorder Versions

**Expected UX:** In the "Version stack" modal, rows are drag-to-reorder (vertical drag handles on left side). Dropping a row re-assigns `version` numbers in displayed order. Version 1 = top of list = "oldest/base"; version N = bottom = "latest." Modal shows a "Save order" button that appears only after the order changes; idle state has no save button (no unnecessary cognitive load).

**Complexity note:** Firestore batch update of N version numbers. Need optimistic UI — reorder locally immediately, commit on "Save order," rollback on failure.

**Dependency:** VSTK-01a (unstack) and VSTK-01b (reorder) both touch `VersionStackModal` — implement together.

---

### STATUS-01 — Asset Status Labels

**Expected UX (Frame.io pattern):**
- Status is a small colored badge on the thumbnail (bottom-left or alongside the type badge).
- Status values: `APPROVED` (green), `NEEDS_REVISION` (red/orange), `IN_REVIEW` (yellow), `PENDING` (gray/default — visually absent or neutral).
- `PENDING` is the default; badge only shows if status is not PENDING (same philosophy as comment count badge: hidden when zero).
- Right-click context menu gets a "Set status" submenu with the 4 values.
- In the asset viewer, status is also visible in the Info tab.
- Clicking a status badge directly (on the card) opens the set-status submenu inline — matches Frame.io muscle memory.

**Data model change:** Add `labelStatus?: 'APPROVED' | 'NEEDS_REVISION' | 'IN_REVIEW' | 'PENDING'` to `Asset` interface. Default absent/`PENDING`.

**API:** `PATCH /api/assets/{id}` already exists (used for rename). Add `labelStatus` to the allowed update fields.

**Visual design:** Use existing badge system (same pattern as V-count badge in `AssetCard`). Colors:
- APPROVED: `bg-green-500/80` with check icon
- NEEDS_REVISION: `bg-red-500/80` with X or alert icon
- IN_REVIEW: `bg-yellow-500/80` with eye icon
- PENDING: no badge (absent)

---

### REVIEW-01 + REVIEW-02 — Smart Copy to Client Facing Folder

**Expected UX:** "Copy to" modal (`AssetFolderPickerModal`) gets two checkboxes at the bottom:
- "Latest version only" (checked by default when asset has multiple versions)
- "Strip comments" (unchecked by default)

"Latest version only" only appears when the asset is in a version stack (version count > 1). "Strip comments" always appears.

**API change:** `POST /api/assets/copy` body gains `latestVersionOnly?: boolean` and `stripComments?: boolean`. Server logic:
- `latestVersionOnly = true`: fetch all versions in the `versionGroupId`, find max `version`, copy only that asset.
- `stripComments = false` (default): existing behavior, copy comments too.
- `stripComments = true`: copy asset record only, skip comment documents.

**Dependency:** Reuses `AssetFolderPickerModal` — needs minor extension (two checkboxes added to footer area).

---

### REVIEW-03 — Selection-Based Review Links

**Expected UX (Frame.io V4 pattern):**
1. User selects 1+ assets using existing checkbox selection in the grid.
2. In the bulk actions toolbar (already shown when `selectedIds.size > 0`), a new button: "Create review link."
3. Opens `CreateReviewLinkModal` with a new mode: pre-populated with the selected asset IDs rather than a folderId.
4. The created link routes to a review page that renders only those specific assets regardless of their folder location.
5. Link label shows "X assets selected" instead of folder name.

**Data model change:** `ReviewLink` gains `assetIds?: string[]`. When `assetIds` is set, `folderId` is null (mutually exclusive). Review page API must handle both modes.

**Complexity:** Medium-High. The review page (`/review/[token]/page.tsx`) needs to handle asset-list mode: fetch each asset individually or via a batch query by IDs. The `ReviewLink` creation API must accept `assetIds`. The review page rendering is the same — just a different data source.

**Dependency:** Existing selection infrastructure (`selectedIds`, `onToggleSelect`) and bulk actions toolbar.

---

### COMPARE-01 — Compare View Audio Switch by Click

**Expected UX:** In `VersionComparison`, both version label buttons (A and B) act as the audio source selector. Clicking a label makes that side's video the audio source (the other is muted). Current active audio side should be visually indicated on the label (e.g., a speaker icon, or a subtle ring/glow vs. the current static A/B styling).

**Current state:** Side A is the audio master; side B is always `muted`. The mute button mutes/unmutes side A only.

**Implementation:** Add `activeAudioSide: 'A' | 'B'` state (default `'A'`). Apply `muted={activeAudioSide !== 'A'}` to videoA and `muted={activeAudioSide !== 'B'}` to videoB. `VersionLabel` button `onClick` sets `activeAudioSide` to its side. The existing global mute toggle (`muted` state) becomes a secondary mute-all override. Visual indicator: speaker icon on the active label, VolumeX on the inactive.

**Complexity:** Low. Purely UI state change in `VersionComparison`. No API, no new components.

---

### COMPARE-02 — Compare View Shows Focused Version's Comments

**Expected UX (Frame.io V4 pattern):** A comments sidebar is visible alongside the comparison viewer. Clicking a version label makes that version "active" — the sidebar shows that version's comments (filtered by `assetId`). Sidebar collapses/hides if toggled to keep the comparison area focused.

**Current state:** `VersionComparison` has no sidebar, no comment loading, no `projectId` prop.

**Implementation approach:**
- Add `projectId: string` prop to `VersionComparison`.
- Add `activeCommentSide: 'A' | 'B'` state (shares with COMPARE-01's `activeAudioSide` — clicking a label sets both audio and comment source).
- Render `CommentSidebar` on the right, passing `assetId = activeCommentSide === 'A' ? assetA.id : assetB.id` and `projectId`.
- Layout: comparison viewer takes remaining width, sidebar fixed width (~320px, same as normal viewer sidebar).
- Add a toggle button to show/hide the sidebar (default shown).

**Dependency:** COMPARE-01 (both features share the "click label = set active side" interaction). Implement together. Requires `CommentSidebar` to accept an `assetId` prop override (check if it reads from page context or props).

**Complexity:** High. Layout restructure, new prop threading, comment subscription for `activeCommentSide`'s asset.

---

### MOVE-01 — Move to Folder Context Menu

**Expected UX:** Right-click → "Move to" → folder picker modal (identical to "Copy to" modal but titled "Move to folder"). Selecting a destination removes the asset from its current folder and places it in the target. Toast "Moved to [folder name]."

**Current state:** Context menu item exists, `onRequestMove` callback defined in `AssetCard`, passed up through `AssetGrid` props. Parent page (`folderId/page.tsx`) receives `onRequestMove` but the handler is not implemented — the move modal never opens.

**API:** `PATCH /api/assets/{id}` with `{ folderId: targetFolderId }`. The existing rename route handles `PUT` with `name`. Confirm whether PATCH or PUT is used; extend to accept `folderId`.

**Reuse:** `AssetFolderPickerModal` is already built with tree navigation. Rename title to "Move to folder" and highlight/disable the current folder row.

**Complexity:** Low. The hard parts (picker modal, API patch route) either exist or are trivial extensions.

---

## Feature Dependencies Map

```
VSTK-01a (Unstack) ──┐
                      ├── both touch VersionStackModal — implement in one pass
VSTK-01b (Reorder) ──┘

COMPARE-01 (Audio switch) ──┐
                             ├── both require "active side" concept — implement together
COMPARE-02 (Comments)   ────┘

REVIEW-01 (Latest only) ──┐
                           ├── both extend AssetFolderPickerModal footer + copy API — implement together
REVIEW-02 (Strip cmts) ───┘

REVIEW-03 (Selection link) ── independent; depends on existing selection infrastructure only
MOVE-01               ── independent; depends on existing AssetFolderPickerModal only
STATUS-01             ── independent; purely additive
```

---

## Recommended Implementation Order

| Order | Ticket(s) | Rationale |
|-------|-----------|-----------|
| 1 | MOVE-01 | Already 80% scaffolded; highest leverage per hour; closes an open stub |
| 2 | STATUS-01 | High visibility; pure data + badge addition; no complex state or layout |
| 3 | COMPARE-01 | Low complexity; fixes a known audio UX bug; prerequisite for COMPARE-02 |
| 4 | VSTK-01a + VSTK-01b | Single modal pass; atomic Firestore batch; medium complexity |
| 5 | REVIEW-01 + REVIEW-02 | Single modal + API pass; low-medium complexity |
| 6 | COMPARE-02 | Layout restructure + comment loading in new context; most complex after REVIEW-03 |
| 7 | REVIEW-03 | Data model change + review page logic fork; highest risk, most cross-cutting |

Defer to v1.5: STATUS-01b (grid filter by status) — no new data, purely client-side, but design space is already crowded in v1.4.

---

## Confidence Assessment

| Feature | Confidence | Basis |
|---------|------------|-------|
| VSTK-01 UX patterns | HIGH | Frame.io V4 API docs confirm reorder + unstack operations; codebase read confirms current modal shape |
| STATUS-01 UX patterns | HIGH | Frame.io ships Needs Review/In Progress/Approved since v2; developer forum confirms; `Asset` type confirmed has no `labelStatus` field |
| REVIEW-01/02 UX patterns | MEDIUM | Inferred from production pipeline conventions; no exact Frame.io equivalent found (Frame.io does not copy stacks, it references them); pattern is sound |
| REVIEW-03 UX patterns | HIGH | Frame.io V4 and legacy both confirm asset-selection review links; `ReviewLink` type confirmed folderId-only currently |
| COMPARE-01 UX patterns | HIGH | Frame.io comparison viewer described as supporting per-side audio; codebase confirms current hardcoded mute on side B |
| COMPARE-02 UX patterns | HIGH | Frame.io explicitly markets "leave comments on either version" in compare view; confirmed absent in current `VersionComparison` |
| MOVE-01 UX patterns | HIGH | Universal pattern across all cloud storage / DAM tools; context menu stub confirmed in codebase |

---

## Sources

- [Frame.io Version Stacking (V4 Knowledge Center)](https://help.frame.io/en/articles/9101068-version-stacking) — confirms unstack + reorder operations
- [Frame.io Comparison Viewer (V4)](https://help.frame.io/en/articles/9952618-comparison-viewer) — confirms per-side commenting and audio compare
- [Frame.io Developer Forum — Asset Label Status](https://forum.frame.io/t/how-to-update-asset-label-status-via-frameio-api/939) — confirms Needs Review / In Progress / Approved status values
- [Frame.io Shares (V4)](https://help.frame.io/en/articles/9105232-shares-in-frame-io) — confirms multi-asset selection in review links
- [Frame.io V4 Changelog](https://developer.adobe.com/frameio/guides/Changelog/) — PATCH reorder version stacks added September 2025
- Codebase read: `src/types/index.ts`, `src/components/files/AssetCard.tsx`, `src/components/viewer/VersionComparison.tsx`, `src/components/review/CreateReviewLinkModal.tsx`
