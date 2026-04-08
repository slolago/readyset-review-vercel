'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { Asset, Comment, AnnotationTool, AnnotationColor } from '@/types';
import { AnnotationCanvas, AnnotationCanvasHandle } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { SafeZonesOverlay } from './SafeZonesOverlay';
import { SafeZoneSelector } from './SafeZoneSelector';
import { VUMeter, type VUMeterHandle } from './VUMeter';
import { formatDuration } from '@/lib/utils';
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Pencil, X, Maximize } from 'lucide-react';

interface VideoPlayerProps {
  asset: Asset;
  comments: Comment[];
  onTimeUpdate?: (time: number) => void;
  onUserInteraction?: () => void;
  isAnnotationMode: boolean;
  displayShapes?: string | null;
  onRequestAnnotation: () => void;
  onAnnotationCapture: (shapes: string) => void;
  onAnnotationCancel: () => void;
  onCommentClick?: (comment: Comment) => void;
  // Called when annotation mode starts so the sidebar can focus the textarea
  onAnnotationStarted?: () => void;
}

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
  pause: () => void;
  getCurrentTime: () => number;
  captureAnnotation: () => string;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_FPS = 30;
const SKIP_SECONDS = 5;

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  asset, comments, onTimeUpdate, onUserInteraction,
  isAnnotationMode, displayShapes,
  onRequestAnnotation, onAnnotationCapture, onAnnotationCancel,
  onCommentClick, onAnnotationStarted,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<AnnotationCanvasHandle>(null);
  const vuMeterRef = useRef<VUMeterHandle>(null);
  const animRef    = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [videoRect, setVideoRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [tool, setTool] = useState<AnnotationTool>('rectangle');
  const [color, setColor] = useState<AnnotationColor>('red');
  const [hoveredComment, setHoveredComment] = useState<Comment | null>(null);
  const [tooltipPct, setTooltipPct] = useState(0);
  const [timecodeMode, setTimecodeMode] = useState<'mmss' | 'smpte'>('mmss');
  const [activeSafeZone, setActiveSafeZone] = useState<string | null>(null);
  const [safeZoneOpacity, setSafeZoneOpacity] = useState(1);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    },
    pause: () => { videoRef.current?.pause(); setPlaying(false); },
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    captureAnnotation: () => {
      const shapes = canvasRef.current?.getShapesJSON() ?? '[]';
      canvasRef.current?.clear();
      return shapes;
    },
  }));

  // Pause when annotation mode activates
  useEffect(() => {
    if (isAnnotationMode) { videoRef.current?.pause(); setPlaying(false); }
  }, [isAnnotationMode]);

  // Compute actual video rect (letterbox/pillarbox)
  const computeVideoRect = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth) return;
    const cw = container.clientWidth, ch = container.clientHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const videoAspect = vw / vh, containerAspect = cw / ch;
    let dw: number, dh: number, dx: number, dy: number;
    if (videoAspect > containerAspect) {
      dw = cw; dh = cw / videoAspect; dx = 0; dy = (ch - dh) / 2;
    } else {
      dh = ch; dw = ch * videoAspect; dx = (cw - dw) / 2; dy = 0;
    }
    setVideoRect({ x: dx, y: dy, w: dw, h: dh });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener('loadedmetadata', computeVideoRect);
    const ro = new ResizeObserver(computeVideoRect);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { video.removeEventListener('loadedmetadata', computeVideoRect); ro.disconnect(); };
  }, [computeVideoRect]);

  // rAF time tracking — throttled so setCurrentTime/onTimeUpdate only fire
  // when time changes by more than 0.25 s (or while scrubbing for smooth scrubber).
  useEffect(() => {
    let lastReported = -1;
    const TIME_THRESHOLD = 0.25;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const t = v.currentTime;
        if (scrubbing || Math.abs(t - lastReported) >= TIME_THRESHOLD) {
          lastReported = t;
          setCurrentTime(t);
          onTimeUpdate?.(t);
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [scrubbing, onTimeUpdate]);

  // ── Keyboard shortcuts (Frame.io style) ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs/textareas
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (isAnnotationMode) return;

      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          onUserInteraction?.();
          if (v.paused) {
            vuMeterRef.current?.resume();
            v.play().catch(() => {});
            setPlaying(true);
          } else {
            v.pause();
            setPlaying(false);
          }
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          onUserInteraction?.();
          v.pause(); setPlaying(false);
          v.currentTime = Math.max(0, v.currentTime - SKIP_SECONDS);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          onUserInteraction?.();
          v.currentTime = Math.min(duration, v.currentTime + SKIP_SECONDS);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onUserInteraction?.();
          v.pause(); setPlaying(false);
          // Shift+← = 1 frame back, plain ← = 5s back
          v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 1 / DEFAULT_FPS : SKIP_SECONDS));
          setCurrentTime(v.currentTime);
          onTimeUpdate?.(v.currentTime);
          break;
        case 'ArrowRight':
          e.preventDefault();
          onUserInteraction?.();
          v.pause(); setPlaying(false);
          // Shift+→ = 1 frame forward, plain → = 5s forward
          v.currentTime = Math.min(duration, v.currentTime + (e.shiftKey ? 1 / DEFAULT_FPS : SKIP_SECONDS));
          setCurrentTime(v.currentTime);
          onTimeUpdate?.(v.currentTime);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
          setMuted(v.muted);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen();
          else wrapperRef.current?.requestFullscreen();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          // Focus comment textarea — dispatch a custom event the sidebar listens to
          window.dispatchEvent(new CustomEvent('focus-comment-input'));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAnnotationMode, duration, onUserInteraction]);

  // Ctrl+Z in annotation mode
  useEffect(() => {
    if (!isAnnotationMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        canvasRef.current?.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAnnotationMode]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    onUserInteraction?.();
    if (v.paused) {
      vuMeterRef.current?.resume(); // inside user gesture → AudioContext.resume() is permitted
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const stepFrame = (dir: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    onUserInteraction?.();
    v.pause(); setPlaying(false);
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + dir / DEFAULT_FPS));
    setCurrentTime(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setScrubbing(true);
    onUserInteraction?.();
    handleSeekClick(e);
    const trackEl = e.currentTarget;
    const onMove = (ev: MouseEvent) => {
      const rect = trackEl.getBoundingClientRect();
      const t = Math.max(0, Math.min(duration, ((ev.clientX - rect.left) / rect.width) * duration));
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
    };
    const onUp = () => { setScrubbing(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v); setMuted(v === 0);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const setRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const handleAnnotationCapture = () => {
    const shapes = canvasRef.current?.getShapesJSON() || '[]';
    canvasRef.current?.clear();
    onAnnotationCapture(shapes);
  };

  const handleAnnotationCancel = () => {
    canvasRef.current?.clear();
    onAnnotationCancel();
  };

  const formatSMPTE = (t: number) => {
    const totalFrames = Math.floor(t * DEFAULT_FPS);
    const frames = totalFrames % DEFAULT_FPS;
    const totalSecs = Math.floor(t);
    const secs = totalSecs % 60;
    const mins = Math.floor(totalSecs / 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  const displayTime = (t: number) => timecodeMode === 'smpte' ? formatSMPTE(t) : formatDuration(t);

  const timedComments = comments
    .filter((c) => c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div ref={wrapperRef} className="w-full h-full flex flex-col bg-black select-none">
      {/* Video area + VU meter side strip */}
      <div className="flex-1 flex flex-row overflow-hidden">
      {/* Video area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onClick={() => { if (!isAnnotationMode) togglePlay(); }}
        style={{ cursor: isAnnotationMode ? 'default' : 'pointer' }}
      >
        <video
          ref={videoRef}
          src={(asset as any).signedUrl as string | undefined}
          crossOrigin="anonymous"
          className="w-full h-full object-contain"
          playsInline preload="auto"
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); computeVideoRect(); }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Annotation canvas overlay */}
        {(isAnnotationMode || (displayShapes && displayShapes !== '[]')) && videoRect.w > 0 && (
          <div style={{ position: 'absolute', left: videoRect.x, top: videoRect.y, width: videoRect.w, height: videoRect.h, pointerEvents: isAnnotationMode ? 'all' : 'none' }}>
            <AnnotationCanvas
              key={isAnnotationMode ? 'drawing' : `readonly-${displayShapes}`}
              ref={canvasRef}
              width={videoRect.w} height={videoRect.h}
              tool={tool} color={color}
              isActive={isAnnotationMode}
              readOnlyShapes={isAnnotationMode ? undefined : (displayShapes ?? undefined)}
            />
          </div>
        )}

        {/* Safe zones overlay */}
        {activeSafeZone && videoRect.w > 0 && (
          <div style={{ position: 'absolute', left: videoRect.x, top: videoRect.y, width: videoRect.w, height: videoRect.h, pointerEvents: 'none', zIndex: 5 }}>
            <SafeZonesOverlay videoRect={videoRect} safeZone={activeSafeZone} opacity={safeZoneOpacity} />
          </div>
        )}

        {/* Annotation toolbar */}
        {isAnnotationMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-20">
            <AnnotationToolbar
              tool={tool} color={color}
              onToolChange={setTool} onColorChange={setColor}
              onUndo={() => canvasRef.current?.undo()}
              onClear={() => canvasRef.current?.clear()}
            />
            <div className="flex gap-2">
              <button onClick={handleAnnotationCapture} className="px-5 py-2 bg-frame-accent hover:bg-frame-accentHover text-white text-sm font-medium rounded-lg shadow-lg transition-colors">
                Attach to comment
              </button>
              <button onClick={handleAnnotationCancel} className="p-2 bg-black/70 hover:bg-black/90 text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Read-only annotation label */}
        {!isAnnotationMode && displayShapes && displayShapes !== '[]' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-frame-accent/80 backdrop-blur-sm text-white text-xs rounded-full z-10 pointer-events-none">
            Showing annotation
          </div>
        )}
      </div>

      {/* VU Meter — right side strip */}
      <div className="flex-shrink-0 w-7 flex flex-col bg-[#0a0a0a] border-l border-white/5">
        <VUMeter ref={vuMeterRef} videoRef={videoRef} isPlaying={playing} />
      </div>

      </div>{/* end flex-row */}

      {/* ── Controls ── */}
      <div className="flex-shrink-0 bg-[#111] border-t border-white/5 px-4 pt-2 pb-3 space-y-2">

        {/* Timeline */}
        <div className="relative">
          {/* Comment markers */}
          {duration > 0 && timedComments.length > 0 && (
            <div className="relative h-4 mb-0.5">
              {timedComments.map((c) => {
                const pct = ((c.timestamp ?? 0) / duration) * 100;
                const hasAnnotation = !!(c.annotation?.shapes && c.annotation.shapes !== '[]');
                return (
                  <div
                    key={c.id}
                    style={{ left: `${pct}%` }}
                    className="absolute top-0 -translate-x-1/2 group/marker"
                    onMouseEnter={() => { setHoveredComment(c); setTooltipPct(pct); }}
                    onMouseLeave={() => setHoveredComment(null)}
                  >
                    <button
                      onClick={() => onCommentClick?.(c)}
                      className="w-3 h-3 rounded-full border-2 border-black transition-transform group-hover/marker:scale-125"
                      style={{ backgroundColor: hasAnnotation ? '#fbbf24' : '#6c5ce7', display: 'block' }}
                    />

                    {/* Tooltip — shift right when near left edge, left when near right edge */}
                    {hoveredComment?.id === c.id && (
                      <div
                        className="absolute bottom-5 z-30 pointer-events-none"
                        style={{
                          minWidth: 180, maxWidth: 240,
                          ...(pct < 20
                            ? { left: 0 }
                            : pct > 80
                            ? { right: 0 }
                            : { left: '50%', transform: 'translateX(-50%)' }),
                        }}
                      >
                        <div className="bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl p-2.5 text-left">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-mono text-frame-accent font-medium">
                              {formatDuration(c.timestamp ?? 0)}
                            </span>
                            {hasAnnotation && (
                              <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                                <Pencil className="w-2.5 h-2.5" /> drawing
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-white leading-none mb-0.5">{c.authorName}</p>
                          <p className="text-xs text-white/60 leading-snug line-clamp-3">{c.text}</p>
                        </div>
                        {/* Arrow — tracks the marker regardless of tooltip alignment */}
                        <div
                          className="w-2 h-2 bg-[#1e1e1e] border-r border-b border-white/10 rotate-45 -mt-1"
                          style={pct < 20 ? { marginLeft: 6 } : pct > 80 ? { marginRight: 6, marginLeft: 'auto' } : { marginLeft: 'auto', marginRight: 'auto' }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scrubber bar */}
          <div
            className="relative h-2 bg-white/15 rounded-full cursor-pointer group"
            onMouseDown={handleSeekMouseDown}
            onClick={handleSeekClick}
          >
            <div className="absolute left-0 top-0 h-full bg-frame-accent rounded-full pointer-events-none" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progress}%` }} />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Play/pause */}
          <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center text-white hover:text-frame-accent transition-colors">
            {playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
          </button>

          {/* Frame step */}
          <div className="flex items-center gap-0.5">
            <button onClick={() => stepFrame(-1)} title="Previous frame (←)" className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => stepFrame(1)} title="Next frame (→)" className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Timecode — click to toggle MM:SS vs MM:SS:FF */}
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

          {/* Safe zones */}
          <SafeZoneSelector
            selected={activeSafeZone}
            onSelect={(file) => { setActiveSafeZone(file); setSafeZoneOpacity(1); }}
          />

          {/* Opacity slider — visible only when a safe zone is active */}
          {activeSafeZone && (
            <div className="flex items-center gap-1.5" title="Overlay opacity">
              <input
                type="range" min={0} max={1} step={0.05}
                value={safeZoneOpacity}
                onChange={(e) => setSafeZoneOpacity(parseFloat(e.target.value))}
                className="w-16 cursor-pointer appearance-none h-1 rounded-full outline-none"
                style={{
                  background: `linear-gradient(to right, #7a00df 0%, #7a00df ${safeZoneOpacity * 100}%, rgba(255,255,255,0.15) ${safeZoneOpacity * 100}%, rgba(255,255,255,0.15) 100%)`,
                }}
              />
            </div>
          )}

          {/* Annotate */}
          {!isAnnotationMode && (
            <button
              onClick={() => { onRequestAnnotation(); onAnnotationStarted?.(); }}
              title="Annotate current frame"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Annotate
            </button>
          )}

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
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

          {/* Speed */}
          <select
            value={playbackRate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="bg-transparent text-white/60 hover:text-white text-xs border border-white/10 rounded px-1.5 py-1 cursor-pointer focus:outline-none"
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r} className="bg-[#111] text-white">{r}x</option>
            ))}
          </select>

          {/* Fullscreen */}
          <button
            onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else wrapperRef.current?.requestFullscreen(); }}
            title="Fullscreen (F)"
            className="text-white/60 hover:text-white transition-colors"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
