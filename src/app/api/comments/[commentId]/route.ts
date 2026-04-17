import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

interface RouteParams {
  params: { commentId: string };
}

// Fields an author is allowed to modify on their own comment
const AUTHOR_UPDATABLE = ['text', 'inPoint', 'outPoint', 'timestamp', 'annotation'];
// Fields any project member can modify (resolved state is collaborative)
const PROJECT_UPDATABLE = ['resolved'];

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('comments').doc(params.commentId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const comment = doc.data() as any;
    if (!(await canAccessProject(user.id, comment.projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawUpdates = await request.json();
    const isAuthor = comment.authorId === user.id;
    const isAdmin = user.role === 'admin';

    // Whitelist fields — author can update content, anyone with project
    // access can mark resolved. Never allow mutating projectId/assetId/authorId/createdAt.
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawUpdates)) {
      if (PROJECT_UPDATABLE.includes(key)) {
        updates[key] = value;
      } else if (AUTHOR_UPDATABLE.includes(key) && (isAuthor || isAdmin)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided or insufficient permission' }, { status: 403 });
    }

    await db.collection('comments').doc(params.commentId).update(updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Comment update error:', err);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('comments').doc(params.commentId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const comment = doc.data() as any;
    // Must have project access AND be author or admin
    if (!(await canAccessProject(user.id, comment.projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (comment.authorId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.collection('comments').doc(params.commentId).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Comment delete error:', err);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
