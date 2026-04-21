# 67-01 — Manual Verification (human_needed)

Task 7 is a blocking human-verify checkpoint. The executor intentionally did NOT
run the steps below; the operator performs them against a live Firestore +
deployed dev build to confirm parity and correctness before the plan closes.

## What was built

- `Project.collaboratorIds?: string[]` (src/types/index.ts)
- `fetchAccessibleProjects(userId, isPlatformAdmin)` shared helper (src/lib/projects-access.ts)
- `/api/projects` GET uses the helper; POST seeds `collaboratorIds: [ownerUid]`
- `/api/stats` uses the helper + Promise.all on asset + reviewLinks loops + `Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300`
- `/api/projects/[projectId]/collaborators` POST/DELETE wrap the write in `runTransaction` with `FieldValue.arrayUnion` / `arrayRemove`
- `scripts/backfill-collaborator-ids.mjs` (idempotent)
- `firestore.indexes.json` has the new `projects(collaboratorIds ARRAY, updatedAt DESC)` composite

## Verification steps

1. **Deploy indexes**
   ```bash
   firebase deploy --only firestore:indexes
   ```
   Wait for the Firebase console to report all indexes `Enabled` (1–5 min on small datasets).

2. **Run the backfill**
   ```bash
   node scripts/backfill-collaborator-ids.mjs
   ```
   Expected first run: non-zero `Updated` count (every pre-v2.1 doc). Expected second run: `Updated 0 projects; N already had the correct collaboratorIds.` — confirms idempotency.

3. **Dev server**
   ```bash
   npm run dev
   ```

4. **Non-admin parity — dashboard**
   Log in as a user who (a) owns ≥1 project AND (b) is a collaborator on ≥1 other user's project.
   - Stat cards: `projectCount`, `assetCount`, `collaboratorCount`, `storageBytes`, `reviewLinkCount` match the pre-phase values.
   - Project list contains the same set of project ids as before.
   - DevTools → Network → `/api/stats` response header:
     ```
     Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300
     ```

5. **Admin parity** — log in as a platform admin; confirm still seeing all projects + correct stats.

6. **Write-path atomicity**
   - Add a collaborator via the UI. In Firestore console, confirm the project doc has the new user in BOTH `collaborators` (object) AND `collaboratorIds` (uid string).
   - Remove that collaborator. Confirm both fields dropped atomically.

7. **Create-path**
   Create a fresh project via the UI. Firestore doc should have `collaboratorIds: [ownerUid]` set at creation time (not undefined, not empty).

## Failure diagnostics

- Parity miss on non-admin: most likely the backfill didn't run, or some legacy project has `ownerId` absent from its own `collaborators[]` array (the helper would then miss it for non-owners — but owners still see it via the `ownerId==` branch). Log the project id + its `collaborators` and `collaboratorIds` fields for follow-up.
- Missing `Cache-Control`: confirm the deployed build is from commit ≥ `b48d41dc` (Task 4). Vercel/CDN may strip/override `private` — check the raw response from the Next server (`curl -i http://localhost:3000/api/stats -H "Cookie: ..."`).
- `collaboratorIds` not updating on add/remove: confirm the deployed commit includes `05882101` (Task 5) and that no admin-path write is overwriting `collaborators` without `collaboratorIds` (see Summary "Other writers" section).

## Resume signal

Type `approved` once parity + cache header + atomic write are all confirmed. Or describe the discrepancy.
