import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl } from '@/lib/gcs';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const folderId = searchParams.get('folderId') || null;

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const hasAccess = await canAccessProject(user.id, projectId);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

    // Generate signed read URLs for all ready assets
    const assets = await Promise.all(
      grouped.map(async (asset: any) => {
        if (asset.gcsPath && asset.status === 'ready') {
          asset.signedUrl = await generateReadSignedUrl(asset.gcsPath, 120);
        }
        if (asset.thumbnailGcsPath && asset.status === 'ready') {
          asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailGcsPath, 120);
        }
        return asset;
      })
    );

    return NextResponse.json({ assets });
  } catch (err) {
    console.error('GET assets error:', err);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
