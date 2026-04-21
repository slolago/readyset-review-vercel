/**
 * Firestore helpers for the generalized `jobs` collection (Phase 60).
 * Server-only — uses firebase-admin. Do not import from client components.
 *
 * Covers probe / sprite / thumbnail / export job lifecycles with a uniform
 * status machine: queued → running → ready | failed. See src/lib/exports.ts
 * for the export-specific wrapper that maps the legacy `encoding` status
 * onto `running`.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import type { Job, JobType, ExportFormat } from '@/types';

const COLLECTION = 'jobs';

export interface CreateJobInput {
  type: JobType;
  assetId: string;
  projectId: string;
  userId: string;
  // export-only (optional)
  format?: ExportFormat;
  inPoint?: number;
  outPoint?: number;
  filename?: string;
}

export async function createJob(input: CreateJobInput): Promise<string> {
  const db = getAdminDb();
  const payload: Record<string, unknown> = {
    type: input.type,
    assetId: input.assetId,
    projectId: input.projectId,
    userId: input.userId,
    status: 'queued',
    attempt: 1,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (input.format !== undefined) payload.format = input.format;
  if (input.inPoint !== undefined) payload.inPoint = input.inPoint;
  if (input.outPoint !== undefined) payload.outPoint = input.outPoint;
  if (input.filename !== undefined) payload.filename = input.filename;
  const ref = await db.collection(COLLECTION).add(payload);
  return ref.id;
}

export async function updateJob(jobId: string, patch: Partial<Job>): Promise<void> {
  const db = getAdminDb();
  // Drop id — never written back. Signed URL is transient, never stored.
  const { id: _id, signedUrl: _s, ...rest } = patch as Partial<Job> & { id?: string };
  void _id; void _s;
  await db.collection(COLLECTION).doc(jobId).update(rest as Record<string, unknown>);
}

export async function getJob(jobId: string): Promise<Job | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Job;
}

/**
 * FMT-02: mark running jobs stuck past a watermark as failed.
 *
 * A serverless function that gets SIGKILL'd (OOM, timeout, redeploy) can't
 * write its own `failed` status, leaving a job `running` forever. This sweep
 * flips anything older than `olderThanMs` (default 2 minutes) to failed with
 * a clear error so the UI doesn't show a permanent "encoding…" spinner.
 *
 * Called lazily from the jobs GET endpoint — no cron needed for now.
 * Returns the number of jobs swept.
 */
export async function sweepStaleJobs(olderThanMs = 120000): Promise<number> {
  const db = getAdminDb();
  const cutoff = new Date(Date.now() - olderThanMs);
  const snap = await db.collection(COLLECTION)
    .where('status', '==', 'running')
    .where('startedAt', '<', cutoff)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      status: 'failed',
      error: 'function likely SIGKILL\'d or crashed',
      completedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return snap.size;
}

export async function listJobsForAsset(assetId: string, max = 20): Promise<Job[]> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION)
    .where('assetId', '==', assetId)
    .orderBy('createdAt', 'desc')
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job));
}
