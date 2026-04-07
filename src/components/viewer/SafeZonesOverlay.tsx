'use client';

interface SafeZonesOverlayProps {
  videoRect: { x: number; y: number; w: number; h: number };
  safeZone: string; // filename like "001-9x16-HotZone-for-TikTok.png"
}

export function SafeZonesOverlay({ safeZone }: SafeZonesOverlayProps) {
  return (
    <img
      src={`/safezones/${safeZone}`}
      alt=""
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        pointerEvents: 'none',
        userSelect: 'none',
        display: 'block',
      }}
      draggable={false}
    />
  );
}
