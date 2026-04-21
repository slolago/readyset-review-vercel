import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { uploadBuffer, generateReadSignedUrl } from '@/lib/gcs';
import { canGenerateSprite } from '@/lib/permissions';
import { createJob, updateJob } from '@/lib/jobs';
import type { Project } from '@/types';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SPRITE_FRAMES = 20;
const SPRITE_FRAME_W = 160;
const SPRITE_FRAME_H = 90; // 16:9

interface RouteParams {
  params: { assetId: string };
}

async function resolveFfmpeg(): Promise<{ binPath: string | null; source: string; diag: string[] }> {
  const diag: string[] = [];

  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    const installerPath = (installer as { path?: string; default?: { path?: string } }).path
      ?? (installer as { default?: { path?: string } }).default?.path;
    diag.push(`@ffmpeg-installer path: ${installerPath}`);
    if (installerPath && existsSync(installerPath)) {
      return { binPath: installerPath, source: '@ffmpeg-installer/ffmpeg', diag };
    }
  } catch (e) {
    diag.push(`@ffmpeg-installer import failed: ${(e as Error).message}`);
  }

  try {
    const staticMod = await import('ffmpeg-static');
    const staticPath = (staticMod as unknown as { default: string }).default
      ?? (staticMod as unknown as string);
    diag.push(`ffmpeg-static path: ${staticPath}`);
    if (staticPath && existsSync(staticPath as string)) {
      return { binPath: staticPath as string, source: 'ffmpeg-static', diag };
    }
  } catch (e) {
    diag.push(`ffmpeg-static import failed: ${(e as Error).message}`);
  }

  if (existsSync('/usr/bin/ffmpeg')) {
    return { binPath: '/usr/bin/ffmpeg', source: 'system', diag };
  }

  return { binPath: null, source: 'none', diag };
}

function runFfmpeg(binPath: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

// Extract a single frame at timestamp `t` using HTTP fast seek.
// Places -ss BEFORE -i so ffmpeg does keyframe-level seek (doesn't decode from start).
async function extractFrame(
  binPath: string,
  videoUrl: string,
  t: number,
  outPath: string,
): Promise<{ ok: boolean; stderr: string }> {
  const { code, stderr } = await runFfmpeg(binPath, [
    '-y',
    '-ss', String(t),           // BEFORE -i = fast keyframe seek
    '-i', videoUrl,
    '-frames:v', '1',
    '-vf',
      `scale=${SPRITE_FRAME_W}:${SPRITE_FRAME_H}:force_original_aspect_ratio=increase,` +
      `crop=${SPRITE_FRAME_W}:${SPRITE_FRAME_H}`,
    '-q:v', '6',
    outPath,
  ]);
  return { ok: code === 0 && existsSync(outPath), stderr };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const steps: string[] = [];
  const step = (msg: string) => { steps.push(msg); console.log('[generate-sprite]', msg); };
  const startedAt = Date.now();

  let jobId: string | null = null;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    step('auth ok');

    const { assetId } = params;
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const asset = doc.data() as any;
    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canGenerateSprite(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!asset.gcsPath || asset.type !== 'video') {
      return NextResponse.json({ error: 'Not a video asset' }, { status: 400 });
    }

    // Observability job. Retries reuse id via x-retry-job-id header.
    const retryJobId = request.headers.get('x-retry-job-id');
    jobId = retryJobId ?? await createJob({
      type: 'sprite',
      assetId,
      projectId: asset.projectId,
      userId: user.id,
    });
    await updateJob(jobId, {
      status: 'running',
      startedAt: FieldValue.serverTimestamp() as any,
      error: FieldValue.delete() as any,
    });

    // Cached?
    if (asset.spriteStripGcsPath && asset.spriteStripGcsPath.includes('sprite-v2.jpg')) {
      const signedUrl = await generateReadSignedUrl(asset.spriteStripGcsPath, 720);
      await updateJob(jobId, { status: 'ready', completedAt: FieldValue.serverTimestamp() as any });
      return NextResponse.json({ spriteStripUrl: signedUrl, cached: true });
    }
    step(`duration: ${asset.duration}`);

    // OBS-05: re-read asset from Firestore so we pick up any probe-set
    // duration that landed between upload/complete and this handler.
    const fresh = await db.collection('assets').doc(assetId).get();
    const freshAsset = fresh.data() as any;
    const duration = freshAsset?.duration && freshAsset.duration > 0 ? freshAsset.duration : 60;
    step(`fresh duration: ${duration}`);

    const { binPath, source, diag } = await resolveFfmpeg();
    if (!binPath) {
      await updateJob(jobId, { status: 'failed', error: 'ffmpeg not found' });
      return NextResponse.json({ error: 'ffmpeg not found', diagnostic: diag, steps }, { status: 500 });
    }
    step(`ffmpeg via ${source}`);
    try { await fs.chmod(binPath, 0o755); } catch (err) {
      console.error('[POST /api/assets/[assetId]/generate-sprite] chmod ffmpeg failed', err);
    }

    // Download the source to /tmp before extracting.
    //
    // Why not ffmpeg over HTTP range: videos muxed by Premiere / After
    // Effects (Mainconcept MP4 encoder, fragmented MP4, or unusual moov
    // placement) routinely fail with `-ss` before `-i` over HTTP — ffmpeg
    // seeks to a byte offset that doesn't contain enough metadata to
    // decode. Pulling the file locally once is bulletproof and still fits
    // comfortably within the 60s serverless budget for typical review
    // clips (~<500 MB). For very large sources we cap at 2 GB.
    const videoUrl = await generateReadSignedUrl(asset.gcsPath, 60);
    step('video signed URL generated');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `sprite-${assetId}-`));
    const spritePath = path.join(tmpDir, 'sprite.jpg');
    const localVideoPath = path.join(tmpDir, 'source');

    try {
      // Early abort if the stored size is too big — the route has ~1 GB
      // of memory on Hobby and we stream to /tmp, but we still want a
      // hard ceiling to avoid runaway function time.
      const MAX_BYTES = 1500 * 1024 * 1024; // 1.5 GB safety ceiling
      if (typeof asset.size === 'number' && asset.size > MAX_BYTES) {
        await updateJob(jobId, { status: 'failed', error: `source too large (${Math.round(asset.size / 1024 / 1024)} MB)` });
        return NextResponse.json({
          error: `source too large for sprite generation (${Math.round(asset.size / 1024 / 1024)} MB)`,
          steps,
        }, { status: 413 });
      }

      step('downloading source…');
      const downloadStart = Date.now();
      const srcRes = await fetch(videoUrl);
      if (!srcRes.ok || !srcRes.body) {
        await updateJob(jobId, { status: 'failed', error: `source fetch failed (${srcRes.status})` });
        return NextResponse.json({
          error: `source fetch failed (${srcRes.status})`,
          steps,
        }, { status: 500 });
      }
      // Stream the body straight to /tmp so we don't hold the entire
      // file in memory at once. Web ReadableStream → async iterator →
      // fs.WriteStream. Tracks byte count to enforce the ceiling.
      const fsNode = await import('fs');
      const writer = fsNode.createWriteStream(localVideoPath);
      let downloaded = 0;
      const reader = srcRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.byteLength;
        if (downloaded > MAX_BYTES) {
          writer.destroy();
          await updateJob(jobId, { status: 'failed', error: `source too large (>${Math.round(MAX_BYTES / 1024 / 1024)} MB)` });
          return NextResponse.json({
            error: `source too large for sprite generation (>${Math.round(MAX_BYTES / 1024 / 1024)} MB)`,
            steps,
          }, { status: 413 });
        }
        if (!writer.write(Buffer.from(value))) {
          // Backpressure — wait for drain before reading more
          await new Promise<void>((resolve) => writer.once('drain', () => resolve()));
        }
      }
      await new Promise<void>((resolve, reject) => {
        writer.once('error', reject);
        writer.end(() => resolve());
      });
      step(`source downloaded: ${Math.round(downloaded / 1024 / 1024)} MB in ${Date.now() - downloadStart}ms`);

      // Compute the 20 timestamps spread across the video (skip first/last 2%)
      const timestamps = Array.from({ length: SPRITE_FRAMES }, (_, i) => {
        return duration * (0.02 + (i / (SPRITE_FRAMES - 1)) * 0.96);
      });

      // Extract all 20 frames IN PARALLEL from the LOCAL file. `-ss` before
      // `-i` on a local file does a reliable keyframe seek (no HTTP range
      // quirks) and avoids the "Mainconcept MP4 can't decode" class of bug.
      step(`extracting ${SPRITE_FRAMES} frames in parallel from local file`);
      const frameResults = await Promise.all(
        timestamps.map((t, i) =>
          extractFrame(binPath, localVideoPath, t, path.join(tmpDir, `frame-${i}.jpg`))
        )
      );

      const failed = frameResults.filter((r) => !r.ok);
      if (failed.length > 0) {
        await updateJob(jobId, { status: 'failed', error: `${failed.length}/${SPRITE_FRAMES} frames failed` });
        return NextResponse.json({
          error: `${failed.length}/${SPRITE_FRAMES} frames failed`,
          stderr: failed[0]?.stderr.slice(-500),
          steps,
        }, { status: 500 });
      }
      step(`all ${SPRITE_FRAMES} frames extracted in ${Date.now() - startedAt}ms`);

      // Tile the 20 frames into a single strip
      const tileArgs = [
        '-y',
        '-i', path.join(tmpDir, 'frame-%d.jpg'),
        '-vf', `tile=${SPRITE_FRAMES}x1`,
        '-frames:v', '1',
        '-q:v', '6',
        spritePath,
      ];
      const tile = await runFfmpeg(binPath, tileArgs);
      if (tile.code !== 0 || !existsSync(spritePath)) {
        await updateJob(jobId, { status: 'failed', error: `tile step failed: ${tile.stderr.slice(-300)}` });
        return NextResponse.json({
          error: 'tile step failed',
          stderr: tile.stderr.slice(-500),
          steps,
        }, { status: 500 });
      }
      step(`tile complete at ${Date.now() - startedAt}ms`);

      const spriteBuffer = await fs.readFile(spritePath);
      const spriteGcsPath = `projects/${asset.projectId}/assets/${assetId}/sprite-v2.jpg`;
      await uploadBuffer(spriteGcsPath, spriteBuffer, 'image/jpeg');

      // Only store the GCS path on the asset doc. The client never reads a
      // "public URL" directly — it reads `spriteSignedUrl` which the list
      // endpoint generates fresh from gcsPath per request. Storing a dead
      // public URL was a phantom field (DC-02 spirit).
      await db.collection('assets').doc(assetId).update({
        spriteStripGcsPath: spriteGcsPath,
      });
      await updateJob(jobId, { status: 'ready', completedAt: FieldValue.serverTimestamp() as any });

      const signedSpriteUrl = await generateReadSignedUrl(spriteGcsPath, 720);
      step(`total: ${Date.now() - startedAt}ms`);
      return NextResponse.json({
        spriteStripUrl: signedSpriteUrl,
        spriteStripGcsPath: spriteGcsPath,
        ms: Date.now() - startedAt,
      });
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch (err) {
        console.error('[POST /api/assets/[assetId]/generate-sprite] cleanup tmp dir failed', err);
      }
    }
  } catch (err) {
    console.error('[generate-sprite] unhandled error:', err);
    if (jobId) {
      try {
        await updateJob(jobId, { status: 'failed', error: (err as Error).message });
      } catch (writeErr) {
        console.error('[generate-sprite] failed to mark job failed', writeErr);
      }
    }
    return NextResponse.json({
      error: (err as Error).message,
      stack: (err as Error).stack?.split('\n').slice(0, 5),
      steps,
    }, { status: 500 });
  }
}
