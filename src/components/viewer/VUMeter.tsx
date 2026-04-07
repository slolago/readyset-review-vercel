'use client';

import { useEffect, useRef } from 'react';

interface VUMeterProps {
  /** The same signed URL the video player uses. We load it in a hidden Audio
   *  element that is solely for analysis — the video element is never touched. */
  src: string | undefined;
  isPlaying: boolean;
  /** Current playback time from the video element (seconds). We keep the
   *  hidden audio in sync by seeking whenever the delta exceeds 0.3 s. */
  currentTime: number;
}

const SEGMENT_COUNT = 20;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_RATE = 0.015;

function getSegmentColor(i: number): string {
  if (i < 12) return '#22c55e';
  if (i < 16) return '#eab308';
  return '#ef4444';
}

export function VUMeter({ src, isPlaying, currentTime }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const connectedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<[number, number]>([0, 0]);
  const peakTimesRef = useRef<[number, number]>([0, 0]);
  const peakDisplayRef = useRef<[number, number]>([0, 0]);

  // ── Setup: create hidden Audio element + Web Audio graph ────────────────
  // This effect runs whenever src changes (new asset).
  // The <video> element is NEVER referenced here.
  useEffect(() => {
    if (!src || typeof window === 'undefined') return;

    // Tear down previous audio element / context
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserLRef.current = null;
    analyserRRef.current = null;
    connectedRef.current = false;

    // Create hidden audio element — muted via Web Audio (no double output)
    const audio = new Audio();
    audio.src = src;
    audio.preload = 'auto';
    // We will NOT connect to ctx.destination, so no sound from this element.
    // The video element handles all audible playback independently.
    audioElRef.current = audio;

    // Build Web Audio graph lazily on first play gesture
    const buildGraph = () => {
      if (connectedRef.current) return;
      try {
        const Ctor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaElementSource(audio);

        const analyserL = ctx.createAnalyser();
        analyserL.fftSize = 256;
        analyserL.smoothingTimeConstant = 0.8;
        analyserLRef.current = analyserL;

        const analyserR = ctx.createAnalyser();
        analyserR.fftSize = 256;
        analyserR.smoothingTimeConstant = 0.8;
        analyserRRef.current = analyserR;

        const splitter = ctx.createChannelSplitter(2);
        source.connect(splitter);
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);
        // No connection to ctx.destination — this audio element is silent.
        // Audible playback comes entirely from the video element.

        connectedRef.current = true;

        // Resume context if suspended (we do this on the first 'play' call,
        // which is triggered by the user gesture → isPlaying flip → this effect)
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
      } catch {
        // Security restriction or unsupported — meter stays dark, player unaffected
      }
    };

    audio.addEventListener('playing', buildGraph, { once: true });

    return () => {
      audio.removeEventListener('playing', buildGraph);
    };
  }, [src]);

  // ── Sync play / pause with the video ────────────────────────────────────
  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Resume AudioContext if graph is built
      if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
        audioCtxRef.current.resume().catch(() => {});
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // ── Sync seek position ───────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    // Only seek if drift > 0.3 s to avoid constant micro-seeks
    if (Math.abs(audio.currentTime - currentTime) > 0.3) {
      audio.currentTime = currentTime;
    }
  }, [currentTime]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = '';
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioElRef.current = null;
      audioCtxRef.current = null;
      analyserLRef.current = null;
      analyserRRef.current = null;
      connectedRef.current = false;
    };
  }, []);

  // ── rAF draw loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      const now = performance.now();

      const getLevel = (a: AnalyserNode | null): number => {
        if (!a) return 0;
        const buf = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = buf[i] / 255; sum += v * v; }
        return Math.sqrt(sum / buf.length);
      };

      const levelL = isPlaying ? getLevel(analyserLRef.current) : 0;
      const levelR = isPlaying ? getLevel(analyserRRef.current) : 0;

      for (let ch = 0; ch < 2; ch++) {
        const lv = ch === 0 ? levelL : levelR;
        if (lv >= peaksRef.current[ch]) {
          peaksRef.current[ch] = lv; peakTimesRef.current[ch] = now; peakDisplayRef.current[ch] = lv;
        } else {
          if (now - peakTimesRef.current[ch] > PEAK_HOLD_MS)
            peakDisplayRef.current[ch] = Math.max(0, peakDisplayRef.current[ch] - PEAK_DECAY_RATE);
          peaksRef.current[ch] = lv;
        }
      }

      const w = canvas.width, h = canvas.height;
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

  return (
    <div className="flex-1 flex items-stretch px-1 py-2">
      <canvas ref={canvasRef} width={20} height={300}
        style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

VUMeter.displayName = 'VUMeter';
