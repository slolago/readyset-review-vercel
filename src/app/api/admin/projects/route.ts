import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();

    // Pagination: ?limit=N (default 50, clamped to [1, 100]) + ?cursor=<docId>
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50;
    const cursor = searchParams.get('cursor');

    let query = db.collection('projects').orderBy('createdAt', 'desc');
    if (cursor) {
      const cursorDoc = await db.collection('projects').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const projectsSnap = await query.limit(limit).get();
    const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const nextCursor = projectsSnap.size === limit ? projectsSnap.docs[projectsSnap.docs.length - 1].id : null;

    // Collect unique owner IDs
    const ownerIds = Array.from(new Set(projects.map((p: any) => p.ownerId).filter(Boolean))) as string[];

    // Batch-fetch owners in a single Firestore RPC
    const ownerDocs = ownerIds.length > 0
      ? await db.getAll(...ownerIds.map((id) => db.collection('users').doc(id)))
      : [];

    const ownerMap = new Map(
      ownerDocs
        .filter((d) => d.exists)
        .map((d) => [d.id, { name: (d.data() as any)?.name ?? 'Unknown', email: (d.data() as any)?.email ?? '' }])
    );

    // Enrich projects with owner info
    const enriched = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      createdAt: p.createdAt,
      ownerId: p.ownerId,
      ownerName: ownerMap.get(p.ownerId)?.name ?? 'Unknown',
      ownerEmail: ownerMap.get(p.ownerId)?.email ?? '',
      collaboratorCount: (p.collaborators || []).length,
    }));

    return NextResponse.json({ projects: enriched, nextCursor });
  } catch (err) {
    console.error('[GET /api/admin/projects]', err);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
