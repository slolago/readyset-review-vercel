'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ChevronDown, Columns2, SplitSquareHorizontal, AudioLines } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { VUMeter, type VUMeterHandle } from './VUMeter';
import type { Asset } from '@/types';

type ViewMode = 'slider' | 'side-by-side';

interface VersionComparisonProps {
  versions: Asset[];
}

export function VersionComparison({ versions }: VersionComparisonProps) {
  // Always default to "latest vs previous" — the most common comparison. No
  // localStorage persistence: stale saved pairs were confusing users (if v3
  // was uploaded, they'd still open on v1/v2 from a previous session).
  // Assumes versions[] is sorted ascending by version number (API guarantees this).
  const latestId = versions[versions.length - 1]?.id ?? '';
  const previousId = versions[versions.length - 2]?.id ?? '';
  const [selectedIdA, setSelectedIdA] = useState(previousId);
  const [selectedIdB, setSelectedIdB] = useState(latestId);

  // If the versions list changes while mounted (new upload), snap to the new
  // latest-vs-previous pair.
  useEffect(() => {
    if (!latestId) return;
    setSelectedIdB((cur) => (versions.some((v) => v.id === cur) ? cur : latestId));
    setSelectedIdA((cur) => (versions.some((v) => v.id === cur) ? cur : previousId));
  }, [versions, latestId, previousId]);
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [pickerSide, setPickerSide] = useState<'A' | 'B' | null>(null);

  const assetA = versions.find((v) => v.id === selectedIdA) ?? versions[versions.length - 2];
  const assetB = versions.find((v) => v.id === selectedIdB) ?? versions[versions.length - 1];

  const [sliderPos, setSliderPos] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const vuRef = useRef<VUMeterHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSide, setActiveSide] = useState<'A' | 'B'>('B'); // default: listen to the latest
  const [muted, setMuted] = useState(false);

  // Track the natural dimensions of video A so both videos can share a single
  // letterbox/pillarbox rect. This keeps the slider split visually consistent
  // even when the two versions have different aspect ratios.
  const [dimsA, setDimsA] = useState<{ w: number; h: number } | null>(null);
  const [dimsB, setDimsB] = useState<{ w: number; h: number } | null>(null);

  // Keep VU meter gain in sync with mute state (the meter owns volume — video.muted is ignored)
  useEffect(() => { vuRef.current?.setMuted(muted); }, [muted]);

  const isVideo = assetA?.type === 'video';
  const urlA = assetA ? ((assetA as any).signedUrl || assetA.url) : '';
  const urlB = assetB ? ((assetB as any).signedUrl || assetB.url) : '';

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [viewMode, selectedIdA, selectedIdB]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerSide) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-picker]')) setPickerSide(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerSide]);

  const syncVideos = useCallback(() => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    if (Math.abs(vA.currentTime - vB.currentTime) > 0.1) vB.currentTime = vA.currentTime;
  }, []);

  const togglePlay = useCallback(async () => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    if (vA.paused) {
      vB.currentTime = vA.currentTime;
      // Unlock AudioContext *before* starting playback. Must happen inside this
      // user-gesture call stack or Chrome leaves the context suspended → silence.
      await vuRef.current?.resume();
      Promise.all([vA.play(), vB.play()]).catch(() => {});
      setIsPlaying(true);
    } else {
      vA.pause(); vB.pause(); setIsPlaying(false);
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
  }, [syncVideos, selectedIdA, viewMode]);

  // Slider drag — mouse
  const handleMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const r = frameRef.current?.getBoundingClientRect();
      if (!r) return;
      setSliderPos(Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  // Slider drag — touch
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    setSliderPos(Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - r.left) / r.width)));
  }, []);
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: TouchEvent) => {
      const r = frameRef.current?.getBoundingClientRect();
      if (!r) return;
      setSliderPos(Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - r.left) / r.width)));
    };
    const onEnd = () => setIsDragging(false);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, [isDragging]);

  const clipA = `inset(0 ${((1 - sliderPos) * 100).toFixed(2)}% 0 0)`;
  const clipB = `inset(0 0 0 ${(sliderPos * 100).toFixed(2)}%)`;

  // Version picker button — floats as overlay, no layout impact
  const VersionLabel = ({ side, asset }: { side: 'A' | 'B'; asset: Asset }) => (
    <div className="relative flex items-center gap-1.5" data-picker>
      {isVideo && (
        <button
          onClick={(e) => { e.stopPropagation(); setActiveSide(side); }}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
            activeSide === side && !muted
              ? 'bg-frame-accent text-white'
              : 'bg-black/60 text-white/40 hover:text-white'
          }`}
          title={activeSide === side ? 'Audio active' : 'Switch audio here'}
        >
          <AudioLines className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        data-picker
        onClick={() => setPickerSide((p) => (p === side ? null : side))}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium max-w-[200px] transition-colors ${
          side === 'B'
            ? 'bg-frame-accent/80 hover:bg-frame-accent text-white'
            : 'bg-black/60 hover:bg-black/80 text-white'
        }`}
      >
        <span className="truncate">V{asset.version} — {asset.name}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {pickerSide === side && (
        <div
          data-picker
          className={`absolute top-full mt-1 bg-frame-card border border-frame-border rounded-lg shadow-xl overflow-hidden z-30 min-w-[200px] max-w-[280px] ${
            side === 'B' ? 'right-0' : 'left-0'
          }`}
        >
          {versions.map((v) => (
            <button
              key={v.id}
              data-picker
              onClick={() => { side === 'A' ? setSelectedIdA(v.id) : setSelectedIdB(v.id); setPickerSide(null); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-frame-cardHover transition-colors truncate ${
                v.id === asset.id ? 'text-frame-accent font-semibold' : 'text-white'
              }`}
            >
              V{v.version} — {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // View mode toggle — floats centered, no layout impact
  const ViewToggle = () => (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg p-1 pointer-events-auto">
      <button
        onClick={() => setViewMode('slider')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          viewMode === 'slider' ? 'bg-frame-accent text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        <SplitSquareHorizontal className="w-3.5 h-3.5" />
        Slider
      </button>
      <button
        onClick={() => setViewMode('side-by-side')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          viewMode === 'side-by-side' ? 'bg-frame-accent text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        <Columns2 className="w-3.5 h-3.5" />
        Side by side
      </button>
    </div>
  );

  // Share a single letterbox/pillarbox frame between both videos. The frame's
  // aspect ratio comes from the LARGER of the two natural aspect ratios (or a
  // sane default until metadata loads) — this guarantees both videos fit inside
  // the same visible rect, so the slider split and side-by-side layout line up
  // properly even when V1 and V3 have different native dimensions.
  const aspectA = dimsA ? dimsA.w / dimsA.h : null;
  const aspectB = dimsB ? dimsB.w / dimsB.h : null;
  const sharedAspect =
    aspectA && aspectB ? Math.max(aspectA, aspectB) : aspectA ?? aspectB ?? 16 / 9;

  const videoStyleA: React.CSSProperties = viewMode === 'slider'
    ? { position: 'absolute', inset: 0, clipPath: clipA }
    : { position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%' };
  const videoStyleB: React.CSSProperties = viewMode === 'slider'
    ? { position: 'absolute', inset: 0, clipPath: clipB }
    : { position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0 };

  const handleMetaA = () => {
    const v = videoARef.current;
    if (v?.videoWidth) setDimsA({ w: v.videoWidth, h: v.videoHeight });
    if (v) setDuration(v.duration || 0);
  };
  const handleMetaB = () => {
    const v = videoBRef.current;
    if (v?.videoWidth) setDimsB({ w: v.videoWidth, h: v.videoHeight });
  };

  return (
    <div className="flex flex-col h-full w-full bg-black">
      <div className="flex-1 min-h-0 flex">
      <div className="relative flex-1 min-h-0 overflow-hidden select-none flex items-center justify-center" ref={containerRef}>
        <ViewToggle />

        {/* Shared frame — sized to fit the container while matching sharedAspect.
            Both videos render absolutely inside, guaranteeing the same visible rect. */}
        <div
          ref={frameRef}
          className="relative"
          style={{
            aspectRatio: `${sharedAspect}`,
            maxWidth: '100%',
            maxHeight: '100%',
            width: viewMode === 'side-by-side' ? '100%' : undefined,
            height: viewMode === 'side-by-side' ? '100%' : undefined,
          }}
        >
          {/* Media — always rendered in the same position so refs stay stable.
              Audio source selection: video.muted gates each video's audio independently.
              When a video is muted, its MediaElementSource emits silence, so the user
              hears only the active side. VUMeter gain nodes stay at volume=1. */}
          {isVideo ? (
            <>
              <video
                ref={videoBRef}
                src={urlB}
                className="object-contain w-full h-full"
                style={videoStyleB}
                muted={activeSide !== 'B' || muted}
                playsInline
                preload="auto"
                onLoadedMetadata={handleMetaB}
              />
              <video
                ref={videoARef}
                src={urlA}
                className="object-contain w-full h-full"
                style={videoStyleA}
                muted={activeSide !== 'A' || muted}
                playsInline
                preload="auto"
                onLoadedMetadata={handleMetaA}
              />
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlB} alt={`V${assetB?.version}`} className="object-contain w-full h-full" style={videoStyleB} draggable={false} onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth) setDimsB({ w: t.naturalWidth, h: t.naturalHeight }); }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlA} alt={`V${assetA?.version}`} className="object-contain w-full h-full" style={videoStyleA} draggable={false} onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth) setDimsA({ w: t.naturalWidth, h: t.naturalHeight }); }} />
            </>
          )}

          {/* Slider handle — only in slider mode, positioned over the shared frame */}
          {viewMode === 'slider' && (
            <>
              <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos * 100}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center cursor-ew-resize z-10"
                style={{ left: `${sliderPos * 100}%` }}
                onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}
              >
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-4 bg-gray-400 rounded" />
                  <div className="w-0.5 h-4 bg-gray-400 rounded" />
                </div>
              </div>
            </>
          )}

          {/* Vertical divider for side-by-side */}
          {viewMode === 'side-by-side' && (
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-white/15 pointer-events-none" />
          )}
        </div>

        {/* Labels — placed over the container (outside the shared frame) */}
        <div className="absolute top-14 left-3 z-10 pointer-events-auto">
          {assetA && <VersionLabel side="A" asset={assetA} />}
        </div>
        <div className="absolute top-14 right-3 z-10 pointer-events-auto">
          {assetB && <VersionLabel side="B" asset={assetB} />}
        </div>
      </div>

      {/* VU Meter strip — right side, stereo, follows active audio source */}
      {isVideo && (
        <div className="flex-shrink-0 w-24 flex flex-col bg-[#0a0a0a] border-l border-white/5">
          <VUMeter
            ref={vuRef}
            videoRefs={[videoARef, videoBRef]}
            activeIndex={activeSide === 'A' ? 0 : 1}
            isPlaying={isPlaying}
          />
          <div className="flex-shrink-0 border-t border-white/5 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/50 text-center">
            Audio: V{activeSide === 'A' ? assetA?.version : assetB?.version}
          </div>
        </div>
      )}
      </div>{/* end viewer+meter row */}

      {/* Video controls */}
      {isVideo && (
        <div className="flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-3 flex items-center gap-3">
          <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            {isPlaying ? <Pause className="w-4 h-4" fill="white" /> : <Play className="w-4 h-4 ml-0.5" fill="white" />}
          </button>
          <span className="text-xs text-white/60 font-mono w-12 text-right flex-shrink-0">{formatDuration(currentTime)}</span>
          <input type="range" min={0} max={duration || 0} step={0.01} value={currentTime} onChange={handleSeek} className="flex-1 h-1 accent-frame-accent" />
          <span className="text-xs text-white/60 font-mono w-12 flex-shrink-0">{formatDuration(duration)}</span>

          {/* Audio source selector — explicit A/B toggle so user always knows which audio is live */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10 ml-1">
            <AudioLines className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setActiveSide('A')}
                title={`Listen to V${assetA?.version}`}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  activeSide === 'A' ? 'bg-frame-accent text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                V{assetA?.version ?? 'A'}
              </button>
              <button
                onClick={() => setActiveSide('B')}
                title={`Listen to V${assetB?.version}`}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  activeSide === 'B' ? 'bg-frame-accent text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                V{assetB?.version ?? 'B'}
              </button>
            </div>
          </div>

          <button onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute' : 'Mute'} className="text-white/60 hover:text-white transition-colors">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
