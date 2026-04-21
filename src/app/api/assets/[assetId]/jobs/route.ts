/**
 * GET /api/assets/[assetId]/jobs — recent jobs for an asset (Phase 60, OBS-01).
 * Used by the AssetCard indicator + retry UI. Gated by canProbeAsset (any
 * project member). Returns newest first, limited to 20.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { listJobsForAsset, sweepStaleJobs } from '@/lib/jobs';
import { canProbeAsset } from '@/lib/permissions';
import type { Project } from '@/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: { assetId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminDb();
  const snap = await db.collection('assets').doc(params.assetId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  const asset = snap.data() as { projectId: string };

  const projDoc = await db.collection('projects').doc(asset.projectId).get();
  if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { id: projDoc.id, ...projDoc.data() } as Project;
  if (!canProbeAsset(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // FMT-02: lazy sweep of stuck jobs on every read — SIGKILL'd functions
  // can't mark themselves failed, so we do it here. Fire-and-await is fine;
  // the query is indexed on (status, startedAt) and usually returns zero.
  try {
    const swept = await sweepStaleJobs();
    if (swept > 0) console.log('[jobs GET] swept stale jobs:', swept);
  } catch (err) {
    console.error('[jobs GET] sweep failed (non-fatal)', err);
  }

  const jobs = await listJobsForAsset(params.assetId, 20);
  return NextResponse.json({ jobs });
}
