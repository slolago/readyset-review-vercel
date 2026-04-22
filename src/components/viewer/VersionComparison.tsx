'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Play, Pause, Volume2, VolumeX, ChevronDown, ChevronLeft, ChevronRight, Columns2, SplitSquareHorizontal, AudioLines, AlertCircle, ZoomIn, ZoomOut, Maximize, Maximize2, Activity } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { VUMeter, type VUMeterHandle } from './VUMeter';
import { PlayerBgPicker } from './PlayerBgPicker';
import { usePlayerBg } from '@/hooks/usePlayerBg';
import type { Asset } from '@/types';

type ViewMode = 'slider' | 'side-by-side';
type Side = 'A' | 'B';

interface VersionComparisonProps {
  versions: Asset[];
}

// ── Extracted components (not inlined so they don't remount on every parent render) ──

const VersionLabel = memo(function VersionLabel({
  side, asset, versions, isOpen, onTogglePicker, onPick, expectedType,
}: {
  side: Side;
  asset: Asset;
  versions: Asset[];
  isOpen: boolean;
  onTogglePicker: (side: Side) => void;
  onPick: (side: Side, id: string) => void;
  /**
   * Type the other side is currently showing. Versions of a different type
   * would trigger the mixed-type error screen, so they render disabled with
   * a tooltip explaining why — a cleaner UX than error-then-fix.
   */
  expectedType: Asset['type'];
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
          {versions.map((v) => {
            const incompatible = v.type !== expectedType;
            return (
              <button
                key={v.id}
                data-picker
                onClick={() => { if (!incompatible) onPick(side, v.id); }}
                disabled={incompatible}
                title={incompatible ? `Can't compare ${v.type} with ${expectedType}` : undefined}
                className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${
                  incompatible
                    ? 'text-white/25 cursor-not-allowed'
                    : v.id === asset.id
                    ? 'text-frame-accent font-semibold hover:bg-frame-cardHover'
                    : 'text-white hover:bg-frame-cardHover'
                }`}
              >
                V{v.version} — {v.name}
                {incompatible && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                    · {v.type}
                  </span>
                )}
              </button>
            );
          })}
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

  const urlA = assetA ? ((assetA as any).signedUrl ?? '') : '';
  const urlB = assetB ? ((assetB as any).signedUrl ?? '') : '';

  // ── Playback state ─────────────────────────────────────────────────────────
  const wrapperRef = useRef<HTMLDivElement>(null);
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
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [timecodeMode, setTimecodeMode] = useState<'mmss' | 'smpte'>('mmss');
  const [dimsA, setDimsA] = useState<{ w: number; h: number } | null>(null);
  const [dimsB, setDimsB] = useState<{ w: number; h: number } | null>(null);
  // Per-side load errors for image mode (broken URL, CORS, SVG with no
  // intrinsic size). Surfaced inline so mediaReady doesn't spin forever.
  const [errA, setErrA] = useState(false);
  const [errB, setErrB] = useState(false);

  // VU meter show/hide — user preference persisted across sessions.
  const [showVU, setShowVU] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('compare-vumeter') !== 'off';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('compare-vumeter', showVU ? 'on' : 'off');
  }, [showVU]);
  const [playerBg, setPlayerBg] = usePlayerBg();

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

  // Track mousedown position so handleFrameClick can distinguish a real click
  // from a drag/pan (drags shouldn't toggle play).
  const mouseDownAt = useRef<{ x: number; y: number } | null>(null);

  const handleFrameMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownAt.current = { x: e.clientX, y: e.clientY };
    // Skip if user clicked the slider handle — let its own handler run.
    if ((e.target as HTMLElement).closest('[data-slider-handle]')) return;
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [zoom, pan.x, pan.y]);

  // togglePlay is declared below; use a ref so handleFrameClick can call the
  // latest version without creating a TDZ forward-reference.
  const togglePlayRef = useRef<() => void>(() => {});

  const handleFrameClick = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on interactive overlays (handle, buttons, pickers, etc.)
    const target = e.target as HTMLElement;
    if (target.closest('[data-slider-handle]')) return;
    if (target.closest('button')) return;
    if (target.closest('[data-picker]')) return;
    // Ignore if this was a drag rather than a click
    const start = mouseDownAt.current;
    if (start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > 25) return; // >5px moved = drag, not click
    }
    togglePlayRef.current();
  }, []);

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

  // When a side changes its asset (user picked a different version), clear
  // that side's cached dims + error so the spinner comes back until the new
  // media loads. Without this, the frame briefly sizes to the OLD aspect
  // ratio while the new image/video is still loading.
  useEffect(() => { setDimsA(null); setErrA(false); }, [selectedIdA]);
  useEffect(() => { setDimsB(null); setErrB(false); }, [selectedIdB]);

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

  // Track durations from each video independently. Deps include selectedIdA
  // / selectedIdB so when the user picks a different version the effect
  // re-runs: we reset durationA/B to 0 (scrubber max reflects the new src
  // while it loads) and re-attach the loadedmetadata listener so the fresh
  // duration lands once metadata arrives.
  useEffect(() => {
    const vA = videoARef.current;
    if (!vA) return;
    setDurationA(0);
    const onLoaded = () => setDurationA(vA.duration || 0);
    vA.addEventListener('loadedmetadata', onLoaded);
    if (vA.readyState >= 1) setDurationA(vA.duration || 0);
    return () => vA.removeEventListener('loadedmetadata', onLoaded);
  }, [selectedIdA]);
  useEffect(() => {
    const vB = videoBRef.current;
    if (!vB) return;
    setDurationB(0);
    const onLoaded = () => setDurationB(vB.duration || 0);
    vB.addEventListener('loadedmetadata', onLoaded);
    if (vB.readyState >= 1) setDurationB(vB.duration || 0);
    return () => vB.removeEventListener('loadedmetadata', onLoaded);
  }, [selectedIdB]);

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

  // Keep the ref pointed at the latest togglePlay so the click handler always
  // invokes a fresh closure (master/slave state, etc.)
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

  // ── Frame stepping (matches VideoPlayer) ──────────────────────────────────
  const DEFAULT_FPS = 30;
  const stepFrame = useCallback((dir: 1 | -1) => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB) return;
    vA.pause(); vB.pause();
    setIsPlaying(false);
    const newT = Math.max(0, Math.min(duration, (masterRef()?.currentTime ?? 0) + dir / DEFAULT_FPS));
    if (vA.readyState >= 1) vA.currentTime = Math.min(newT, vA.duration || newT);
    if (vB.readyState >= 1) vB.currentTime = Math.min(newT, vB.duration || newT);
    setCurrentTime(newT);
  }, [duration, masterRef]);

  // ── Scrubber (matches VideoPlayer styling + behavior) ─────────────────────
  const handleSeekClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (vA && vA.readyState >= 1) vA.currentTime = Math.min(t, vA.duration || t);
    if (vB && vB.readyState >= 1) vB.currentTime = Math.min(t, vB.duration || t);
    setCurrentTime(t);
  }, [duration]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setScrubbing(true);
    handleSeekClick(e);
    const trackEl = e.currentTarget;
    const onMove = (ev: MouseEvent) => {
      const rect = trackEl.getBoundingClientRect();
      const t = Math.max(0, Math.min(duration, ((ev.clientX - rect.left) / rect.width) * duration));
      const vA = videoARef.current;
      const vB = videoBRef.current;
      if (vA && vA.readyState >= 1) vA.currentTime = Math.min(t, vA.duration || t);
      if (vB && vB.readyState >= 1) vB.currentTime = Math.min(t, vB.duration || t);
      setCurrentTime(t);
    };
    const onUp = () => {
      setScrubbing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [duration, handleSeekClick]);

  // ── Volume (native — applied to both videos, muted one still outputs silence) ─
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (v === 0) setMuted(true);
    else setMuted(false);
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (vA) vA.volume = v;
    if (vB) vB.volume = v;
  }, []);

  // Sync volume & playbackRate to both videos reactively
  useEffect(() => {
    if (videoARef.current) videoARef.current.volume = volume;
    if (videoBRef.current) videoBRef.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (videoARef.current) videoARef.current.playbackRate = playbackRate;
    if (videoBRef.current) videoBRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapperRef.current?.requestFullscreen();
  }, []);

  // ── Display helpers ───────────────────────────────────────────────────────
  const displayTime = useCallback((t: number): string => {
    if (timecodeMode === 'smpte') {
      const totalFrames = Math.floor(t * DEFAULT_FPS);
      const frames = totalFrames % DEFAULT_FPS;
      const totalSeconds = Math.floor(t);
      const mm = Math.floor(totalSeconds / 60);
      const ss = totalSeconds % 60;
      return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    }
    return formatDuration(t);
  }, [timecodeMode]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
  // Grabbing the slider handle while zoomed misaligns the split boundary
  // from the transformed media content (clip-path is in media-local space,
  // handle is in frame-space). The simplest correct fix is to reset zoom
  // the moment the user grabs the handle — they were inspecting detail,
  // now they want the split authoritative again.
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resetZoom();
    setIsDragging(true);
  }, [resetZoom]);
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
    resetZoom();
    setIsDragging(true);
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    setSliderPos(Math.max(0.02, Math.min(0.98, (e.touches[0].clientX - r.left) / r.width)));
  }, [resetZoom]);
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

  // Frame sizing is viewMode-aware:
  //   - Slider: fit sharedAspect inside the container (letterbox/pillarbox)
  //     so both videos occupy the SAME visible rect → clip-path split aligns.
  //   - Side-by-side: frame IS the full container. Each video uses its half
  //     at full container height, object-contain letterboxing individually.
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const compute = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (!cw || !ch) return;
      if (viewMode === 'side-by-side') {
        setFrameSize({ w: cw, h: ch });
        return;
      }
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
  }, [sharedAspect, viewMode]);

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
      if (typeof document !== 'undefined' && document.body.dataset.modalOpen === 'true') return;
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ── Shortcuts that apply to BOTH videos + images ─────────────
      if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      // W — swap A ↔ B in whatever pair is active.
      if (e.code === 'KeyW') {
        e.preventDefault();
        setUserTouchedSelection(true);
        setSelectedIdA(selectedIdB);
        setSelectedIdB(selectedIdA);
        return;
      }
      // +/= (zoom in) and - / _ (zoom out). Mimics the toolbar buttons.
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        const r = frameRef.current?.getBoundingClientRect();
        if (r) handleWheel({
          preventDefault: () => {}, deltaY: -150,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        } as unknown as React.WheelEvent);
        return;
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        const r = frameRef.current?.getBoundingClientRect();
        if (r) handleWheel({
          preventDefault: () => {}, deltaY: 150,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        } as unknown as React.WheelEvent);
        return;
      }
      // 0 — center the slider (slider mode only). Shift+0 additionally
      // resets zoom/pan, acting like a full "view reset".
      if (e.code === 'Digit0') {
        e.preventDefault();
        if (viewMode === 'slider') setSliderPos(0.5);
        if (e.shiftKey) resetZoom();
        return;
      }

      // ── Image-only shortcuts ──────────────────────────────────────
      if (isImage) {
        if (e.code === 'KeyS') {
          e.preventDefault();
          setViewMode((m) => (m === 'slider' ? 'side-by-side' : 'slider'));
          return;
        }
        // Arrow keys nudge the slider handle in slider mode. ±1% per
        // press; Shift makes it ±10% for quick jumps.
        if (
          viewMode === 'slider' &&
          (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
        ) {
          e.preventDefault();
          const delta = (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01);
          setSliderPos((p) => Math.max(0.02, Math.min(0.98, p + delta)));
          return;
        }
        return;
      }
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
  }, [togglePlay, masterRef, duration, toggleFullscreen, isImage, viewMode, selectedIdA, selectedIdB, handleWheel, resetZoom]);

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
    <div
      ref={wrapperRef}
      className="flex flex-col h-full w-full"
      style={{ backgroundColor: playerBg }}
    >
      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-h-0 overflow-hidden select-none flex items-center justify-center" ref={containerRef}>
          {/* Shared display rect (see audit doc for why JS-sized). Wheel zoom and
              mouse-drag pan live at this level so both videos move in lockstep. */}
          <div
            ref={frameRef}
            className={`relative ${zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : isVideo ? 'cursor-pointer' : ''}`}
            style={{
              width: frameSize?.w ?? '100%',
              height: frameSize?.h ?? '100%',
              overflow: 'hidden',
            }}
            onWheel={isVideo || isImage ? handleWheel : undefined}
            onMouseDown={handleFrameMouseDown}
            onClick={isVideo ? handleFrameClick : undefined}
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
                    key={`compare-B-${assetB.id}`}
                    ref={videoBRef}
                    src={urlB}
                    crossOrigin="anonymous"
                    className="object-contain"
                    style={videoStyleB}
                    muted={activeSide !== 'B' || muted}
                    playsInline
                    preload="auto"
                    onLoadedMetadata={handleMetaB}
                    onError={() => setErrB(true)}
                  />
                  <video
                    key={`compare-A-${assetA.id}`}
                    ref={videoARef}
                    src={urlA}
                    crossOrigin="anonymous"
                    className="object-contain"
                    style={videoStyleA}
                    muted={activeSide !== 'A' || muted}
                    playsInline
                    preload="auto"
                    onLoadedMetadata={handleMetaA}
                    onError={() => setErrA(true)}
                  />
                </>
              ) : isImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`compare-B-${assetB.id}`}
                    src={urlB}
                    alt={`V${assetB.version}`}
                    className="object-contain"
                    style={videoStyleB}
                    draggable={false}
                    onLoad={(e) => {
                      const t = e.currentTarget;
                      // SVGs without an intrinsic size report naturalWidth=0.
                      // Fall back to the element's layout box so mediaReady
                      // still flips and the frame uses a sensible 1:1 aspect.
                      const w = t.naturalWidth || t.clientWidth || 1;
                      const h = t.naturalHeight || t.clientHeight || 1;
                      setDimsB({ w, h });
                    }}
                    onError={() => setErrB(true)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`compare-A-${assetA.id}`}
                    src={urlA}
                    alt={`V${assetA.version}`}
                    className="object-contain"
                    style={videoStyleA}
                    draggable={false}
                    onLoad={(e) => {
                      const t = e.currentTarget;
                      const w = t.naturalWidth || t.clientWidth || 1;
                      const h = t.naturalHeight || t.clientHeight || 1;
                      setDimsA({ w, h });
                    }}
                    onError={() => setErrA(true)}
                  />
                </>
              ) : null}
            </div>

            {/* Load error — replaces the spinner when either side fails
                to load. Otherwise an unreadable signed URL would spin
                forever. */}
            {(errA || errB) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm">
                <AlertCircle className="w-7 h-7 text-red-400" />
                <p className="text-xs text-white/80">
                  Failed to load {errA && errB ? 'both versions' : errA ? `V${assetA.version}` : `V${assetB.version}`}
                </p>
              </div>
            )}

            {/* Loading spinner shown only until media is ready */}
            {!mediaReady && !errA && !errB && (
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
                // Incompatible = different type from the OTHER side. Both
                // sides use assetB/assetA as the anchor respectively.
                expectedType={assetB.type}
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
                expectedType={assetA.type}
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

      {/* Controls — mirrors VideoPlayer exactly (same bg, same structure) */}
      {isVideo && (
        <div className="flex-shrink-0 bg-[#111] border-t border-white/5 px-4 pt-2 pb-3 space-y-2">
          {/* Scrubber — same style as single-video player */}
          <div className="relative">
            <div
              className="relative h-2 bg-white/15 rounded-full cursor-pointer group"
              onMouseDown={handleSeekMouseDown}
              onClick={handleSeekClick}
            >
              <div
                className="absolute left-0 top-0 h-full bg-frame-accent rounded-full pointer-events-none"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play/pause */}
            <button
              onClick={togglePlay}
              title="Play / Pause (Space)"
              className="w-8 h-8 flex items-center justify-center text-white hover:text-frame-accent transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
            </button>

            {/* Frame step */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => stepFrame(-1)}
                title="Previous frame (Shift+←)"
                className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => stepFrame(1)}
                title="Next frame (Shift+→)"
                className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Timecode */}
            <button
              onClick={() => setTimecodeMode((m) => m === 'mmss' ? 'smpte' : 'mmss')}
              title={timecodeMode === 'mmss' ? 'Switch to SMPTE (MM:SS:FF)' : 'Switch to MM:SS'}
              className="font-mono text-xs tabular-nums flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors"
            >
              <span className="text-white">{displayTime(currentTime)}</span>
              <span className="text-white/30">/</span>
              <span className="text-white/50">{displayTime(duration)}</span>
            </button>

            <div className="flex-1" />

            {/* View mode toggle — compare-specific (slider vs side-by-side) */}
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('slider')}
                title="Slider"
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'slider' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('side-by-side')}
                title="Side by side"
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'side-by-side' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Audio source selector — the ONE thing that's compare-specific */}
            <div className="flex items-center gap-1.5">
              <AudioLines className="w-3.5 h-3.5 text-white/50" />
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

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newMuted = !muted;
                  setMuted(newMuted);
                }}
                title={`${muted ? 'Unmute' : 'Mute'} (M)`}
                className="text-white/60 hover:text-white transition-colors"
              >
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 cursor-pointer appearance-none h-1 rounded-full outline-none"
                style={{ background: `linear-gradient(to right, #7a00df 0%, #7a00df ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) 100%)` }}
              />
            </div>

            {/* VU meter toggle */}
            <button
              onClick={() => setShowVU((v) => !v)}
              title={`${showVU ? 'Hide' : 'Show'} VU meter`}
              className={`transition-colors ${showVU ? 'text-frame-accent hover:text-frame-accentHover' : 'text-white/40 hover:text-white/70'}`}
            >
              <Activity className="w-4 h-4" />
            </button>

            {/* Background color picker */}
            <PlayerBgPicker value={playerBg} onChange={setPlayerBg} />

            {/* Speed */}
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="bg-transparent text-white/60 hover:text-white text-xs border border-white/10 rounded px-1.5 py-1 cursor-pointer focus:outline-none"
            >
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r} className="bg-[#111] text-white">{r}x</option>
              ))}
            </select>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
              className="text-white/60 hover:text-white transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Image controls — lightweight strip with view mode + bg + fullscreen.
          Playback/audio/timecode/VU rows don't apply to images, but the user
          still needs to flip between slider and side-by-side and the bg
          picker + fullscreen are useful everywhere. */}
      {isImage && (
        <div className="flex-shrink-0 bg-[#111] border-t border-white/5 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex-1" />

            {/* View mode toggle (slider vs side-by-side) */}
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('slider')}
                title="Slider"
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'slider' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('side-by-side')}
                title="Side by side"
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'side-by-side' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Background color picker */}
            <PlayerBgPicker value={playerBg} onChange={setPlayerBg} />

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
              className="text-white/60 hover:text-white transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
