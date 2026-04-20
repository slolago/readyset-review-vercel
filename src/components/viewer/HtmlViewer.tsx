'use client';

/**
 * Sandboxed HTML viewer.
 *
 * Sandbox flags: `allow-scripts allow-same-origin`.
 *   - `allow-scripts` — uploaded prototypes typically need JS to be useful.
 *   - `allow-same-origin` — needed so relative asset refs in the uploaded HTML
 *     resolve against the signed GCS URL's host. The sandboxed origin is the
 *     GCS bucket, not the app origin, so scripts cannot touch the parent.
 *
 * Explicitly NOT allowed: allow-forms, allow-popups, allow-top-navigation,
 * allow-modals, allow-downloads. Anything stronger than the iframe sandbox
 * (server-side scanning, CSP hardening) is out-of-scope for Phase 51 per
 * REQUIREMENTS; see .planning/REQUIREMENTS.md Out-of-Scope section.
 */
import type { Asset } from '@/types';

interface Props {
  asset: Asset;
}

export function HtmlViewer({ asset }: Props) {
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
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0 bg-white"
      title={asset.name}
    />
  );
}
