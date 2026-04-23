import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject, canCreateReviewLink } from '@/lib/permissions';
import type { Project } from '@/types';
import { serializeReviewLink, hashPassword } from '@/lib/review-links';
import { Timestamp } from 'firebase-admin/firestore';
import { customAlphabet } from 'nanoid';

// v2.4: POST awaits per-asset stamp jobs; each stamp HTTP call can take
// 5-15s (download + exiftool + upload). Parallel fan-out keeps total
// wall time ≈ max(individual), but 60s caps the safe batch size at ~20
// typical-sized assets. Past that, some stamps may be abandoned; the
// link is still created and guests fall back to the original URL.
export const runtime = 'nodejs';
export const maxDuration = 60;

const generateShortToken = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  8
);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const db = getAdminDb();
  const projDoc = await db.collection('projects').doc(projectId).get();
  if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { id: projDoc.id, ...projDoc.data() } as Project;
  if (!canAccessProject(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // no orderBy — avoids composite index requirement; sorted in-memory below
    const snap = await db.collection('reviewLinks')
      .where('projectId', '==', projectId)
      .get();

    // Strip password field — only indicate whether one is set
    const links = snap.docs.map((d) =>
      serializeReviewLink({ id: d.id, ...(d.data() as Record<string, unknown>) })
    );

    // Sort by createdAt desc in memory (supports both _seconds and seconds shapes)
    links.sort((a, b) => {
      const ca = (a as any).createdAt;
      const cb = (b as any).createdAt;
      const ta = ca?._seconds ?? ca?.seconds ?? 0;
      const tb = cb?._seconds ?? cb?.seconds ?? 0;
      return tb - ta;
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('review-links GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch review links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, projectId, folderId, folderIds, allowComments, password, expiresAt,
            allowDownloads, allowApprovals, showAllVersions, assetIds } = await request.json();

    if (!name || !projectId) return NextResponse.json({ error: 'name and projectId required' }, { status: 400 });
    if (assetIds && assetIds.length > 200) return NextResponse.json({ error: 'Maximum 200 assets per link' }, { status: 400 });
    if (folderIds && folderIds.length > 50) return NextResponse.json({ error: 'Maximum 50 folders per link' }, { status: 400 });

    const db = getAdminDb();
    const projDoc = await db.collection('projects').doc(projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canCreateReviewLink(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = generateShortToken();

    // New links use folderIds[]/assetIds[] arrays (editable). folderId (legacy) is only set
    // when the caller passes a single folderId and no arrays — preserves backward compat.
    const cleanAssetIds: string[] | null = Array.isArray(assetIds) && assetIds.length ? assetIds.filter((x: unknown) => typeof x === 'string') : null;
    const cleanFolderIds: string[] | null = Array.isArray(folderIds) && folderIds.length ? folderIds.filter((x: unknown) => typeof x === 'string') : null;

    const data: Record<string, unknown> = {
      token,
      name,
      projectId,
      folderId: (cleanAssetIds || cleanFolderIds) ? null : (folderId || null),
      folderIds: cleanFolderIds,
      assetIds: cleanAssetIds,
      createdBy: user.id,
      allowComments: allowComments !== false,
      allowDownloads: allowDownloads === true,
      allowApprovals: allowApprovals === true,
      showAllVersions: showAllVersions === true,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      createdAt: Timestamp.now(),
    };
    // SEC-20: hash at write — store bcrypt hash, never plaintext
    if (password && typeof password === 'string') data.password = hashPassword(password);

    await db.collection('reviewLinks').doc(token).set(data);
    const doc = await db.collection('reviewLinks').doc(token).get();
    const docData = doc.data() as Record<string, unknown>;

    // v2.4 STAMP-01 — trigger Meta XMP stamp jobs for every asset this
    // link will directly expose. AWAITED (not fire-and-forget) because
    // Vercel serverless kills the function as soon as the HTTP response
    // is sent — fire-and-forget fetches never reach their destination in
    // practice. Individual stamp failures are tolerated via Promise
    // .allSettled; guests fall back to the original URL via decorate()'s
    // signedViaStamp check per STAMP-08. The CreateReviewLinkModal's
    // spinner ("Applying metadata…") stays up for the real duration now
    // that the POST actually waits.
    await triggerStampJobs({
      db,
      projectId,
      assetIds: cleanAssetIds,
      folderIds: cleanFolderIds,
      legacyFolderId: cleanAssetIds || cleanFolderIds ? null : folderId ?? null,
      origin: request.nextUrl.origin,
      authHeader: request.headers.get('Authorization'),
    });

    return NextResponse.json({ link: serializeReviewLink({ id: token, ...docData }) }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/review-links]', err);
    return NextResponse.json({ error: 'Failed to create review link' }, { status: 500 });
  }
}

/**
 * Enumerate the assets a newly-created review link will directly expose, then
 * fire POST /api/assets/[id]/stamp-metadata for each. Fire-and-forget — this
 * function is called without `await` from the POST handler.
 *
 * Scope (matches what the review-link GET serves at the root level):
 *   - Loose assetIds[] — stamped directly
 *   - Each folderIds[i] — direct children of that folder (not recursive)
 *   - Legacy folderId — direct children
 *   - Neither — project root (folderId == null)
 *
 * Subfolder drill-down is NOT triggered here. Guests who navigate into a
 * subfolder get the original URL via decorate()'s fallback — acceptable
 * per STAMP-08. A future milestone can add lazy stamping on drill-down
 * via a worker.
 *
 * Errors at every step are logged and swallowed — a failed enumeration or
 * trigger never blocks review-link creation. STAMP-08 is explicit: stamp
 * failure must never prevent the link from being usable.
 */
async function triggerStampJobs(opts: {
  db: FirebaseFirestore.Firestore;
  projectId: string;
  assetIds: string[] | null;
  folderIds: string[] | null;
  legacyFolderId: string | null;
  origin: string;
  authHeader: string | null;
}): Promise<void> {
  const { db, projectId, assetIds, folderIds, legacyFolderId, origin, authHeader } = opts;
  if (!authHeader) {
    // Guest-originated POSTs don't happen in the current perm model, but
    // guard anyway — without auth the stamp route will 401.
    return;
  }

  try {
    const ids = new Set<string>();
    if (assetIds) {
      for (const id of assetIds) ids.add(id);
    }

    // Resolve folder contents in parallel — each folder is one Firestore
    // query; Promise.all keeps total latency ~one-folder-query regardless
    // of fan-out. Ready-only + filter soft-deleted in-memory (matches the
    // review-link GET's decorate pipeline).
    const folderScopeIds: string[] = [];
    if (folderIds && folderIds.length) folderScopeIds.push(...folderIds);
    else if (legacyFolderId) folderScopeIds.push(legacyFolderId);
    else if (!assetIds) folderScopeIds.push(''); // sentinel for project-root fetch

    const folderFetches = folderScopeIds.map((fid) =>
      fid === ''
        ? db.collection('assets')
            .where('projectId', '==', projectId)
            .where('folderId', '==', null)
            .where('status', '==', 'ready')
            .get()
        : db.collection('assets')
            .where('projectId', '==', projectId)
            .where('folderId', '==', fid)
            .where('status', '==', 'ready')
            .get()
    );
    const snaps = await Promise.all(folderFetches);
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (!(d.data() as { deletedAt?: unknown }).deletedAt) ids.add(d.id);
      }
    }

    // Fire stamps in parallel and AWAIT all of them via Promise.allSettled.
    // The HTTP call to the stamp route returns once that child function
    // has completed the full stamp pipeline (download → exiftool →
    // upload → Firestore update). For a typical MP4 that's 5-15s;
    // fan-out parallelism means N stamps cost ~max(individual time),
    // which fits within Vercel's 60s maxDuration for batches up to ~20
    // assets. Individual failures are logged but do not fail the parent
    // POST — STAMP-08 guarantees the link is created regardless.
    const results = await Promise.allSettled(
      Array.from(ids).map((aid) =>
        fetch(`${origin}/api/assets/${aid}/stamp-metadata`, {
          method: 'POST',
          headers: { Authorization: authHeader },
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`stamp ${aid} → ${res.status} ${body.slice(0, 200)}`);
          }
          return aid;
        }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      // Log each individually for ops visibility. Review link still
      // succeeds — guest fallback handles unstamped assets.
      for (const r of failed) {
        console.warn('[review-links] stamp trigger failed:', (r as PromiseRejectedResult).reason);
      }
    }
  } catch (err) {
    console.warn('[review-links] stamp enumeration failed', err);
  }
}
