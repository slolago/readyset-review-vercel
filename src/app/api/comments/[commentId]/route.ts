import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  canResolveComment,
  canEditComment,
  canDeleteComment,
  assertReviewLinkAllows,
  ReviewLinkDenied,
} from '@/lib/permissions';
import type { Project, Comment, ReviewLink } from '@/types';

interface RouteParams {
  params: { commentId: string };
}

// Fields an author is allowed to modify on their own comment
const AUTHOR_UPDATABLE = ['text', 'inPoint', 'outPoint', 'timestamp', 'annotation'];
// Fields any project member can modify (resolved state is collaborative)
const PROJECT_UPDATABLE = ['resolved'];

async function loadProject(projectId: string): Promise<Project | null> {
  const db = getAdminDb();
  const doc = await db.collection('projects').doc(projectId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Project;
}

async function loadReviewLinkByToken(token: string): Promise<ReviewLink | null> {
  const db = getAdminDb();
  const snap = await db
    .collection('reviewLinks')
    .where('token', '==', token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as ReviewLink;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(request.url);
  const reviewToken = searchParams.get('reviewToken');
  const user = await getAuthenticatedUser(request);

  // Guest path: reviewToken, no authed user. Only `resolved` toggle is allowed.
  if (!user && reviewToken) {
    try {
      const link = await loadReviewLinkByToken(reviewToken);
      if (!link) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
      try {
        assertReviewLinkAllows(link, 'comment');
      } catch (e) {
        if (e instanceof ReviewLinkDenied) {
          return NextResponse.json({ error: 'Comments disabled' }, { status: 403 });
        }
        throw e;
      }

      const db = getAdminDb();
      const doc = await db.collection('comments').doc(params.commentId).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const comment = { id: doc.id, ...doc.data() } as Comment;

      if (comment.reviewLinkId !== link.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const body = await request.json();
      if (typeof body.resolved !== 'boolean') {
        return NextResponse.json(
          { error: 'Only "resolved" toggle allowed for guests' },
          { status: 403 }
        );
      }

      await db
        .collection('comments')
        .doc(params.commentId)
        .update({ resolved: body.resolved });
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('[comments/guest] update error:', err);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('comments').doc(params.commentId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const comment = { id: doc.id, ...doc.data() } as Comment;
    const project = await loadProject(comment.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rawUpdates = await request.json();

    // Whitelist per permission:
    //   PROJECT_UPDATABLE keys require canResolveComment (any project member)
    //   AUTHOR_UPDATABLE keys require canEditComment (author or admin)
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawUpdates)) {
      if (PROJECT_UPDATABLE.includes(key) && canResolveComment(user, project)) {
        updates[key] = value;
      } else if (AUTHOR_UPDATABLE.includes(key) && canEditComment(user, project, comment)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided or insufficient permission' },
        { status: 403 }
      );
    }

    await db.collection('comments').doc(params.commentId).update(updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Comment update error:', err);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(request.url);
  const reviewToken = searchParams.get('reviewToken');
  const user = await getAuthenticatedUser(request);

  // Guest path: reviewToken, no authed user. Only allow deleting one's own
  // guest-authored comment on the same review link. "Own" = authorName matches
  // the X-Guest-Name header (lightweight ownership — full auth is out of scope).
  if (!user && reviewToken) {
    try {
      const link = await loadReviewLinkByToken(reviewToken);
      if (!link) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
      try {
        assertReviewLinkAllows(link, 'comment');
      } catch (e) {
        if (e instanceof ReviewLinkDenied) {
          return NextResponse.json({ error: 'Comments disabled' }, { status: 403 });
        }
        throw e;
      }

      const db = getAdminDb();
      const doc = await db.collection('comments').doc(params.commentId).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const comment = { id: doc.id, ...doc.data() } as Comment;

      if (comment.reviewLinkId !== link.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (comment.authorId) {
        // Authed comments can't be deleted via guest path
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const guestName =
        request.headers.get('X-Guest-Name') ||
        (await request.clone().json().catch(() => null))?.guestName ||
        null;
      if (!guestName || guestName !== comment.authorName) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      await db.collection('comments').doc(params.commentId).delete();
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('[comments/guest] delete error:', err);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('comments').doc(params.commentId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const comment = { id: doc.id, ...doc.data() } as Comment;
    const project = await loadProject(comment.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!canDeleteComment(user, project, comment)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.collection('comments').doc(params.commentId).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Comment delete error:', err);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
