import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/permissions';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Project } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = params;

  try {
    const db = getAdminDb();

    // Verify the review link exists and user can access its project
    const linkDoc = await db.collection('reviewLinks').doc(token).get();
    if (!linkDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const link = linkDoc.data() as any;

    const projectDoc = await db.collection('projects').doc(link.projectId).get();
    if (!projectDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projectDoc.id, ...projectDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all comments made via this review link
    const commentsSnap = await db.collection('comments')
      .where('reviewLinkId', '==', token)
      .orderBy('createdAt', 'desc')
      .get();

    // Group by author (email or name as key)
    const viewerMap = new Map<string, {
      name: string;
      email: string;
      commentCount: number;
      lastSeen: any;
    }>();

    for (const doc of commentsSnap.docs) {
      const c = doc.data();
      const key = c.authorEmail || c.authorName || 'anonymous';
      if (viewerMap.has(key)) {
        const v = viewerMap.get(key)!;
        v.commentCount++;
        // keep most recent
        if ((c.createdAt?._seconds ?? 0) > (v.lastSeen?._seconds ?? 0)) {
          v.lastSeen = c.createdAt;
        }
      } else {
        viewerMap.set(key, {
          name: c.authorName || 'Anonymous',
          email: c.authorEmail || '',
          commentCount: 1,
          lastSeen: c.createdAt,
        });
      }
    }

    const viewers = Array.from(viewerMap.values()).sort(
      (a, b) => (b.lastSeen?._seconds ?? 0) - (a.lastSeen?._seconds ?? 0)
    );

    return NextResponse.json({
      viewers,
      totalComments: commentsSnap.size,
    });
  } catch (err) {
    console.error('[GET /api/review-links/[token]/viewers]', err);
    return NextResponse.json({ error: 'Failed to fetch viewers' }, { status: 500 });
  }
}
