import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('projects').get();
    const userProjects = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter(
        (p: any) =>
          p.ownerId === user.id ||
          p.collaborators?.some((c: any) => c.userId === user.id)
      );
    const projectIds = userProjects.map((p: any) => p.id);

    const collaboratorSet = new Set<string>();
    for (const p of userProjects) {
      for (const c of p.collaborators || []) {
        if (c.userId !== user.id) collaboratorSet.add(c.userId);
      }
    }

    let assetCount = 0;
    let storageBytes = 0;
    if (projectIds.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < projectIds.length; i += 30) {
        chunks.push(projectIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const assetsSnap = await db
          .collectionGroup('assets')
          .where('projectId', 'in', chunk)
          .get();
        assetCount += assetsSnap.size;
        for (const doc of assetsSnap.docs) {
          storageBytes += (doc.data().size as number) || 0;
        }
      }
    }

    return NextResponse.json({
      projectCount: userProjects.length,
      assetCount,
      collaboratorCount: collaboratorSet.size,
      storageBytes,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
