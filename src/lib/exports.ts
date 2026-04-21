/**
 * Export-job helpers — thin wrapper over src/lib/jobs.ts (Phase 60 migration).
 * All exports now live in the generalized `jobs` collection with type:'export'.
 * Server-only — do not import from client components.
 *
 * Note: the legacy `exports` collection is abandoned; historical completed
 * exports stop appearing in the list. Acceptable per Phase 60 anti-scope.
 */
import { getAdminDb } from './firebase-admin';
import { createJob, getJob, updateJob } from './jobs';
import type { Job, ExportFormat } from '@/types';

const COLLECTION = 'jobs';

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
  return createJob({ type: 'export', ...input });
}

export async function getExportJob(jobId: string): Promise<Job | null> {
  return getJob(jobId);
}

// Legacy export status values extend the unified JobStatus with 'encoding'
// (mapped to 'running' at write-time).
export type LegacyExportPatch = Omit<Partial<Job>, 'status'> & {
  status?: Job['status'] | 'encoding';
};

export async function updateExportJob(
  jobId: string,
  patch: LegacyExportPatch
): Promise<void> {
  // Legacy callers may still pass status:'encoding'. Map it to the unified
  // JobStatus value `running` so Firestore only ever holds the new schema.
  const { status, ...rest } = patch;
  const mapped: Partial<Job> = { ...rest };
  if (status === 'encoding') mapped.status = 'running';
  else if (status !== undefined) mapped.status = status;
  return updateJob(jobId, mapped);
}

export async function listUserExports(userId: string, max = 20): Promise<Job[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('type', '==', 'export')
    .orderBy('createdAt', 'desc')
    .limit(max)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job));
}
