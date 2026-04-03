import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject, roleAtLeast } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

interface RouteParams {
  params: { folderId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = { id: doc.id, ...doc.data() } as any;
    const hasAccess = await canAccessProject(user.id, folder.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Walk up the parentId chain to build ancestors array
    const ancestors: any[] = [];
    let parentId = folder.parentId;
    while (parentId) {
      const parentDoc = await db.collection('folders').doc(parentId).get();
      if (!parentDoc.exists) break;
      const parent = { id: parentDoc.id, ...parentDoc.data() };
      ancestors.unshift(parent); // prepend to keep root-first order
      parentId = (parent as any).parentId;
    }

    return NextResponse.json({ folder, ancestors });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch folder' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = doc.data() as any;
    const hasAccess = await canAccessProject(user.id, folder.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updates = await request.json();
    await db.collection('folders').doc(params.folderId).update(updates);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = doc.data() as any;
    const hasAccess = await canAccessProject(user.id, folder.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!roleAtLeast(user, 'manager')) return NextResponse.json({ error: 'Forbidden: manager role required' }, { status: 403 });

    await db.collection('folders').doc(params.folderId).delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
