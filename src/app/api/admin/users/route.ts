import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { name, email, role = 'viewer' } = await request.json();
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    if (!['admin', 'manager', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const db = getAdminDb();

    // Check for duplicate email in Firestore
    const existing = await db.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create a Firestore-only invitation record.
    // When this person signs in with Google using this email, the session
    // endpoint finds the doc and applies the pre-assigned role automatically.
    const docRef = db.collection('users').doc(); // auto-generated ID (replaced on first Google login)
    const userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      avatar: '',
      createdAt: Timestamp.now(),
      invited: true,
    };
    await docRef.set(userData);

    return NextResponse.json({ user: { id: docRef.id, ...userData } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { userId, role } = await request.json();
    if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
    if (!['admin', 'manager', 'editor', 'viewer'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    if (userId === admin.id) return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });

    const db = getAdminDb();
    await db.collection('users').doc(userId).update({ role });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (userId === admin.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

    const auth = getAdminAuth();
    const db = getAdminDb();

    // Try to delete from Firebase Auth — may not exist if user was only invited and never logged in
    try { await auth.deleteUser(userId); } catch {}
    // Always delete from Firestore
    await db.collection('users').doc(userId).delete();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
