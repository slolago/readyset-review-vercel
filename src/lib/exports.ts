/**
 * Firestore helpers for the `exports` collection (Phase 47).
 * Server-only — uses firebase-admin. Do not import from client components.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import type { ExportJob, ExportFormat } from '@/types';

const COLLECTION = 'exports';

export interface CreateExportJobInput {
  userId: string;
  assetId: string;
  projectId: string;
  format: ExportFormat;
  inPoint: number;
  outPoint: number;
  filename: string;
}

export async function createExportJob(input: CreateExportJobInput): Promise<string> {
  const db = getAdminDb();
  const ref = await db.collection(COLLECTION).add({
    userId: input.userId,
    assetId: input.assetId,
    projectId: input.projectId,
    format: input.format,
    inPoint: input.inPoint,
    outPoint: input.outPoint,
    filename: input.filename,
    status: 'queued',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getExportJob(jobId: string): Promise<ExportJob | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as ExportJob;
}

export async function updateExportJob(
  jobId: string,
  patch: Partial<ExportJob>
): Promise<void> {
  const db = getAdminDb();
  // Drop id — never written back. Signed URL is transient, never stored.
  const { id: _id, signedUrl: _s, ...rest } = patch as Partial<ExportJob> & { id?: string };
  void _id; void _s;
  await db.collection(COLLECTION).doc(jobId).update(rest as Record<string, unknown>);
}

export async function listUserExports(userId: string, max = 20): Promise<ExportJob[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExportJob));
}
