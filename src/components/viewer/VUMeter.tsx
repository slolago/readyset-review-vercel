'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';

/** Called from VideoPlayer's togglePlay — must run inside the user-gesture
 *  call stack so the browser permits audio.play() and ctx.resume(). */
export interface VUMeterHandle {
  start: () => void;
  stop: () => void;
}

interface VUMeterProps {
  /** Same signed URL as the video. Loaded in a hidden Audio element for
   *  analysis only — the <video> element is never referenced here. */
  src: string | undefined;
  isPlaying: boolean;
}

const SEGMENT_COUNT = 20;
const PEAK_HOLD_MS   = 1500;
const PEAK_DECAY     = 0.015;

function segColor(i: number) {
  if (i < 12) return '#22c55e';
  if (i < 16) return '#eab308';
  return '#ef4444';
}

export const VUMeter = memo(forwardRef<VUMeterHandle, VUMeterProps>(
  function VUMeter({ src, isPlaying }, ref) {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const audioElRef   = useRef<HTMLAudioElement | null>(null);
    const ctxRef       = useRef<AudioContext | null>(null);
    const analyserLRef = useRef<AnalyserNode | null>(null);
    const analyserRRef = useRef<AnalyserNode | null>(null);
    const wiredRef     = useRef(false);
    const rafRef       = useRef(0);
    const peaks        = useRef<[number,number]>([0,0]);
    const peakTimes    = useRef<[number,number]>([0,0]);
    const peakDisp     = useRef<[number,number]>([0,0]);

    // ── Wire Web Audio graph once, lazily on first start() call ────────────
    const ensureGraph = useCallback(() => {
      if (wiredRef.current) return;
      const audio = audioElRef.current;
      if (!audio) return;

      try {
        const Ctor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;

        const ctx = new Ctor();
        ctxRef.current = ctx;

        const source   = ctx.createMediaElementSource(audio);
        const aL       = ctx.createAnalyser(); aL.fftSize = 256; aL.smoothingTimeConstant = 0.8;
        const aR       = ctx.createAnalyser(); aR.fftSize = 256; aR.smoothingTimeConstant = 0.8;
        const splitter = ctx.createChannelSplitter(2);

        source.connect(splitter);
        splitter.connect(aL, 0);
        splitter.connect(aR, 1);
        // Intentionally NOT connecting to ctx.destination:
        // the <video> handles all audible output; this element is silent.

        analyserLRef.current = aL;
        analyserRRef.current = aR;
        wiredRef.current     = true;
      } catch { /* security/CORS restriction — meter stays dark */ }
    }, []);

    // ── start() / stop() — must be called inside user-gesture context ───────
    const start = useCallback(() => {
      const audio = audioElRef.current;
      if (!audio) return;

      ensureGraph();

      // Resume AudioContext inside the gesture so browser allows it
      if (ctxRef.current && ctxRef.current.state !== 'running') {
        ctxRef.current.resume().catch(() => {});
      }

      // play() inside the gesture so browser's autoplay policy is satisfied
      audio.play().catch(() => {});
    }, [ensureGraph]);

    const stop = useCallback(() => {
      audioElRef.current?.pause();
    }, []);

    useImperativeHandle(ref, () => ({ start, stop }), [start, stop]);

    // ── Recreate hidden Audio element when src changes ──────────────────────
    useEffect(() => {
      // Tear down previous
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = '';
      }
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => {});
      }
      ctxRef.current    = null;
      analyserLRef.current = null;
      analyserRRef.current = null;
      wiredRef.current  = false;

      if (!src || typeof window === 'undefined') { audioElRef.current = null; return; }

      const audio       = new Audio(src);
      audio.preload     = 'none';
      audioElRef.current = audio;

      return () => {
        audio.pause();
        audio.src = '';
      };
    }, [src]);

    // ── Sync play/pause when isPlaying prop changes (fallback path) ─────────
    // For browsers where the gesture window has already been satisfied.
    useEffect(() => {
      if (isPlaying) {
        start();
      } else {
        stop();
      }
    }, [isPlaying, start, stop]);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    useEffect(() => () => {
      cancelAnimationFrame(rafRef.current);
      audioElRef.current?.pause();
      ctxRef.current?.close().catch(() => {});
    }, []);

    // ── rAF draw ─────────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const c = canvas.getContext('2d');
        if (!c) return;

        const now = performance.now();
        const lvl = (a: AnalyserNode | null) => {
          if (!a) return 0;
          const buf = new Uint8Array(a.frequencyBinCount);
          a.getByteFrequencyData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) { const v = buf[i] / 255; s += v * v; }
          return Math.sqrt(s / buf.length);
        };

        const lL = isPlaying ? lvl(analyserLRef.current) : 0;
        const lR = isPlaying ? lvl(analyserRRef.current) : 0;

        for (let ch = 0; ch < 2; ch++) {
          const lv = ch === 0 ? lL : lR;
          if (lv >= peaks.current[ch]) {
            peaks.current[ch] = lv; peakTimes.current[ch] = now; peakDisp.current[ch] = lv;
          } else if (now - peakTimes.current[ch] > PEAK_HOLD_MS) {
            peakDisp.current[ch] = Math.max(0, peakDisp.current[ch] - PEAK_DECAY);
            peaks.current[ch]    = lv;
          } else {
            peaks.current[ch] = lv;
          }
        }

        const w = canvas.width, h = canvas.height;
        c.clearRect(0, 0, w, h);

        const paint = (level: number, peak: number, ox: number, cw: number) => {
          const segH  = Math.floor((h - (SEGMENT_COUNT - 1) * 2) / SEGMENT_COUNT);
          const step  = segH + 2;
          const active = Math.round(level * SEGMENT_COUNT);
          const pk    = Math.round(peak * SEGMENT_COUNT);
          for (let i = 0; i < SEGMENT_COUNT; i++) {
            const y = h - (i + 1) * step + 2;
            c.globalAlpha = i < active ? 1 : 0.2;
            c.fillStyle   = segColor(i);
            c.fillRect(ox, y, cw, segH);
            if (i === pk && pk > 0) {
              c.globalAlpha = 1; c.fillStyle = '#fff';
              c.fillRect(ox, y, cw, 2);
            }
          }
          c.globalAlpha = 1;
        };

        const cw = Math.floor((w - 2) / 2);
        paint(lL, peakDisp.current[0], 0,      cw);
        paint(lR, peakDisp.current[1], cw + 2, cw);
      };

      rafRef.current = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying]);

    return (
      <div className="flex-1 flex items-stretch px-1 py-2">
        <canvas ref={canvasRef} width={20} height={300}
          style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    );
  }
));

VUMeter.displayName = 'VUMeter';
