import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateDownloadSignedUrl } from '@/lib/gcs';
import { getOrCreateSignedUrl } from '@/lib/signed-url-cache';
import { canAccessProject } from '@/lib/permissions';
import type { Project } from '@/types';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const folderId = searchParams.get('folderId') || null;

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const db0 = getAdminDb();
  const projDoc = await db0.collection('projects').doc(projectId).get();
  if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { id: projDoc.id, ...projDoc.data() } as Project;
  if (!canAccessProject(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    // Fetch all assets for project, filter folderId in memory to avoid composite index
    const snap = await db.collection('assets').where('projectId', '==', projectId).get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    // Load soft-deleted folder IDs for this project so we can hide assets whose parent is trashed.
    const foldersSnap = await db.collection('folders')
      .where('projectId', '==', projectId)
      .get();
    const deletedFolderIds = new Set(
      foldersSnap.docs.filter((d) => (d.data() as any).deletedAt).map((d) => d.id)
    );

    const liveAssets = all.filter((a: any) => {
      if (a.deletedAt) return false;
      if (a.folderId && deletedFolderIds.has(a.folderId)) return false;
      return true;
    });
    const filtered = liveAssets.filter((a: any) => (a.folderId ?? null) === folderId);

    // Group by versionGroupId, show only the latest version per group
    const groups = new Map<string, any[]>();
    for (const asset of filtered) {
      const groupId = asset.versionGroupId || asset.id;
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId)!.push(asset);
    }

    const grouped = Array.from(groups.values()).map((group) => {
      const sorted = group.sort((a, b) => (b.version || 1) - (a.version || 1));
      const latest = { ...sorted[0], _versionCount: group.length };
      return latest;
    });

    // Sort by earliest version's createdAt (stack creation time) descending
    grouped.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());

    // Fetch comment counts for all assets in one query, grouped by assetId.
    // Rule: count only top-level (parentId == null) comments with non-empty
    // text. Replies and empty-text docs are excluded so the grid badge matches
    // what the user sees in the sidebar tab.
    const commentCountMap = new Map<string, number>();
    try {
      const commentsSnap = await db.collection('comments').where('projectId', '==', projectId).get();
      for (const doc of commentsSnap.docs) {
        const d = doc.data() as any;
        const aid = d.assetId as string | undefined;
        if (!aid) continue;
        if (d.parentId) continue;                           // skip replies
        if (!d.text || !String(d.text).trim()) continue;    // skip empty/whitespace
        commentCountMap.set(aid, (commentCountMap.get(aid) ?? 0) + 1);
      }
    } catch (err) {
      // Non-fatal: comment counts stay 0 if query fails
      console.error('[GET /api/assets] comment count query failed', err);
    }
    for (const asset of grouped) {
      asset._commentCount = commentCountMap.get(asset.id) ?? 0;
    }

    // Generate/reuse signed read URLs for all ready assets.
    // Phase 62 (CACHE-01/03): pull from asset doc when cached URL has >30 min
    // of life; otherwise regenerate. Fresh URLs are batch-written back so the
    // next request reuses them.
    const pendingWrites: Array<{ id: string; patch: Record<string, unknown> }> = [];

    const assets = await Promise.all(
      grouped.map(async (asset: any) => {
        if (asset.status !== 'ready') return asset;

        const patch: Record<string, unknown> = {};

        const [mainRes, thumbRes, spriteRes, downloadUrl] = await Promise.all([
          asset.gcsPath
            ? getOrCreateSignedUrl({
                gcsPath: asset.gcsPath,
                cached: asset.signedUrl,
                cachedExpiresAt: asset.signedUrlExpiresAt,
                ttlMinutes: 120,
              })
            : Promise.resolve(null),
          asset.thumbnailGcsPath
            ? getOrCreateSignedUrl({
                gcsPath: asset.thumbnailGcsPath,
                cached: asset.thumbnailSignedUrl,
                cachedExpiresAt: asset.thumbnailSignedUrlExpiresAt,
                ttlMinutes: 720,
              })
            : Promise.resolve(null),
          asset.spriteStripGcsPath && asset.spriteStripGcsPath.includes('sprite-v2.jpg')
            ? getOrCreateSignedUrl({
                gcsPath: asset.spriteStripGcsPath,
                cached: asset.spriteSignedUrl,
                cachedExpiresAt: asset.spriteSignedUrlExpiresAt,
                ttlMinutes: 720,
              })
            : Promise.resolve(null),
          // Download URL stays per-request — it has a filename disposition
          // that changes if the asset is renamed, and isn't a hot-path cost.
          asset.gcsPath
            ? generateDownloadSignedUrl(asset.gcsPath, asset.name).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        if (mainRes) {
          asset.signedUrl = mainRes.url;
          if (mainRes.fresh) {
            patch.signedUrl = mainRes.url;
            patch.signedUrlExpiresAt = mainRes.expiresAt;
          }
        }
        if (thumbRes) {
          asset.thumbnailSignedUrl = thumbRes.url;
          if (thumbRes.fresh) {
            patch.thumbnailSignedUrl = thumbRes.url;
            patch.thumbnailSignedUrlExpiresAt = thumbRes.expiresAt;
          }
        }
        if (spriteRes) {
          asset.spriteSignedUrl = spriteRes.url;
          if (spriteRes.fresh) {
            patch.spriteSignedUrl = spriteRes.url;
            patch.spriteSignedUrlExpiresAt = spriteRes.expiresAt;
          }
        }
        if (downloadUrl !== undefined) asset.downloadUrl = downloadUrl;

        if (Object.keys(patch).length > 0) {
          pendingWrites.push({ id: asset.id, patch });
        }
        return asset;
      })
    );

    // Persist freshly-signed URLs so the next request hits the cache.
    // Sync write (batched) before response — the latency cost is one round-trip
    // and only on requests that regenerated something.
    if (pendingWrites.length > 0) {
      try {
        const batch = db.batch();
        for (const { id, patch } of pendingWrites) {
          batch.update(db.collection('assets').doc(id), patch);
        }
        await batch.commit();
      } catch (err) {
        // Non-fatal: worst case we regenerate again next request.
        console.error('[GET /api/assets] signed URL cache write-back failed', err);
      }
    }

    return NextResponse.json({ assets });
  } catch (err) {
    console.error('GET assets error:', err);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
