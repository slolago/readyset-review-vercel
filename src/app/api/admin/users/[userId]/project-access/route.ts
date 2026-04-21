import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

interface RouteParams { params: { userId: string } }

/**
 * POST /api/admin/users/[userId]/project-access
 * Body: { projectId, role: 'manager'|'editor'|'viewer' }
 *
 * Adds the user as a collaborator on the project with the given role.
 * If already a collaborator, updates the role. Does NOT transfer ownership.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { projectId, role } = await request.json();
    if (!projectId || !role) return NextResponse.json({ error: 'projectId and role required' }, { status: 400 });
    if (!['manager', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role (owner transfer goes through a different endpoint)' }, { status: 400 });
    }

    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(params.userId).get();
    if (!userDoc.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const ref = db.collection('projects').doc(projectId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('PROJECT_NOT_FOUND');
      const p = snap.data() as any;
      if (p.ownerId === params.userId) throw new Error('ALREADY_OWNER');
      const collaborators = Array.isArray(p.collaborators) ? [...p.collaborators] : [];
      const idx = collaborators.findIndex((c: any) => c.userId === params.userId);
      const userData = userDoc.data() as any;
      const entry = {
        userId: params.userId,
        name: userData?.name ?? '',
        email: userData?.email ?? '',
        avatar: userData?.avatar ?? '',
        role,
      };
      if (idx >= 0) collaborators[idx] = { ...collaborators[idx], ...entry };
      else collaborators.push(entry);
      // Phase 67 (PERF-01): keep denormalized collaboratorIds in sync atomically.
      tx.update(ref, {
        collaborators,
        collaboratorIds: collaborators.map((c: any) => c.userId).filter(Boolean),
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'PROJECT_NOT_FOUND') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (msg === 'ALREADY_OWNER') return NextResponse.json({ error: 'User already owns this project' }, { status: 400 });
    console.error('admin project-access POST error:', err);
    return NextResponse.json({ error: 'Failed to add project access' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[userId]/project-access?projectId=X
 *
 * Removes the user as a collaborator from the project. Refuses if the user
 * is the owner (use the transfer endpoint instead).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const db = getAdminDb();
    const ref = db.collection('projects').doc(projectId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('PROJECT_NOT_FOUND');
      const p = snap.data() as any;
      if (p.ownerId === params.userId) throw new Error('IS_OWNER');
      const collaborators = (Array.isArray(p.collaborators) ? p.collaborators : [])
        .filter((c: any) => c.userId !== params.userId);
      // Phase 67 (PERF-01): keep denormalized collaboratorIds in sync atomically.
      tx.update(ref, {
        collaborators,
        collaboratorIds: collaborators.map((c: any) => c.userId).filter(Boolean),
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'PROJECT_NOT_FOUND') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (msg === 'IS_OWNER') return NextResponse.json({ error: 'Cannot remove owner via this endpoint — transfer ownership first' }, { status: 400 });
    console.error('admin project-access DELETE error:', err);
    return NextResponse.json({ error: 'Failed to remove project access' }, { status: 500 });
  }
}
