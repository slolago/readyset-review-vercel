import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { canInviteCollaborator, canRemoveCollaborator } from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { projectId: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as Project;
    if (!canInviteCollaborator(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, role } = await request.json();
    if (!email || !role) return NextResponse.json({ error: 'Email and role required' }, { status: 400 });

    // Find user by email
    const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (usersSnap.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const invitedUser = { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() } as any;
    const collaborator = {
      userId: invitedUser.id,
      role,
      email: invitedUser.email,
      name: invitedUser.name,
    };

    // Remove existing entry if any
    const existing = project.collaborators || [];
    const filtered = existing.filter((c: any) => c.userId !== invitedUser.id);
    filtered.push(collaborator);

    // Phase 67 (PERF-01): keep collaborators + collaboratorIds in sync atomically.
    // arrayUnion is idempotent so re-adding an existing collaborator with a new
    // role still leaves collaboratorIds correct.
    const projectRef = db.collection('projects').doc(params.projectId);
    await db.runTransaction(async (tx) => {
      tx.update(projectRef, {
        collaborators: filtered,
        collaboratorIds: FieldValue.arrayUnion(invitedUser.id),
        updatedAt: Timestamp.now(),
      });
    });

    return NextResponse.json({ collaborator });
  } catch (err) {
    console.error('[POST /api/projects/[projectId]/collaborators]', err);
    return NextResponse.json({ error: 'Failed to add collaborator' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as Project;
    if (!canRemoveCollaborator(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await request.json();
    const collaborators = (project.collaborators || []).filter(
      (c: any) => c.userId !== userId
    );

    // Phase 67 (PERF-01): atomic removal from both fields.
    const projectRef = db.collection('projects').doc(params.projectId);
    await db.runTransaction(async (tx) => {
      tx.update(projectRef, {
        collaborators,
        collaboratorIds: FieldValue.arrayRemove(userId),
        updatedAt: Timestamp.now(),
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/projects/[projectId]/collaborators]', err);
    return NextResponse.json({ error: 'Failed to remove collaborator' }, { status: 500 });
  }
}
