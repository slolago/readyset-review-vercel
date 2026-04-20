/**
 * POST /api/exports — create + run an export job inline.
 * GET  /api/exports — list current user's recent export jobs (fresh signed URLs for ready ones).
 *
 * Inline ffmpeg spawn (not a queue). maxDuration=60 on the platform caps total time.
 * The client displays "encoding…" until this POST resolves; polling of individual
 * jobs is via GET /api/exports/[jobId] if the client wants intermediate state.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { spawn } from 'child_process';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';

import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  generateReadSignedUrl,
  generateDownloadSignedUrl,
  uploadBuffer,
} from '@/lib/gcs';
import { canProbeAsset } from '@/lib/permissions';
import { resolveFfmpeg } from '@/lib/ffmpeg-resolve';
import {
  createExportJob,
  updateExportJob,
  listUserExports,
} from '@/lib/exports';
import type { Project, ExportFormat, ExportJob } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_DURATION_SECONDS = 120;

function sanitizeFilename(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  return cleaned.slice(0, 80);
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

async function safeUnlink(p: string) {
  try { await fsp.unlink(p); } catch {}
}

interface AssetDoc {
  id: string;
  projectId: string;
  gcsPath?: string;
  videoCodec?: string;
  audioCodec?: string;
  containerFormat?: string;
  duration?: number;
  type?: string;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    assetId?: string;
    format?: ExportFormat;
    inPoint?: number;
    outPoint?: number;
    filename?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { assetId, format, inPoint, outPoint } = body;
  const rawFilename = body.filename ?? '';

  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  }
  if (format !== 'mp4' && format !== 'gif') {
    return NextResponse.json({ error: 'format must be mp4 or gif' }, { status: 400 });
  }
  if (typeof inPoint !== 'number' || typeof outPoint !== 'number') {
    return NextResponse.json({ error: 'inPoint and outPoint must be numbers' }, { status: 400 });
  }
  if (inPoint < 0 || outPoint <= inPoint) {
    return NextResponse.json({ error: 'outPoint must be greater than inPoint' }, { status: 400 });
  }
  const clipDur = outPoint - inPoint;
  if (clipDur > MAX_DURATION_SECONDS) {
    return NextResponse.json({ error: `Clip too long (max ${MAX_DURATION_SECONDS}s)` }, { status: 400 });
  }
  const filename = sanitizeFilename(rawFilename);
  if (!filename) {
    return NextResponse.json({ error: 'filename required' }, { status: 400 });
  }

  // Load asset + project for permission gate
  const db = getAdminDb();
  const assetSnap = await db.collection('assets').doc(assetId).get();
  if (!assetSnap.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  const asset = { id: assetSnap.id, ...assetSnap.data() } as AssetDoc;
  if (!asset.gcsPath) return NextResponse.json({ error: 'Asset has no file' }, { status: 400 });

  const projSnap = await db.collection('projects').doc(asset.projectId).get();
  if (!projSnap.exists) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = { id: projSnap.id, ...projSnap.data() } as Project;
  if (!canProbeAsset(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Create job (queued)
  const jobId = await createExportJob({
    userId: user.id,
    assetId,
    projectId: asset.projectId,
    format,
    inPoint,
    outPoint,
    filename,
  });

  const ffmpegPath = await resolveFfmpeg();
  if (!ffmpegPath) {
    await updateExportJob(jobId, { status: 'failed', error: 'ffmpeg not available' });
    return NextResponse.json({ error: 'ffmpeg not available', jobId }, { status: 500 });
  }

  await updateExportJob(jobId, { status: 'encoding' });

  // Fresh signed URL for the source (60 min)
  const sourceUrl = await generateReadSignedUrl(asset.gcsPath, 60);

  try {
    let outPath: string;
    let contentType: string;
    let gcsOutPath: string;
    const tempsToClean: string[] = [];

    if (format === 'mp4') {
      outPath = path.join(os.tmpdir(), `export-${jobId}.mp4`);
      tempsToClean.push(outPath);
      contentType = 'video/mp4';
      gcsOutPath = `exports/${user.id}/${jobId}.mp4`;

      // Decide copy vs. re-encode.
      const videoOk = asset.videoCodec === 'h264';
      const audioOk = asset.audioCodec === 'aac' || !asset.audioCodec;
      const containerOk =
        !asset.containerFormat || asset.containerFormat.toLowerCase().includes('mp4');
      const tryCopy = videoOk && audioOk && containerOk;

      const copyArgs = [
        '-y',
        '-ss', String(inPoint),
        '-i', sourceUrl,
        '-t', String(clipDur),
        '-c', 'copy',
        '-movflags', '+faststart',
        outPath,
      ];
      const reencodeArgs = [
        '-y',
        '-ss', String(inPoint),
        '-i', sourceUrl,
        '-t', String(clipDur),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        outPath,
      ];

      let { code, stderr } = tryCopy
        ? await runFfmpeg(ffmpegPath, copyArgs)
        : await runFfmpeg(ffmpegPath, reencodeArgs);

      if (code !== 0 && tryCopy) {
        // Common: keyframe alignment problems with -c copy and a non-zero -ss.
        // Retry with re-encode.
        ({ code, stderr } = await runFfmpeg(ffmpegPath, reencodeArgs));
      }
      if (code !== 0) {
        await updateExportJob(jobId, {
          status: 'failed',
          error: stderr.slice(-500),
        });
        await Promise.all(tempsToClean.map(safeUnlink));
        return NextResponse.json({ error: 'ffmpeg failed', jobId, stderr: stderr.slice(-500) }, { status: 500 });
      }
    } else {
      // format === 'gif' — two-pass palette.
      const palettePath = path.join(os.tmpdir(), `palette-${jobId}.png`);
      outPath = path.join(os.tmpdir(), `export-${jobId}.gif`);
      tempsToClean.push(palettePath, outPath);
      contentType = 'image/gif';
      gcsOutPath = `exports/${user.id}/${jobId}.gif`;

      const paletteArgs = [
        '-y',
        '-ss', String(inPoint),
        '-i', sourceUrl,
        '-t', String(clipDur),
        '-vf', 'fps=15,scale=720:-1:flags=lanczos,palettegen=stats_mode=diff',
        palettePath,
      ];
      const useArgs = [
        '-y',
        '-ss', String(inPoint),
        '-i', sourceUrl,
        '-t', String(clipDur),
        '-i', palettePath,
        '-filter_complex', 'fps=15,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
        '-loop', '0',
        outPath,
      ];

      const p1 = await runFfmpeg(ffmpegPath, paletteArgs);
      if (p1.code !== 0) {
        await updateExportJob(jobId, { status: 'failed', error: p1.stderr.slice(-500) });
        await Promise.all(tempsToClean.map(safeUnlink));
        return NextResponse.json({ error: 'palettegen failed', jobId, stderr: p1.stderr.slice(-500) }, { status: 500 });
      }
      const p2 = await runFfmpeg(ffmpegPath, useArgs);
      if (p2.code !== 0) {
        await updateExportJob(jobId, { status: 'failed', error: p2.stderr.slice(-500) });
        await Promise.all(tempsToClean.map(safeUnlink));
        return NextResponse.json({ error: 'paletteuse failed', jobId, stderr: p2.stderr.slice(-500) }, { status: 500 });
      }
    }

    // Upload output
    const buf = await fsp.readFile(outPath);
    await uploadBuffer(gcsOutPath, buf, contentType);

    // Clean temps
    await Promise.all(tempsToClean.map(safeUnlink));

    // Mark ready
    await updateExportJob(jobId, {
      status: 'ready',
      gcsPath: gcsOutPath,
      completedAt: FieldValue.serverTimestamp() as unknown as ExportJob['completedAt'],
    });

    // Fresh download URL
    const signedUrl = await generateDownloadSignedUrl(
      gcsOutPath,
      `${filename}.${format}`,
      60,
    );

    return NextResponse.json({
      jobId,
      status: 'ready',
      signedUrl,
      format,
      filename,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await updateExportJob(jobId, { status: 'failed', error: msg });
    return NextResponse.json({ error: 'Export failed', jobId, detail: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await listUserExports(user.id, 20);
  const hydrated = await Promise.all(
    jobs.map(async (job) => {
      if (job.status === 'ready' && job.gcsPath) {
        try {
          const signedUrl = await generateDownloadSignedUrl(
            job.gcsPath,
            `${job.filename}.${job.format}`,
            60,
          );
          return { ...job, signedUrl };
        } catch {
          return job;
        }
      }
      return job;
    }),
  );

  return NextResponse.json({ jobs: hydrated });
}
