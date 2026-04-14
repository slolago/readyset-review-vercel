'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Check, Loader2 } from 'lucide-react';
import type { SafeZone } from '@/types';

const RATIO_ORDER = ['9:16', '16:9', '4:5', '1:1'];

interface SafeZoneSelectorProps {
  selected: string | null;   // imageUrl of the active zone, or null
  onSelect: (imageUrl: string | null) => void;
}

export function SafeZoneSelector({ selected, onSelect }: SafeZoneSelectorProps) {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState<SafeZone[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch zones on first open
  useEffect(() => {
    if (!open || zones.length > 0) return;
    setLoading(true);
    fetch('/api/safe-zones')
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, zones.length]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (imageUrl: string) => {
    onSelect(selected === imageUrl ? null : imageUrl);
    setOpen(false);
  };

  const handleNone = () => { onSelect(null); setOpen(false); };

  // Find active zone label
  const activeLabel = selected
    ? zones.find((z) => z.imageUrl === selected)?.name ?? 'Safe Zones'
    : null;

  // Group zones by ratio (preserve custom ratios at the end)
  const knownRatios = new Set(RATIO_ORDER);
  const customRatios = Array.from(new Set(zones.filter((z) => !knownRatios.has(z.ratio)).map((z) => z.ratio)));
  const allRatios = [...RATIO_ORDER, ...customRatios];
  const grouped = allRatios
    .map((ratio) => ({ ratio, zones: zones.filter((z) => z.ratio === ratio) }))
    .filter((g) => g.zones.length > 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Safe Zones overlay"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${
          selected
            ? 'text-white border-frame-accent bg-frame-accent/20 hover:bg-frame-accent/30'
            : 'text-white/70 hover:text-white border-white/10 hover:border-white/30'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{activeLabel ?? 'Safe Zones'}</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-52 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* None option */}
          <button
            onClick={handleNone}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
          >
            <span>None</span>
            {!selected && <Check className="w-3.5 h-3.5 text-frame-accent" />}
          </button>

          {loading && (
            <div className="flex items-center justify-center py-6 text-white/30">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}

          {!loading && (
            <div className="max-h-72 overflow-y-auto">
              {grouped.map(({ ratio, zones: group }) => (
                <div key={ratio}>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                      {ratio}
                    </span>
                  </div>
                  {group.map((zone) => (
                    <button
                      key={zone.id}
                      onClick={() => handleSelect(zone.imageUrl)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span>{zone.name}</span>
                      {selected === zone.imageUrl && (
                        <Check className="w-3.5 h-3.5 text-frame-accent flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="px-3 py-4 text-xs text-white/30 text-center">No safe zones configured</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
