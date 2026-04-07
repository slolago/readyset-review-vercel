'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Check } from 'lucide-react';

const SAFE_ZONES = [
  { file: '001-9x16-HotZone-for-TikTok.png', label: 'TikTok', ratio: '9:16' },
  { file: '005-9x16-HotZone-for-Stories.png', label: 'Stories', ratio: '9:16' },
  { file: '006-9x16-HotZone-for-MetaReels.png', label: 'Meta Reels', ratio: '9:16' },
  { file: '007-9x16-HotZone-for-Snapchat.png', label: 'Snapchat', ratio: '9:16' },
  { file: '008-9x16-HotZone-for-YoutubeVertical.png', label: 'YouTube Vertical', ratio: '9:16' },
  { file: '010-9x16-HotZone-for-TikTokArabic.png', label: 'TikTok Arabic', ratio: '9:16' },
  { file: '011-9x16-HotZone-for-Reels+TikTok.png', label: 'Reels + TikTok', ratio: '9:16' },
  { file: '012-9x16-HotZone-for-Reels+YoutubeShorts.png', label: 'Reels + YT Shorts', ratio: '9:16' },
  { file: '013-9x16-HotZone-for-Hims&Hers.png', label: 'Hims & Hers', ratio: '9:16' },
  { file: '014-9x16-HotZone-for-Hims&HersDisclaimers.png', label: 'Hims & Hers (Disc.)', ratio: '9:16' },
  { file: '009-16x9-HotZone-for-YoutubeHorizontal.png', label: 'YouTube Horizontal', ratio: '16:9' },
  { file: '003-4x5-HotZone-for-Meta(4x5With1x1SafeZone).png', label: 'Meta 4:5 (with 1:1)', ratio: '4:5' },
  { file: '004-4x5-HotZone-for-Meta(4x5OriginalSafeZone).png', label: 'Meta 4:5', ratio: '4:5' },
  { file: '002-1x1-HotZone-for-Meta.png', label: 'Meta 1:1', ratio: '1:1' },
] as const;

const RATIO_ORDER = ['9:16', '16:9', '4:5', '1:1'] as const;

interface SafeZoneSelectorProps {
  selected: string | null;
  onSelect: (file: string | null) => void;
}

export function SafeZoneSelector({ selected, onSelect }: SafeZoneSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (file: string) => {
    onSelect(selected === file ? null : file);
    setOpen(false);
  };

  const handleNone = () => {
    onSelect(null);
    setOpen(false);
  };

  const activeLabel = selected
    ? SAFE_ZONES.find((z) => z.file === selected)?.label ?? 'Safe Zones'
    : null;

  // Group zones by ratio
  const grouped = RATIO_ORDER.map((ratio) => ({
    ratio,
    zones: SAFE_ZONES.filter((z) => z.ratio === ratio),
  })).filter((g) => g.zones.length > 0);

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
        <div
          className="absolute bottom-full mb-2 right-0 w-52 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
        >
          {/* None option */}
          <button
            onClick={handleNone}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
          >
            <span>None</span>
            {!selected && <Check className="w-3.5 h-3.5 text-frame-accent" />}
          </button>

          <div className="max-h-72 overflow-y-auto">
            {grouped.map(({ ratio, zones }) => (
              <div key={ratio}>
                {/* Group header */}
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    {ratio}
                  </span>
                </div>
                {zones.map((zone) => (
                  <button
                    key={zone.file}
                    onClick={() => handleSelect(zone.file)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <span>{zone.label}</span>
                    {selected === zone.file && (
                      <Check className="w-3.5 h-3.5 text-frame-accent flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
