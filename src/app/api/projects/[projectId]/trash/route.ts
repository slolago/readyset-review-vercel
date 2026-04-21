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

    const [assetsSnap, foldersSnap] = await Promise.all([
      db.collection('assets').where('projectId', '==', params.projectId).get(),
      db.collection('folders').where('projectId', '==', params.projectId).get(),
    ]);

    const assets = assetsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((a) => !!a.deletedAt);
    const folders = foldersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((f) => !!f.deletedAt);

    return NextResponse.json({ assets, folders });
  } catch (err) {
    console.error('GET trash error:', err);
    return NextResponse.json({ error: 'Failed to fetch trash' }, { status: 500 });
  }
}
