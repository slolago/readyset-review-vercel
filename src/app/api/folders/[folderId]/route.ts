import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject, roleAtLeast } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

interface RouteParams {
  params: { folderId: string };
}

/** Convert Firestore Timestamps and other non-JSON types to plain values */
function serializeDoc(data: Record<string, unknown>, id: string): Record<string, unknown> {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = serializeDoc(doc.data()!, doc.id);
    const hasAccess = await canAccessProject(user.id, folder.projectId as string);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Walk parentId chain upward to build full breadcrumb path
    const ancestors: Record<string, unknown>[] = [];
    let parentId = folder.parentId as string | null | undefined;
    let depth = 0;

    while (parentId && typeof parentId === 'string' && depth < 20) {
      const parentDoc = await db.collection('folders').doc(parentId).get();
      if (!parentDoc.exists) break;
      const parent = serializeDoc(parentDoc.data()!, parentDoc.id);
      ancestors.unshift(parent); // prepend → root first
      parentId = parent.parentId as string | null | undefined;
      depth++;
    }

    return NextResponse.json({ folder, ancestors });
  } catch (err) {
    console.error('GET folder error:', err);
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
