/**
 * GET /api/spike/stamp-test
 *
 * Diagnostic for v2.4 rollout. Runs the FULL stampAsset pipeline on a
 * test file (a tiny JPEG written to /tmp from base64) without going
 * through review-link / auth / GCS round-trip. Isolates whether the
 * exiftool+config path works on Vercel Lambda as-deployed.
 *
 * No auth. Remove after v2.4 is validated in production.
 */
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { stampAsset } from '@/lib/metadata-stamp';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Smallest valid JPEG (minimum SOI/EOI markers aren't parseable by
// exiftool). Use a minimal 1x1 pixel white JPEG in base64 instead —
// big enough for exiftool to read + write XMP.
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD//Z';

export async function GET() {
  const tempDir = path.join(os.tmpdir(), `stamp-test-${randomUUID()}`);
  let stamped = false;
  try {
    await fs.mkdir(tempDir, { recursive: true });
    const localPath = path.join(tempDir, 'test.jpg');
    await fs.writeFile(localPath, Buffer.from(TINY_JPEG_B64, 'base64'));

    // stampAsset throws with context on failure — caught below and
    // reported in the response.
    const attribCount = await stampAsset(localPath, 'test.jpg');
    stamped = true;

    // Read the stamped file back to verify the Attrib field is actually
    // in the bytes (not just that the write call returned without error).
    const bytes = await fs.readFile(localPath);
    const head = bytes.subarray(0, Math.min(4096, bytes.length)).toString('binary');
    const hasAttribNs = head.includes('ns.attribution.com/ads/1.0/');
    const hasData = head.includes('Ready Set');

    return NextResponse.json({
      ok: true,
      stamped,
      attribCount,
      bytesWritten: bytes.length,
      verification: {
        hasAttribNamespace: hasAttribNs,
        hasCompanyString: hasData,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[spike/stamp-test]', err);
    return NextResponse.json(
      {
        ok: false,
        stamped,
        error: message,
        stack: stack?.split('\n').slice(0, 10),
      },
      { status: 500 },
    );
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
