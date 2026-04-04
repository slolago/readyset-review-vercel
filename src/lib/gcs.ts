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
