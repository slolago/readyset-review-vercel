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

export const VUMeter = forwardRef<VUMeterHandle, VUMeterProps>(function VUMeter({ videoRef, isPlaying }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const connectedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<[number, number]>([0, 0]);
  const peakTimesRef = useRef<[number, number]>([0, 0]);
  const peakDisplayRef = useRef<[number, number]>([0, 0]);

  // Connect via createMediaElementSource.
  // This hijacks the native audio output, so we MUST also connect to ctx.destination.
  // The video element's .volume and .muted properties still control the source level.
  const connectAnalysers = useCallback(() => {
    const video = videoRef.current;
    const ctx = audioCtxRef.current;
    if (!video || !ctx || connectedRef.current) return;

    try {
      const source = ctx.createMediaElementSource(video);
      connectedRef.current = true;

      const analyserL = ctx.createAnalyser();
      analyserL.fftSize = 256;
      analyserL.smoothingTimeConstant = 0.8;
      analyserLRef.current = analyserL;

      const analyserR = ctx.createAnalyser();
      analyserR.fftSize = 256;
      analyserR.smoothingTimeConstant = 0.8;
      analyserRRef.current = analyserR;

      const splitter = ctx.createChannelSplitter(2);

      // Playback path: source → destination (restores audio hijacked by createMediaElementSource)
      source.connect(ctx.destination);

      // Analysis path: source → splitter → L/R analysers (dead-end, read-only)
      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
    } catch {
      // Already captured or security restriction — audio still plays via destination
    }
  }, [videoRef]);

  // Create + resume AudioContext inside the user gesture, then connect
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state !== 'running') {
      audioCtxRef.current.resume().catch(() => {});
    }
    connectAnalysers();
  }, [connectAnalysers]);

  useImperativeHandle(ref, () => ({ initAudio }));

  // rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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
      ctx.clearRect(0, 0, w, h);

      const drawChan = (level: number, peak: number, ox: number, cw: number) => {
        const segH = Math.floor((h - (SEGMENT_COUNT - 1) * 2) / SEGMENT_COUNT);
        const segStep = segH + 2;
        const active = Math.round(level * SEGMENT_COUNT);
        const peakSeg = Math.round(peak * SEGMENT_COUNT);
        for (let i = 0; i < SEGMENT_COUNT; i++) {
          const y = h - (i + 1) * segStep + 2;
          ctx.globalAlpha = i < active ? 1 : 0.2;
          ctx.fillStyle = getSegmentColor(i);
          ctx.fillRect(ox, y, cw, segH);
          if (i === peakSeg && peakSeg > 0) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ox, y, cw, 2);
          }
        }
        ctx.globalAlpha = 1;
      };

      const cw = Math.floor((w - 2) / 2);
      drawChan(levelL, peakDisplayRef.current[0], 0, cw);
      drawChan(levelR, peakDisplayRef.current[1], cw + 2, cw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        analyserLRef.current?.disconnect();
        analyserRRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch { /* ignore */ }
      connectedRef.current = false;
      audioCtxRef.current = null;
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
