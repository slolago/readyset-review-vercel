import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject } from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { projectId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const projDoc = await db.collection('projects').doc(params.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Phase 63 (IDX-04): composite index on (projectId, deletedAt) lets us
    // fetch only trashed rows instead of walking every asset/folder in memory.
    // `deletedAt != null` excludes both missing-field and explicit-null values,
    // so the result set is exactly the trashed items. Falls back to the legacy
    // scan if the index isn't deployed yet.
    let assets: any[];
    let folders: any[];
    try {
      const [assetsSnap, foldersSnap] = await Promise.all([
        db
          .collection('assets')
          .where('projectId', '==', params.projectId)
          .where('deletedAt', '!=', null)
          .get(),
        db
          .collection('folders')
          .where('projectId', '==', params.projectId)
          .where('deletedAt', '!=', null)
          .get(),
      ]);
      assets = assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      folders = foldersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/index/i.test(msg) || /FAILED_PRECONDITION/i.test(msg)) {
        console.warn(
          '[GET /api/projects/[id]/trash] Composite index not deployed yet — falling back to in-memory filter. Deploy firestore.indexes.json.'
        );
        const [assetsSnap, foldersSnap] = await Promise.all([
          db.collection('assets').where('projectId', '==', params.projectId).get(),
          db.collection('folders').where('projectId', '==', params.projectId).get(),
        ]);
        assets = assetsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((a) => !!a.deletedAt);
        folders = foldersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((f) => !!f.deletedAt);
      } else {
        throw err;
      }
    }

    return NextResponse.json({ assets, folders });
  } catch (err) {
    console.error('GET trash error:', err);
    return NextResponse.json({ error: 'Failed to fetch trash' }, { status: 500 });
  }
}
