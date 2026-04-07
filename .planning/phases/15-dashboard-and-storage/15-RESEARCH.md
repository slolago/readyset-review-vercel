# Phase 15: Dashboard and Storage - Research

**Researched:** 2026-04-07
**Domain:** Firestore collection queries, client-side aggregation, Next.js API routes, React stats derivation
**Confidence:** HIGH

## Summary

The codebase is well-positioned for both requirements. The `Asset` type already has a `size: number` field (confirmed in `src/types/index.ts` line 56), and `formatBytes` is already exported from `src/lib/utils.ts` and even imported in `FolderBrowser.tsx`. No new utility functions are needed.

For REQ-15A (dashboard stats), the dashboard already fetches all projects via `useProjects()`. The key gap is assets and collaborators. The cheapest viable approach for a small app is a single Firestore collection-group query on `assets` scoped to the user's project IDs — done in a new `/api/stats` route. This returns `totalAssets`, `totalStorage`, and `totalCollaborators` derived server-side, avoiding N separate asset fetches. An alternative (fetching assets per-project) is too expensive at scale.

For REQ-15B (folder size), `useAssets` already fetches only the current folder's assets. Those assets are available as `assets` in FolderBrowser. Summing their `size` fields client-side is trivial and free. For recursive size (all subfolders included), the assets API currently fetches only one `folderId` level — a separate endpoint or a project-wide asset fetch would be needed. The decision between "current folder only" vs "recursive" is a UX choice with real cost implications (see Architecture Patterns).

The best injection point for folder size in FolderBrowser is the header row (line 655–708), immediately after the `<Breadcrumb>` component, as a small `text-frame-textMuted` badge.

**Primary recommendation:** Create `/api/stats` for dashboard aggregation; add a `useMemo` sum of `assets` in FolderBrowser for current-folder storage display; use a separate `/api/assets/stats?projectId=X` for recursive size only if product explicitly requires it.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase-admin | project default | Firestore server-side queries + collection group | Already used in all API routes |
| React useMemo | built-in | Client-side sum derivation | Zero cost, avoids extra re-renders |
| `formatBytes` | `src/lib/utils.ts` | Format bytes to human-readable string | Already in codebase, already imported in FolderBrowser |

### No New Dependencies
All required tools already exist. No `npm install` step needed.

---

## Architecture Patterns

### REQ-15A: Dashboard Stats

**The problem:** `useProjects()` returns project list + collaborator arrays, but no asset counts or sizes. Fetching assets per-project (N projects × 1 API call each) is too expensive on page load.

**Recommended pattern: Single `/api/stats` endpoint**

The Firestore Admin SDK supports collection group queries (`collectionGroup('assets')`). A single query can fetch all assets across all projects and filter by `projectId in [...]` (using Firestore `in` operator, max 30 project IDs per query). This returns asset counts and size sums in one server round-trip.

```typescript
// src/app/api/stats/route.ts  (new file)
// Source: firebase-admin SDK — collectionGroup is standard on admin SDK
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminDb();

  // Step 1: fetch user's projects (same logic as /api/projects GET)
  const projectsSnap = await db.collection('projects').get();
  const userProjects = projectsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(p => p.ownerId === user.id || p.collaborators?.some((c: any) => c.userId === user.id));

  const projectIds = userProjects.map(p => p.id);

  // Step 2: total collaborators (deduplicated across projects)
  const collaboratorSet = new Set<string>();
  for (const p of userProjects) {
    for (const c of (p.collaborators || [])) {
      if (c.userId !== user.id) collaboratorSet.add(c.userId);
    }
  }

  // Step 3: collection group query for all assets across user's projects
  // Firestore `in` supports up to 30 items; for >30 projects, batch into chunks
  let totalAssets = 0;
  let totalStorage = 0;

  if (projectIds.length > 0) {
    // Chunk into groups of 30 (Firestore `in` limit)
    const chunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += 30) {
      chunks.push(projectIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const snap = await db.collectionGroup('assets')
        .where('projectId', 'in', chunk)
        .get();
      totalAssets += snap.size;
      for (const doc of snap.docs) {
        totalStorage += (doc.data().size as number) || 0;
      }
    }
  }

  return NextResponse.json({
    projectCount: userProjects.length,
    totalAssets,
    totalStorage,       // bytes — format on client with formatBytes()
    totalCollaborators: collaboratorSet.size,
  });
}
```

**Dashboard consumption:**

```typescript
// src/app/(app)/dashboard/page.tsx — add after useProjects()
const [stats, setStats] = useState<{ totalAssets: number; totalStorage: number; totalCollaborators: number } | null>(null);

useEffect(() => {
  getIdToken().then(token =>
    fetch('/api/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStats(d))
  );
}, []);
```

Then replace the `"—"` values in the three StatCards:
- Assets: `stats?.totalAssets.toString() ?? '—'`
- Collaborators: `stats?.totalCollaborators.toString() ?? '—'`
- Storage: `stats ? formatBytes(stats.totalStorage) : '—'` (rename "Uploads" label to "Storage")

**Note on the "Uploads" stat card:** The current label says "Uploads" (orange, Upload icon). There is no `uploads` count tracked anywhere in Firestore. The most natural replacement is "Storage" showing total bytes used — this is both available and more useful.

---

### REQ-15B: Folder Size in FolderBrowser

**Two tiers of implementation:**

#### Tier 1 (Simple — current folder only):
Assets in the current folder are already fetched via `useAssets(projectId, folderId)` and available as `assets` in FolderBrowser. Summing their sizes requires zero new API calls.

```typescript
// Inside FolderBrowser component, after the assets/folders state
const currentFolderSize = useMemo(
  () => assets.reduce((sum, a) => sum + (a.size || 0), 0),
  [assets]
);
```

Inject into the header, right of the Breadcrumb:
```tsx
{/* In the header div, after <Breadcrumb ...> */}
{!assetsLoading && assets.length > 0 && (
  <span className="text-xs text-frame-textMuted ml-2 flex-shrink-0">
    {formatBytes(currentFolderSize)}
  </span>
)}
```

This is located at line 657–658 of FolderBrowser.tsx (the `{/* Breadcrumb */}` div).

#### Tier 2 (Recursive — includes all subfolders):
The assets API (`/api/assets`) currently filters by a single `folderId`. To get all assets under a folder recursively, the options are:

**Option A — New API endpoint `/api/assets/stats?projectId=X&folderId=Y` (recommended if recursive needed):**
Server fetches all project assets, then filters to those whose `path` array contains the target `folderId`. This requires the `Folder.path` field (`string[]` in the Folder type — confirmed in `src/types/index.ts` line 35) but assets do NOT store a path array — they only store `folderId` (direct parent). So recursive requires fetching all project assets and resolving the folder tree.

**Option B — Client-side recursive folder walk:**
Already fetched direct-child assets. For each subfolder, call `useAssets(projectId, subfolderId)`. This is an N+1 problem and not recommended.

**Option C — Store `folderPath: string[]` on assets at upload time:**
Most scalable long-term but requires a schema migration (adding path to all existing assets during upload). Out of scope for this phase.

**Recommendation:** Implement Tier 1 (current folder assets only) for Phase 15. The UX label can be "X files, Y total" or just the size badge. Document recursive as a future enhancement. Most users interpret "folder size" as the files they can see in the current view, and this is consistent with the current asset fetch scope.

---

### Injection Point: Where to Show Folder Size

FolderBrowser header is at lines 655–708. The breadcrumb renders at line 658:

```tsx
<div className="px-8 py-4 border-b border-frame-border flex items-center justify-between bg-frame-sidebar">
  {/* Breadcrumb */}
  <Breadcrumb items={breadcrumbs} projectId={projectId} projectColor={color} />
  {/* Actions row */}
  <div className="flex items-center gap-2 flex-shrink-0">
    ...
  </div>
</div>
```

The Breadcrumb is on the left, actions on the right. The size badge fits naturally as a small muted text immediately after the Breadcrumb, inside the same left-side container. Alternatively, it can sit in the actions `flex` row as the leftmost item before the view-mode toggle. Either works — the former is cleaner because it stays associated with "where you are" rather than "what you can do."

Best approach: wrap the left side in a `flex items-center gap-2` and add the size badge there:

```tsx
<div className="flex items-center gap-2 min-w-0">
  <Breadcrumb items={breadcrumbs} projectId={projectId} projectColor={color} />
  {!assetsLoading && assets.length > 0 && (
    <span className="text-xs text-frame-textMuted whitespace-nowrap flex-shrink-0">
      {formatBytes(currentFolderSize)}
    </span>
  )}
</div>
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Byte formatting | Custom size formatter | `formatBytes` in `src/lib/utils.ts` | Already exists, handles all scales from Bytes to TB |
| Stats aggregation | Per-project asset fetch loop | Firestore `collectionGroup` query | Single query vs N queries |
| Firestore `in` batching | Custom chunking util | Inline chunk loop (3 lines) | Simple enough to inline, no library needed |

**Key insight:** The most important "don't hand-roll" is the per-project fetch loop for stats. Iterating N projects and awaiting N asset queries in `Promise.all` will work but produces N Firestore reads on every dashboard load. A single collection-group query produces 1 read (billed by documents returned, not queries).

---

## Common Pitfalls

### Pitfall 1: Firestore `in` operator limit
**What goes wrong:** `where('projectId', 'in', projectIds)` throws or silently fails if `projectIds.length > 30`.
**Why it happens:** Firestore has a hard limit of 30 values in `in` / `not-in` / `array-contains-any` queries.
**How to avoid:** Chunk `projectIds` into arrays of ≤ 30 and run one query per chunk. Shown in the code example above.
**Warning signs:** Console error "maximum number of 'in' filters" in Firestore.

### Pitfall 2: `size` field may be 0 or undefined on older assets
**What goes wrong:** Storage total shows lower than reality, or `formatBytes(0)` shows "0 Bytes" unexpectedly.
**Why it happens:** Early uploaded assets may have been stored without a `size` field (if the upload flow changed), or the `size` field defaulted to 0.
**How to avoid:** Guard with `(doc.data().size as number) || 0` (already shown in example). Display `"—"` instead of `"0 Bytes"` if `totalStorage === 0` and `totalAssets > 0`.
**Warning signs:** Stats show "0 Bytes" storage despite visible assets.

### Pitfall 3: Dashboard stats load delay — "—" flash
**What goes wrong:** Stats cards show "—" for a second on every page load, even when data is fresh.
**Why it happens:** The `/api/stats` fetch is a separate round-trip after the initial page render.
**How to avoid:** This is acceptable UX (keep "—" as the loading state). Optionally show a skeleton pulse instead of "—". Do NOT use `localStorage` caching for stats — it would show stale counts.

### Pitfall 4: `collectionGroup('assets')` requires a Firestore index
**What goes wrong:** The collection group query fails in production with a "requires an index" error and returns a console link to create one.
**Why it happens:** Firestore collection group queries on `projectId` field may require a single-field exemption or composite index if combined with other filters. A simple `where('projectId', 'in', [...])` on a top-level collection called `assets` should work without a manually created index, but it depends on whether `assets` is a top-level collection (it is) vs a subcollection.
**How to avoid:** Test the query locally with multiple project IDs. If an index is needed, the Firestore console error includes a direct link to create it. The query uses only one `where` clause so a collection group index is usually auto-created.
**Warning signs:** 500 error from `/api/stats` with "requires an index" in the server logs.

### Pitfall 5: FolderBrowser `assets` array only contains latest version per group
**What goes wrong:** Storage size sums only the latest version of each asset, not all versions.
**Why it happens:** The assets API groups by `versionGroupId` and returns only the latest version (see `assets/route.ts` lines 27–37).
**How to avoid:** For current-folder display (Tier 1), this is acceptable — users see the same assets that are displayed. Document this limitation. For a truly accurate storage count, the stats endpoint should count all versions (not grouped).
**Warning signs:** Storage numbers don't match actual GCS bucket size.

---

## Code Examples

### formatBytes (already exists)
```typescript
// Source: src/lib/utils.ts line 8
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
```

### Firestore collection group query (admin SDK)
```typescript
// Source: firebase-admin Firestore docs — collectionGroup is available on admin SDK
const snap = await db.collectionGroup('assets')
  .where('projectId', 'in', projectIds)  // max 30 values
  .get();
// snap.docs is an array of QueryDocumentSnapshot
```

### useMemo sum of asset sizes (client)
```typescript
// Source: React built-in — useMemo pattern for derived state
import { useMemo } from 'react';
const currentFolderSize = useMemo(
  () => assets.reduce((sum, a) => sum + (a.size || 0), 0),
  [assets]
);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Fetch all docs, count client-side | Firestore `count()` aggregation query | Less data transferred; but `count()` doesn't sum a field |
| N per-project asset fetches | Collection group + `in` filter | Single round-trip for all projects |

**Note on Firestore `count()` aggregation:** Firestore does have a `count()` aggregation query (`collection.count().get()`) that is very cheap (counts without returning documents). However, it does not support summing a field. For storage total (sum of `size`), full documents must be fetched. For asset count only, `count()` could be used per-project, but the collection-group approach returns both count and size in one pass — preferable.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all required tools already in project).

---

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — project has no test infrastructure |
| Config file | none |
| Quick run command | n/a |
| Full suite command | n/a |

### Phase Requirements — Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-15A | Dashboard stats show real project count | manual-only | n/a — no test framework | N/A |
| REQ-15A | Dashboard stats show real asset count | manual-only | n/a | N/A |
| REQ-15A | Dashboard stats show real collaborator count | manual-only | n/a | N/A |
| REQ-15A | Dashboard storage formatted correctly (MB/GB) | manual-only | n/a | N/A |
| REQ-15B | FolderBrowser header shows size of current folder | manual-only | n/a | N/A |
| REQ-15B | Size updates when navigating between folders | manual-only | n/a | N/A |

### Wave 0 Gaps
No test infrastructure exists in the project. Manual browser testing is the validation path for this phase. Recommend verifying:
- `/dashboard` page loads and populates all 4 stat cards within 2 seconds
- Stats are not hardcoded (create/delete a project and verify count changes)
- Navigate into a folder with known files — verify size matches expected sum
- `formatBytes` edge cases: 0 assets → "—", large files → shows GB correctly

---

## Open Questions

1. **"Uploads" stat card label replacement**
   - What we know: The current 4th stat is labeled "Uploads" with an Upload icon. No upload count is tracked in Firestore.
   - What's unclear: Does the user want to track upload count (would require schema change) or replace with "Storage"?
   - Recommendation: Replace "Uploads" with "Storage" showing total bytes. This is directly available and more useful. If upload tracking is desired, it is a separate phase.

2. **Recursive folder size vs. current-folder-only**
   - What we know: Current folder assets are free to sum. Recursive requires extra API call or full project fetch.
   - What's unclear: Does the user want recursive size in the FolderBrowser header? The phase goal says "sum of all file sizes in current folder including all subfolders."
   - Recommendation: The phase goal explicitly says "including all subfolders." This requires a new API endpoint `/api/assets/stats?projectId=X&folderId=Y` that fetches all project assets (no `folderId` filter), then recursively resolves which assets belong under the target folder. The implementation is feasible but adds an extra API call per folder navigation. Include this in the plan with a note that it is one extra fetch per folder visit. See Architecture Patterns Tier 2 for implementation approach.

3. **Version counting for storage stats**
   - What we know: The assets API returns only latest versions. All asset versions exist in Firestore.
   - What's unclear: Should "storage used" count all versions or only latest?
   - Recommendation: The `/api/stats` endpoint should use the raw collection group query (not grouped by version) so all versions are counted — this reflects actual GCS storage. The FolderBrowser folder size should match what the user sees (latest versions only).

---

## Sources

### Primary (HIGH confidence)
- `src/types/index.ts` — Asset interface confirmed `size: number` field at line 56
- `src/lib/utils.ts` — `formatBytes` confirmed at line 8, already exported
- `src/components/files/FolderBrowser.tsx` — Header render location confirmed lines 655–708; `formatBytes` already imported at line 38
- `src/app/api/assets/route.ts` — Confirmed assets fetched per `projectId + folderId`; versioning logic lines 27–37
- `src/app/(app)/dashboard/page.tsx` — Confirmed stat cards use hardcoded `"—"` at lines 48–62
- `src/hooks/useProject.ts` — `useProjects()` confirmed fetches project list but no asset data
- `src/app/api/projects/route.ts` — Confirmed no asset data in project response

### Secondary (MEDIUM confidence)
- Firebase Admin SDK documentation — `collectionGroup()` is a standard method on the Admin Firestore instance; `in` operator limit of 30 is documented behavior

### Tertiary (LOW confidence)
- Firestore index requirement for collection group queries on top-level collections — requires empirical testing to confirm whether an index must be manually created for this specific query pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in codebase, verified by direct file reads
- Architecture: HIGH — direct inspection of API routes, types, and component structure
- Pitfalls: HIGH (Firestore `in` limit) / MEDIUM (index requirement) — `in` limit is documented; index requirement needs runtime verification

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable stack, 30-day window)
