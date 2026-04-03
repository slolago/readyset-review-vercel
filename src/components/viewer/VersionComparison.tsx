'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type { Asset } from '@/types';

interface VersionComparisonProps {
  assetA: Asset; // older version (left)
  assetB: Asset; // newer version (right)
}

export function VersionComparison({ assetA, assetB }: VersionComparisonProps) {
  const [sliderPos, setSliderPos] = useState(0.5); // 0–1
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Video-specific state
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const isVideo = assetA.type === 'video';

  const urlA = (assetA as any).signedUrl || assetA.url;
  const urlB = (assetB as any).signedUrl || assetB.url;

  // Sync video B to video A's time
  const syncVideos = useCallback(() => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    if (Math.abs(vA.currentTime - vB.currentTime) > 0.1) {
      vB.currentTime = vA.currentTime;
    }
  }, []);

  const togglePlay = useCallback(() => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    if (vA.paused) {
      vA.play();
      vB.play();
      setIsPlaying(true);
    } else {
      vA.pause();
      vB.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (videoARef.current) videoARef.current.currentTime = t;
    if (videoBRef.current) videoBRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  useEffect(() => {
    const vA = videoARef.current;
    if (!vA) return;
    const onTime = () => { setCurrentTime(vA.currentTime); syncVideos(); };
    const onLoaded = () => setDuration(vA.duration);
    const onEnded = () => setIsPlaying(false);
    vA.addEventListener('timeupdate', onTime);
    vA.addEventListener('loadedmetadata', onLoaded);
    vA.addEventListener('ended', onEnded);
    return () => {
      vA.removeEventListener('timeupdate', onTime);
      vA.removeEventListener('loadedmetadata', onLoaded);
      vA.removeEventListener('ended', onEnded);
    };
  }, [syncVideos]);

  // Drag logic for slider
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setSliderPos(pos);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    setSliderPos(pos);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: TouchEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
      setSliderPos(pos);
    };
    const onEnd = () => setIsDragging(false);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging]);

  const clipA = `inset(0 ${((1 - sliderPos) * 100).toFixed(2)}% 0 0)`;
  const clipB = `inset(0 0 0 ${(sliderPos * 100).toFixed(2)}%)`;

  return (
    <div className="flex flex-col h-full w-full bg-black">
      {/* Comparison viewer */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden select-none">
        {isVideo ? (
          <>
            {/* Video B (right/newer) */}
            <video
              ref={videoBRef}
              src={urlB}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: clipB }}
              muted
              playsInline
              preload="auto"
            />
            {/* Video A (left/older) */}
            <video
              ref={videoARef}
              src={urlA}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: clipA }}
              muted={muted}
              playsInline
              preload="auto"
            />
          </>
        ) : (
          <>
            {/* Image B (right/newer) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlB}
              alt={`V${assetB.version}`}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: clipB }}
              draggable={false}
            />
            {/* Image A (left/older) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlA}
              alt={`V${assetA.version}`}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ clipPath: clipA }}
              draggable={false}
            />
          </>
        )}

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
          style={{ left: `${sliderPos * 100}%` }}
        />

        {/* Drag handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center cursor-ew-resize z-10"
          style={{ left: `${sliderPos * 100}%` }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="flex gap-0.5">
            <div className="w-0.5 h-4 bg-gray-400 rounded" />
            <div className="w-0.5 h-4 bg-gray-400 rounded" />
          </div>
        </div>

        {/* Version labels */}
        <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white font-medium">
          V{assetA.version} — {assetA.name}
        </div>
        <div className="absolute top-3 right-3 px-2 py-1 bg-frame-accent/80 backdrop-blur-sm rounded text-xs text-white font-medium">
          V{assetB.version} — {assetB.name}
        </div>
      </div>

      {/* Video controls */}
      {isVideo && (
        <div className="flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" fill="white" /> : <Play className="w-4 h-4 ml-0.5" fill="white" />}
          </button>

          <span className="text-xs text-white/60 font-mono w-12 text-right flex-shrink-0">
            {formatDuration(currentTime)}
          </span>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 accent-frame-accent"
          />

          <span className="text-xs text-white/60 font-mono w-12 flex-shrink-0">
            {formatDuration(duration)}
          </span>

          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (videoARef.current) videoARef.current.muted = next;
            }}
            className="text-white/60 hover:text-white transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
