import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl, generateDownloadSignedUrl } from '@/lib/gcs';
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
    const filtered = all.filter((a: any) => (a.folderId ?? null) === folderId);

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
    } catch {
      // Non-fatal: comment counts stay 0 if query fails
    }
    for (const asset of grouped) {
      asset._commentCount = commentCountMap.get(asset.id) ?? 0;
    }

    // Generate signed read URLs for all ready assets — parallelized per asset and across assets
    const assets = await Promise.all(
      grouped.map(async (asset: any) => {
        if (asset.status !== 'ready') return asset;
        const [signedUrl, thumbnailSignedUrl, downloadUrl, spriteSignedUrl] = await Promise.all([
          asset.gcsPath ? generateReadSignedUrl(asset.gcsPath, 120) : Promise.resolve(undefined),
          asset.thumbnailGcsPath ? generateReadSignedUrl(asset.thumbnailGcsPath, 120) : Promise.resolve(undefined),
          asset.gcsPath
            ? generateDownloadSignedUrl(asset.gcsPath, asset.name).catch(() => undefined)
            : Promise.resolve(undefined),
          asset.spriteStripGcsPath && asset.spriteStripGcsPath.includes('sprite-v2.jpg')
            ? generateReadSignedUrl(asset.spriteStripGcsPath, 120)
            : Promise.resolve(undefined),
        ]);
        if (signedUrl !== undefined) asset.signedUrl = signedUrl;
        if (thumbnailSignedUrl !== undefined) asset.thumbnailSignedUrl = thumbnailSignedUrl;
        if (downloadUrl !== undefined) asset.downloadUrl = downloadUrl;
        if (spriteSignedUrl !== undefined) asset.spriteSignedUrl = spriteSignedUrl;
        return asset;
      })
    );

    return NextResponse.json({ assets });
  } catch (err) {
    console.error('GET assets error:', err);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
