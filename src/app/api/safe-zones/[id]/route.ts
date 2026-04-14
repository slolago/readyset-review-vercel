import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { deleteFile } from '@/lib/gcs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { name, ratio, order } = await request.json();
    const db = getAdminDb();
    const ref = db.collection('safeZones').doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (ratio !== undefined) updates.ratio = String(ratio).trim();
    if (order !== undefined) updates.order = Number(order);

    await ref.update(updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[safe-zones PATCH]', err);
    return NextResponse.json({ error: 'Failed to update safe zone' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const ref = db.collection('safeZones').doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = snap.data()!;
    if (data.isBuiltIn) {
      return NextResponse.json({ error: 'Built-in safe zones cannot be deleted' }, { status: 400 });
    }

    if (data.gcsPath) {
      await deleteFile(data.gcsPath).catch(() => {});
    }

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[safe-zones DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete safe zone' }, { status: 500 });
  }
}
