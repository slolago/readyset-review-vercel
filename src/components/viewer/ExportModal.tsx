'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, Scissors } from 'lucide-react';
import type { Asset, ExportFormat } from '@/types';
import { forceDownload } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface ExportModalProps {
  asset: Asset;
  initialIn?: number;
  initialOut?: number;
  open: boolean;
  onClose: () => void;
}

type UiState = 'idle' | 'encoding' | 'ready' | 'failed';

const MAX_CLIP = 45; // matches server cap (Hobby plan)

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function sanitizeFilenameInput(v: string): string {
  return v.replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 80);
}

export function ExportModal({
  asset,
  initialIn,
  initialOut,
  open,
  onClose,
}: ExportModalProps) {
  const { getIdToken } = useAuth();
  const duration = Math.max(0.1, asset.duration ?? 0.1);
  const previewUrl = (asset as unknown as { signedUrl?: string }).signedUrl;

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [inPt, setInPt] = useState<number>(initialIn ?? 0);
  const [outPt, setOutPt] = useState<number>(
    typeof initialOut === 'number' ? initialOut : duration,
  );
  const [filename, setFilename] = useState<string>(
    `${stripExt(asset.name)}-trim`,
  );
  const [ui, setUi] = useState<UiState>('idle');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'in' | 'out' | null>(null);

  // Reset state when modal opens for a fresh asset
  useEffect(() => {
    if (!open) return;
    setFormat('mp4');
    setInPt(initialIn ?? 0);
    setOutPt(typeof initialOut === 'number' ? initialOut : duration);
    setFilename(`${stripExt(asset.name)}-trim`);
    setUi('idle');
    setSignedUrl(null);
    setErrorMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset.id]);

  // Seek preview to in-point
  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (v && Math.abs(v.currentTime - inPt) > 0.05) {
      try { v.currentTime = inPt; } catch {}
    }
  }, [open, inPt]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui !== 'encoding') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, ui]);

  const clipDur = Math.max(0, outPt - inPt);
  const clipTooLong = clipDur > MAX_CLIP;
  const rangeValid = outPt > inPt + 0.05 && !clipTooLong;
  const filenameValid = filename.trim().length > 0 && filename.length <= 80;
  const canSubmit = rangeValid && filenameValid && ui !== 'encoding';

  const handlePointerDown = useCallback(
    (which: 'in' | 'out') => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = which;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const t = pct * duration;
      if (dragRef.current === 'in') {
        setInPt(Math.min(t, outPt - 0.1));
      } else {
        setOutPt(Math.max(t, inPt + 0.1));
      }
    },
    [duration, inPt, outPt],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleBarClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current) return;
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const t = pct * duration;
      // Move nearest handle
      const distIn = Math.abs(t - inPt);
      const distOut = Math.abs(t - outPt);
      if (distIn <= distOut) setInPt(Math.min(t, outPt - 0.1));
      else setOutPt(Math.max(t, inPt + 0.1));
    },
    [duration, inPt, outPt],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setUi('encoding');
    setErrorMsg(null);
    setSignedUrl(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetId: asset.id,
          format,
          inPoint: inPt,
          outPoint: outPt,
          filename,
        }),
      });
      // Server may return HTML on edge crashes / timeouts (Vercel's
      // "An error occurred…" page) — res.json() would throw. Read as
      // text first, then try to parse.
      const raw = await res.text();
      let data: { status?: string; signedUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        // Non-JSON (usually Vercel runtime crash). Surface a friendlier
        // message and keep the raw payload in the console for debugging.
        console.error('[export] non-JSON response:', raw.slice(0, 500));
        setUi('failed');
        const msg = res.status === 504
          ? 'Export timed out — try a shorter clip.'
          : `Server error (${res.status}). Try again or check the logs.`;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      if (!res.ok) {
        setUi('failed');
        setErrorMsg(data.error || 'Export failed');
        toast.error(data.error || 'Export failed');
        return;
      }
      if (data.status === 'ready' && data.signedUrl) {
        setSignedUrl(data.signedUrl);
        setUi('ready');
        toast.success('Export ready');
      } else {
        setUi('failed');
        setErrorMsg('Export completed without a signed URL');
      }
    } catch (err) {
      setUi('failed');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      toast.error('Export failed');
    }
  }, [asset.id, canSubmit, filename, format, getIdToken, inPt, outPt]);

  const handleDownload = useCallback(() => {
    if (!signedUrl) return;
    forceDownload(signedUrl, `${filename}.${format}`);
  }, [filename, format, signedUrl]);

  if (!open) return null;

  const inPct = duration > 0 ? (inPt / duration) * 100 : 0;
  const outPct = duration > 0 ? (outPt / duration) * 100 : 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={() => ui !== 'encoding' && onClose()}
    >
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-frame-accent" />
            <h3 className="text-sm font-semibold text-white">Export</h3>
          </div>
          <button
            onClick={() => ui !== 'encoding' && onClose()}
            disabled={ui === 'encoding'}
            className="text-frame-textMuted hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        {previewUrl && (
          <div className="px-5 pt-4">
            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                src={previewUrl}
                muted
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        {/* Trim bar */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between text-[11px] text-frame-textSecondary mb-1.5">
            <span>In: <span className="text-white font-mono">{formatTime(inPt)}</span></span>
            <span className={clipTooLong ? 'text-frame-red' : ''}>
              Length: <span className="font-mono">{formatTime(clipDur)}</span>
              {clipTooLong && <span className="ml-1">(max 0:45.000)</span>}
            </span>
            <span>Out: <span className="text-white font-mono">{formatTime(outPt)}</span></span>
          </div>
          <div
            ref={barRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerDown={handleBarClick}
            className="relative h-8 flex items-center cursor-pointer select-none"
          >
            {/* Track */}
            <div className="absolute left-0 right-0 h-2 bg-frame-border rounded-full" />
            {/* Selection fill */}
            <div
              className="absolute h-2 bg-frame-accent/50 rounded-full"
              style={{ left: `${inPct}%`, right: `${100 - outPct}%` }}
            />
            {/* IN handle */}
            <div
              onPointerDown={handlePointerDown('in')}
              title="In point"
              className="absolute w-3 h-5 -ml-1.5 bg-frame-accent rounded-sm shadow-lg cursor-ew-resize hover:bg-frame-accentHover"
              style={{ left: `${inPct}%` }}
            />
            {/* OUT handle */}
            <div
              onPointerDown={handlePointerDown('out')}
              title="Out point"
              className="absolute w-3 h-5 -ml-1.5 bg-frame-accent rounded-sm shadow-lg cursor-ew-resize hover:bg-frame-accentHover"
              style={{ left: `${outPct}%` }}
            />
          </div>
        </div>

        {/* Format toggle */}
        <div className="px-5 pt-4">
          <div className="text-[11px] text-frame-textSecondary mb-1.5">Format</div>
          <div className="inline-flex bg-frame-bg border border-frame-border rounded-lg p-0.5">
            {(['mp4', 'gif'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={ui === 'encoding'}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  format === f
                    ? 'bg-frame-accent text-white'
                    : 'text-frame-textSecondary hover:text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-frame-textMuted">
            {format === 'mp4'
              ? 'Re-encodes to H.264/AAC if the source can\u2019t be stream-copied. Max 45 seconds.'
              : '480p, 12 fps, looping. Max 45 seconds.'}
          </p>
        </div>

        {/* Filename */}
        <div className="px-5 pt-4">
          <label className="text-[11px] text-frame-textSecondary mb-1.5 block">
            Filename
          </label>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(sanitizeFilenameInput(e.target.value))}
              disabled={ui === 'encoding'}
              maxLength={80}
              className="flex-1 bg-frame-bg border border-frame-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-frame-accent disabled:opacity-50"
              placeholder="clip-name"
            />
            <span className="text-xs text-frame-textMuted self-center">
              .{format}
            </span>
          </div>
        </div>

        {/* Footer — submit / status / download */}
        <div className="px-5 py-4 mt-4 border-t border-frame-border flex items-center justify-between gap-3">
          <div className="text-[11px] text-frame-textMuted min-h-[1em]">
            {ui === 'encoding' && 'Encoding on the server — this may take up to a few minutes for longer clips.'}
            {ui === 'failed' && errorMsg && (
              <span className="text-frame-red">{errorMsg}</span>
            )}
          </div>

          {ui === 'ready' && signedUrl ? (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-frame-green hover:brightness-110 rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-frame-accent hover:bg-frame-accentHover rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ui === 'encoding' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Encoding…
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5" />
                  Export
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
