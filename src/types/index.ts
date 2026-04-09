import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer';
  createdAt: Timestamp;
  invited?: boolean;
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
}

export type AssetStatus = 'uploading' | 'ready';
export type AssetType = 'video' | 'image';
export type ReviewStatus = 'approved' | 'needs_revision' | 'in_review';

export interface Asset {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  type: AssetType;
  mimeType: string;
  url: string;
  gcsPath: string;
  thumbnailUrl: string;
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
  frameRate?: number;
  reviewStatus?: ReviewStatus;
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
  annotation?: AnnotationData;
  resolved: boolean;
  parentId: string | null;
  createdAt: Timestamp;
}

export interface ReviewLink {
  id: string;
  token: string;
  projectId: string;
  folderId: string | null;
  assetIds?: string[];
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
  status: 'pending' | 'uploading' | 'complete' | 'error';
  assetId?: string;
  error?: string;
}
