'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface VUMeterHandle {
  /** Call inside a user-gesture handler so the browser allows AudioContext to run. */
  initAudio: () => void;
}

interface VUMeterProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
}

const SEGMENT_COUNT = 20;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_RATE = 0.015;

function getSegmentColor(i: number): string {
  if (i < 12) return '#22c55e';
  if (i < 16) return '#eab308';
  return '#ef4444';
}

// ── Module-level singletons ──────────────────────────────────────────────────
// The AudioContext and MediaElementSource connections must survive component
// remounts. createMediaElementSource can only be called once per video element;
// closing and recreating the AudioContext (as cleanup used to do) left the
// element permanently silent. A module-level WeakMap tracks which elements
// are already wired so we never call createMediaElementSource twice.
let _audioCtx: AudioContext | null = null;

interface ConnectedEntry {
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
}
const _connected = new WeakMap<HTMLVideoElement, ConnectedEntry>();

function getOrCreateCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  _audioCtx = new Ctor();
  return _audioCtx;
}
// ────────────────────────────────────────────────────────────────────────────

export const VUMeter = forwardRef<VUMeterHandle, VUMeterProps>(function VUMeter({ videoRef, isPlaying }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<[number, number]>([0, 0]);
  const peakTimesRef = useRef<[number, number]>([0, 0]);
  const peakDisplayRef = useRef<[number, number]>([0, 0]);

  const initAudio = useCallback(() => {
    const ctx = getOrCreateCtx();
    if (!ctx) return;

    // Always resume inside the user gesture
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }

    const video = videoRef.current;
    if (!video) return;

    // Reuse existing connection if the element was already wired
    const existing = _connected.get(video);
    if (existing) {
      analyserLRef.current = existing.analyserL;
      analyserRRef.current = existing.analyserR;
      return;
    }

    // First time for this video element — create the Web Audio graph
    try {
      const source = ctx.createMediaElementSource(video);

      const analyserL = ctx.createAnalyser();
      analyserL.fftSize = 256;
      analyserL.smoothingTimeConstant = 0.8;

      const analyserR = ctx.createAnalyser();
      analyserR.fftSize = 256;
      analyserR.smoothingTimeConstant = 0.8;

      const splitter = ctx.createChannelSplitter(2);

      // Playback: restore the audio path hijacked by createMediaElementSource
      source.connect(ctx.destination);

      // Analysis: split into L/R for the meter (dead-end, no destination)
      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);

      _connected.set(video, { analyserL, analyserR });
      analyserLRef.current = analyserL;
      analyserRRef.current = analyserR;
    } catch {
      // Security restriction or element already captured by a closed context —
      // audio still plays natively; meter just won't animate.
    }
  }, [videoRef]);

  useImperativeHandle(ref, () => ({ initAudio }));

  // rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      const analyserL = analyserLRef.current;
      const analyserR = analyserRRef.current;
      const now = performance.now();

      const getLevel = (a: AnalyserNode | null): number => {
        if (!a) return 0;
        const buf = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = buf[i] / 255; sum += v * v; }
        return Math.sqrt(sum / buf.length);
      };

      const levelL = isPlaying ? getLevel(analyserL) : 0;
      const levelR = isPlaying ? getLevel(analyserR) : 0;

      for (let ch = 0; ch < 2; ch++) {
        const lv = ch === 0 ? levelL : levelR;
        if (lv >= peaksRef.current[ch]) {
          peaksRef.current[ch] = lv;
          peakTimesRef.current[ch] = now;
          peakDisplayRef.current[ch] = lv;
        } else {
          if (now - peakTimesRef.current[ch] > PEAK_HOLD_MS) {
            peakDisplayRef.current[ch] = Math.max(0, peakDisplayRef.current[ch] - PEAK_DECAY_RATE);
          }
          peaksRef.current[ch] = lv;
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const drawChan = (level: number, peak: number, ox: number, cw: number) => {
        const segH = Math.floor((h - (SEGMENT_COUNT - 1) * 2) / SEGMENT_COUNT);
        const segStep = segH + 2;
        const active = Math.round(level * SEGMENT_COUNT);
        const peakSeg = Math.round(peak * SEGMENT_COUNT);
        for (let i = 0; i < SEGMENT_COUNT; i++) {
          const y = h - (i + 1) * segStep + 2;
          ctx2d.globalAlpha = i < active ? 1 : 0.2;
          ctx2d.fillStyle = getSegmentColor(i);
          ctx2d.fillRect(ox, y, cw, segH);
          if (i === peakSeg && peakSeg > 0) {
            ctx2d.globalAlpha = 1;
            ctx2d.fillStyle = '#ffffff';
            ctx2d.fillRect(ox, y, cw, 2);
          }
        }
        ctx2d.globalAlpha = 1;
      };

      const cw = Math.floor((w - 2) / 2);
      drawChan(levelL, peakDisplayRef.current[0], 0, cw);
      drawChan(levelR, peakDisplayRef.current[1], cw + 2, cw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // On unmount: cancel RAF and detach local analyser refs.
  // Do NOT close the AudioContext or disconnect nodes — the video element may
  // be reused and createMediaElementSource cannot be called twice on the same element.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      analyserLRef.current = null;
      analyserRRef.current = null;
    };
  }, []);

  return (
    <div className="flex-1 flex items-stretch px-1 py-2">
      <canvas
        ref={canvasRef}
        width={20}
        height={300}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
});

VUMeter.displayName = 'VUMeter';
