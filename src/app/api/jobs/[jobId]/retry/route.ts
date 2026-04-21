/**
 * POST /api/jobs/[jobId]/retry — re-run a failed probe/sprite job (OBS-02).
 *
 * Semantics:
 *   - Only failed jobs are retryable (409 for queued/running/ready).
 *   - Hard cap at 3 attempts (409 beyond that).
 *   - Reuses the same job doc id so history is preserved — attempt is
 *     incremented and error cleared here, then the underlying processing
 *     route is fired with an `x-retry-job-id` header so it reuses the id
 *     instead of creating a fresh job.
 *   - Exports are NOT retryable from this endpoint (they have their own
 *     ffmpeg re-run flow via POST /api/exports).
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { getJob, updateJob } from '@/lib/jobs';
import { canProbeAsset } from '@/lib/permissions';
import type { Project } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ATTEMPTS = 3;

interface RouteParams {
  params: { jobId: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const job = await getJob(params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  if (job.type === 'export') {
    return NextResponse.json(
      { error: 'exports are not retryable from this endpoint' },
      { status: 400 },
    );
  }
  if (job.type !== 'probe' && job.type !== 'sprite') {
    return NextResponse.json({ error: `unsupported job type: ${job.type}` }, { status: 400 });
  }

  const db = getAdminDb();
  const assetSnap = await db.collection('assets').doc(job.assetId).get();
  if (!assetSnap.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

  const projDoc = await db.collection('projects').doc(job.projectId).get();
  if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { id: projDoc.id, ...projDoc.data() } as Project;
  if (!canProbeAsset(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (job.status !== 'failed') {
    return NextResponse.json({ error: 'only failed jobs can be retried' }, { status: 409 });
  }
  if ((job.attempt ?? 1) >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'max attempts reached' }, { status: 409 });
  }

  await updateJob(params.jobId, {
    status: 'queued',
    attempt: (job.attempt ?? 1) + 1,
    error: FieldValue.delete() as any,
  });

  // Fire-and-forget the processing route. The `x-retry-job-id` header tells
  // the route to reuse this job doc instead of creating a new one.
  const origin = request.nextUrl.origin;
  const authHeader = request.headers.get('Authorization');
  const endpoint = job.type === 'probe'
    ? `${origin}/api/assets/${job.assetId}/probe`
    : `${origin}/api/assets/${job.assetId}/generate-sprite`;

  if (authHeader) {
    fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'x-retry-job-id': params.jobId,
      },
    }).catch((err) => console.warn('[jobs/retry] background re-run failed', err));
  }

  return NextResponse.json({ ok: true, jobId: params.jobId, attempt: (job.attempt ?? 1) + 1 });
}
