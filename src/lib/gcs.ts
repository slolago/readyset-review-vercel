import { Storage } from '@google-cloud/storage';

let storageInstance: Storage | null = null;

function getStorage(): Storage {
  if (!storageInstance) {
    storageInstance = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });
  }
  return storageInstance;
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME!;

export async function generateUploadSignedUrl(
  gcsPath: string,
  contentType: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    contentType,
  });

  return url;
}

export async function generateReadSignedUrl(
  gcsPath: string,
  expiresInMinutes: number = 720 // 12 hours — allows browser to cache video across sessions
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return url;
}

export async function generateDownloadSignedUrl(
  gcsPath: string,
  filename: string,
  expiresInMinutes: number = 720
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);

  const safeName = filename.replace(/"/g, '\\"');
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseDisposition: `attachment; filename="${safeName}"`,
  });

  return url;
}

export function getPublicUrl(gcsPath: string): string {
  return `https://storage.googleapis.com/${BUCKET_NAME}/${gcsPath}`;
}

export async function deleteFile(gcsPath: string): Promise<void> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);
  await file.delete({ ignoreNotFound: true });
}

export function buildGcsPath(
  projectId: string,
  assetId: string,
  filename: string
): string {
  const ext = filename.split('.').pop() || '';
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `projects/${projectId}/assets/${assetId}/${safeName}`;
}

export function buildThumbnailPath(
  projectId: string,
  assetId: string
): string {
  return `projects/${projectId}/assets/${assetId}/thumbnail.jpg`;
}

export async function uploadBuffer(
  gcsPath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);
  await file.save(buffer, { contentType, resumable: false });
}

export async function downloadToFile(gcsPath: string, localPath: string): Promise<void> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);
  await file.download({ destination: localPath });
}

/**
 * Streaming upload from a local file to GCS. Preferred over `uploadBuffer`
 * when the source is on disk — a 500MB video read into a Buffer on a
 * 1GB-memory Lambda will OOM even before we consider heap overhead.
 *
 * Uses `createReadStream()` → `file.createWriteStream({ resumable: false })`
 * and awaits the `finish` event. `resumable: false` matches `uploadBuffer`'s
 * behavior (simple PUT, no resumable-session state machine — faster for
 * files under ~5MB, negligible difference above).
 *
 * Introduced for v2.4 stamp pipeline (PITFALLS.md HIGH finding: memory
 * bomb on large stamped videos). Reuse for any future server-side pipeline
 * that produces a file on /tmp and needs to upload to GCS.
 */
export async function uploadStream(
  localPath: string,
  gcsPath: string,
  contentType: string,
): Promise<void> {
  const { createReadStream } = await import('fs');
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);

  return new Promise<void>((resolve, reject) => {
    const readStream = createReadStream(localPath);
    const writeStream = file.createWriteStream({ contentType, resumable: false });

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve());
    readStream.pipe(writeStream);
  });
}


/**
 * Confirm a GCS object actually exists and has non-zero size.
 * Used by upload/complete to reject cancelled or failed uploads before
 * flipping asset.status to 'ready'.
 */
export async function verifyGcsObject(
  gcsPath: string
): Promise<{ exists: boolean; size: number; contentType: string | null }> {
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(gcsPath);
  try {
    const [meta] = await file.getMetadata();
    const raw = meta.size;
    const size = typeof raw === 'string' ? parseInt(raw, 10) : (raw ?? 0);
    const contentType = typeof meta.contentType === 'string' ? meta.contentType : null;
    return { exists: true, size: Number.isNaN(size) ? 0 : size, contentType };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 404) return { exists: false, size: 0, contentType: null };
    throw err;
  }
}
