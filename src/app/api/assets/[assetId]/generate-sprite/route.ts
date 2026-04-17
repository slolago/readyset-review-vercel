import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { downloadToFile, uploadBuffer, getPublicUrl, generateReadSignedUrl } from '@/lib/gcs';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { spawn } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SPRITE_FRAMES = 20;
const SPRITE_FRAME_W = 160;

interface RouteParams {
  params: { assetId: string };
}

// Resolve ffmpeg binary — try multiple sources so we can diagnose what's missing
async function resolveFfmpeg(): Promise<{ binPath: string | null; source: string; diag: string[] }> {
  const diag: string[] = [];

  // Try @ffmpeg-installer/ffmpeg first (better cross-platform support)
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    // CJS default export vs named
    const installerPath = (installer as { path?: string; default?: { path?: string } }).path
      ?? (installer as { default?: { path?: string } }).default?.path;
    diag.push(`@ffmpeg-installer path: ${installerPath}`);
    if (installerPath && existsSync(installerPath)) {
      return { binPath: installerPath, source: '@ffmpeg-installer/ffmpeg', diag };
    }
  } catch (e) {
    diag.push(`@ffmpeg-installer import failed: ${(e as Error).message}`);
  }

  // Fallback to ffmpeg-static
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

  // Last resort: system ffmpeg (unlikely on Vercel but just in case)
  diag.push('Falling back to system PATH /usr/bin/ffmpeg');
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const steps: string[] = [];
  const step = (msg: string) => { steps.push(msg); console.log('[generate-sprite]', msg); };

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    step('auth ok');

    const { assetId } = params;
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    step(`asset fetched: ${assetId}`);

    const asset = doc.data() as any;
    if (!asset.gcsPath || asset.type !== 'video') {
      return NextResponse.json({ error: 'Not a video asset' }, { status: 400 });
    }

    // Return cached sprite if already generated
    if (asset.spriteStripGcsPath) {
      const signedUrl = await generateReadSignedUrl(asset.spriteStripGcsPath, 720);
      return NextResponse.json({ spriteStripUrl: signedUrl, cached: true });
    }
    step(`gcsPath: ${asset.gcsPath}, duration: ${asset.duration}`);

    // Resolve ffmpeg binary BEFORE any heavy work
    const { binPath, source, diag } = await resolveFfmpeg();
    if (!binPath) {
      return NextResponse.json({
        error: 'ffmpeg binary not found',
        diagnostic: diag,
        steps,
      }, { status: 500 });
    }
    step(`ffmpeg found via ${source}: ${binPath}`);

    // Make sure the binary is executable (needed on Linux/Vercel)
    try {
      await fs.chmod(binPath, 0o755);
    } catch (e) {
      step(`chmod warning (non-fatal): ${(e as Error).message}`);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `sprite-${assetId}-`));
    const videoPath = path.join(tmpDir, 'input.mp4');
    const spritePath = path.join(tmpDir, 'sprite.jpg');
    step(`tmpDir: ${tmpDir}`);

    try {
      // Download video from GCS
      await downloadToFile(asset.gcsPath, videoPath);
      const videoSize = statSync(videoPath).size;
      step(`video downloaded: ${videoSize} bytes`);

      // Determine duration (either from asset doc or by probing)
      let duration = asset.duration || 0;
      if (duration <= 0) {
        const probed = await probeDuration(binPath, videoPath);
        if (probed) duration = probed;
        step(`probed duration: ${duration}`);
      }
      if (duration <= 0) duration = 10; // last-resort fallback

      const fps = SPRITE_FRAMES / duration;
      step(`running ffmpeg with fps=${fps}`);

      const { code, stderr } = await runFfmpeg(binPath, [
        '-y',
        '-i', videoPath,
        '-vf', `fps=${fps},scale=${SPRITE_FRAME_W}:-1,tile=${SPRITE_FRAMES}x1`,
        '-frames:v', '1',
        '-q:v', '5',
        spritePath,
      ]);

      if (code !== 0) {
        return NextResponse.json({
          error: `ffmpeg exited ${code}`,
          stderr: stderr.slice(-1000),
          steps,
        }, { status: 500 });
      }

      if (!existsSync(spritePath)) {
        return NextResponse.json({
          error: 'ffmpeg produced no output',
          stderr: stderr.slice(-500),
          steps,
        }, { status: 500 });
      }

      const spriteBuffer = await fs.readFile(spritePath);
      step(`sprite size: ${spriteBuffer.length} bytes`);

      const spriteGcsPath = `projects/${asset.projectId}/assets/${assetId}/sprite-strip.jpg`;
      await uploadBuffer(spriteGcsPath, spriteBuffer, 'image/jpeg');
      step('uploaded to gcs');

      const publicUrl = getPublicUrl(spriteGcsPath);
      await db.collection('assets').doc(assetId).update({
        spriteStripUrl: publicUrl,
        spriteStripGcsPath: spriteGcsPath,
      });

      const signedUrl = await generateReadSignedUrl(spriteGcsPath, 720);
      return NextResponse.json({ spriteStripUrl: signedUrl, spriteStripGcsPath: spriteGcsPath });
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  } catch (err) {
    console.error('[generate-sprite] unhandled error:', err);
    return NextResponse.json({
      error: (err as Error).message,
      stack: (err as Error).stack?.split('\n').slice(0, 5),
      steps,
    }, { status: 500 });
  }
}

async function probeDuration(binPath: string, videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(binPath, ['-i', videoPath]);
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
