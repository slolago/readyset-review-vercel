import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

interface RouteParams { params: { projectId: string } }

/**
 * GET /api/admin/projects/[projectId]
 * Returns project detail with owner + collaborators + basic counts.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const project = { id: doc.id, ...doc.data() } as any;

    const ownerDoc = project.ownerId ? await db.collection('users').doc(project.ownerId).get() : null;

    const [foldersSnap, assetsSnap, commentsSnap, reviewLinksSnap] = await Promise.all([
      db.collection('folders').where('projectId', '==', params.projectId).count().get().catch(() => null),
      db.collection('assets').where('projectId', '==', params.projectId).count().get().catch(() => null),
      db.collection('comments').where('projectId', '==', params.projectId).count().get().catch(() => null),
      db.collection('reviewLinks').where('projectId', '==', params.projectId).count().get().catch(() => null),
    ]);

    return NextResponse.json({
      project: {
        ...project,
        owner: ownerDoc?.exists ? { id: ownerDoc.id, ...ownerDoc.data() } : null,
      },
      stats: {
        folders: foldersSnap?.data().count ?? 0,
        assets: assetsSnap?.data().count ?? 0,
        comments: commentsSnap?.data().count ?? 0,
        reviewLinks: reviewLinksSnap?.data().count ?? 0,
      },
    });
  } catch (err) {
    console.error('admin project GET error:', err);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/projects/[projectId]
 * Body: { newOwnerId }
 *
 * Transfer ownership. Moves the old owner into collaborators as a manager,
 * promotes newOwnerId to owner, removes them from the collaborators list.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { newOwnerId } = await request.json();
    if (!newOwnerId) return NextResponse.json({ error: 'newOwnerId required' }, { status: 400 });

    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(newOwnerId).get();
    if (!userDoc.exists) return NextResponse.json({ error: 'New owner user not found' }, { status: 404 });
    const user = userDoc.data() as any;

    const ref = db.collection('projects').doc(params.projectId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('PROJECT_NOT_FOUND');
      const p = snap.data() as any;
      if (p.ownerId === newOwnerId) throw new Error('ALREADY_OWNER');

      const collaborators = Array.isArray(p.collaborators) ? [...p.collaborators] : [];

      // Fetch old owner info for the collaborators entry
      let oldOwnerEntry: any = null;
      if (p.ownerId) {
        const oldOwnerDoc = await tx.get(db.collection('users').doc(p.ownerId));
        if (oldOwnerDoc.exists) {
          const ou = oldOwnerDoc.data() as any;
          oldOwnerEntry = {
            userId: p.ownerId,
            name: ou?.name ?? '',
            email: ou?.email ?? '',
            avatar: ou?.avatar ?? '',
            role: 'manager',
          };
        }
      }

      // Remove new owner from collaborators (they're becoming owner)
      const filtered = collaborators.filter((c: any) => c.userId !== newOwnerId);
      // Add old owner as manager (if any + not already listed)
      if (oldOwnerEntry && !filtered.some((c: any) => c.userId === oldOwnerEntry.userId)) {
        filtered.push(oldOwnerEntry);
      }

      tx.update(ref, {
        ownerId: newOwnerId,
        ownerName: user?.name ?? null,
        ownerEmail: user?.email ?? null,
        collaborators: filtered,
        // Phase 67 (PERF-01): keep denormalized collaboratorIds in sync.
        collaboratorIds: filtered.map((c: any) => c.userId).filter(Boolean),
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'PROJECT_NOT_FOUND') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (msg === 'ALREADY_OWNER') return NextResponse.json({ error: 'User already owns this project' }, { status: 400 });
    console.error('admin project PATCH error:', err);
    return NextResponse.json({ error: 'Failed to transfer ownership' }, { status: 500 });
  }
}
