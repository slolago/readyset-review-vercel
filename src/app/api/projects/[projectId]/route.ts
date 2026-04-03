import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

interface RouteParams {
  params: { projectId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as any;
    const hasAccess =
      project.ownerId === user.id ||
      project.collaborators?.some((c: { userId: string }) => c.userId === user.id);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = doc.data() as any;
    if (project.ownerId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updates = await request.json();
    await db.collection('projects').doc(params.projectId).update({
      ...updates,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = doc.data() as any;
    if (project.ownerId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.collection('projects').doc(params.projectId).delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
