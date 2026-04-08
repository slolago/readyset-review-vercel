'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Play, Pause, Volume2, VolumeX, GitCompare, Columns2, SplitSquareHorizontal } from 'lucide-react';
import type { Asset } from '@/types';

type ViewMode = 'side-by-side' | 'slider';

interface AssetCompareModalProps {
  assetA: Asset;
  assetB: Asset;
  onClose: () => void;
}

function MediaItem({
  asset,
  signedUrl,
  videoRef,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  className = '',
}: {
  asset: Asset;
  signedUrl?: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onEnded?: () => void;
  className?: string;
}) {
  if (asset.type === 'video' && signedUrl) {
    return (
      <video
        ref={videoRef}
        src={signedUrl}
        className={`max-w-full max-h-full object-contain ${className}`}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        playsInline
      />
    );
  }
  if (asset.type === 'image' && signedUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={signedUrl} alt={asset.name} className={`max-w-full max-h-full object-contain ${className}`} />;
  }
  return <div className="text-white/30 text-sm">No preview available</div>;
}

export function AssetCompareModal({ assetA, assetB, onClose }: AssetCompareModalProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioSide, setAudioSide] = useState<'A' | 'B'>('A');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const signedUrlA = (assetA as any).signedUrl as string | undefined;
  const signedUrlB = (assetB as any).signedUrl as string | undefined;

  const hasVideo = assetA.type === 'video' || assetB.type === 'video';

  // Sync muted state when audioSide changes
  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = audioSide !== 'A';
    if (videoBRef.current) videoBRef.current.muted = audioSide !== 'B';
  }, [audioSide]);

  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = false;
    if (videoBRef.current) videoBRef.current.muted = true;
  }, []);

  const togglePlayPause = useCallback(() => {
    const vidA = videoARef.current;
    const vidB = videoBRef.current;
    if (!vidA && !vidB) return;
    if (isPlaying) {
      vidA?.pause();
      vidB?.pause();
      setIsPlaying(false);
    } else {
      const playA = vidA ? vidA.play() : Promise.resolve();
      const playB = vidB ? vidB.play() : Promise.resolve();
      Promise.all([playA, playB]).catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (videoARef.current) videoARef.current.currentTime = t;
    if (videoBRef.current) videoBRef.current.currentTime = t;
  }, []);

  const handleToggleAudio = useCallback(() => {
    setAudioSide((prev) => (prev === 'A' ? 'B' : 'A'));
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoARef.current ?? videoBRef.current;
    if (vid) setCurrentTime(vid.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const vid = videoARef.current ?? videoBRef.current;
    if (vid) setDuration(vid.duration || 0);
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Slider drag
  const updateSliderFromEvent = useCallback((clientX: number) => {
    const container = sliderContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(2, Math.min(98, pos)));
  }, []);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) updateSliderFromEvent(e.clientX);
  }, [isDragging, updateSliderFromEvent]);

  const handleContainerMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Release drag if mouse leaves window
  useEffect(() => {
    const onUp = () => setIsDragging(false);
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePlayPause, onClose]);

  const formatTime = (s: number): string => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 text-white">
          <GitCompare className="w-4 h-4 text-frame-accent" />
          <span className="text-sm font-medium">Compare Assets</span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          <button
            onClick={() => setViewMode('side-by-side')}
            title="Side by side"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'side-by-side'
                ? 'bg-frame-accent text-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            Side by side
          </button>
          <button
            onClick={() => setViewMode('slider')}
            title="Slider comparison"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'slider'
                ? 'bg-frame-accent text-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            Slider
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Exit comparison"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main content */}
      {viewMode === 'side-by-side' ? (
        <div className="flex flex-1 min-h-0 divide-x divide-white/10">
          {/* Panel A */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
              <p className="text-xs font-medium text-white truncate" title={assetA.name}>{assetA.name}</p>
            </div>
            <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
              <MediaItem
                asset={assetA}
                signedUrl={signedUrlA}
                videoRef={videoARef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
              />
            </div>
          </div>

          {/* Panel B */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
              <p className="text-xs font-medium text-white truncate" title={assetB.name}>{assetB.name}</p>
            </div>
            <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
              <MediaItem
                asset={assetB}
                signedUrl={signedUrlB}
                videoRef={videoBRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Slider view */
        <div
          ref={sliderContainerRef}
          className="relative flex-1 min-h-0 bg-black overflow-hidden"
          style={{ cursor: isDragging ? 'ew-resize' : 'default' }}
          onMouseMove={handleContainerMouseMove}
          onMouseUp={handleContainerMouseUp}
        >
          {/* Asset B — full width underneath */}
          <div className="absolute inset-0 flex items-center justify-center">
            <MediaItem
              asset={assetB}
              signedUrl={signedUrlB}
              videoRef={videoBRef}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
            />
          </div>

          {/* Asset A — clipped to left of slider */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <MediaItem
              asset={assetA}
              signedUrl={signedUrlA}
              videoRef={videoARef}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
            />
          </div>

          {/* Labels */}
          <div className="absolute top-3 left-3 text-xs text-white bg-black/60 px-2 py-1 rounded pointer-events-none select-none">
            {assetA.name}
          </div>
          <div className="absolute top-3 right-3 text-xs text-white bg-black/60 px-2 py-1 rounded pointer-events-none select-none">
            {assetB.name}
          </div>

          {/* Divider line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
            style={{ left: `${sliderPos}%` }}
          />

          {/* Drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center cursor-ew-resize select-none"
            style={{ left: `${sliderPos}%` }}
            onMouseDown={handleDividerMouseDown}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 4L2 8L5 12M11 4L14 8L11 12" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      {/* Controls bar */}
      {hasVideo && (
        <div className="flex-shrink-0 px-6 py-4 border-t border-white/10 bg-black/60">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-white/50 w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 accent-frame-accent cursor-pointer"
            />
            <span className="text-xs text-white/50 w-10 tabular-nums">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={togglePlayPause}
              className="flex items-center gap-2 px-4 py-2 bg-frame-accent hover:bg-frame-accent/80 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isPlaying ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Play</>}
            </button>

            <button
              onClick={handleToggleAudio}
              title={`Audio: ${audioSide === 'A' ? assetA.name : assetB.name}`}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {audioSide === 'A' ? (
                <><Volume2 className="w-3.5 h-3.5 text-frame-accent" /><span>Audio: Left</span></>
              ) : (
                <><VolumeX className="w-3.5 h-3.5 text-white/40" /><Volume2 className="w-3.5 h-3.5 text-frame-accent" /><span>Audio: Right</span></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
