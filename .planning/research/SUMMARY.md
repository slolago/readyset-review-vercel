# Research Summary -- v1.4 Review and Version Workflow

**Project:** readyset-review
**Milestone:** v1.4 -- Review and Version Workflow
**Synthesized:** 2026-04-08
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

v1.4 is a workflow-polish milestone, not a greenfield build. Every feature extends existing
infrastructure in place since v1.2-1.3: the version group model (versionGroupId + version integer),
the folder-browser selection pipeline, VersionStackModal, VersionComparison, and ReviewLink types.
No new npm packages are required. The Firestore schema needs exactly two new optional fields
(reviewStatus on assets, assetIds on reviewLinks), two new API routes, and modifications to four
existing routes.

The recommended approach is an inside-out build: start with features already 80 percent wired
(MOVE-01) and purely additive ones (STATUS-01, REVIEW-01/02), then tackle features requiring schema
changes and cross-cutting logic (REVIEW-03), and finish with the most self-contained but internally
complex work (the VersionComparison refactor in COMPARE-01/02). This order front-loads visible wins
and defers the riskiest state surgery to when the rest of the milestone is already shippable.

The key risk in this milestone is not complexity but subtle data-model misuse. The existing status
field on Asset is an upload lifecycle field and must not be repurposed. Version numbers in a stack
must always be re-compacted after any reorder or unstack to prevent gaps. The latest-version concept
has three different implementations across the codebase and needs to be unified into a shared server
utility before REVIEW-01 is built.

---

## Key Findings

### Stack: No New Dependencies

The full existing stack (Next.js 14, Firebase Admin, GCS, Tailwind, Video.js, Fabric.js, Radix UI,
Zustand) covers every v1.4 feature. Specifically:

- Version reorder UI: Native HTML5 drag-and-drop already used in AssetListView. No @dnd-kit needed.
- Status badges: Existing Badge component has color variants; extend it, do not create a new one.
- Move-to modal: AssetFolderPickerModal already exists for Copy To; reuse with a title change.
- Compare comment panel: CommentSidebar accepts assetId prop and handles its own fetching.
- API patterns: Firestore batch writes, auth + project-access guards, and doc-ID fetching are
  established patterns that new routes must follow exactly.

package.json does not change.

### Features: Table Stakes vs Differentiators

**Table stakes** -- absence makes the product feel unfinished relative to Frame.io:

| Ticket    | Feature                                              | Complexity       |
|-----------|------------------------------------------------------|------------------|
| VSTK-01a  | Unstack individual version from group                | Medium           |
| VSTK-01b  | Reorder versions within a stack                      | Medium-High      |
| STATUS-01 | APPROVED / NEEDS_REVISION / IN_REVIEW status badge   | Low-Medium       |
| MOVE-01   | Move to context menu with folder picker              | Low (scaffolded) |
| COMPARE-01| Click version label to switch active audio           | Low              |
| COMPARE-02| Compare view shows focused version comments          | High             |

**Differentiators** -- valued workflow features, not universally expected:

| Ticket    | Feature                                              | Complexity  |
|-----------|------------------------------------------------------|-------------|
| REVIEW-03 | Selection-based review links                         | Medium-High |
| REVIEW-01 | Smart copy: latest version only                      | Low-Medium  |
| REVIEW-02 | Copy without comments (UI clarification)             | Low         |

Deferred to v1.5: STATUS-01b grid filter, custom status labels, multi-approver workflow, bulk status change.

### Architecture: What Changes and Build Order

**Firestore schema changes (minimal):**

- assets: ADD reviewStatus optional (approved | needs_revision | in_review). Separate from existing status field.
- reviewLinks: ADD assetIds optional string[]. When present, bypasses folderId scope.

No new collections. No new Firestore indexes needed.

**New API routes:**
- POST /api/assets/reorder-versions -- Batch-update version numbers for a group
- POST /api/assets/unstack-version -- Eject one asset from its version group

**Modified API routes:**
- POST /api/assets/copy -- Add latestVersionOnly optional boolean
- POST /api/review-links -- Accept and store assetIds optional string[]
- GET /api/review-links/[token] -- Branch on assetIds vs folderId for asset resolution

**New components:**
- SmartCopyModal: Copy options: latest-version toggle, strip-comments label, folder picker
- ReviewStatusBadge: Colored pill with click-to-change popover
- CompareCommentPanel (collocated): Comment list for one version side in compare view

**Modified components:**
- VersionStackModal (in AssetCard.tsx): drag-to-reorder rows and Unstack button
- AssetCard: add reviewStatus badge, wire SmartCopyModal
- VersionComparison: per-side audio state (mutedA/mutedB), active-side state, comment panel
- CreateReviewLinkModal: optional assetIds prop
- FolderBrowser: status filter bar, Create review link from selection toolbar action
- types/index.ts: ReviewStatus type, Asset.reviewStatus, ReviewLink.assetIds

**Recommended build order:**
1. MOVE-01      -- Verify prop wire; likely 0-1 line fix; closes a known open stub
2. VSTK-01      -- Version stack reorder + unstack (2 new routes + modal UI in one pass)
3. STATUS-01    -- reviewStatus type + badge + context menu (many files, each small)
4. REVIEW-01/02 -- Smart copy: 1 API param + SmartCopyModal (~80 lines)
5. REVIEW-03    -- Selection review links: schema + 2 API changes + modal prop
6. COMPARE-01   -- Per-side audio mute refactor in VersionComparison
7. COMPARE-02   -- Per-version comments panel in VersionComparison

### Pitfalls: Top Issues to Watch

**CRITICAL -- data corruption or silent breakage if missed:**

1. Version number gaps after unstack/reorder (VSTK-01): After any unstack or reorder,
   re-compact all remaining stack members in the same batch so version numbers are always
   1..N with no gaps. The merge-version route is the established template.

2. versionGroupId must be asset.id, never null, on unstack (VSTK-01): Write
   versionGroupId = asset.id explicitly. Setting it to null or empty string breaks
   the versionGroupId || asset.id fallback chain used throughout the codebase.

3. reviewStatus vs status field collision (STATUS-01): Asset.status is the upload lifecycle
   field (uploading | ready). The QC status must be a new separate field reviewStatus.
   Reusing status breaks the where(status == ready) query in review link asset loading.

4. New version upload must NOT inherit reviewStatus (STATUS-01): New uploads start with
   reviewStatus undefined. Copying the previous status would mark an unreviewed file as approved.

5. Latest version definition is inconsistent across three code paths (REVIEW-01): Extract
   getGroupHead(versions) utility before REVIEW-01 and use it everywhere.

6. Smart copy shares a GCS object (REVIEW-01): Deleting the original removes the GCS file
   and breaks the copy. Decide: reference copy with a delete guard, or a full GCS object copy.

**IMPORTANT -- bugs under concurrency or edge cases:**

7. Use Firestore transaction, not batch, for version reorder (VSTK-01): Batches do not
   check for stale reads; a concurrent upload mid-reorder creates duplicate version numbers.
   Use db.runTransaction().

8. Firestore in query capped at 30 items (REVIEW-03): Use individual getDoc calls via
   Promise.all. Cap UI selection at 50 assets for v1.4.

9. Video.js does not reset audio track state on src() change (COMPARE-01): Use
   player.muted() toggling instead of audio track selection.

10. MOVE-01 must use the existing PUT handler (MOVE-01): The batch-move-all-group-members
    logic is inside PUT /api/assets/[assetId]. Any new code path silently splits a version group.

**MINOR -- UX issues, not data bugs:**
- REVIEW-03: Hide the folder browser on selection-based review link pages.
- REVIEW-03: Show Asset unavailable placeholder when a linked asset is deleted.
- MOVE-01: Warn when moving from a folder that has active review links.
- COMPARE-02: Debounce the assetId-change effect 150-200ms to prevent comment-panel flicker.

---

## Implications for Roadmap

### Pre-Coding Decisions Required

| Decision                              | Recommendation                                               |
|---------------------------------------|--------------------------------------------------------------|
| reviewStatus field name               | Use reviewStatus. Clearest separation from upload status.    |
| Status enum values                    | 3 values: approved, needs_revision, in_review. Absent = pending, no badge. |
| Smart copy: reference vs GCS copy     | Reference copy with a GCS delete guard. Decide before REVIEW-01. |
| reviewStatus scope                    | Per latest-version doc only. Consistent with grid showing latest-version metadata. |
| COMPARE-02 layout                     | Tab row below video. Avoids wide 3-column layout.            |
| Selection review link asset cap       | Cap at 50 for v1.4 to bound signed URL generation latency.  |

### Phase Groupings

Group A -- Completing open stubs (start here): MOVE-01, STATUS-01
Group B -- Version stack surgery (self-contained): VSTK-01a + VSTK-01b (one pass)
Group C -- Copy workflow: REVIEW-01 + REVIEW-02 (one API param + one modal)
Group D -- Review link scope extension (schema change): REVIEW-03
Group E -- Compare view refactor (isolated complexity): COMPARE-01 + COMPARE-02 (together)

### Research Flags

No additional research sprints needed. Codebase knowledge is HIGH confidence across all features.

Pre-build spikes recommended:
- VSTK-01: Confirm VersionStackModal render location and props interface before extending it.
- REVIEW-03: Trace CreateReviewLinkModal prop threading path from grid selection toolbar.
- COMPARE-01/02: Full read of current VersionComparison state shape before the refactor.

---

## Confidence Assessment

| Area                               | Confidence  | Notes                                                     |
|------------------------------------|-------------|-----------------------------------------------------------|
| No new npm packages required       | HIGH        | Full codebase read; every primitive confirmed present     |
| Firestore schema changes           | HIGH        | Two new optional fields; no migration needed              |
| MOVE-01 is nearly complete         | HIGH        | Prop wire chain traced end-to-end in codebase             |
| VSTK-01 patterns                   | HIGH        | merge-version route is a direct template                  |
| STATUS-01 field design             | HIGH        | Name collision confirmed; reviewStatus is safe choice     |
| REVIEW-01/02 backend scope         | HIGH        | Copy route confirmed to never touch comments collection   |
| REVIEW-03 assetIds fetch pattern   | HIGH        | Promise.all(getDoc) confirmed; in limit documented        |
| COMPARE-01/02 component refactor   | MEDIUM-HIGH | Props confirmed; Video.js audio from GitHub issues only   |
| GCS delete guard for ref copies    | MEDIUM      | Requires reading the delete route before REVIEW-01        |

**Overall: HIGH.** Research is codebase-verified throughout. The two MEDIUM items have safe,
simple mitigations already identified.

### Gaps to Address Before Coding

1. GCS delete route audit: Read DELETE /api/assets/[assetId] to confirm whether it checks
   for shared gcsPath before calling deleteFile. Determines if a guard is needed in REVIEW-01.

2. VersionStackModal exact location: Confirm collocated in AssetCard.tsx or extracted,
   and whether to extend in place or extract for VSTK-01.

3. CreateReviewLinkModal prop wire path: Trace which component renders it and how assetIds
   from the grid selection toolbar reaches it before designing REVIEW-03.

4. Full VersionComparison state read: Multiple iterations since v1.2. Read in full before COMPARE-01.

---

## Aggregated Sources

- Frame.io Version Stacking V4: https://help.frame.io/en/articles/9101068-version-stacking
- Frame.io Comparison Viewer V4: https://help.frame.io/en/articles/9952618-comparison-viewer
- Frame.io Developer Forum Asset Label Status: https://forum.frame.io/t/how-to-update-asset-label-status-via-frameio-api/939
- Frame.io Shares V4: https://help.frame.io/en/articles/9105232-shares-in-frame-io
- Frame.io V4 Changelog (PATCH reorder September 2025): https://developer.adobe.com/frameio/guides/Changelog/
- Codebase 2026-04-08: src/types/index.ts, src/app/api/assets/[assetId]/route.ts,
  merge-version/route.ts, copy/route.ts, review-links/route.ts, review-links/[token]/route.ts,
  src/hooks/useComments.ts, src/components/files/AssetCard.tsx,
  src/components/viewer/VersionComparison.tsx, src/components/review/CreateReviewLinkModal.tsx
- Firestore official docs: batch vs transaction semantics, in query 30-item limit, no cascade delete.
- Video.js GitHub issues 8198 and 5607: audio track state on src() change.
- GCS official docs: signed URL generation is local crypto with service account key.
