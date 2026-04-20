/**
 * GET /api/exports/[jobId]
 *
 * Returns the job document. If ready, attaches a fresh signed download URL
 * (never persisted). 404 for missing, 403 for cross-user access (unless platform admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getExportJob } from '@/lib/exports';
import { generateDownloadSignedUrl } from '@/lib/gcs';

export const runtime = 'nodejs';

interface RouteParams {
  params: { jobId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const job = await getExportJob(params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const isOwner = job.userId === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let signedUrl: string | undefined;
  if (job.status === 'ready' && job.gcsPath) {
    try {
      signedUrl = await generateDownloadSignedUrl(
        job.gcsPath,
        `${job.filename}.${job.format}`,
        60,
      );
    } catch {
      // non-fatal — caller can retry
    }
  }

  return NextResponse.json({ ...job, signedUrl });
}
