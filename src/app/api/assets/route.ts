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

    // Phase 63 (IDX-02): read the denormalized `commentCount` from each asset
    // doc instead of scanning the comments collection per list request.
    // Pre-Phase-63 assets may lack the field — lazy-backfill on first read by
    // counting visible top-level comments once, then write the value so future
    // list reads hit the cached count directly.
    const backfillWrites: Array<{ id: string; count: number }> = [];
    await Promise.all(
      grouped.map(async (asset: any) => {
        if (typeof asset.commentCount === 'number') {
          asset._commentCount = asset.commentCount;
          return;
        }
        try {
          const cSnap = await db.collection('comments').where('assetId', '==', asset.id).get();
          let count = 0;
          for (const doc of cSnap.docs) {
            const d = doc.data() as any;
            if (d.parentId) continue;                            // skip replies
            if (!d.text || !String(d.text).trim()) continue;     // skip empty/whitespace
            count++;
          }
          asset._commentCount = count;
          asset.commentCount = count;
          backfillWrites.push({ id: asset.id, count });
        } catch (err) {
          console.error('[GET /api/assets] comment-count backfill failed for', asset.id, err);
          asset._commentCount = 0;
        }
      })
    );
    if (backfillWrites.length > 0) {
      try {
        const batch = db.batch();
        for (const { id, count } of backfillWrites) {
          batch.update(db.collection('assets').doc(id), { commentCount: count });
        }
        await batch.commit();
      } catch (err) {
        // Non-fatal: next request will try the backfill again.
        console.error('[GET /api/assets] commentCount backfill write failed', err);
      }
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
