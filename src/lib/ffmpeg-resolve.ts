/**
 * Resolve an ffmpeg binary path. Mirrors the ffprobe resolver in
 * src/app/api/assets/[assetId]/probe/route.ts.
 *
 * Try `@ffmpeg-installer/ffmpeg` first, then `ffmpeg-static`, then system paths.
 * On win32 the binary name is `ffmpeg.exe`.
 */
import { existsSync } from 'fs';
import path from 'path';

/**
 * Resolve an ffprobe binary. ffprobe ships alongside ffmpeg in both
 * @ffmpeg-installer/ffmpeg and ffmpeg-static (same directory). Also falls
 * back to @ffprobe-installer/ffprobe and system paths.
 */
export async function resolveFfprobe(): Promise<string | null> {
  const binName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

  // @ffmpeg-installer — ffprobe sits next to ffmpeg
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = (installer as { path?: string; default?: { path?: string } }).path
      ?? (installer as { default?: { path?: string } }).default?.path;
    if (ffmpegPath) {
      const candidate = path.join(path.dirname(ffmpegPath), binName);
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  // ffmpeg-static — same trick
  try {
    const staticMod = await import('ffmpeg-static');
    const staticPath = (staticMod as unknown as { default: string }).default
      ?? (staticMod as unknown as string);
    if (staticPath && typeof staticPath === 'string') {
      const candidate = path.join(path.dirname(staticPath), binName);
      if (existsSync(candidate)) return candidate;
    }
  } catch {}

  // @ffprobe-installer as a dedicated fallback
  try {
    const probeInstaller = await import('@ffprobe-installer/ffprobe');
    const probePath = (probeInstaller as { path?: string; default?: { path?: string } }).path
      ?? (probeInstaller as { default?: { path?: string } }).default?.path;
    if (probePath && existsSync(probePath)) return probePath;
  } catch {}

  for (const dir of ['/usr/bin', '/usr/local/bin']) {
    const candidate = path.join(dir, binName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export async function resolveFfmpeg(): Promise<string | null> {
  // Try @ffmpeg-installer first — its `.path` points directly at the ffmpeg binary.
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg');
    const p = (installer as { path?: string; default?: { path?: string } }).path
      ?? (installer as { default?: { path?: string } }).default?.path;
    if (p && existsSync(p)) return p;
  } catch {}

  // Try ffmpeg-static — default export is the path string.
  try {
    const staticMod = await import('ffmpeg-static');
    const staticPath = (staticMod as unknown as { default: string }).default
      ?? (staticMod as unknown as string);
    if (staticPath && typeof staticPath === 'string' && existsSync(staticPath)) return staticPath;
  } catch {}

  // System fallbacks.
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const dir of ['/usr/bin', '/usr/local/bin']) {
    const candidate = path.join(dir, binName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}
