import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('projects').get();
    const projects = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p: any) => {
        return (
          p.ownerId === user.id ||
          p.collaborators?.some((c: { userId: string }) => c.userId === user.id)
        );
      });

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
