import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl } from '@/lib/gcs';
import { canProbeAsset } from '@/lib/permissions';
import type { Project } from '@/types';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RouteParams {
  params: { assetId: string };
}

/**
 * Resolve an ffprobe binary. ffprobe ships with both @ffmpeg-installer/ffmpeg
 * and ffmpeg-static — it sits next to the ffmpeg binary, same directory.
 * On linux (Vercel) the binary name is `ffprobe`; on Windows `ffprobe.exe`.
 */
async function resolveFfprobe(): Promise<string | null> {
  // Try @ffmpeg-installer first
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = (installer as { path?: string; default?: { path?: string } }).path
      ?? (installer as { default?: { path?: string } }).default?.path;
    if (ffmpegPath) {
      const dir = path.dirname(ffmpegPath);
      const candidate = path.join(dir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  // Try ffmpeg-static directory
  try {
    const staticMod = await import('ffmpeg-static');
    const staticPath = (staticMod as unknown as { default: string }).default
      ?? (staticMod as unknown as string);
    if (staticPath) {
      const dir = path.dirname(staticPath as string);
      const candidate = path.join(dir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  // Try @ffprobe-installer as a fallback (separate package, also widely used)
  try {
    const probeInstaller = await import('@ffprobe-installer/ffprobe');
    const probePath = (probeInstaller as { path?: string; default?: { path?: string } }).path
      ?? (probeInstaller as { default?: { path?: string } }).default?.path;
    if (probePath && existsSync(probePath)) return probePath;
  } catch {}

  // System fallback
  if (existsSync('/usr/bin/ffprobe')) return '/usr/bin/ffprobe';
  if (existsSync('/usr/local/bin/ffprobe')) return '/usr/local/bin/ffprobe';

  return null;
}

function runFfprobe(binPath: string, url: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      url,
    ];
    const proc = spawn(binPath, args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

interface FfprobeStream {
  codec_type?: 'video' | 'audio' | 'subtitle' | 'data';
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  r_frame_rate?: string;       // e.g. '30000/1001'
  avg_frame_rate?: string;
  bit_rate?: string;
  duration?: string;
  channels?: number;
  channel_layout?: string;
  sample_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number; side_data_type?: string }>;
}

interface FfprobeOutput {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    size?: string;
  };
  streams?: FfprobeStream[];
}

/** '30000/1001' → 29.97 (rounded to 3 decimals) */
function parseFrameRate(fr: string | undefined): number | undefined {
  if (!fr) return undefined;
  const [num, den] = fr.split('/').map((n) => parseInt(n, 10));
  if (!num || !den || den === 0) return undefined;
  return Math.round((num / den) * 1000) / 1000;
}

/** Some MOV files carry rotation as tags.rotate ('90'), others as side_data_list[0].rotation (-90). */
function extractRotation(video: FfprobeStream): number | undefined {
  if (video.tags?.rotate) {
    const n = parseInt(video.tags.rotate, 10);
    if (!isNaN(n)) return ((n % 360) + 360) % 360;
  }
  const sdr = video.side_data_list?.find((sd) => sd.side_data_type === 'Display Matrix' || sd.rotation !== undefined);
  if (sdr?.rotation !== undefined) {
    const n = sdr.rotation;
    // side_data rotations are typically negative of display rotation
    const display = (-n % 360 + 360) % 360;
    return display;
  }
  return undefined;
}

/**
 * POST /api/assets/[assetId]/probe
 *
 * Runs ffprobe against the asset's GCS object (via signed URL) and persists
 * accurate metadata: codecs, bitrates, color space, channels, sample rate,
 * precise frame rate, etc. Overwrites whatever was submitted by the client
 * on upload (the client-side HTMLVideoElement APIs are incomplete and
 * sometimes wrong).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const snap = await db.collection('assets').doc(params.assetId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    const asset = snap.data() as any;

    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canProbeAsset(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Images (and any future non-video types) do not go through ffprobe.
    // Mark probed:true so the UI's "Probe" affordance in FileInfoPanel hides.
    if (asset.type !== 'video') {
      await db.collection('assets').doc(params.assetId).update({ probed: true });
      return NextResponse.json({ success: true, skipped: 'non-video asset', updates: { probed: true } });
    }

    if (!asset.gcsPath) return NextResponse.json({ error: 'Asset has no file' }, { status: 400 });

    const ffprobePath = await resolveFfprobe();
    if (!ffprobePath) return NextResponse.json({ error: 'ffprobe not available' }, { status: 500 });

    const signedUrl = await generateReadSignedUrl(asset.gcsPath, 60);
    const { code, stdout, stderr } = await runFfprobe(ffprobePath, signedUrl);
    if (code !== 0) {
      console.error('ffprobe failed', { code, stderr });
      return NextResponse.json({ error: 'ffprobe failed', stderr: stderr.slice(0, 500) }, { status: 500 });
    }

    let data: FfprobeOutput;
    try {
      data = JSON.parse(stdout);
    } catch {
      return NextResponse.json({ error: 'Could not parse ffprobe output' }, { status: 500 });
    }

    const video = data.streams?.find((s) => s.codec_type === 'video');
    const audio = data.streams?.find((s) => s.codec_type === 'audio');

    const updates: Record<string, unknown> = { probed: true };

    // Format-level
    if (data.format?.format_name) updates.containerFormat = data.format.format_name;
    if (data.format?.duration) {
      const d = parseFloat(data.format.duration);
      if (!isNaN(d)) updates.duration = d;
    }
    if (data.format?.bit_rate) {
      const br = parseInt(data.format.bit_rate, 10);
      if (!isNaN(br)) updates.bitRate = br;
    }

    // Video
    if (video) {
      if (video.codec_name) updates.videoCodec = video.codec_name;
      if (video.width) updates.width = video.width;
      if (video.height) updates.height = video.height;
      if (video.pix_fmt) updates.pixelFormat = video.pix_fmt;
      if (video.color_space) updates.colorSpace = video.color_space;
      if (video.color_primaries) updates.colorPrimaries = video.color_primaries;
      if (video.color_transfer) updates.colorTransfer = video.color_transfer;
      if (video.profile) updates.profile = video.profile;
      if (video.level !== undefined) updates.level = video.level;
      const fr = parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate);
      if (fr) updates.frameRate = fr;
      if (video.bit_rate) {
        const br = parseInt(video.bit_rate, 10);
        if (!isNaN(br)) updates.videoBitRate = br;
      }
      const rot = extractRotation(video);
      if (rot !== undefined) updates.rotation = rot;

      // Swap width/height if portrait rotation applied
      if (rot === 90 || rot === 270) {
        const w = updates.width as number | undefined;
        const h = updates.height as number | undefined;
        if (w && h) {
          updates.width = h;
          updates.height = w;
        }
      }
    }

    // Audio
    if (audio) {
      if (audio.codec_name) updates.audioCodec = audio.codec_name;
      if (audio.channels) updates.audioChannels = audio.channels;
      if (audio.channel_layout) updates.audioChannelLayout = audio.channel_layout;
      if (audio.sample_rate) {
        const sr = parseInt(audio.sample_rate, 10);
        if (!isNaN(sr)) updates.audioSampleRate = sr;
      }
      if (audio.bit_rate) {
        const br = parseInt(audio.bit_rate, 10);
        if (!isNaN(br)) updates.audioBitRate = br;
      }
    }

    await db.collection('assets').doc(params.assetId).update(updates);
    return NextResponse.json({ success: true, updates });
  } catch (err) {
    console.error('probe error:', err);
    return NextResponse.json({ error: 'Probe failed' }, { status: 500 });
  }
}
