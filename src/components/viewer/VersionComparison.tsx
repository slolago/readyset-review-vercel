'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Play, Pause, Volume2, VolumeX, ChevronDown, Columns2, SplitSquareHorizontal, AudioLines, AlertCircle, ZoomIn, ZoomOut, Maximize2, Activity } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { VUMeter, type VUMeterHandle } from './VUMeter';
import type { Asset } from '@/types';

type ViewMode = 'slider' | 'side-by-side';
type Side = 'A' | 'B';

interface VersionComparisonProps {
  versions: Asset[];
}

// ── Extracted components (not inlined so they don't remount on every parent render) ──

const ViewToggle = memo(function ViewToggle({
  viewMode, onChange,
}: { viewMode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg p-1 pointer-events-auto">
      <button
        onClick={() => onChange('slider')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          viewMode === 'slider' ? 'bg-frame-accent text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        <SplitSquareHorizontal className="w-3.5 h-3.5" />
        Slider
      </button>
      <button
        onClick={() => onChange('side-by-side')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          viewMode === 'side-by-side' ? 'bg-frame-accent text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        <Columns2 className="w-3.5 h-3.5" />
        Side by side
      </button>
    </div>
  );
});

const VersionLabel = memo(function VersionLabel({
  side, asset, versions, isOpen, onTogglePicker, onPick,
}: {
  side: Side;
  asset: Asset;
  versions: Asset[];
  isOpen: boolean;
  onTogglePicker: (side: Side) => void;
  onPick: (side: Side, id: string) => void;
}) {
  return (
    <div className="relative" data-picker>
      <button
        data-picker
        onClick={() => onTogglePicker(side)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium max-w-[200px] transition-colors ${
          side === 'B'
            ? 'bg-frame-accent/80 hover:bg-frame-accent text-white'
            : 'bg-black/60 hover:bg-black/80 text-white'
        }`}
      >
        <span className="truncate">V{asset.version} — {asset.name}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {isOpen && (
        <div
          data-picker
          className={`absolute top-full mt-1 bg-frame-card border border-frame-border rounded-lg shadow-xl overflow-y-auto z-30 min-w-[200px] max-w-[280px] max-h-64 ${
            side === 'B' ? 'right-0' : 'left-0'
          }`}
        >
          {versions.map((v) => (
            <button
              key={v.id}
              data-picker
              onClick={() => onPick(side, v.id)}
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
});

export function VersionComparison({ versions }: VersionComparisonProps) {
  // ── Selection state: default latest+previous; no persistence. ──────────────
  const latestId = versions[versions.length - 1]?.id ?? '';
  const previousId = versions[versions.length - 2]?.id ?? '';
  const [selectedIdA, setSelectedIdA] = useState(previousId);
  const [selectedIdB, setSelectedIdB] = useState(latestId);
  const [userTouchedSelection, setUserTouchedSelection] = useState(false);

  // Snap to new latest+previous when a new upload arrives — unless the user
  // explicitly picked a non-default pair (then only snap if the current
  // selection references a version that no longer exists).
  useEffect(() => {
    if (!latestId) return;
    if (userTouchedSelection) {
      setSelectedIdB((cur) => (versions.some((v) => v.id === cur) ? cur : latestId));
      setSelectedIdA((cur) => (versions.some((v) => v.id === cur) ? cur : previousId));
    } else {
      setSelectedIdA(previousId);
      setSelectedIdB(latestId);
    }
  }, [versions, latestId, previousId, userTouchedSelection]);

  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [pickerSide, setPickerSide] = useState<Side | null>(null);

  const assetA = versions.find((v) => v.id === selectedIdA) ?? versions[versions.length - 2];
  const assetB = versions.find((v) => v.id === selectedIdB) ?? versions[versions.length - 1];

  // ── Mixed-type guard: both sides must be the same media type ──────────────
  const typesMatch = assetA?.type === assetB?.type;
  const isVideo = typesMatch && assetA?.type === 'video';
  const isImage = typesMatch && assetA?.type === 'image';

  const urlA = assetA ? ((assetA as any).signedUrl || assetA.url) : '';
  const urlB = assetB ? ((assetB as any).signedUrl || assetB.url) : '';

  // ── Playback state ─────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const vuRef = useRef<VUMeterHandle>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [activeSide, setActiveSide] = useState<Side>('B');
  const [muted, setMuted] = useState(false);
  const [dimsA, setDimsA] = useState<{ w: number; h: number } | null>(null);
  const [dimsB, setDimsB] = useState<{ w: number; h: number } | null>(null);

  // VU meter show/hide — user preference persisted across sessions.
  const [showVU, setShowVU] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('compare-vumeter') !== 'off';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('compare-vumeter', showVU ? 'on' : 'off');
  }, [showVU]);

  // Ready = both dims known (or skipped for images — onLoad fires quickly).
  // Until ready we render the media at opacity-0 behind a spinner, so the user
  // doesn't see the frame rubber-band from 16:9 → aspectA → max(A,B).
  const mediaReady = !!(dimsA && dimsB);

  // Timeline covers the LONGER of the two so the user can scrub anywhere.
  const duration = Math.max(durationA, durationB);

  // ── Zoom + pan (wheel-anchored scale; drag to pan when zoomed) ─────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number }>({ mx: 0, my: 0, px: 0, py: 0 });

  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom if ctrl/meta held OR if the user is clearly over the video
    // (default wheel should still scroll the page outside the frame).
    // For compare we claim all wheel inside the frame.
    e.preventDefault();
    const frame = frameRef.current;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;

    const delta = -e.deltaY * 0.0015;
    setZoom((prevZoom) => {
      const newZoom = Math.max(1, Math.min(5, prevZoom * (1 + delta)));
      // Anchor zoom around cursor: keep the point under the cursor stationary.
      // Transform chain: translate(pan) → scale(zoom) around center.
      // Content coord at cursor BEFORE: (cx - r.w/2 - pan.x) / prevZoom
      // We want: after transform, same content coord maps to same cursor position.
      setPan((prevPan) => {
        if (newZoom === 1) return { x: 0, y: 0 }; // snap to center when fully zoomed out
        const contentX = (cx - r.width / 2 - prevPan.x) / prevZoom;
        const contentY = (cy - r.height / 2 - prevPan.y) / prevZoom;
        const newPanX = (cx - r.width / 2) - contentX * newZoom;
        const newPanY = (cy - r.height / 2) - contentY * newZoom;
        // Clamp so the zoomed content edges don't slide past the frame edges
        const maxPanX = ((newZoom - 1) * r.width) / 2;
        const maxPanY = ((newZoom - 1) * r.height) / 2;
        return {
          x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
          y: Math.max(-maxPanY, Math.min(maxPanY, newPanY)),
        };
      });
      return newZoom;
    });
  }, []);

  const handleFrameMouseDown = useCallback((e: React.MouseEvent) => {
    // Skip if user clicked the slider handle — let its own handler run.
    if ((e.target as HTMLElement).closest('[data-slider-handle]')) return;
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [zoom, pan.x, pan.y]);

  useEffect(() => {
    if (!isPanning) return;
    const frame = frameRef.current;
    const onMove = (e: MouseEvent) => {
      const r = frame?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      const maxPanX = ((zoom - 1) * r.width) / 2;
      const maxPanY = ((zoom - 1) * r.height) / 2;
      setPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, panStartRef.current.px + dx)),
        y: Math.max(-maxPanY, Math.min(maxPanY, panStartRef.current.py + dy)),
      });
    };
    const stop = () => setIsPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [isPanning, zoom]);

  // Reset zoom when switching versions or view mode (context change)
  useEffect(() => { resetZoom(); }, [selectedIdA, selectedIdB, viewMode, resetZoom]);

  // Active side = the master for playback sync (user listens to it).
  const masterRef = useCallback((): HTMLVideoElement | null => {
    return activeSide === 'A' ? videoARef.current : videoBRef.current;
  }, [activeSide]);
  const slaveRef = useCallback((): HTMLVideoElement | null => {
    return activeSide === 'A' ? videoBRef.current : videoARef.current;
  }, [activeSide]);

  // Audio in compare is controlled by video.muted (declaratively on each
  // <video> below). VUMeter no longer owns playback routing — it reads a
  // captureStream() side-channel for analysis only.

  // Close picker on outside click
  useEffect(() => {
    if (!pickerSide) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-picker]')) setPickerSide(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerSide]);

  // Keep the non-active side synced to the active side's currentTime.
  // Runs on master's timeupdate so the active side plays smoothly and the
  // inactive one catches up once per frame.
  useEffect(() => {
    const master = masterRef();
    if (!master) return;
    const onTime = () => {
      const slave = slaveRef();
      setCurrentTime(master.currentTime);
      if (slave && Math.abs(slave.currentTime - master.currentTime) > 0.1) {
        // Only seek the slave if the target is within its range; avoids seeks past end.
        if (slave.duration && master.currentTime <= slave.duration) {
          slave.currentTime = master.currentTime;
        }
      }
    };
    const onEnded = () => {
      // Master ended → pause slave too and update UI
      const slave = slaveRef();
      slave?.pause();
      setIsPlaying(false);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    master.addEventListener('timeupdate', onTime);
    master.addEventListener('ended', onEnded);
    master.addEventListener('pause', onPause);
    master.addEventListener('play', onPlay);
    return () => {
      master.removeEventListener('timeupdate', onTime);
      master.removeEventListener('ended', onEnded);
      master.removeEventListener('pause', onPause);
      master.removeEventListener('play', onPlay);
    };
  }, [masterRef, slaveRef]);

  // Track durations from each video independently
  useEffect(() => {
    const vA = videoARef.current;
    if (!vA) return;
    const onLoaded = () => setDurationA(vA.duration || 0);
    vA.addEventListener('loadedmetadata', onLoaded);
    if (vA.readyState >= 1) setDurationA(vA.duration || 0);
    return () => vA.removeEventListener('loadedmetadata', onLoaded);
  }, []);
  useEffect(() => {
    const vB = videoBRef.current;
    if (!vB) return;
    const onLoaded = () => setDurationB(vB.duration || 0);
    vB.addEventListener('loadedmetadata', onLoaded);
    if (vB.readyState >= 1) setDurationB(vB.duration || 0);
    return () => vB.removeEventListener('loadedmetadata', onLoaded);
  }, []);

  // Play / pause — audibility is handled by video.muted declaratively; Web Audio
  // is analysis-only so no context-resume dance needed. Kept synchronous to
  // keep the user gesture intact for play().
  const togglePlay = useCallback(() => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    const master = masterRef();
    if (!master) return;

    if (master.paused) {
      const slave = slaveRef();
      if (slave) slave.currentTime = master.currentTime;
      vA.volume = 1;
      vB.volume = 1;
      vuRef.current?.resume();   // resume analyser context so the meter updates
      Promise.all([vA.play(), vB.play()])
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn('[Compare] play() failed', e);
          setIsPlaying(false);
          vA.pause(); vB.pause();
        });
    } else {
      vA.pause();
      vB.pause();
      setIsPlaying(false);
    }
  }, [masterRef, slaveRef]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (!Number.isFinite(t) || t < 0) return;
    const vA = videoARef.current;
    const vB = videoBRef.current;
    // Clamp per-video to its own duration to avoid seeking past end
    if (vA && vA.readyState >= 1) vA.currentTime = Math.min(t, vA.duration || t);
    if (vB && vB.readyState >= 1) vB.currentTime = Math.min(t, vB.duration || t);
    setCurrentTime(t);
  }, []);

  // ── Slider drag (robust against lost mouseup) ─────────────────────────────
  const [sliderPos, setSliderPos] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  useEffect(() => {
    if (!isDragging) return;
    const frame = frameRef.current;
    const onMove = (e: MouseEvent) => {
      const r = frame?.getBoundingClientRect();
      if (!r || !r.width) return;
      setSliderPos(Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)));
    };
    const stop = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('pointercancel', stop);   // drag ended outside window / tab switch
    window.addEventListener('blur', stop);             // window lost focus
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [isDragging]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    setSliderPos(Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - r.left) / r.width)));
  }, []);
  useEffect(() => {
    if (!isDragging) return;
    const frame = frameRef.current;
    const onMove = (e: TouchEvent) => {
      const r = frame?.getBoundingClientRect();
      if (!r || !r.width) return;
      setSliderPos(Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - r.left) / r.width)));
    };
    const stop = () => setIsDragging(false);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', stop);
    window.addEventListener('touchcancel', stop);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
    };
  }, [isDragging]);

  const clipA = `inset(0 ${((1 - sliderPos) * 100).toFixed(2)}% 0 0)`;
  const clipB = `inset(0 0 0 ${(sliderPos * 100).toFixed(2)}%)`;

  // ── Shared display rect (JS-measured) ─────────────────────────────────────
  const aspectA = dimsA ? dimsA.w / dimsA.h : null;
  const aspectB = dimsB ? dimsB.w / dimsB.h : null;
  const sharedAspect =
    aspectA && aspectB ? Math.max(aspectA, aspectB) : aspectA ?? aspectB ?? 16 / 9;

  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const compute = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (!cw || !ch) return;
      const containerAspect = cw / ch;
      let fw: number, fh: number;
      if (sharedAspect >= containerAspect) {
        fw = cw; fh = cw / sharedAspect;
      } else {
        fh = ch; fw = ch * sharedAspect;
      }
      setFrameSize({ w: fw, h: fh });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [sharedAspect]);

  // Zoom/pan transform applied to BOTH videos identically so the split stays
  // aligned. Order matters: translate first, then scale around the result.
  const mediaTransform: React.CSSProperties = zoom === 1
    ? {}
    : { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' };

  // Side-by-side: explicit width on each half with a 12px gap between them.
  // Using width (not left+right) because some browsers are inconsistent when
  // `left` + `right` are both set alongside object-fit — explicit width avoids
  // any ambiguity in how the element's box is sized.
  const SBS_GAP_PX = 12;
  const SBS_HALF_OFFSET = SBS_GAP_PX / 2;  // 6px on each side of center
  const videoStyleA: React.CSSProperties = viewMode === 'slider'
    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: clipA, ...mediaTransform }
    : { position: 'absolute', top: 0, left: 0, width: `calc(50% - ${SBS_HALF_OFFSET}px)`, height: '100%', ...mediaTransform };
  const videoStyleB: React.CSSProperties = viewMode === 'slider'
    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: clipB, ...mediaTransform }
    : { position: 'absolute', top: 0, left: `calc(50% + ${SBS_HALF_OFFSET}px)`, width: `calc(50% - ${SBS_HALF_OFFSET}px)`, height: '100%', ...mediaTransform };

  const handleMetaA = () => {
    const v = videoARef.current;
    if (v?.videoWidth) setDimsA({ w: v.videoWidth, h: v.videoHeight });
  };
  const handleMetaB = () => {
    const v = videoBRef.current;
    if (v?.videoWidth) setDimsB({ w: v.videoWidth, h: v.videoHeight });
  };

  // ── Selection handlers (mark as user-touched so we don't auto-snap) ───────
  const handlePickerPick = useCallback((side: Side, id: string) => {
    setUserTouchedSelection(true);
    if (side === 'A') setSelectedIdA(id);
    else setSelectedIdB(id);
    setPickerSide(null);
  }, []);

  // ── Keyboard shortcuts (only while compare is mounted) ────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        setMuted((m) => !m);
        return;
      }
      if (e.code === 'Digit1') {
        e.preventDefault();
        setActiveSide('A');
        return;
      }
      if (e.code === 'Digit2') {
        e.preventDefault();
        setActiveSide('B');
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 / 30 : 5; // frame-advance with shift, else 5s
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        const vA = videoARef.current;
        const vB = videoBRef.current;
        const master = masterRef();
        if (!master) return;
        const newT = Math.max(0, Math.min(duration, master.currentTime + dir * step));
        if (vA && vA.readyState >= 1) vA.currentTime = Math.min(newT, vA.duration || newT);
        if (vB && vB.readyState >= 1) vB.currentTime = Math.min(newT, vB.duration || newT);
        setCurrentTime(newT);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, masterRef, duration]);

  // ── Render: gate on mismatched types ──────────────────────────────────────
  if (!assetA || !assetB) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/60 text-sm">
        Select two versions to compare.
      </div>
    );
  }
  if (!typesMatch) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/70 text-sm gap-3 px-8 text-center">
        <AlertCircle className="w-8 h-8 text-yellow-400" />
        <div>
          <p className="font-medium">Can&apos;t compare different media types</p>
          <p className="text-xs text-white/50 mt-1">V{assetA.version} is {assetA.type}, V{assetB.version} is {assetB.type}. Pick two of the same type.</p>
        </div>
      </div>
    );
  }

  const audioVersion = activeSide === 'A' ? assetA.version : assetB.version;

  return (
    <div className="flex flex-col h-full w-full bg-black">
      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-h-0 overflow-hidden select-none flex items-center justify-center" ref={containerRef}>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />

          {/* Shared display rect (see audit doc for why JS-sized). Wheel zoom and
              mouse-drag pan live at this level so both videos move in lockstep. */}
          <div
            ref={frameRef}
            className={`relative ${zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
            style={{
              width: frameSize?.w ?? '100%',
              height: frameSize?.h ?? '100%',
              overflow: 'hidden',
            }}
            onWheel={isVideo || isImage ? handleWheel : undefined}
            onMouseDown={handleFrameMouseDown}
            onDoubleClick={zoom > 1 ? resetZoom : undefined}
          >
            {/* Opacity gate: keep media hidden until both dimensions are known so
                the frame doesn't visibly rubber-band as metadata arrives. */}
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${mediaReady ? 'opacity-100' : 'opacity-0'}`}
            >
              {isVideo ? (
                <>
                  <video
                    ref={videoBRef}
                    src={urlB}
                    crossOrigin="anonymous"
                    className="object-contain"
                    style={videoStyleB}
                    muted={activeSide !== 'B' || muted}
                    playsInline
                    preload="auto"
                    onLoadedMetadata={handleMetaB}
                  />
                  <video
                    ref={videoARef}
                    src={urlA}
                    crossOrigin="anonymous"
                    className="object-contain"
                    style={videoStyleA}
                    muted={activeSide !== 'A' || muted}
                    playsInline
                    preload="auto"
                    onLoadedMetadata={handleMetaA}
                  />
                </>
              ) : isImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlB} alt={`V${assetB.version}`} className="object-contain" style={videoStyleB} draggable={false} onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth) setDimsB({ w: t.naturalWidth, h: t.naturalHeight }); }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlA} alt={`V${assetA.version}`} className="object-contain" style={videoStyleA} draggable={false} onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth) setDimsA({ w: t.naturalWidth, h: t.naturalHeight }); }} />
                </>
              ) : null}
            </div>

            {/* Loading spinner shown only until media is ready */}
            {!mediaReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
              </div>
            )}

            {/* Slider handle */}
            {viewMode === 'slider' && (
              <>
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos * 100}%` }} />
                <div
                  data-slider-handle
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center cursor-ew-resize z-10"
                  style={{ left: `${sliderPos * 100}%` }}
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                  onTouchStart={handleTouchStart}
                >
                  <div className="flex gap-0.5">
                    <div className="w-0.5 h-4 bg-gray-400 rounded" />
                    <div className="w-0.5 h-4 bg-gray-400 rounded" />
                  </div>
                </div>
              </>
            )}

            {/* No explicit divider needed in side-by-side — the 12px black gap
                between the two videos is already a clear separator. */}

            {/* Zoom controls — appear bottom-right of the frame */}
            {(isVideo || isImage) && (
              <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg p-1 pointer-events-auto">
                <button
                  onClick={() => {
                    const r = frameRef.current?.getBoundingClientRect();
                    if (!r) return;
                    handleWheel({ preventDefault: () => {}, deltaY: -150, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } as any);
                  }}
                  title="Zoom in"
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-white/60 tabular-nums w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
                <button
                  onClick={() => {
                    const r = frameRef.current?.getBoundingClientRect();
                    if (!r) return;
                    handleWheel({ preventDefault: () => {}, deltaY: 150, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } as any);
                  }}
                  title="Zoom out"
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                {zoom > 1 && (
                  <button
                    onClick={resetZoom}
                    title="Reset zoom (double-click anywhere)"
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Labels — pinned to the FRAME corners (so they stay next to the video even with pillarbox) */}
            <div className="absolute top-3 left-3 z-10 pointer-events-auto">
              <VersionLabel
                side="A"
                asset={assetA}
                versions={versions}
                isOpen={pickerSide === 'A'}
                onTogglePicker={(s) => setPickerSide((p) => (p === s ? null : s))}
                onPick={handlePickerPick}
              />
            </div>
            <div className="absolute top-3 right-3 z-10 pointer-events-auto">
              <VersionLabel
                side="B"
                asset={assetB}
                versions={versions}
                isOpen={pickerSide === 'B'}
                onTogglePicker={(s) => setPickerSide((p) => (p === s ? null : s))}
                onPick={handlePickerPick}
              />
            </div>
          </div>
        </div>

        {/* VU meter strip — toggleable. When hidden, VUMeter is NOT mounted so
            it doesn't consume resources, but the audio still routes through the
            cached Web Audio graph (created on first mount via the singleton). */}
        {isVideo && showVU && (
          <div className="flex-shrink-0 w-24 flex flex-col bg-[#0a0a0a] border-l border-white/5">
            <div className={`flex-1 min-h-0 flex flex-col transition-opacity ${muted ? 'opacity-30' : 'opacity-100'}`}>
              <VUMeter
                ref={vuRef}
                videoRefs={[videoARef, videoBRef]}
                activeIndex={activeSide === 'A' ? 0 : 1}
                isPlaying={isPlaying && !muted}
              />
            </div>
            <div className="flex-shrink-0 border-t border-white/5 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/50 text-center">
              Audio: V{audioVersion}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isVideo && (
        <div className="flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={togglePlay}
            title="Play / Pause (Space)"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" fill="white" /> : <Play className="w-4 h-4 ml-0.5" fill="white" />}
          </button>
          <span className="text-xs text-white/60 font-mono w-12 text-right flex-shrink-0">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            onChange={handleSeek}
            className="flex-1 h-1 accent-frame-accent"
          />
          <span className="text-xs text-white/60 font-mono w-12 flex-shrink-0">{formatDuration(duration)}</span>

          {/* Audio source toggle — single source of truth, with keyboard hints */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10 ml-1">
            <AudioLines className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setActiveSide('A')}
                title={`Listen to V${assetA.version} (1)`}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  activeSide === 'A' ? 'bg-frame-accent text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                V{assetA.version}
              </button>
              <button
                onClick={() => setActiveSide('B')}
                title={`Listen to V${assetB.version} (2)`}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  activeSide === 'B' ? 'bg-frame-accent text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                V{assetB.version}
              </button>
            </div>
          </div>

          <button
            onClick={() => setMuted((m) => !m)}
            title={`${muted ? 'Unmute' : 'Mute'} (M)`}
            className="text-white/60 hover:text-white transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowVU((v) => !v)}
            title={`${showVU ? 'Hide' : 'Show'} VU meter`}
            className={`transition-colors ${showVU ? 'text-frame-accent hover:text-frame-accentHover' : 'text-white/40 hover:text-white/70'}`}
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
