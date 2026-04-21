import { imageSize } from 'image-size';
import { spawn } from 'child_process';
import { generateReadSignedUrl } from '@/lib/gcs';
import { resolveFfprobe } from '@/lib/ffmpeg-resolve';

export interface ImageMetadata {
  width?: number;
  height?: number;
  colorSpace?: string; // reserved — image-size does not expose this; leave undefined for now
}

const HEADER_BYTES = 64 * 1024;
const MAX_FULL_BYTES = 20 * 1024 * 1024;

async function fetchRange(url: string, end: number): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${end - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * FMT-03: ffprobe fallback for formats image-size can't parse (HEIC, AVIF,
 * HDR variants). ffprobe treats them as single-frame video streams and reads
 * width/height reliably. Signed URL is read directly — no local download.
 */
function probeWithFfprobe(binPath: string, url: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      url,
    ]);
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

async function ffprobeDimensions(url: string): Promise<ImageMetadata | null> {
  const binPath = await resolveFfprobe();
  if (!binPath) return null;
  try {
    const { code, stdout } = await probeWithFfprobe(binPath, url);
    if (code !== 0) return null;
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    if (video?.width && video?.height) {
      return { width: video.width, height: video.height };
    }
    return null;
  } catch (err) {
    console.error('[image-metadata ffprobe fallback]', err);
    return null;
  }
}

export async function extractImageMetadata(gcsPath: string): Promise<ImageMetadata | null> {
  try {
    // Short-lived read URL — 1 minute is plenty for a header fetch.
    const url = await generateReadSignedUrl(gcsPath, 1);

    // First try: header-only (fast, cheap — enough for every common format)
    const head = await fetchRange(url, HEADER_BYTES);
    if (head) {
      try {
        const { width, height } = imageSize(head);
        if (width && height) return { width, height };
      } catch { /* fall through */ }
    }

    // Fallback: full download (bounded)
    const res = await fetch(url);
    if (res.ok) {
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength <= MAX_FULL_BYTES) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength <= MAX_FULL_BYTES) {
          try {
            const { width, height } = imageSize(buf);
            if (width && height) return { width, height };
          } catch { /* fall through */ }
        }
      }
    }

    // FMT-03: final fallback — ffprobe reads HEIC/AVIF/HDR where image-size
    // returns null. Uses the signed URL directly (no extra download).
    return await ffprobeDimensions(url);
  } catch {
    return null;
  }
}
