'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutGrid, Lock, Trash2, Upload, Plus, Check, X, Pencil,
  AlertTriangle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { SafeZone } from '@/types';

interface SafeZonesManagerProps {
  getIdToken: () => Promise<string | null>;
}

const RATIO_ORDER = ['9:16', '16:9', '4:5', '1:1'];

// ── helpers ────────────────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  options: RequestInit,
  token: string | null
): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ── sub-components ─────────────────────────────────────────────────────────────

function RatioBadge({ ratio }: { ratio: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-white/8 text-white/50 border border-white/10 leading-none">
      {ratio}
    </span>
  );
}

interface ZoneCardProps {
  zone: SafeZone;
  onRename: (id: string, name: string) => void;
  onDeleteRequest: (zone: SafeZone) => void;
  onImageReplace: (id: string, file: File) => void;
  uploading: boolean;
}

function ZoneCard({ zone, onRename, onDeleteRequest, onImageReplace, uploading }: ZoneCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(zone.name);
  const fileRef = useRef<HTMLInputElement>(null);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== zone.name) onRename(zone.id, trimmed);
    setEditing(false);
  };

  return (
    <div className="group relative flex flex-col bg-frame-card border border-frame-border rounded-xl overflow-hidden hover:border-white/20 transition-colors">
      {/* Image preview */}
      <div className="relative bg-[#0d0d0d] aspect-video flex items-center justify-center overflow-hidden">
        {zone.imageUrl ? (
          <img
            src={zone.imageUrl}
            alt={zone.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/20">
            <LayoutGrid className="w-8 h-8" />
            <span className="text-xs">No image</span>
          </div>
        )}

        {/* Built-in badge */}
        {zone.isBuiltIn && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 rounded text-white/40 text-[10px]">
            <Lock className="w-2.5 h-2.5" />
            built-in
          </div>
        )}

        {/* Hover overlay with action buttons */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {/* Replace image */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Replace image"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white text-xs transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Replace
          </button>

          {/* Delete — custom zones only */}
          {!zone.isBuiltIn && (
            <button
              onClick={() => onDeleteRequest(zone)}
              title="Delete zone"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setDraft(zone.name); setEditing(false); }
                }}
                className="flex-1 bg-white/8 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:border-frame-accent min-w-0"
              />
              <button onClick={commitRename} className="text-frame-accent hover:text-white transition-colors">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setDraft(zone.name); setEditing(false); }} className="text-white/40 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/name min-w-0">
              <span className="text-sm text-white font-medium truncate">{zone.name}</span>
              <button
                onClick={() => { setDraft(zone.name); setEditing(true); }}
                className="opacity-0 group-hover/name:opacity-100 text-white/40 hover:text-white transition-all flex-shrink-0"
                title="Rename"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        <RatioBadge ratio={zone.ratio} />
      </div>

      {/* Hidden file input for image replacement */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageReplace(zone.id, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export function SafeZonesManager({ getIdToken }: SafeZonesManagerProps) {
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeZone | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/safe-zones');
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones);
      }
    } catch {
      toast.error('Failed to load safe zones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // ── rename ──────────────────────────────────────────────────────────────────
  const handleRename = async (id: string, name: string) => {
    const token = await getIdToken();
    const res = await apiFetch(
      `/api/safe-zones/${id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
      token
    );
    if (res.ok) {
      setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
      toast.success('Renamed');
    } else {
      toast.error('Failed to rename');
    }
  };

  // ── delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = await getIdToken();
    const res = await apiFetch(`/api/safe-zones/${deleteTarget.id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setZones((prev) => prev.filter((z) => z.id !== deleteTarget.id));
      toast.success('Deleted');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to delete');
    }
    setDeleteTarget(null);
  };

  // ── image upload ─────────────────────────────────────────────────────────────
  const handleImageReplace = async (id: string, file: File) => {
    setUploadingId(id);
    const token = await getIdToken();
    const form = new FormData();
    form.append('image', file);
    const res = await apiFetch(`/api/safe-zones/${id}/image`, { method: 'POST', body: form }, token);
    if (res.ok) {
      const data = await res.json();
      // Force cache-bust by appending a timestamp query param
      const bustedUrl = `${data.imageUrl}?t=${Date.now()}`;
      setZones((prev) => prev.map((z) => (z.id === id ? { ...z, imageUrl: bustedUrl } : z)));
      toast.success('Image updated');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Upload failed');
    }
    setUploadingId(null);
  };

  // ── add zone ─────────────────────────────────────────────────────────────────
  const handleZoneCreated = (zone: SafeZone) => {
    setZones((prev) => [...prev, zone]);
    setShowAddModal(false);
  };

  // ── group by ratio ────────────────────────────────────────────────────────────
  const grouped = [
    ...RATIO_ORDER.map((ratio) => ({ ratio, zones: zones.filter((z) => z.ratio === ratio) })),
    ...(() => {
      const known = new Set(RATIO_ORDER);
      const custom = zones.filter((z) => !known.has(z.ratio));
      const ratios = Array.from(new Set(custom.map((z) => z.ratio)));
      return ratios.map((ratio) => ({ ratio, zones: custom.filter((z) => z.ratio === ratio) }));
    })(),
  ].filter((g) => g.zones.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-white/40">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading safe zones…
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-frame-textSecondary text-sm">
            {zones.length} zone{zones.length !== 1 ? 's' : ''} · Built-in zones can have their image replaced. Custom zones can be fully managed.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-frame-accent hover:bg-frame-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add custom zone
        </button>
      </div>

      {/* Grouped grid */}
      <div className="space-y-8">
        {grouped.map(({ ratio, zones: group }) => (
          <div key={ratio}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">{ratio}</span>
              <div className="flex-1 h-px bg-frame-border" />
              <span className="text-xs text-white/30">{group.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  onRename={handleRename}
                  onDeleteRequest={setDeleteTarget}
                  onImageReplace={handleImageReplace}
                  uploading={uploadingId === zone.id}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          zone={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Add zone modal */}
      {showAddModal && (
        <AddZoneModal
          getIdToken={getIdToken}
          onCreated={handleZoneCreated}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ── DeleteConfirmDialog ────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  zone,
  onConfirm,
  onCancel,
}: {
  zone: SafeZone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-frame-card border border-frame-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Delete safe zone?</h3>
            <p className="text-sm text-frame-textSecondary mt-1">
              <span className="text-white font-medium">&ldquo;{zone.name}&rdquo;</span> will be permanently removed and no longer available in the player.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-white/70 hover:text-white border border-frame-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddZoneModal ───────────────────────────────────────────────────────────────

const PRESET_RATIOS = ['9:16', '16:9', '4:5', '1:1', '4:3', '2.39:1'];

function AddZoneModal({
  getIdToken,
  onCreated,
  onClose,
}: {
  getIdToken: () => Promise<string | null>;
  onCreated: (zone: SafeZone) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [customRatio, setCustomRatio] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const effectiveRatio = ratio === 'custom' ? customRatio.trim() : ratio;

  const handleSubmit = async () => {
    if (!name.trim() || !effectiveRatio) return;
    setSaving(true);
    try {
      const token = await getIdToken();

      // 1. Create the zone
      const createRes = await apiFetch(
        '/api/safe-zones',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), ratio: effectiveRatio }) },
        token
      );
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        toast.error(err.error || 'Failed to create zone');
        return;
      }
      const { zone } = await createRes.json();

      // 2. Upload image if selected
      if (file) {
        const form = new FormData();
        form.append('image', file);
        const imgRes = await apiFetch(`/api/safe-zones/${zone.id}/image`, { method: 'POST', body: form }, token);
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          zone.imageUrl = `${imgData.imageUrl}?t=${Date.now()}`;
        }
      }

      onCreated(zone as SafeZone);
      toast.success('Safe zone created');
    } finally {
      setSaving(false);
      if (preview) URL.revokeObjectURL(preview);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-frame-border">
          <h3 className="font-semibold text-white">Add custom safe zone</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Name</label>
            <input
              autoFocus
              placeholder="e.g. Pinterest 2:3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-frame-accent transition-colors"
            />
          </div>

          {/* Ratio */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Aspect ratio</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_RATIOS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRatio(r)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    ratio === r
                      ? 'border-frame-accent bg-frame-accent/10 text-white'
                      : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                  }`}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => setRatio('custom')}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  ratio === 'custom'
                    ? 'border-frame-accent bg-frame-accent/10 text-white'
                    : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
                }`}
              >
                Custom
              </button>
            </div>
            {ratio === 'custom' && (
              <input
                autoFocus
                placeholder="e.g. 3:4"
                value={customRatio}
                onChange={(e) => setCustomRatio(e.target.value)}
                className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-frame-accent transition-colors"
              />
            )}
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Safe zone image <span className="text-white/30">(PNG recommended)</span></label>
            {preview ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d]">
                <img src={preview} alt="Preview" className="w-full h-40 object-contain" />
                <button
                  onClick={() => { setFile(null); setPreview(null); }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-32 border border-dashed border-white/15 hover:border-frame-accent/60 rounded-xl flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/70 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Click to upload image</span>
                <span className="text-[10px] text-white/25">PNG, JPEG, WebP · max 5MB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-frame-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-white/70 hover:text-white border border-frame-border rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !effectiveRatio}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-frame-accent hover:bg-frame-accent/90 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
