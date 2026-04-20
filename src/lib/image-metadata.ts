import { imageSize } from 'image-size';
import { generateReadSignedUrl } from '@/lib/gcs';

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
    if (!res.ok) return null;
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FULL_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_FULL_BYTES) return null;
    try {
      const { width, height } = imageSize(buf);
      if (width && height) return { width, height };
    } catch { /* ignore */ }
    return null;
  } catch {
    return null;
  }
}
