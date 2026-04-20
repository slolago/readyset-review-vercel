/**
 * Central file-type classifier and allow-list for the upload pipeline.
 *
 * Single source of truth consumed by:
 *   - src/app/api/upload/signed-url/route.ts   (server allow-list)
 *   - src/components/files/UploadZone.tsx       (react-dropzone accept map)
 *   - src/components/files/{FolderBrowser,AssetCard,AssetListView}.tsx
 *                                                (hidden <input type=file> accept)
 *   - src/components/files/AssetCard.tsx + AssetListView.tsx (thumbnail icons)
 *   - src/components/viewer/FileTypeCard.tsx   (icon rendering)
 *
 * This module is deliberately framework-agnostic: `iconName` is a string key
 * that consumers map to the actual lucide-react component. This keeps file
 * classification decoupled from React.
 */
import type { AssetType } from '@/types';

export type ViewerKind = 'video' | 'image' | 'pdf' | 'html' | 'card';

export type IconName =
  | 'Film'
  | 'Image'
  | 'FileText'
  | 'FileCode'
  | 'FileArchive'
  | 'Type'
  | 'Palette';

export interface FileTypeMeta {
  type: AssetType;
  subtype: string;
  viewer: ViewerKind;
  label: string;
  iconName: IconName;
}

/** Return the lowercase extension including leading dot, or '' if none. */
export function extFromName(name: string): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i).toLowerCase();
}

// ---------- Classification rules ----------
// Order matters: video/image MIME prefixes are checked first so any video/*
// or image/* MIME is accepted (preserves existing behavior for .m4v etc.).

const DESIGN_EXTS = ['.ai', '.psd', '.aep', '.fig'] as const;
const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'] as const;

export function classify(mime: string, extension: string): FileTypeMeta | null {
  const m = (mime || '').toLowerCase();
  const ext = (extension || '').toLowerCase();

  // Video — any video/* MIME, or common video extensions
  if (m.startsWith('video/') || ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) {
    return { type: 'video', subtype: ext.slice(1) || 'video', viewer: 'video', label: 'Video', iconName: 'Film' };
  }

  // Image — any image/* MIME, or common image extensions
  if (m.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
    return { type: 'image', subtype: ext.slice(1) || 'image', viewer: 'image', label: 'Image', iconName: 'Image' };
  }

  // PDF
  if (m === 'application/pdf' || ext === '.pdf') {
    return { type: 'document', subtype: 'pdf', viewer: 'pdf', label: 'PDF', iconName: 'FileText' };
  }

  // HTML
  if (m === 'text/html' || ext === '.html' || ext === '.htm') {
    return { type: 'document', subtype: 'html', viewer: 'html', label: 'HTML', iconName: 'FileCode' };
  }

  // ZIP archive
  if (m === 'application/zip' || m === 'application/x-zip-compressed' || ext === '.zip') {
    return { type: 'archive', subtype: 'zip', viewer: 'card', label: 'Archive', iconName: 'FileArchive' };
  }

  // Fonts
  if (m.startsWith('font/') || m.startsWith('application/font-') || m === 'application/vnd.ms-fontobject') {
    const sub = ext ? ext.slice(1) : 'font';
    return { type: 'font', subtype: sub, viewer: 'card', label: 'Font', iconName: 'Type' };
  }
  if (FONT_EXTS.includes(ext as typeof FONT_EXTS[number])) {
    return { type: 'font', subtype: ext.slice(1), viewer: 'card', label: 'Font', iconName: 'Type' };
  }

  // Design files — browsers usually send application/octet-stream for these;
  // extension is the reliable signal.
  if (DESIGN_EXTS.includes(ext as typeof DESIGN_EXTS[number])) {
    return { type: 'design', subtype: ext.slice(1), viewer: 'card', label: 'Design', iconName: 'Palette' };
  }

  return null;
}

// ---------- Allow-lists derived from the classifier ----------

/** Flat list of allowed MIME types, used by the server allow-list. */
export const ACCEPTED_MIME: string[] = [
  'video/*',
  'image/*',
  'application/pdf',
  'text/html',
  'application/zip',
  'application/x-zip-compressed',
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-fontobject',
];

/** Accepted extensions (leading dot, lowercase). */
export const ACCEPTED_EXTENSIONS: string[] = [
  // video
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
  // image
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  // document
  '.pdf', '.html', '.htm',
  // archive
  '.zip',
  // fonts
  '.ttf', '.otf', '.woff', '.woff2',
  // design
  '.ai', '.psd', '.aep', '.fig',
];

/** react-dropzone-shaped accept map. */
export const DROPZONE_ACCEPT: Record<string, string[]> = {
  'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  'application/pdf': ['.pdf'],
  'text/html': ['.html', '.htm'],
  'application/zip': ['.zip'],
  'font/ttf': ['.ttf'],
  'font/otf': ['.otf'],
  'font/woff': ['.woff'],
  'font/woff2': ['.woff2'],
  // Design files: browsers send application/octet-stream. The extension list
  // makes the dropzone accept them; the server re-classifies by extension.
  'application/octet-stream': ['.ai', '.psd', '.aep', '.fig'],
};

/** Comma-joined accept string for native <input type="file" accept={...}>. */
export const FILE_INPUT_ACCEPT: string = [...ACCEPTED_MIME, ...ACCEPTED_EXTENSIONS].join(',');

/** Per-AssetType metadata used when subtype is unknown (e.g. legacy records). */
export const TYPE_META: Record<AssetType, { label: string; iconName: IconName }> = {
  video: { label: 'Video', iconName: 'Film' },
  image: { label: 'Image', iconName: 'Image' },
  document: { label: 'Document', iconName: 'FileText' },
  archive: { label: 'Archive', iconName: 'FileArchive' },
  font: { label: 'Font', iconName: 'Type' },
  design: { label: 'Design', iconName: 'Palette' },
};
