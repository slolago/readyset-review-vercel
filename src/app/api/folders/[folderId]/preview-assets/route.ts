import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl } from '@/lib/gcs';
import { canAccessProject } from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { folderId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const folderDoc = await db.collection('folders').doc(params.folderId).get();
    if (!folderDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = folderDoc.data() as any;
    const projDoc = await db.collection('projects').doc(folder.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // List non-deleted assets in this folder — order by createdAt desc, limit 4.
    const snap = await db
      .collection('assets')
      .where('folderId', '==', params.folderId)
      .get();
    const live = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((a: any) => !a.deletedAt)
      .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 4);

    const assets = await Promise.all(
      live.map(async (a: any) => {
        const [signedUrl, thumbnailSignedUrl] = await Promise.all([
          a.gcsPath ? generateReadSignedUrl(a.gcsPath, 120).catch(() => undefined) : Promise.resolve(undefined),
          a.thumbnailGcsPath ? generateReadSignedUrl(a.thumbnailGcsPath, 120).catch(() => undefined) : Promise.resolve(undefined),
        ]);
        return {
          id: a.id,
          type: a.type,
          name: a.name,
          ...(signedUrl ? { signedUrl } : {}),
          ...(thumbnailSignedUrl ? { thumbnailSignedUrl } : {}),
        };
      })
    );

    return NextResponse.json(
      { assets },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('GET folder preview-assets error:', err);
    return NextResponse.json({ error: 'Failed to fetch preview assets' }, { status: 500 });
  }
}
