'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Play, Pause, Volume2, VolumeX, GitCompare } from 'lucide-react';
import type { Asset } from '@/types';

interface AssetCompareModalProps {
  assetA: Asset;
  assetB: Asset;
  onClose: () => void;
}

export function AssetCompareModal({ assetA, assetB, onClose }: AssetCompareModalProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioSide, setAudioSide] = useState<'A' | 'B'>('A');

  const signedUrlA = (assetA as any).signedUrl as string | undefined;
  const signedUrlB = (assetB as any).signedUrl as string | undefined;

  const hasVideo = assetA.type === 'video' || assetB.type === 'video';

  // Sync muted state when audioSide changes
  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = audioSide !== 'A';
    if (videoBRef.current) videoBRef.current.muted = audioSide !== 'B';
  }, [audioSide]);

  // On mount, set initial muted state
  useEffect(() => {
    if (videoARef.current) videoARef.current.muted = false; // A has audio by default
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

  // Track time from video A (or B if A is not video)
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

  // Keyboard handler
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
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Exit comparison"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Side-by-side panels */}
      <div className="flex flex-1 min-h-0 divide-x divide-white/10">
        {/* Panel A */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
            <p className="text-xs font-medium text-white truncate" title={assetA.name}>{assetA.name}</p>
          </div>
          <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
            {assetA.type === 'video' && signedUrlA ? (
              <video
                ref={videoARef}
                src={signedUrlA}
                className="max-w-full max-h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
                playsInline
              />
            ) : assetA.type === 'image' && signedUrlA ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signedUrlA} alt={assetA.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-white/30 text-sm">No preview available</div>
            )}
          </div>
        </div>

        {/* Panel B */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
            <p className="text-xs font-medium text-white truncate" title={assetB.name}>{assetB.name}</p>
          </div>
          <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
            {assetB.type === 'video' && signedUrlB ? (
              <video
                ref={videoBRef}
                src={signedUrlB}
                className="max-w-full max-h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
                playsInline
              />
            ) : assetB.type === 'image' && signedUrlB ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signedUrlB} alt={assetB.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-white/30 text-sm">No preview available</div>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      {hasVideo && (
        <div className="flex-shrink-0 px-6 py-4 border-t border-white/10 bg-black/60">
          {/* Scrubber */}
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

          {/* Buttons */}
          <div className="flex items-center justify-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="flex items-center gap-2 px-4 py-2 bg-frame-accent hover:bg-frame-accent/80 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Play
                </>
              )}
            </button>

            {/* Audio toggle */}
            <button
              onClick={handleToggleAudio}
              title={`Audio: ${audioSide === 'A' ? assetA.name : assetB.name}`}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {audioSide === 'A' ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-frame-accent" />
                  <span>Audio: Left</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-white/40" />
                  <Volume2 className="w-3.5 h-3.5 text-frame-accent" />
                  <span>Audio: Right</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
