/**
 * GET /api/spike/exiftool-version
 *
 * Phase 79 platform spike. Verifies exiftool-vendored works on the Vercel
 * Pro Lambda runtime BEFORE v2.4 Phase 80 builds production code against it.
 *
 * Returns the exiftool version string on success, or the error message +
 * stderr on failure. If this route returns 500 with a perl-not-found error,
 * the v2.4 stamp-pipeline architecture must be reconsidered (e.g. move the
 * job to Cloud Run with an explicitly-installed perl + exiftool).
 *
 * Remove this route after Phase 80's stamp pipeline ships and its first
 * successful deploy confirms exiftool works in production. The removal is
 * tracked as a cleanup item in Phase 79's verification report.
 */
import { NextResponse } from 'next/server';
import { ExifTool } from 'exiftool-vendored';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Diagnostic probe. Returns exiftool version AND verifies the custom
 * Attrib config file is reachable from the Lambda runtime — the latter
 * was the silent failure in v2.4 rollout (file missing from bundle, so
 * exiftool ran successfully but wrote XMP without the Attrib namespace).
 */
export async function GET() {
  // Config file bundle check — try all candidate paths, report which
  // resolves. If none resolve, the stamp pipeline is broken even
  // though exiftool itself works.
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'exiftool-config', 'attrib.config'),
    path.join(cwd, '.next', 'standalone', 'public', 'exiftool-config', 'attrib.config'),
    path.join('/var/task', 'public', 'exiftool-config', 'attrib.config'),
  ];
  const configCheck = candidates.map((p) => ({ path: p, exists: existsSync(p) }));
  const configPath = configCheck.find((c) => c.exists)?.path ?? null;

  const et = new ExifTool({ maxProcs: 1, maxTasksPerProcess: 1 });

  try {
    const version = await et.version();
    return NextResponse.json({
      ok: true,
      version,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd,
      },
      config: {
        found: configPath,
        candidates: configCheck,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[spike/exiftool-version] exiftool failed', err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        // If perl is missing, exiftool-vendored typically throws something
        // like "ENOENT: no such file or directory, open '/var/task/.../perl'"
        // or "perl: command not found". Surface verbatim for triage.
      },
      { status: 500 },
    );
  } finally {
    try {
      await et.end();
    } catch {
      /* ignore — we're already returning */
    }
  }
}
