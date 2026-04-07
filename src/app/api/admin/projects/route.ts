import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();

    // Fetch all projects ordered by creation date descending
    const projectsSnap = await db.collection('projects').orderBy('createdAt', 'desc').get();
    const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

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

    return NextResponse.json({ projects: enriched });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
