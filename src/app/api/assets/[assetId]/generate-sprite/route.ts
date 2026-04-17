import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { downloadToFile, uploadBuffer, getPublicUrl, generateReadSignedUrl } from '@/lib/gcs';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

// Force Node.js runtime (ffmpeg needs fs/child_process, not edge)
export const runtime = 'nodejs';
export const maxDuration = 60;

const SPRITE_FRAMES = 20;
const SPRITE_FRAME_W = 160;

interface RouteParams {
  params: { assetId: string };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static not available'));
      return;
    }
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assetId } = params;
  const db = getAdminDb();
  const doc = await db.collection('assets').doc(assetId).get();
  if (!doc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

  const asset = doc.data() as any;
  if (!asset.gcsPath || asset.type !== 'video') {
    return NextResponse.json({ error: 'Not a video asset' }, { status: 400 });
  }

  // Skip if sprite already exists — return signed URL so client can load it
  if (asset.spriteStripGcsPath) {
    const signedUrl = await generateReadSignedUrl(asset.spriteStripGcsPath, 720);
    return NextResponse.json({ spriteStripUrl: signedUrl, cached: true });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `sprite-${assetId}-`));
  const videoPath = path.join(tmpDir, 'input.mp4');
  const spritePath = path.join(tmpDir, 'sprite.jpg');

  try {
    // Download video from GCS
    await downloadToFile(asset.gcsPath, videoPath);

    // Get duration — probe via ffmpeg (use -f null with -nostats for quick probe)
    // Simpler: compute frame sampling using -vf fps
    // Strategy: sample 20 frames evenly spread, scale to 160px wide, tile horizontally
    // Use thumbnail filter for scene-aware sampling or fps= for even distribution
    const duration = asset.duration || 0;
    if (duration <= 0) {
      // Try to detect duration via ffmpeg
      const meta = await probeDuration(videoPath);
      if (!meta || meta <= 0) throw new Error('Could not determine video duration');
    }

    const durForCalc = duration > 0 ? duration : (await probeDuration(videoPath)) || 10;
    // fps filter: we want exactly SPRITE_FRAMES frames across duration
    const fps = SPRITE_FRAMES / durForCalc;

    await runFfmpeg([
      '-y',
      '-i', videoPath,
      '-vf', `fps=${fps},scale=${SPRITE_FRAME_W}:-1,tile=${SPRITE_FRAMES}x1`,
      '-frames:v', '1',
      '-q:v', '5',
      spritePath,
    ]);

    if (!existsSync(spritePath)) {
      throw new Error('ffmpeg did not produce sprite file');
    }

    const spriteBuffer = await fs.readFile(spritePath);
    const spriteGcsPath = `projects/${asset.projectId}/assets/${assetId}/sprite-strip.jpg`;
    await uploadBuffer(spriteGcsPath, spriteBuffer, 'image/jpeg');

    const publicUrl = getPublicUrl(spriteGcsPath);
    await db.collection('assets').doc(assetId).update({
      spriteStripUrl: publicUrl,
      spriteStripGcsPath: spriteGcsPath,
    });

    // Return signed URL so the browser can load it immediately
    const signedUrl = await generateReadSignedUrl(spriteGcsPath, 720);
    return NextResponse.json({ spriteStripUrl: signedUrl, spriteStripGcsPath: spriteGcsPath });
  } catch (err) {
    console.error('[generate-sprite] error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    // Cleanup temp files
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function probeDuration(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!ffmpegPath) { resolve(null); return; }
    const proc = spawn(ffmpegPath, ['-i', videoPath]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', () => {
      const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!match) { resolve(null); return; }
      const h = parseInt(match[1]), m = parseInt(match[2]), s = parseFloat(match[3]);
      resolve(h * 3600 + m * 60 + s);
    });
    proc.on('error', () => resolve(null));
  });
}
