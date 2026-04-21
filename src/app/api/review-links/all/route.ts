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

    // Get all projects user has access to
    const projectsSnap = await db.collection('projects').get();
    const userProjects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Project)
      .filter((p) => canAccessProject(user, p));
    const projectMap: Record<string, string> = {};
    for (const p of userProjects) projectMap[p.id] = p.name;
    const projectIds = userProjects.map((p: any) => p.id);

    if (projectIds.length === 0) return NextResponse.json({ links: [] });

    // Fetch review links for all user projects (batched in chunks of 10 due to Firestore 'in' limit)
    const allLinks: any[] = [];
    for (let i = 0; i < projectIds.length; i += 10) {
      const chunk = projectIds.slice(i, i + 10);
      const snap = await db.collection('reviewLinks')
        .where('projectId', 'in', chunk)
        .get(); // no orderBy — avoids composite index requirement; sorted in-memory below
      allLinks.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // Fetch comment counts per link token
    const tokens = allLinks.map(l => l.token || l.id);
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
      } catch { /* non-fatal */ }
    }

    const links = allLinks.map((l) => ({
      ...serializeReviewLink(l as Record<string, unknown>),
      projectName: projectMap[l.projectId] ?? 'Unknown',
      _commentCount: commentCounts[l.token || l.id] ?? 0,
    })) as any[];

    // Sort by createdAt desc
    links.sort((a, b) => {
      const ta = a.createdAt?._seconds ?? 0;
      const tb = b.createdAt?._seconds ?? 0;
      return tb - ta;
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('review-links/all error:', error);
    return NextResponse.json({ error: 'Failed to fetch review links' }, { status: 500 });
  }
}
