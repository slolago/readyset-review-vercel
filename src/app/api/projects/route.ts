import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { canAccessProject } from '@/lib/permissions';
import type { Project } from '@/types';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    // Fetch projects owned by this user directly via index query
    const ownedSnap = await db.collection('projects').where('ownerId', '==', user.id).get();
    const ownedIds = new Set(ownedSnap.docs.map((d) => d.id));
    const ownedProjects = ownedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Fetch remaining projects and filter via canAccessProject (handles admin + collaborators)
    const allSnap = await db.collection('projects').get();
    const collaboratorProjects = allSnap.docs
      .filter((d) => !ownedIds.has(d.id))
      .map((d) => ({ id: d.id, ...d.data() }) as Project)
      .filter((p) => canAccessProject(user, p));

    const projects = [...ownedProjects, ...collaboratorProjects];

    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, description, color } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const db = getAdminDb();
    const now = Timestamp.now();
    const ref = await db.collection('projects').add({
      name,
      description: description || '',
      ownerId: user.id,
      collaborators: [
        {
          userId: user.id,
          role: 'owner',
          email: user.email,
          name: user.name,
        },
      ],
      color: color || 'purple',
      createdAt: now,
      updatedAt: now,
    });

    const doc = await ref.get();
    return NextResponse.json({ project: { id: ref.id, ...doc.data() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
