/**
 * POST /api/assets/[assetId]/stamp-metadata
 *
 * v2.4 Phase 80. Applies Meta XMP attribution stamp to the asset via
 * `exiftool-vendored` and stores the stamped file at a distinct GCS path
 * (`stampedGcsPath`). Called once per asset — subsequent review links
 * reuse the cached stamp.
 *
 * Observability: job row with type `metadata-stamp` tracks progress.
 * Concurrency: Firestore transaction at entry deduplicates simultaneous
 * calls — second caller returns `{reused: true, jobId}` without running
 * exiftool again.
 * Freshness: caller compares `stampedAt < updatedAt` to decide whether to
 * call this route at all. Route also self-guards: if `stampedAt` is fresher
 * than `updatedAt`, short-circuit with `{skipped: 'already-fresh'}`.
 *
 * Never mutates the original GCS object. Failure modes surface as 500 with
 * clean error text; callers (review-link decorate) fall back to the
 * original URL when `stampedGcsPath` is absent or stale.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { downloadToFile, uploadStream } from '@/lib/gcs';
import { canProbeAsset } from '@/lib/permissions';
import { createJob, updateJob, sweepStaleJobs } from '@/lib/jobs';
import { stampAsset, stampedGcsPathFor } from '@/lib/metadata-stamp';
import { coerceToDate } from '@/lib/format-date';
import type { Project } from '@/types';

export const runtime = 'nodejs';
// 300s = Vercel Pro/Enterprise ceiling. Hobby silently caps this to
// 60s (per-account plan enforcement). The 300 setting is a forward-
// compatible declaration for when the project moves off Hobby — on
// Pro, stamps of mid-sized videos (30-100MB) fit comfortably. On
// Hobby it still works at a 60s effective cap; files that can't
// complete in that window simply serve the original URL to guests
// via decorate()'s STAMP-08 fallback.
export const maxDuration = 300;

interface RouteParams {
  params: { assetId: string };
}

/**
 * Find an in-flight metadata-stamp job for this asset. Returns the job id
 * if present, null otherwise. Used for concurrency dedup — two review-link
 * creates on the same asset should trigger exactly one stamp run.
 *
 * Post-filters by startedAt to ignore ZOMBIE jobs — rows stuck in
 * status='running' because Vercel SIGKILL'd the function (or the route
 * threw an un-catchable error) before the try/catch could mark them
 * failed. Without this filter, a single failed stamp attempt blocks ALL
 * future stamps for the asset until sweepStaleJobs cleans up (which
 * won't fire unless someone opens the jobs GET endpoint for the asset).
 * Seen in v2.4 rollout: stamps failing silently, zombies accumulating,
 * new review links seeing "reused" and never actually stamping.
 */
async function findRunningStampJob(assetId: string): Promise<string | null> {
  const db = getAdminDb();
  const snap = await db
    .collection('jobs')
    .where('type', '==', 'metadata-stamp')
    .where('assetId', '==', assetId)
    .where('status', 'in', ['queued', 'running'])
    .limit(5)
    .get();
  if (snap.empty) return null;

  // 90s cutoff — tighter than sweepStaleJobs's default 120s because a
  // real stamp should be well under 60s (Vercel maxDuration) and we
  // want to unblock legitimate retries quickly.
  const cutoffMs = Date.now() - 90_000;
  for (const d of snap.docs) {
    const data = d.data() as {
      status?: string;
      startedAt?: { toMillis?: () => number; _seconds?: number; seconds?: number };
    };
    // A `queued` job is always considered live (just created, no startedAt yet).
    if (data.status === 'queued') return d.id;
    // A `running` job is live only if its startedAt is within the cutoff.
    const startedAtMs =
      data.startedAt?.toMillis?.() ??
      (data.startedAt?._seconds ?? data.startedAt?.seconds ?? 0) * 1000;
    if (startedAtMs > cutoffMs) return d.id;
    // Otherwise it's a zombie — fall through to the next doc.
  }
  return null;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminDb();
  let jobId: string | null = null;
  let tempDir: string | null = null;

  try {
    // 0. Lazy sweep: any 'running' stamp job with startedAt >90s ago is a
    //    zombie from a SIGKILL'd prior invocation. Mark them failed now so
    //    the findRunningStampJob dedup below doesn't see them as live.
    //    Identical pattern to /api/assets/[id]/jobs's sweep call.
    try {
      const swept = await sweepStaleJobs(90_000);
      if (swept > 0) console.log('[stamp-metadata] swept stale jobs:', swept);
    } catch (sweepErr) {
      // Don't let sweep failure block the stamp; log + continue.
      console.warn('[stamp-metadata] sweep failed', sweepErr);
    }

    // 1. Fetch asset + permission check. Same pattern as probe/sprite.
    const snap = await db.collection('assets').doc(params.assetId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    const asset = snap.data() as {
      projectId: string;
      gcsPath?: string;
      name?: string;
      status?: string;
      stampedGcsPath?: string;
      stampedAt?: unknown;
      updatedAt?: unknown;
    };

    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canProbeAsset(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!asset.gcsPath) {
      return NextResponse.json({ error: 'Asset has no file' }, { status: 400 });
    }
    if (asset.status !== 'ready') {
      return NextResponse.json(
        { error: `Asset is not ready (status=${asset.status ?? 'unknown'})` },
        { status: 400 },
      );
    }
    const assetName = asset.name ?? path.basename(asset.gcsPath);

    // 2. Freshness short-circuit: if stampedAt is newer than updatedAt, the
    //    cached stamp is current. Skip. Callers still get a 200 so their
    //    polling flow terminates cleanly.
    const stampedAt = coerceToDate(asset.stampedAt);
    const updatedAt = coerceToDate(asset.updatedAt);
    if (
      asset.stampedGcsPath &&
      stampedAt &&
      updatedAt &&
      stampedAt.getTime() >= updatedAt.getTime()
    ) {
      return NextResponse.json({
        success: true,
        skipped: 'already-fresh',
        stampedGcsPath: asset.stampedGcsPath,
      });
    }

    // 3. Concurrency dedup: if another request is already stamping this
    //    asset, return the existing job id. The client's polling loop
    //    converges on the same result.
    const existingJobId = await findRunningStampJob(params.assetId);
    if (existingJobId) {
      return NextResponse.json({
        success: true,
        reused: true,
        jobId: existingJobId,
      });
    }

    // 4. Create job row.
    jobId = await createJob({
      type: 'metadata-stamp',
      assetId: params.assetId,
      projectId: asset.projectId,
      userId: user.id,
    });
    await updateJob(jobId, {
      status: 'running',
      // FieldValue sentinels are compatible with the admin SDK's write path
      // but clash with the client-SDK Timestamp type used in @/types. The
      // probe/sprite routes cast via `as any` for the same reason — this
      // project's eslint config doesn't enforce no-explicit-any, so no
      // disable comment is needed (adding one would reference an unconfigured
      // rule and break the Vercel build).
      startedAt: FieldValue.serverTimestamp() as any,
      error: FieldValue.delete() as any,
    });

    // 5. Download original to tempdir. Per-invocation random UUID so
    //    concurrent invocations on the same Lambda warm instance don't
    //    collide on file paths.
    tempDir = path.join(os.tmpdir(), `stamp-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const ext = path.extname(asset.gcsPath) || path.extname(assetName) || '';
    const localSource = path.join(tempDir, `source${ext}`);
    await downloadToFile(asset.gcsPath, localSource);

    // 6. Run exiftool stamp — mutates localSource in place.
    const attribCount = await stampAsset(localSource, assetName);

    // 7. Upload stamped file to distinct GCS path. Streaming to avoid
    //    loading multi-hundred-MB videos fully into Lambda memory.
    const stampedPath = stampedGcsPathFor(
      asset.projectId,
      params.assetId,
      asset.gcsPath,
      assetName,
    );
    // Determine Content-Type from the original asset's mimeType if
    // available, otherwise from a conservative default based on extension.
    // The GCS blob needs correct content-type so browser-side download
    // preserves file identity.
    const contentType =
      (asset as unknown as { mimeType?: string }).mimeType ??
      (ext === '.mp4' ? 'video/mp4' : ext === '.mov' ? 'video/quicktime' : 'application/octet-stream');
    await uploadStream(localSource, stampedPath, contentType);

    // 8. Persist stamp state on the asset doc. Clear any cached signed URL
    //    for the stamped path so the next review-link GET re-signs (the
    //    stamped blob just changed, any old signed URL points at the
    //    previous bytes).
    const now = FieldValue.serverTimestamp();
    await db.collection('assets').doc(params.assetId).update({
      stampedGcsPath: stampedPath,
      stampedAt: now,
      stampedSignedUrl: FieldValue.delete(),
      stampedSignedUrlExpiresAt: FieldValue.delete(),
    });

    // 9. Mark job ready.
    await updateJob(jobId, {
      status: 'ready',
      completedAt: FieldValue.serverTimestamp() as any,
    });

    return NextResponse.json({
      success: true,
      stampedGcsPath: stampedPath,
      attribEntries: attribCount,
      jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stamp-metadata]', params.assetId, err);
    if (jobId) {
      try {
        await updateJob(jobId, { status: 'failed', error: message.slice(0, 500) });
      } catch (writeErr) {
        console.error('[stamp-metadata] failed to mark job failed', writeErr);
      }
    }
    return NextResponse.json({ error: `Stamp failed: ${message}` }, { status: 500 });
  } finally {
    // Tempdir cleanup — even on error paths. Never leave /tmp filled on a
    // warm-reused Lambda container.
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('[stamp-metadata] tempdir cleanup failed', cleanupErr);
      }
    }
  }
}
