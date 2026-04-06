import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { folderId, targetParentId, name } = await request.json();
    if (!folderId) return NextResponse.json({ error: 'folderId required' }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection('folders').doc(folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const source = doc.data() as any;
    const hasAccess = await canAccessProject(user.id, source.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // targetParentId: if omitted default to same parent (Duplicate behaviour)
    const destinationParentId = targetParentId !== undefined ? targetParentId : source.parentId;

    // Compute path for the copy
    let path: string[] = [];
    if (destinationParentId) {
      const parentDoc = await db.collection('folders').doc(destinationParentId).get();
      if (parentDoc.exists) {
        const parent = parentDoc.data() as any;
        path = [...(parent.path || []), destinationParentId];
      }
    }

    const newRef = db.collection('folders').doc();
    const copyData = {
      name: name ?? `Copy of ${source.name}`,
      projectId: source.projectId,
      parentId: destinationParentId ?? null,
      path,
      createdAt: Timestamp.now(),
    };

    await newRef.set(copyData);
    return NextResponse.json({ folder: { id: newRef.id, ...copyData } }, { status: 201 });
  } catch (err) {
    console.error('POST folders/copy error:', err);
    return NextResponse.json({ error: 'Failed to copy folder' }, { status: 500 });
  }
}
