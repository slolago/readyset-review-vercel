import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject, roleAtLeast } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { generateToken } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const hasAccess = await canAccessProject(user.id, projectId);
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('reviewLinks')
      .where('projectId', '==', projectId)
      .orderBy('createdAt', 'desc')
      .get();

    const links = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch review links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, projectId, folderId, allowComments, password, expiresAt } = await request.json();

    if (!name || !projectId) return NextResponse.json({ error: 'name and projectId required' }, { status: 400 });

    const hasAccess = await canAccessProject(user.id, projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!roleAtLeast(user, 'manager')) return NextResponse.json({ error: 'Forbidden: manager role required to create review links' }, { status: 403 });

    const token = generateToken();
    const db = getAdminDb();

    const data: Record<string, unknown> = {
      token,
      name,
      projectId,
      folderId: folderId || null,
      createdBy: user.id,
      allowComments: allowComments !== false,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      createdAt: Timestamp.now(),
    };
    if (password) data.password = password;

    const ref = await db.collection('reviewLinks').add(data);
    const doc = await ref.get();

    return NextResponse.json({ link: { id: ref.id, ...doc.data() } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create review link' }, { status: 500 });
  }
}
