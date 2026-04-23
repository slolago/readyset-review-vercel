/**
 * Meta XMP attribution stamping — server-side replica of the `scf-metadata`
 * Electron desktop app (v0.11.9 by Fuerza Studio, MIT-licensed).
 *
 * Writes four fields into the asset's XMP `Attrib:Ads` Seq:
 *   - FbId     (hardcoded Meta Ads Object ID — see FB_ID)
 *   - Data     (hardcoded `{"Company":"Ready Set"}` JSON — see DATA)
 *   - ExtId    (filename without extension — stable per asset)
 *   - Created  (YYYY:MM:DD in META_TZ — advances on re-stamp only)
 *
 * Match-reference-1:1 semantics:
 *   - READS existing `Attrib` entries, re-stamps `Data` on each, APPENDS a new
 *     entry. Never clobbers prior attribution history.
 *   - Passes the custom `.config` file so exiftool recognizes the Attrib
 *     namespace and `Ads` struct.
 *   - Uses `-overwrite_original` to write in-place on the local /tmp copy
 *     (the caller uploads the result to a separate GCS `stampedGcsPath`, so
 *     the original GCS object is never mutated).
 *
 * Serverless hygiene (per PITFALLS.md):
 *   - Per-call `new ExifTool({ maxProcs:1, maxTasksPerProcess:1 })` — NEVER
 *     a module-scope singleton. Lambda cold-start reuse without explicit
 *     `et.end()` leaves zombie perl across warm container reuses.
 *   - `await et.end()` in `finally` — unconditional.
 *
 * The `Data` literal deliberately keeps exiftool-vendored's pipe-wrapped
 * struct-field syntax. exiftool strips the pipes before serializing to XMP;
 * on-disk the value is plain JSON `{"Company":"Ready Set"}`. Confirmed
 * against a desktop-stamped sample in Phase 79's VERIFICATION-SPIKE.md.
 */

import path from 'path';
import { existsSync } from 'fs';
import { ExifTool, type Tags } from 'exiftool-vendored';

/** Hardcoded Meta Ads Object ID from the reference app. */
export const FB_ID = 2955517117817270;

/**
 * Struct-syntax-wrapped company data. The `|...|` delimiters are
 * exiftool-vendored's struct-field markers, stripped before write — the XMP
 * on disk contains `{"Company":"Ready Set"}` (plain JSON).
 */
export const DATA = '|{"Company":"Ready Set"|}';

/**
 * Timezone for the `Created` field. Meta's validators care about the date
 * component; using the agency's local TZ (not Lambda UTC) keeps evening
 * deliveries from producing a next-day `Created`.
 */
export const META_TZ = 'America/New_York';

/**
 * Resolves the custom XMP schema file path at first use. Probes candidate
 * locations because Next.js on Vercel may execute the route with
 * `process.cwd()` equal to the project root, `.next/standalone/`, or
 * `/var/task/` depending on how the Lambda was packaged — a single
 * hardcoded path is unreliable.
 *
 * Cached after first successful resolution. Throws if no candidate
 * resolves — caught by the stamp route's try/catch and surfaced as a
 * clear 500 with actionable error text, rather than the old silent
 * failure mode (exiftool runs, writes XMP without the Attrib namespace,
 * and the stamped file looks identical to the original).
 *
 * Deferred to call-time (not module-load) so an import of this file
 * from an unrelated route doesn't blow up on missing-config — the
 * failure is scoped to the stamp pipeline.
 */
let cachedConfigPath: string | null = null;
export function getAttribConfigPath(): string {
  if (cachedConfigPath) return cachedConfigPath;
  const candidates = [
    path.join(process.cwd(), 'public', 'exiftool-config', 'attrib.config'),
    path.join(process.cwd(), '.next', 'standalone', 'public', 'exiftool-config', 'attrib.config'),
    path.join('/var/task', 'public', 'exiftool-config', 'attrib.config'),
    // Last-ditch: resolve relative to this file's directory.
    path.resolve(__dirname, '..', '..', '..', 'public', 'exiftool-config', 'attrib.config'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedConfigPath = c;
      return c;
    }
  }
  throw new Error(
    `ATTRIB config file not found. Tried: ${candidates.join(' | ')}. ` +
      'Verify next.config.mjs outputFileTracingIncludes contains ./public/exiftool-config/**.',
  );
}

/**
 * Today's date in `YYYY:MM:DD` format, in the META_TZ timezone.
 *
 * Deliberately uses `Intl.DateTimeFormat` rather than dayjs. `dayjs` is not a
 * project dependency; `Intl` is native and correct for the single format we
 * need. Format is `YYYY:MM:DD` (colons, not dashes) per exiftool's `date`
 * WRITABLE type.
 */
export function todayInMetaTz(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: META_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}:${m}:${d}`;
}

/**
 * Derive the `ExtId` field — the asset's filename without extension. Matches
 * the reference app: `basename(tags.FileName, extname(tags.FileName))`.
 *
 * Takes the filename the server originally stored (e.g. from the Firestore
 * `Asset.name`). Falls back to the basename of `localPath` if not provided —
 * the reference app uses the filename exiftool reads from disk, which
 * matches what we write to Firestore at upload time.
 */
export function deriveExtId(filename: string): string {
  const ext = path.extname(filename);
  return path.basename(filename, ext);
}

/**
 * Stamp a local file with the Attrib XMP fields.
 *
 * Writes in-place via exiftool's `-overwrite_original`. The caller is
 * responsible for: downloading the source from GCS to `localPath`,
 * uploading the stamped result to a distinct GCS path, cleaning up
 * `localPath` when done.
 *
 * `assetName` should be the Firestore `Asset.name` — the source of truth
 * for ExtId. Passing the /tmp filename would produce a wrong ExtId.
 *
 * Returns the final Attrib array length (for post-stamp sanity checks).
 */
export async function stampAsset(localPath: string, assetName: string): Promise<number> {
  // Resolve config path BEFORE creating the ExifTool instance so a missing
  // config file produces a clear error instead of a cryptic exiftool
  // stderr message later in the pipeline.
  const configPath = getAttribConfigPath();

  // `checkPerl: false` bypasses the `which perl` preflight check that
  // otherwise throws "Perl must be installed" on Vercel Lambda — perl IS
  // available (the spike route's et.version() succeeds), but it's not on
  // the default $PATH, so the `which perl` command returns empty. The
  // actual exiftool spawn works because exiftool-vendored.pl's shebang
  // resolves perl through the Node child_process spawn which knows the
  // Lambda's real paths. checkPerl is a belt-and-suspenders pre-flight
  // we don't need.
  //
  // Passing `-config` via `exiftoolArgs` (the constructor option) instead
  // of per-call via `.read()` / `.write()` args. Per-call args trigger a
  // re-spawn that hit the checkPerl code path that failed in production.
  // exiftoolArgs are embedded in the initial spawn args, matching the
  // reference scf-metadata Electron app's pattern.
  const et = new ExifTool({
    maxProcs: 1,
    maxTasksPerProcess: 1,
    checkPerl: false,
    exiftoolArgs: ['-config', configPath, '-stay_open', 'True', '-@', '-'],
  });

  try {
    // Read existing Attrib entries. A freshly-uploaded asset has no Attrib;
    // a previously-stamped asset has ≥1. exiftool-vendored returns a single
    // entry as an object, multiple as an array — normalize to array.
    const tags = await et.read(localPath);
    const existing = (tags as Tags & { Attrib?: unknown }).Attrib;
    const oldAttrib: Array<Record<string, unknown>> = Array.isArray(existing)
      ? (existing as Array<Record<string, unknown>>)
      : existing && typeof existing === 'object'
        ? [existing as Record<string, unknown>]
        : [];

    // Re-stamp `Data` on each prior entry — matches reference app behavior.
    // Keeps the prior FbId/ExtId/Created intact; only the company string is
    // refreshed. Odd semantic on the reference side but reproduced verbatim.
    const refreshed = oldAttrib.map((a) => ({ ...a, Data: DATA }));

    const newEntry = {
      ExtId: deriveExtId(assetName),
      Created: todayInMetaTz(),
      Data: DATA,
      FbId: FB_ID,
    };

    const Attrib = [...refreshed, newEntry];

    // `-config` passed per-call (not via constructor) — exiftool-vendored
    // merges these args with its internal stay_open bootstrap.
    // `-overwrite_original` writes in-place on the /tmp copy.
    // -config already baked into exiftoolArgs in the constructor —
    // don't pass again. Only pass -overwrite_original per-write.
    await et.write(
      localPath,
      { Attrib } as unknown as Tags,
      ['-overwrite_original'],
    );

    return Attrib.length;
  } finally {
    // Unconditional cleanup — never leak a perl child across warm container
    // reuses. try/catch inside end() ignored; if the subprocess is already
    // dead (error thrown above cascaded), `end()` is a no-op that throws a
    // swallowed error.
    try {
      await et.end();
    } catch {
      /* best-effort; process may already be dead */
    }
  }
}

/**
 * Compute the GCS path for the stamped copy of a source asset.
 *
 * Layout: `projects/{projectId}/assets/{assetId}/stamped{ext}`. One path per
 * asset — shared across review links, overwritten on re-stamp.
 */
export function stampedGcsPathFor(
  projectId: string,
  assetId: string,
  sourceGcsPath: string,
  assetName: string,
): string {
  // Prefer the source GCS path's extension (authoritative); fall back to the
  // filename extension if the GCS path doesn't have one.
  const ext = path.extname(sourceGcsPath) || path.extname(assetName) || '';
  return `projects/${projectId}/assets/${assetId}/stamped${ext}`;
}
