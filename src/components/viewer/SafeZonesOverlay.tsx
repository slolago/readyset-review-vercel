'use client';

interface SafeZonesOverlayProps {
  videoRect: { x: number; y: number; w: number; h: number };
  /** Full image URL — either "/safezones/..." for built-in or "/api/safe-zones/{id}/image" for custom. */
  imageUrl: string;
  opacity?: number; // 0–1, defaults to 1
}

export function SafeZonesOverlay({ imageUrl, opacity = 1 }: SafeZonesOverlayProps) {
  return (
    <img
      src={imageUrl}
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
