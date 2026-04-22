import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject } from '@/lib/permissions';
import type { Project } from '@/types';
import { serializeReviewLink } from '@/lib/review-links';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();

    // Pagination: ?limit=N (default 50, clamped to [1, 100]) + ?cursor=<linkId>.
    // Firestore-side ordering across a cross-project union of review links would
    // require a new composite index + ordered union; for now we page in-memory
    // over the sorted-by-createdAt list. The project set is already bounded by
    // user access, so memory pressure is scoped to "links per user".
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50;
    const cursor = searchParams.get('cursor');

    // Get all projects user has access to
    const projectsSnap = await db.collection('projects').get();
    const userProjects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Project)
      .filter((p) => canAccessProject(user, p));
    const projectMap: Record<string, string> = {};
    for (const p of userProjects) projectMap[p.id] = p.name;
    const projectIds = userProjects.map((p: any) => p.id);

    if (projectIds.length === 0) return NextResponse.json({ links: [], nextCursor: null });

    // Fetch review links for all user projects (batched in chunks of 10 due to Firestore 'in' limit)
    const allLinks: any[] = [];
    for (let i = 0; i < projectIds.length; i += 10) {
      const chunk = projectIds.slice(i, i + 10);
      const snap = await db.collection('reviewLinks')
        .where('projectId', 'in', chunk)
        .get(); // no orderBy — avoids composite index requirement; sorted in-memory below
      allLinks.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // Sort by createdAt desc (stable order before slicing)
    allLinks.sort((a, b) => {
      const ta = a.createdAt?._seconds ?? a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?._seconds ?? b.createdAt?.seconds ?? 0;
      return tb - ta;
    });

    // Apply cursor slice (cursor = last link id from previous page)
    let startIndex = 0;
    if (cursor) {
      const idx = allLinks.findIndex((l) => l.id === cursor);
      if (idx >= 0) startIndex = idx + 1;
    }
    const pagedLinks = allLinks.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < allLinks.length && pagedLinks.length > 0
      ? pagedLinks[pagedLinks.length - 1].id
      : null;

    // Fetch comment counts only for the paged slice's tokens
    const tokens = pagedLinks.map((l) => l.token || l.id);
    const commentCounts: Record<string, number> = {};
    for (let i = 0; i < tokens.length; i += 10) {
      const chunk = tokens.slice(i, i + 10);
      try {
        const snap = await db.collection('comments')
          .where('reviewLinkId', 'in', chunk)
          .get();
        for (const doc of snap.docs) {
          const rl = doc.data().reviewLinkId;
          commentCounts[rl] = (commentCounts[rl] || 0) + 1;
        }
      } catch (err) {
        // non-fatal
        console.error('[GET /api/review-links/all] comment count query failed', err);
      }
    }

    const links = pagedLinks.map((l) => ({
      ...serializeReviewLink(l as Record<string, unknown>),
      projectName: projectMap[l.projectId] ?? 'Unknown',
      _commentCount: commentCounts[l.token || l.id] ?? 0,
    })) as any[];

    return NextResponse.json({ links, nextCursor });
  } catch (error) {
    console.error('review-links/all error:', error);
    return NextResponse.json({ error: 'Failed to fetch review links' }, { status: 500 });
  }
}
