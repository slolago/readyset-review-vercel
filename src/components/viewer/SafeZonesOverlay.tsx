'use client';

interface SafeZonesOverlayProps {
  videoRect: { x: number; y: number; w: number; h: number };
  safeZone: string; // filename like "001-9x16-HotZone-for-TikTok.png"
  opacity?: number; // 0–1, defaults to 1
}

export function SafeZonesOverlay({ safeZone, opacity = 1 }: SafeZonesOverlayProps) {
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
        opacity,
      }}
      draggable={false}
    />
  );
}
