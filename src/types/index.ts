import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer';
  createdAt: Timestamp;
  invited?: boolean;
  disabled?: boolean;   // suspended accounts cannot establish a session
}

export interface Collaborator {
  userId: string;
  role: 'owner' | 'editor' | 'reviewer';
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  collaborators: Collaborator[];
  color: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Folder {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  path: string[];
  createdAt: Timestamp;
  /** Soft-delete marker — set by DELETE endpoint, cleared by restore. null on live docs (Phase 63+) or absent (pre-Phase 63). */
  deletedAt?: Timestamp | null;
  /** User id of the user who soft-deleted the item. Absent on live docs. */
  deletedBy?: string;
}

export type AssetStatus = 'uploading' | 'ready';
export type AssetType = 'video' | 'image' | 'document' | 'archive' | 'font' | 'design';
export type ReviewStatus = 'approved' | 'needs_revision' | 'in_review';

export interface Asset {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  type: AssetType;
  /** Extension hint (e.g. 'pdf', 'html', 'zip', 'ttf', 'psd'). Optional — absent on pre-Phase-51 assets. */
  subtype?: string;
  mimeType: string;
  gcsPath: string;
  thumbnailUrl: string;
  /** GCS path to the generated thumbnail. Set by upload/complete + upload/thumbnail. Absent until first thumbnail is produced. */
  thumbnailGcsPath?: string;
  /** GCS path for the sprite strip (trickplay filmstrip). Set by generate-sprite (fired from upload/complete) or the legacy upload/thumbnail sprite path. The client reads `spriteSignedUrl` on list, which is re-signed fresh per request. */
  spriteStripGcsPath?: string;
  /** Free-form user-supplied description. Writable via PUT /api/assets/[assetId]. */
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  size: number;
  uploadedBy: string;
  status: AssetStatus;
  version: number;
  versionGroupId: string;
  createdAt: Timestamp;
  _versionCount?: number;
  _commentCount?: number;
  /**
   * Phase 63 (IDX-02) — denormalized comment count. Incremented on comment create,
   * decremented on delete (both inside a transaction with the comment mutation).
   * Lazy-backfilled on first list-read if absent on pre-Phase-63 assets.
   * Counts top-level comments with non-empty text only (matches the list endpoint rule).
   */
  commentCount?: number;
  frameRate?: number;
  reviewStatus?: ReviewStatus;
  /** Soft-delete marker — set by DELETE endpoint, cleared by restore. null on live docs (Phase 63+) or absent (pre-Phase 63). */
  deletedAt?: Timestamp | null;
  /** User id of the user who soft-deleted the item. Absent on live docs. */
  deletedBy?: string;

  // Accurate metadata populated by server-side ffprobe after upload. Absent
  // on assets uploaded before the probe pipeline existed — use the /probe
  // endpoint to backfill.
  probed?: boolean;                // true once ffprobe ran successfully
  containerFormat?: string;        // e.g. 'mov,mp4,m4a,3gp,3g2,mj2'
  videoCodec?: string;             // e.g. 'h264', 'hevc', 'av1', 'vp9'
  audioCodec?: string;             // e.g. 'aac', 'opus', 'mp3'
  bitRate?: number;                // overall bits per second
  videoBitRate?: number;           // video stream bits per second
  audioBitRate?: number;           // audio stream bits per second
  audioChannels?: number;          // 1=mono, 2=stereo, 6=5.1
  audioChannelLayout?: string;     // e.g. 'stereo', '5.1(side)'
  audioSampleRate?: number;        // Hz, e.g. 48000
  pixelFormat?: string;            // e.g. 'yuv420p', 'yuv422p10le'
  colorSpace?: string;             // e.g. 'bt709', 'bt2020nc'
  colorPrimaries?: string;         // e.g. 'bt709'
  colorTransfer?: string;          // e.g. 'bt709', 'smpte2084'
  profile?: string;                // e.g. 'High', 'Main 10'
  level?: number;                  // H.264 level (40 = 4.0)
  rotation?: number;               // display rotation in degrees (0/90/180/270)

  // Phase 62: signed URL cache (CACHE-01..03). Stored so list endpoints can
  // return cached values when expiry is >30 min away and avoid per-request
  // GCS signing (a 200-asset review link was firing 600 sign calls per load).
  signedUrl?: string;
  signedUrlExpiresAt?: Timestamp;
  thumbnailSignedUrl?: string;
  thumbnailSignedUrlExpiresAt?: Timestamp;
  spriteSignedUrl?: string;
  spriteSignedUrlExpiresAt?: Timestamp;
}

export interface AnnotationData {
  shapes: string; // JSON stringified Fabric.js shapes
  frameTime?: number;
  pageX?: number;
  pageY?: number;
}

export interface Comment {
  id: string;
  assetId: string;
  projectId: string;
  reviewLinkId?: string;
  authorId: string | null;
  authorName: string;
  authorEmail?: string;
  text: string;
  timestamp?: number; // video seconds
  inPoint?: number;   // range start in video seconds
  outPoint?: number;  // range end in video seconds
  annotation?: AnnotationData;
  resolved: boolean;
  parentId: string | null;
  createdAt: Timestamp;
  /** Per-comment approve/reject/in-review state. Set by SEC-06 comment POST when link allows approvals. */
  approvalStatus?: ReviewStatus;
}

export interface ReviewLink {
  id: string;
  token: string;
  projectId: string;
  folderId: string | null;          // legacy single-folder scope (kept for backward compat)
  folderIds?: string[];             // editable: multiple folders included in the link
  assetIds?: string[];              // editable: individual assets included in the link
  name: string;
  createdBy: string;
  expiresAt: Timestamp | null;
  allowComments: boolean;
  allowDownloads?: boolean;   // default false — viewers can download assets
  allowApprovals?: boolean;   // default false — viewers can approve/reject
  showAllVersions?: boolean;  // default false — show all asset versions
  password?: string;
  createdAt: Timestamp;
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

export interface SignedUrlResponse {
  signedUrl: string;
  assetId: string;
  gcsPath: string;
}

export interface UploadCompleteRequest {
  assetId: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface SafeZone {
  id: string;
  name: string;
  ratio: string;       // "9:16" | "16:9" | "4:5" | "1:1" | custom
  imageUrl: string;    // "/safezones/..." for built-in, "/api/safe-zones/{id}/image" for custom
  gcsPath?: string;    // null for built-in, set for custom
  isBuiltIn: boolean;
  order: number;
  createdAt?: Timestamp;
  createdBy?: string | null;
}

// UI types
export type AnnotationTool = 'select' | 'rectangle' | 'circle' | 'arrow' | 'freehand' | 'text';
export type AnnotationColor = 'red' | 'yellow' | 'blue' | 'green' | 'white';

export interface BreadcrumbItem {
  id: string;
  name: string;
  href: string;
}

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error' | 'cancelled';
  assetId?: string;
  error?: string;
}

// ---------- Export jobs (Phase 47) ----------

export type ExportFormat = 'mp4' | 'gif';
// `encoding` is a legacy status kept as a type-level alias for `running` so
// in-flight exports don't break mid-migration. The serialization layer in
// src/lib/exports.ts maps `encoding` → `running` before writing.
export type ExportStatus = 'queued' | 'encoding' | 'running' | 'ready' | 'failed';

// ---------- Generalized jobs (Phase 60) ----------
// Unified observability for probe, sprite, thumbnail, and export pipelines.
// Exports are now rows in the `jobs` collection with type:'export'.
export type JobType = 'probe' | 'sprite' | 'thumbnail' | 'export';
export type JobStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  assetId: string;
  projectId: string;
  userId: string;
  status: JobStatus;
  attempt: number;        // 1-based; bumped on retry; max 3
  error?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;

  // Export-only fields (kept optional on Job; exports reuse this shape)
  format?: ExportFormat;
  inPoint?: number;
  outPoint?: number;
  filename?: string;
  gcsPath?: string;
  signedUrl?: string;      // transient, never stored
}
