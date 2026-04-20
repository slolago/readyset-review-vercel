import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/admin/users/orphans?limit=50&cursor={userId}
 *
 * Orphan = role === 'viewer' AND invited !== true AND NOT a member of any project
 * (owner or collaborator). Admin-only; in-memory filter is acceptable at v1.7
 * scale (bounded user count).
 *
 * Phase 45 / ACCESS-06.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const cursor = searchParams.get('cursor');

    const db = getAdminDb();

    // Build membership set from all projects
    const projectsSnap = await db.collection('projects').get();
    const memberIds = new Set<string>();
    for (const d of projectsSnap.docs) {
      const p = d.data() as any;
      if (p.ownerId) memberIds.add(p.ownerId);
      if (Array.isArray(p.collaborators)) {
        for (const c of p.collaborators) if (c?.userId) memberIds.add(c.userId);
      }
    }

    // Viewers only — filter invited===true in memory (Firestore can't combine ==
    // with != without a compound index)
    const viewersSnap = await db
      .collection('users')
      .where('role', '==', 'viewer')
      .orderBy('createdAt', 'desc')
      .get();

    const all = viewersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((u) => u.invited !== true)
      .filter((u) => !memberIds.has(u.id));

    // Simple cursor: slice after encountering cursor id
    let startIdx = 0;
    if (cursor) {
      const idx = all.findIndex((u) => u.id === cursor);
      if (idx >= 0) startIdx = idx + 1;
    }
    const page = all.slice(startIdx, startIdx + limit);
    const nextCursor = startIdx + limit < all.length ? page[page.length - 1]?.id ?? null : null;

    return NextResponse.json({ users: page, nextCursor });
  } catch (err) {
    console.error('admin orphans GET error:', err);
    return NextResponse.json({ error: 'Failed to load orphan users' }, { status: 500 });
  }
}
