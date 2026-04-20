import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invitedUser = { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() } as any;
    const collaborator = {
      userId: invitedUser.id,
      role,
      email: invitedUser.email,
      name: invitedUser.name,
    };

    // Remove existing entry if any
    const existing = project.collaborators || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = existing.filter((c: any) => c.userId !== invitedUser.id);
    filtered.push(collaborator);

    await db.collection('projects').doc(params.projectId).update({
      collaborators: filtered,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ collaborator });
  } catch {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.userId !== userId
    );

    await db.collection('projects').doc(params.projectId).update({
      collaborators,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove collaborator' }, { status: 500 });
  }
}
