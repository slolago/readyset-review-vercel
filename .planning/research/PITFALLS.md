# Domain Pitfalls: v1.4 Review & Version Workflow

**Domain:** Frame.io-style media review platform (Next.js 14, Firestore, GCS, Video.js)
**Researched:** 2026-04-08
**Scope:** Version stack unstack/reorder, asset status labels, smart copy to review, selection-based review links, compare view audio & comments, move to folder

---

## Data Model Reference (existing system)

Before reading pitfalls, understand the current model:

- `Asset.version` — integer set at upload time; never updated after upload (until v1.3 merge)
- `Asset.versionGroupId` — all assets in a stack share this value (the root asset's doc ID)
- `Asset.status` — current values: `'uploading' | 'ready'` (upload lifecycle, not QC status)
- `Asset.folderId` — which folder the asset lives in; all stack members share the same `folderId` (enforced in the PUT handler)
- `ReviewLink.folderId` — scopes the link to a folder; `null` means project root
- Comments live in a flat `comments` collection keyed by `assetId` — no per-version scoping exists
- Review links are folder-scoped, not asset-ID-scoped — there is no `assetIds` array field today

---

## Critical Pitfalls

Mistakes that cause data corruption, silent bugs, or required rewrites.

---

### Pitfall 1: Version Reorder Creates Number Gaps That Break "Latest Version" Logic

**What goes wrong:**
The system identifies the latest version in a stack by finding the asset with the highest `version` integer (see `[token]/route.ts` line 72: `sorted[0]` after `sort((a, b) => (b.version || 1) - (a.version || 1))`). If a reorder operation reassigns version numbers naively — for example, swapping V2 and V3 — and then an unstack removes V2, the remaining versions have numbers `[1, 3]`. The gap causes no immediate breakage, but a subsequent merge of another stack appends starting from `maxVersion + 1 = 4`, so the final order is `[1, 3, 4, 5]`. This is cosmetically wrong but functionally broken if UI labels version numbers by their `version` field value.

**Why it happens:**
Version numbers are ordinal labels, not array indices. The codebase uses `Math.max(...versions.map(v => v.version))` to append. Deletion always leaves gaps. Reorder without re-compacting also leaves gaps.

**Consequences:**
- Version switcher UI shows "V1, V3, V4" instead of "V1, V2, V3" after an unstack.
- A future merge appends at the wrong number.
- If any UI displays `version` as a user-visible label ("Version 3"), gaps confuse users.

**Prevention:**
After any unstack or reorder operation, re-compact all remaining stack members in a single Firestore batch: fetch all docs in the group, sort by their new desired order, write `version = index + 1` for each. This is the same approach used in `merge-version/route.ts` — apply the same pattern for unstack and reorder.

**Phase:** VSTK-01

---

### Pitfall 2: Unstacking a Non-Root Asset Leaves an Orphaned versionGroupId

**What goes wrong:**
When the user unstacks a single version (e.g., removes V2 from a 3-version stack), the goal is to produce: (a) the original stack minus V2, and (b) V2 as an independent standalone asset. The natural implementation is: clear `versionGroupId` on V2 and update its `version` to 1. But `versionGroupId` on a standalone asset must equal the asset's own doc ID (the convention established in `merge-version/route.ts` line 39: `source.versionGroupId || sourceId`). If the unstacked asset gets `versionGroupId = null` instead, the group query `where('versionGroupId', '==', assetId)` returns nothing, and the asset appears to have no version history — but the grid's version count badge query is `where('versionGroupId', '==', groupId)` which would also return nothing, leaving the badge blank instead of hidden.

**Why it happens:**
The convention is implicit: the root asset's doc ID serves as the group ID. Legacy assets (pre-v1.3) have `versionGroupId` undefined. The system handles this with `|| assetId` fallbacks throughout. Setting `versionGroupId = null` on an unstacked asset breaks this fallback chain in a subtle way.

**Consequences:**
- Unstacked asset shows no version badge (fine) but also fails the same-stack guard in the merge endpoint (line 43–45 of `merge-version/route.ts`), because both `sourceGroupId` and `targetGroupId` resolve to their own IDs — which are different, so it allows re-merging the same asset repeatedly.
- `useAsset` hook (`[assetId]/route.ts` line 34–48) constructs `groupId = asset.versionGroupId || asset.id`. If `versionGroupId` is null (not undefined), `|| asset.id` still works because `null || asset.id` evaluates correctly. This is safe. But if `versionGroupId` is explicitly set to an empty string, the fallback fails.

**Prevention:**
When unstacking an asset, write `versionGroupId = asset.id` (its own doc ID), not `null`. Also write `version = 1`. Use a transaction (not a batch) if also re-numbering the remaining stack members, because you need to read and write the remaining stack atomically.

**Phase:** VSTK-01

---

### Pitfall 3: Asset Status Name Collision With Existing `status` Field

**What goes wrong:**
`Asset.status` already exists in the type and is used as an upload lifecycle field (`'uploading' | 'ready'`). The v1.4 STATUS-01 feature adds QC approval statuses like `APPROVED`. Storing QC status in the same `status` field means: (a) `status: 'ready'` queries throughout the codebase (e.g., `[token]/route.ts` line 43: `where('status', '==', 'ready')`) would need to change, and (b) setting an asset to `APPROVED` would make it invisible to any query that filters `status == 'ready'`.

**Why it happens:**
The field name `status` is semantically overloaded. Upload lifecycle and QC approval are orthogonal concerns.

**Consequences:**
- If the same field is used: all ready-state queries must be updated or the feature silently hides assets.
- Review link asset loading (`[token]/route.ts` line 43) filters `status == 'ready'`. An `APPROVED` asset would 404 in review link view.
- The `AssetStatus` type is exported and used widely; changing it is a broad impact change.

**Prevention:**
Add a new field: `reviewStatus?: 'approved' | 'needs_revision' | 'in_review'` (or similar). Never repurpose the existing `status` field. Update `types/index.ts` with a separate `AssetReviewStatus` type. The existing `status` field meaning does not change.

**Phase:** STATUS-01

---

### Pitfall 4: Status Drift — New Version Upload Does Not Reset Approval

**What goes wrong:**
If an asset has `reviewStatus: 'approved'` and the user uploads a new version (V2) to the same version group, V2 is a new asset document with `reviewStatus` undefined. The grid shows the latest version (V2, highest `version` integer) as the representative card. V2 has no `reviewStatus` set, so it displays no status badge. But if `reviewStatus` is inherited from the previous doc or defaults to the group-level status, an unapproved new version could appear approved.

**Why it happens:**
`reviewStatus` lives on individual asset documents, not on the version group. The upload path (`upload/signed-url/route.ts`) creates a new asset doc without QC status. There is no explicit logic to inherit or reset status on version upload.

**Consequences:**
- A new version (which nobody has reviewed yet) inherits no status — this is actually safe by default.
- The bug risk is the opposite: a developer might try to be "smart" and copy `reviewStatus` from the previous latest version when creating the new asset doc. This would cause an unreviewed file to appear `approved`.

**Prevention:**
Never copy `reviewStatus` from a previous version when creating a new asset doc. New uploads always start with `reviewStatus` undefined (no badge). The approved badge only appears if explicitly set. Document this decision in the upload route.

**Phase:** STATUS-01

---

### Pitfall 5: "Latest Version" Definition Is Inconsistent Across Code Paths

**What goes wrong:**
REVIEW-01 requires copying only the "latest version" from a stack. The definition of "latest" differs across the codebase:

- `[token]/route.ts` lines 71–74: latest = highest `version` integer.
- `useAsset` hook and `[assetId]/route.ts` line 65: sorts ascending and takes `sorted[0]` (lowest) as the first display, but the "versions" array contains all.
- The grid's version badge counts all assets in the group but does not explicitly define which is the head.

If the copy-to-review endpoint uses a different "latest" definition than the viewer, the user copies what they believe is V3 but the copy operation uses V1.

**Why it happens:**
No canonical "get the head of a version group" utility exists. Each route implements its own sort/pick inline.

**Prevention:**
Extract a shared utility function (server-side, in a lib file) that takes a version group array and returns the asset with the highest `version` value. Every route that needs the "head" asset uses this function. The smart copy endpoint (REVIEW-01) uses the same utility. A single test can verify the definition is consistent.

**Phase:** REVIEW-01

---

### Pitfall 6: Smart Copy Copies GCS Bytes Instead of Referencing Them

**What goes wrong:**
The current `assets/copy/route.ts` creates new Firestore documents that point to the same `gcsPath` as the original assets — it does NOT copy the GCS object. Two Firestore documents share one GCS object. This means:
- Deleting the original asset deletes the GCS file, breaking the copy's signed URL.
- The copy is a reference, not an independent file.

For the smart-copy-to-review feature, the expected behavior matters: if the team wants the Client Facing folder to be independent (so the original can be deleted without affecting the review copy), a GCS object copy is required. If co-pointing to the same file is acceptable, the current approach works but must be documented.

**Why it happens:**
`assets/copy/route.ts` deliberately copies only the Firestore doc (fast, cheap) and reuses `gcsPath`. This was a correct decision for the internal copy feature (v1.2 "Duplicate"), but the review-copy feature may have different durability expectations.

**Consequences:**
- Delete original → review copy's GCS object is gone, video no longer plays in the review link.
- No extra GCS storage cost with the reference approach.
- GCS copy operation uses the `copyFile` Admin SDK call and has no size limit concerns but costs egress for large videos.

**Prevention:**
Decide explicitly: reference copy or GCS copy. Document the choice in the route. If durability is required, use `storage.bucket().file(src).copy(dest)` (Google Cloud Storage Admin SDK). If reference copy is acceptable, add a Firestore rule that prevents deletion of the original if any other document shares its `gcsPath`. At minimum, ensure asset deletion does NOT delete the GCS object if `gcsPath` is shared — add a reference count field or check before calling `deleteFile`.

**Phase:** REVIEW-01, REVIEW-02

---

### Pitfall 7: Strip-Comments Copy Leaves Orphaned Thread Replies

**What goes wrong:**
REVIEW-02 (copy without comments) could be interpreted as: delete all `comments` where `assetId == newAssetId` after copying the Firestore doc. But comments on the *source* asset have `parentId` fields pointing to each other (threads). If the copy produces a new `assetId` and comments are not copied, there are no orphans from the copy's perspective. The orphan problem is on the other side: if the original asset has thread replies and someone later deletes the root comment on the original, replies become dangling (no parent comment exists). This pre-exists v1.4 — the DELETE handler at `comments/[commentId]/route.ts` does not cascade to child comments (`parentId == deletedId`).

**Why it happens:**
Firestore has no cascade delete. The existing comment DELETE handler only removes the one document.

**Consequences:**
- After deleting a root comment, reply comments still exist in Firestore. They are returned by the GET endpoint and displayed as floating orphans with no parent to reply to.
- The strip-comments copy itself is safe (new asset has no comments by definition), but the underlying comment delete bug can surface when the admin "cleans up" comments on the original after copying.

**Prevention for v1.4:**
- REVIEW-02 (copy without comments): no action needed — the copy produces a new `assetId`, comments are not copied by default, so this feature is already "no comments."
- Add a cascade delete check to the existing comment DELETE handler: when deleting a comment, also delete all comments where `parentId == commentId`. This should be done in a single batch.

**Phase:** REVIEW-02

---

### Pitfall 8: Selection-Based Review Links Require New Data Model — No Array Field Exists

**What goes wrong:**
The current `ReviewLink` type has only `folderId: string | null` for scoping. There is no `assetIds: string[]` field. REVIEW-03 (selection-based review links) requires the review link to resolve a specific set of assets regardless of folder. The `[token]/route.ts` GET handler fetches assets via `where('folderId', '==', link.folderId)`. Adding an `assetIds` array and doing `where('__name__', 'in', assetIds)` has a hard Firestore limit of 30 document IDs per `in` query (as of 2025 — previously 10, raised to 30).

**Why it happens:**
The existing model was designed for folder-level sharing. Asset-level selection is a different scope entirely.

**Consequences:**
- Selections of more than 30 assets silently break if the `in` query is used naively.
- A workaround is to batch the lookups: `Promise.all` of multiple `getDoc` calls, one per asset. This works but does N parallel Firestore reads (one per selected asset) instead of one query — acceptable for 10–50 assets, slow for hundreds.
- `assetIds` stored as a Firestore array field on the ReviewLink document is bounded by the 1 MiB document size limit. Each asset ID is ~20 chars. 1000 IDs ≈ 20 KB — well within limits. This is not a practical concern.

**Prevention:**
- Add `assetIds?: string[]` to the `ReviewLink` type and Firestore schema.
- In `[token]/route.ts` GET, branch: if `link.assetIds?.length`, fetch assets by their IDs using individual `getDoc` calls batched in `Promise.all`. If `link.folderId`, use the existing folder query. If neither, use the project-level query.
- Cap the UI selection at a reasonable limit (e.g., 100 assets) to prevent runaway parallel reads.
- On the review link page, filter displayed assets to only those in `assetIds` if the field is present.

**Phase:** REVIEW-03

---

### Pitfall 9: Stale Review Links After Asset Deletion or Move

**What goes wrong:**
When an asset referenced in a selection-based review link is deleted or moved out of the scoped folder, the review link silently shows fewer assets (or the wrong assets) without any indication to the link creator that the selection has changed.

**Why it happens:**
Review links are snapshots of intent, not live queries. The `assetIds` array stores IDs at creation time. There is no Firestore trigger or cleanup mechanism.

**Consequences:**
- A reviewer opens the link expecting 5 assets; only 4 load because one was deleted. No error — it just doesn't appear.
- For folder-scoped links: moving an asset OUT of a folder removes it from the link immediately (the query still works, it just matches fewer results). Moving an asset INTO the folder adds it immediately. This is arguably correct behavior for folder links but surprising for selection-based links.

**Prevention:**
- For selection-based links: when a `GET /api/assets/:id` returns 404 (deleted), the review link token page should show a placeholder "Asset unavailable" card, not silently omit it.
- For folder-scoped links: current behavior (live folder query) is correct. Document this.
- Do not attempt to keep `assetIds` in sync with deletions via Firestore triggers — this is over-engineering for v1.4. The missing asset UX is sufficient.

**Phase:** REVIEW-03

---

### Pitfall 10: Compare View Comment Fetch Fires N+1 Reads on Version Switch

**What goes wrong:**
COMPARE-02 requires the compare view to show the focused version's comments. If clicking a version label triggers `useComments(assetId)` to re-initialize with a new `assetId`, the hook re-fetches from `/api/comments?assetId=X`. With two panels, each version switch triggers one fetch per panel. If a user rapidly cycles through 5 versions on each side (testing UX), that is 10 sequential API calls, each spawning a Firestore query. The API already does a full collection scan via `where('assetId', '==', assetId)` with no index — Firestore will auto-index this, but repeated rapid calls can exhaust the 1 req/sec write rate on Firestore index building for new users.

**Why it happens:**
`useComments` re-fetches any time `assetId` changes (the `useEffect` depends on it via `fetchComments` which depends on `assetId`). There is no debounce or cache.

**Consequences:**
- Rapid version switching causes visible comment-panel flicker (loading state → comments → loading state → comments).
- Under test/demo conditions with many rapid switches, multiple in-flight requests may race and the last-to-respond wins, showing stale comments.

**Prevention:**
- Add a 150–200 ms debounce to the assetId-change trigger in the compare view before calling `fetchComments`. This eliminates the race for rapid UI interaction.
- Alternatively, cache fetched comments by `assetId` in a `useRef` map inside `useComments`. On switch, serve from cache immediately while re-fetching in the background.
- The existing `GET /api/comments?assetId=X` path already sorts results client-side after the query — acceptable at current scale.

**Phase:** COMPARE-02

---

### Pitfall 11: Video.js Source Switch Leaves Stale Audio State on Version Change

**What goes wrong:**
COMPARE-01 adds audio switching by clicking a version label in compare view. The current compare view implementation uses two `<video>` elements loaded with signed URLs. When the user switches version (clicks a different version label), the implementation must call `player.src({ src: newSignedUrl })` on the Video.js instance. Video.js does not reset its internal audio track selection when `src()` is called — if the previous source had audio track 0 selected, the new source may have a different track ordering, causing the "wrong" audio channel to play.

**Why it happens:**
Video.js maintains audio track state across source changes. The `AudioTrackList` is not automatically cleared on `src()`. Known Video.js behavior, documented in issue #8198 (github.com/videojs/video.js).

**Consequences:**
- After switching versions, audio may be silent (if the new source's track 0 is a different language track and the player was on track 1 of the previous source).
- More commonly: audio simply plays correctly because most assets have one audio track. The bug only surfaces with multi-track media.

**Prevention:**
After calling `player.src({ src: newSignedUrl })`, call `player.load()` and then, in the `loadedmetadata` handler, explicitly select the desired audio track: `player.audioTracks()[0].enabled = true`. Reset all other audio tracks to `enabled = false` to ensure a clean state.

Additionally: the bigger audio-sync issue in compare view is that both players share a play/pause/seek state but have independent audio. The correct UX for "click to hear this version's audio" is: mute the other player (`player.muted(true)`) and unmute the clicked player (`player.muted(false)`). This is simpler than track selection and avoids the multi-track edge case entirely.

**Phase:** COMPARE-01

---

### Pitfall 12: Move to Folder Splits a Version Group if Only One Member Is Moved

**What goes wrong:**
MOVE-01 adds a "Move to folder" context menu. The natural implementation is: call `PUT /api/assets/:id` with `{ folderId: newFolderId }`. The existing PUT handler (`[assetId]/route.ts` lines 89–111) already correctly handles this: it detects `folderId` in the updates and moves ALL version group members atomically via a batch. But if a developer adds a new code path (e.g., a drag-to-folder handler that calls a different endpoint, or a bulk-move operation that sends individual PUT requests per asset), the batch logic is bypassed and only one asset in the stack is moved.

**Why it happens:**
The batch-move logic is embedded inside the PUT handler, not extracted as a reusable utility. It is invisible to new code paths. Future developers may not know it exists.

**Consequences:**
- V1 is in folder A, V2–V4 are still in folder B. The grid queries by `folderId` so only V1 appears in folder A; V2–V4 appear in folder B as separate cards (or are hidden if their `versionGroupId` points to V1 which is no longer colocated).
- This is silent data corruption — the version stack still exists in Firestore but is split across folders.

**Prevention:**
- The MOVE-01 context menu action must call `PUT /api/assets/:id` (the existing endpoint with batch-move logic), not a new endpoint.
- Add a comment to the PUT handler explicitly stating the batch-move behavior, so future developers do not bypass it.
- Consider extracting a `moveVersionGroup(assetId, folderId, db)` server utility function so any future endpoint can call it without re-implementing the batch logic.

**Phase:** MOVE-01

---

### Pitfall 13: Move to Folder Invalidates Folder-Scoped Review Links

**What goes wrong:**
Review links scoped to `folderId = "folderA"` show all assets where `folderId == "folderA"`. Moving an asset OUT of folderA removes it from that review link immediately (the query no longer matches). The review link creator is not notified. If the Client Facing folder had a shared review link and a manager moves assets out of it, reviewers lose access to those assets without warning.

**Why it happens:**
Review links are live folder queries, not snapshots. This is by design for folder-scoped links (changes to the folder are reflected in the link). But the move-to-folder UX does not surface this consequence.

**Consequences:**
- An external reviewer opens a previously-shared review link and finds assets missing.
- No error is shown — the link loads successfully with fewer assets.

**Prevention:**
This is a UX communication problem, not a code bug. In the Move To dialog, if the source folder has any review links, show a warning: "This folder has active review links. Moving assets will remove them from those links." This requires a lightweight query: `where('folderId', '==', sourceFolderId)` on `reviewLinks` collection. Do not block the move — just warn.

**Phase:** MOVE-01

---

## Moderate Pitfalls

---

### Pitfall 14: Reorder Operation Is Not Atomic — Concurrent Version Upload Creates Conflicts

**What goes wrong:**
A reorder operation reads all current version docs, computes new `version` values, and writes them in a batch. If another user uploads a new version to the same stack between the read and the batch write, the upload creates a new doc with `version = maxVersion + 1`. The reorder batch then overwrites `version` values for the existing docs but is unaware of the new upload. The newly uploaded file may end up with the same `version` value as one of the reordered docs.

**Why it happens:**
Firestore batches are atomic for their writes but do NOT check that the read data is still current at write time (unlike transactions). A batch write can succeed even if the underlying documents changed between read and write.

**Prevention:**
Use a Firestore **transaction** (not a batch) for reorder: read all group members inside the transaction, compute new version numbers, write them — all in one atomic operation. The transaction will retry if any member doc changed between the read and write. The existing `merge-version/route.ts` uses a batch (acceptable there because the merge reads are done outside the batch). Reorder should use `db.runTransaction()`.

**Phase:** VSTK-01

---

### Pitfall 15: Status Labels Are Per-Asset-Doc, Not Per-Version-Group

**What goes wrong:**
If `reviewStatus` is stored per asset document, then each version in a stack has its own `reviewStatus`. The UI must decide: does the grid card show the latest version's status? The group's status? Any version's status if any is approved? If the implementation is inconsistent — some code reads the latest version's status, other code reads a "group-level" status that doesn't exist — the displayed badge is wrong.

**Why it happens:**
There is no "version group" document in the current schema. All metadata is on individual asset docs. Status could be on any or all of them.

**Prevention:**
Decide: `reviewStatus` lives only on the latest version doc (highest `version` integer). When a new version is uploaded, it gets no `reviewStatus`. The grid card always shows the latest version's `reviewStatus`. This is consistent with how the grid already works (it shows the latest version's thumbnail, name, and metadata). Document this convention explicitly and enforce it in the status-update API route.

**Phase:** STATUS-01

---

### Pitfall 16: Comment Strip During Copy Needs Explicit Definition

**What goes wrong:**
REVIEW-02 says "strip comments when copying to Client Facing Folder." The copy route creates new asset docs. New asset docs have no comments by definition — there is nothing to strip. The "strip" language implies that comments from the source asset should NOT be copied. Since the current copy route copies only Firestore doc fields (not comments), it already "strips" them. No special implementation is needed — but a developer may add comment-copying logic thinking it is required for a complete copy, inadvertently introducing the bug they are trying to avoid.

**Prevention:**
Explicitly document in the copy route that comments are intentionally not copied. Add a code comment: `// Comments are per-assetId and not duplicated on copy — this is intentional for review folder workflow`. This prevents well-intentioned future additions.

**Phase:** REVIEW-02

---

## Minor Pitfalls

---

### Pitfall 17: Selection-Based Review Link Has No Folder for Virtual Browser Navigation

**What goes wrong:**
The current review link page has a virtual folder browser (the existing folders query in `[token]/route.ts` lines 77–84). For selection-based links (no `folderId`), the folder structure doesn't apply — the link is a flat list of specific assets. If the folder browser is shown on selection-based review links, it will show all project root folders, which is confusing and potentially leaks folder structure to external reviewers.

**Prevention:**
When `link.assetIds?.length > 0`, skip the folders query and set `folders = []`. Hide the folder browser in the review link page UI when in selection mode.

**Phase:** REVIEW-03

---

### Pitfall 18: Signed URL Generation in Review Link GET Scales Linearly With Asset Count

**What goes wrong:**
The review link GET handler generates signed URLs for every asset via `Promise.all(assetsSnap.docs.map(async (d) => generateReadSignedUrl(...)))`. At 50 assets, this is 50 parallel GCS requests. At 200 assets, it is 200. GCS signed URL generation is a local cryptographic operation (no network call) when using service account credentials — it is fast. But if the GCS client library makes a network call to fetch a token (e.g., if running with Workload Identity rather than a service account key), 200 network calls is a noticeable latency hit.

**Why it happens:**
The current approach works well at the scale of a small review project (10–30 assets). Selection-based review links for larger selections (50–100 assets) may expose this.

**Prevention:**
For v1.4 scope (internal team use), this is acceptable. Cap selection-based review link asset count at 50 in the UI. If scaling beyond that, batch signed URL generation or switch to a client-side URL signing pattern.

**Phase:** REVIEW-03

---

### Pitfall 19: Compare View Version Label Click Has No Debounce

**What goes wrong:**
COMPARE-01: clicking a version label in the compare view to switch audio triggers a Video.js `src()` call and a reload of the video element. If the user double-clicks or rapidly clicks between versions, multiple `src()` calls queue up. Video.js does not cancel an in-flight source load when `src()` is called again — each call triggers a new load, and the loads complete in nondeterministic order. The final active source may not be the last one the user clicked.

**Prevention:**
Debounce the version-switch handler at ~300 ms. Alternatively, track a `switchingVersion` flag and ignore clicks while a source switch is in progress. Reset the flag in Video.js's `loadeddata` event.

**Phase:** COMPARE-01

---

## Phase-Specific Warnings

| Phase / Feature | Likely Pitfall | Mitigation |
|----------------|----------------|------------|
| VSTK-01: Unstack | Orphaned `versionGroupId` on unstacked asset (Pitfall 2) | Write `versionGroupId = asset.id` on unstack, never null |
| VSTK-01: Reorder | Version number gaps after reorder/delete (Pitfall 1) | Re-compact all remaining member version numbers in same batch |
| VSTK-01: Reorder | Concurrent upload mid-reorder creates duplicate version numbers (Pitfall 14) | Use Firestore transaction, not batch |
| STATUS-01 | Field name collision with existing `status` field (Pitfall 3) | New field `reviewStatus`, never reuse `status` |
| STATUS-01 | New version upload appears approved (Pitfall 4) | Never copy `reviewStatus` to new version docs |
| STATUS-01 | Status shown at group vs version level (Pitfall 15) | Status lives on latest version doc only |
| REVIEW-01 | Inconsistent "latest version" definition (Pitfall 5) | Extract shared `getGroupHead(versions)` utility |
| REVIEW-01 | Copy shares GCS object — delete original breaks copy (Pitfall 6) | Decide reference vs GCS copy; guard GCS delete if shared |
| REVIEW-02 | Orphaned comment thread replies on delete (Pitfall 7) | Cascade delete child comments in DELETE handler |
| REVIEW-02 | Developer adds comment copy logic thinking it is needed (Pitfall 16) | Add explicit comment in copy route that omission is intentional |
| REVIEW-03 | `in` query limit for large asset selections (Pitfall 8) | Use individual `getDoc` calls via `Promise.all`; cap at 100 assets |
| REVIEW-03 | Stale link when asset deleted (Pitfall 9) | Show "Asset unavailable" placeholder, do not silently omit |
| REVIEW-03 | Folder browser shown on selection links (Pitfall 17) | Skip folders query and hide browser in selection mode |
| REVIEW-03 | Signed URL generation scales with asset count (Pitfall 18) | Cap selection at 50 assets for v1.4 |
| COMPARE-01 | Video.js stale audio track after source switch (Pitfall 11) | Reset audio tracks in `loadedmetadata`; simpler: use `player.muted()` toggle |
| COMPARE-01 | Rapid version label clicks race on source load (Pitfall 19) | Debounce 300 ms or track in-progress switch flag |
| COMPARE-02 | N+1 comment fetches on rapid version switch (Pitfall 10) | Debounce assetId change; optionally cache by assetId |
| MOVE-01 | Only one stack member moved if new code path bypasses batch logic (Pitfall 12) | All move operations must go through the existing PUT handler |
| MOVE-01 | Move silently removes asset from folder-scoped review links (Pitfall 13) | Warn user if source folder has active review links |

---

## Sources

- Codebase analysis (2026-04-08): `src/types/index.ts`, `src/app/api/assets/[assetId]/route.ts`, `src/app/api/assets/merge-version/route.ts`, `src/app/api/assets/copy/route.ts`, `src/app/api/review-links/[token]/route.ts`, `src/app/api/review-links/route.ts`, `src/app/api/comments/route.ts`, `src/hooks/useComments.ts`, `src/hooks/useAssets.ts`
- Firestore batch vs transaction: official Firebase docs — transactions retry on concurrent edit; batches do not check read staleness. HIGH confidence.
- Firestore `in` query limit: official Firebase quotas page — 30 items per `in` clause (raised from 10 in 2023). HIGH confidence.
- Firestore no cascade delete: official docs + multiple community sources confirming this is by design. HIGH confidence.
- Video.js audio track state on src() change: GitHub issue #8198, confirmed by Video.js issue #5607. MEDIUM confidence (GitHub issues, not official docs).
- GCS signed URL generation is local crypto when using service account key: official Cloud Storage docs. HIGH confidence.
