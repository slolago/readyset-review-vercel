import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');
  const reviewToken = searchParams.get('reviewToken');

  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  try {
    const db = getAdminDb();

    // For review links, verify token and filter by reviewLinkId
    if (reviewToken) {
      const linkSnap = await db.collection('reviewLinks').where('token', '==', reviewToken).limit(1).get();
      if (linkSnap.empty) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
      const reviewLinkId = linkSnap.docs[0].id;

      const snap = await db.collection('comments').where('assetId', '==', assetId).get();
      const comments = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((c: any) => c.reviewLinkId === reviewLinkId)
        .sort((a: any, b: any) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
      return NextResponse.json({ comments });
    } else {
      // Require auth
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      try {
        await getAdminAuth().verifyIdToken(authHeader.slice(7));
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const snap = await db.collection('comments')
      .where('assetId', '==', assetId)
      .get();

    const comments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    const body = await request.json();
    const { assetId, projectId, text, timestamp, annotation, parentId, authorName, authorEmail, reviewLinkId } = body;

    if (!assetId || !projectId || !text) {
      return NextResponse.json({ error: 'assetId, projectId, text required' }, { status: 400 });
    }

    let authorId: string | null = null;
    let resolvedAuthorName = authorName || 'Anonymous';

    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
        authorId = decoded.uid;
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          resolvedAuthorName = (userDoc.data() as any).name || resolvedAuthorName;
        }
      } catch {
        // Guest comment if token invalid
      }
    }

    // If not auth and no review token, reject
    if (!authorId && !reviewLinkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const commentData: Record<string, unknown> = {
      assetId,
      projectId,
      authorId,
      authorName: resolvedAuthorName,
      text,
      resolved: false,
      parentId: parentId || null,
      createdAt: Timestamp.now(),
    };

    if (authorEmail) commentData.authorEmail = authorEmail;
    if (reviewLinkId) commentData.reviewLinkId = reviewLinkId;
    if (timestamp !== undefined) commentData.timestamp = timestamp;
    if (annotation) commentData.annotation = annotation;

    const ref = await db.collection('comments').add(commentData);
    const doc = await ref.get();

    return NextResponse.json({ comment: { id: ref.id, ...doc.data() } }, { status: 201 });
  } catch (error) {
    console.error('Comment create error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
