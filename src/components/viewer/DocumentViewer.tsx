'use client';

/**
 * Inline PDF viewer. Renders the signed GCS URL in an iframe and lets the
 * browser's built-in PDF viewer (Chrome/Edge/Firefox) handle rendering —
 * zero JS dependency on pdf.js.
 *
 * The signed URL comes from `generateReadSignedUrl` which does NOT set
 * responseDisposition, so the browser displays inline instead of forcing
 * a download.
 */
import type { Asset } from '@/types';

interface Props {
  asset: Asset;
}

export function DocumentViewer({ asset }: Props) {
  const url = (asset as any).signedUrl as string | undefined;
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center text-frame-textMuted text-sm">
        Loading…
      </div>
    );
  }
  return (
    <iframe
      src={url}
      className="w-full h-full border-0 bg-white"
      title={asset.name}
    />
  );
}
