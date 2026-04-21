import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  canAccessProject,
  canPostComment,
  assertReviewLinkActive,
  assertReviewLinkAllows,
  ReviewLinkDenied,
} from '@/lib/permissions';
import type { Project, ReviewLink, User } from '@/types';

function mapReviewLinkDenied(e: ReviewLinkDenied): NextResponse {
  switch (e.reason) {
    case 'expired':
      return NextResponse.json({ error: 'This review link has expired' }, { status: 410 });
    case 'password':
      return NextResponse.json({ error: 'Password required' }, { status: 401 });
    case 'comments_disabled':
      return NextResponse.json(
        { error: 'Comments are disabled on this review link' },
        { status: 403 }
      );
    case 'approvals_disabled':
      return NextResponse.json(
        { error: 'Approvals are disabled on this review link' },
        { status: 403 }
      );
    case 'downloads_disabled':
      return NextResponse.json(
        { error: 'Downloads are disabled on this review link' },
        { status: 403 }
      );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');
  const reviewToken = searchParams.get('reviewToken');
  const reviewPassword = searchParams.get('password') ?? undefined;

  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  try {
    const db = getAdminDb();

    // For review links, verify token, enforce expiry+password, then filter by reviewLinkId.
    if (reviewToken) {
      const linkSnap = await db
        .collection('reviewLinks')
        .where('token', '==', reviewToken)
        .limit(1)
        .get();
      if (linkSnap.empty) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
      const linkDoc = linkSnap.docs[0];
      const link = { id: linkDoc.id, ...linkDoc.data() } as ReviewLink;

      try {
        assertReviewLinkActive(link, { providedPassword: reviewPassword });
      } catch (e) {
        if (e instanceof ReviewLinkDenied) return mapReviewLinkDenied(e);
        throw e;
      }

      const reviewLinkId = linkDoc.id;
      // Compound query: requires a Firestore composite index on
      //   comments(assetId ASC, reviewLinkId ASC, createdAt ASC)
      // If the index is missing, Firestore throws FAILED_PRECONDITION with
      // a URL to auto-create it. We fall back to the legacy in-memory filter
      // in that window so the endpoint degrades rather than 500s.
      let comments: any[];
      try {
        const snap = await db
          .collection('comments')
          .where('assetId', '==', assetId)
          .where('reviewLinkId', '==', reviewLinkId)
          .get();
        comments = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .sort((a: any, b: any) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/index/i.test(msg) || /FAILED_PRECONDITION/i.test(msg)) {
          console.warn('[comments GET] composite index missing, falling back to in-memory filter:', msg);
          const snap = await db.collection('comments').where('assetId', '==', assetId).get();
          comments = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as any))
            .filter((c: any) => c.reviewLinkId === reviewLinkId)
            .sort((a: any, b: any) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
        } else {
          throw e;
        }
      }
      return NextResponse.json({ comments });
    }

    // Auth path — require project access for the asset being queried
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let userId: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
      userId = decoded.uid;
    } catch (err) {
      console.error('[GET /api/comments] token verify failed', err);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    const asset = assetDoc.data() as any;

    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const user = { id: userDoc.id, ...userDoc.data() } as User;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snap = await db.collection('comments').where('assetId', '==', assetId).get();
    const comments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
    return NextResponse.json({ comments });
  } catch (err) {
    console.error('Comment fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    const body = await request.json();
    const {
      assetId,
      projectId,
      text,
      timestamp,
      inPoint,
      outPoint,
      annotation,
      parentId,
      authorName,
      authorEmail,
      reviewLinkId,
      password,
      approvalStatus,
    } = body;

    if (!assetId || !projectId || !text) {
      return NextResponse.json({ error: 'assetId, projectId, text required' }, { status: 400 });
    }

    // Verify the asset exists and its projectId matches what the client claims
    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    const asset = assetDoc.data() as any;
    if (asset.projectId !== projectId) {
      return NextResponse.json({ error: 'projectId mismatch' }, { status: 400 });
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
      } catch (err) {
        console.warn('Comment POST — token verify failed:', (err as Error).message);
      }
    }

    // Authenticated users need project access; guests need a valid reviewLinkId
    // plus passing the link's expiry/password/allowComments gates.
    if (authorId) {
      const projDoc = await db.collection('projects').doc(projectId).get();
      if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const project = { id: projDoc.id, ...projDoc.data() } as Project;
      const userDoc = await db.collection('users').doc(authorId).get();
      if (!userDoc.exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const user = { id: userDoc.id, ...userDoc.data() } as User;
      if (!canPostComment(user, project)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (reviewLinkId) {
      const linkDoc = await db.collection('reviewLinks').doc(reviewLinkId).get();
      if (!linkDoc.exists) return NextResponse.json({ error: 'Invalid review link' }, { status: 403 });
      const link = { id: linkDoc.id, ...linkDoc.data() } as ReviewLink;
      if (link.projectId !== projectId) {
        return NextResponse.json({ error: 'Review link does not match project' }, { status: 403 });
      }
      try {
        assertReviewLinkActive(link, { providedPassword: password });
        assertReviewLinkAllows(link, 'comment');
        if (approvalStatus !== undefined) {
          assertReviewLinkAllows(link, 'approve');
        }
      } catch (e) {
        if (e instanceof ReviewLinkDenied) return mapReviewLinkDenied(e);
        throw e;
      }
    } else {
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
    if (inPoint !== undefined) commentData.inPoint = inPoint;
    if (outPoint !== undefined) commentData.outPoint = outPoint;
    if (annotation) commentData.annotation = annotation;

    if (approvalStatus !== undefined) {
      // Guest path: already gated above via assertReviewLinkAllows(link, 'approve').
      // Authenticated path: project access via canPostComment is sufficient.
      // Validate the shape — only the three legal values persist.
      const VALID: readonly string[] = ['approved', 'needs_revision', 'in_review'];
      if (typeof approvalStatus === 'string' && VALID.includes(approvalStatus)) {
        commentData.approvalStatus = approvalStatus;
      }
    }

    // Phase 63 (IDX-02): write the comment + bump `asset.commentCount` in a single
    // transaction so the denormalized count cannot drift from the comments collection.
    // Only top-level comments with non-empty text are counted (matches the list
    // endpoint's visibility rule).
    const newRef = db.collection('comments').doc();
    const countsTowardTotal =
      !commentData.parentId && typeof commentData.text === 'string' && commentData.text.trim().length > 0;

    await db.runTransaction(async (tx) => {
      tx.set(newRef, commentData);
      if (countsTowardTotal) {
        tx.update(db.collection('assets').doc(assetId), {
          commentCount: FieldValue.increment(1),
        });
      }
    });

    const doc = await newRef.get();
    return NextResponse.json({ comment: { id: newRef.id, ...doc.data() } }, { status: 201 });
  } catch (error) {
    console.error('Comment create error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
