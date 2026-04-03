import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject, roleAtLeast } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const parentId = searchParams.get('parentId') || null;
  const all = searchParams.get('all') === 'true';

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const hasAccess = await canAccessProject(user.id, projectId);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('folders').where('projectId', '==', projectId).get();
    const allFolders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const folders = all
      ? allFolders.sort((a: any, b: any) => a.createdAt?.toMillis() - b.createdAt?.toMillis())
      : allFolders
          .filter((f: any) => (f.parentId ?? null) === parentId)
          .sort((a: any, b: any) => a.createdAt?.toMillis() - b.createdAt?.toMillis());

    return NextResponse.json({ folders });
  } catch (err) {
    console.error('GET folders error:', err);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, projectId, parentId } = await request.json();
    if (!name || !projectId) return NextResponse.json({ error: 'name and projectId required' }, { status: 400 });

    const hasAccess = await canAccessProject(user.id, projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (!roleAtLeast(user, 'manager')) {
      return NextResponse.json({ error: 'Forbidden: manager role required to create folders' }, { status: 403 });
    }

    const db = getAdminDb();
    let path: string[] = [];
    if (parentId) {
      const parentDoc = await db.collection('folders').doc(parentId).get();
      if (parentDoc.exists) {
        const parent = parentDoc.data() as any;
        path = [...(parent.path || []), parentId];
      }
    }

    const ref = await db.collection('folders').add({
      name,
      projectId,
      parentId: parentId || null,
      path,
      createdAt: Timestamp.now(),
    });

    const doc = await ref.get();
    return NextResponse.json({ folder: { id: ref.id, ...doc.data() } }, { status: 201 });
  } catch (err) {
    console.error('POST folder error:', err);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
