'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';

/**
 * Called from VideoPlayer's togglePlay — must run inside the user-gesture
 * call stack so the browser permits AudioContext.resume().
 * setVolume / setMuted route volume control through the GainNode so the
 * analyser always reads the pre-gain source signal.
 */
export interface VUMeterHandle {
  resume: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

interface VUMeterProps {
  /** Direct ref to the <video> element that is already playing audio. */
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
}

const SEGMENT_COUNT = 20;
const PEAK_HOLD_MS  = 1500;
const PEAK_DECAY    = 0.015;

function segColor(i: number) {
  if (i < 12) return '#22c55e';
  if (i < 16) return '#eab308';
  return '#ef4444';
}

export const VUMeter = memo(forwardRef<VUMeterHandle, VUMeterProps>(
  function VUMeter({ videoRef, isPlaying }, ref) {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const ctxRef       = useRef<AudioContext | null>(null);
    const gainNodeRef  = useRef<GainNode | null>(null);
    const analyserLRef = useRef<AnalyserNode | null>(null);
    const analyserRRef = useRef<AnalyserNode | null>(null);
    const rafRef       = useRef(0);
    const peaks        = useRef<[number, number]>([0, 0]);
    const peakTimes    = useRef<[number, number]>([0, 0]);
    const peakDisp     = useRef<[number, number]>([0, 0]);
    const volumeRef    = useRef(1);
    const mutedRef     = useRef(false);

    // ── resume() — call inside user-gesture so AudioContext is allowed ──
    const resume = useCallback(() => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'running') {
        ctx.resume().catch(() => {});
      }
    }, []);

    const setVolume = useCallback((v: number) => {
      volumeRef.current = v;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = mutedRef.current ? 0 : v;
      }
    }, []);

    const setMuted = useCallback((m: boolean) => {
      mutedRef.current = m;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = m ? 0 : volumeRef.current;
      }
    }, []);

    useImperativeHandle(ref, () => ({ resume, setVolume, setMuted }), [resume, setVolume, setMuted]);

    // ── Wire Web Audio graph once, at mount, from the real video element ─
    useEffect(() => {
      const video = videoRef.current;
      if (!video || typeof window === 'undefined') return;

      const Ctor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      let ctx: AudioContext;
      try {
        ctx = new Ctor();
        // Context starts suspended — that's fine. resume() is called in the
        // play-button gesture handler so the browser permits it.

        const source   = ctx.createMediaElementSource(video);
        const gainNode = ctx.createGain();
        const splitter = ctx.createChannelSplitter(2);
        const aL       = ctx.createAnalyser();
        const aR       = ctx.createAnalyser();

        aL.fftSize = 256; aL.smoothingTimeConstant = 0.8;
        aR.fftSize = 256; aR.smoothingTimeConstant = 0.8;

        gainNode.gain.value = volumeRef.current;

        // Route playback through GainNode so the user can control volume.
        // createMediaElementSource hijacks the element's native output, so
        // we must reconnect through the graph to hear audio.
        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Tap the source BEFORE the GainNode so the analyser always reads
        // the pre-gain signal — volume slider and mute do not affect the meter.
        source.connect(splitter);
        splitter.connect(aL, 0);
        splitter.connect(aR, 1);

        // Force the media element to always output at full level; volume and
        // mute are now controlled by gainNode instead.
        video.volume = 1;
        video.muted  = false;

        ctxRef.current    = ctx;
        gainNodeRef.current = gainNode;
        analyserLRef.current = aL;
        analyserRRef.current = aR;
      } catch {
        // SecurityError (CORS) or InvalidStateError — meter stays dark,
        // native video audio is untouched because we never called
        // createMediaElementSource successfully.
        return;
      }

      return () => {
        ctx.close().catch(() => {});
        ctxRef.current    = null;
        gainNodeRef.current = null;
        analyserLRef.current = null;
        analyserRRef.current = null;
      };
    // videoRef is a stable ref object — this runs exactly once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Global cleanup on unmount ────────────────────────────────────────
    useEffect(() => () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
    }, []);

    // ── rAF draw loop — only active while isPlaying ──────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!isPlaying) {
        const c = canvas.getContext('2d');
        if (c) c.clearRect(0, 0, canvas.width, canvas.height);
        peaks.current     = [0, 0];
        peakTimes.current = [0, 0];
        peakDisp.current  = [0, 0];
        return;
      }

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const c = canvas.getContext('2d');
        if (!c) return;

        const now = performance.now();
        const lvl = (a: AnalyserNode | null): number => {
          if (!a) return 0;
          const buf = new Uint8Array(a.frequencyBinCount);
          a.getByteFrequencyData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) { const v = buf[i] / 255; s += v * v; }
          return Math.sqrt(s / buf.length);
        };

        const lL = lvl(analyserLRef.current);
        const lR = lvl(analyserRRef.current);

        for (let ch = 0; ch < 2; ch++) {
          const lv = ch === 0 ? lL : lR;
          if (lv >= peaks.current[ch]) {
            peaks.current[ch]     = lv;
            peakTimes.current[ch] = now;
            peakDisp.current[ch]  = lv;
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
          const segH   = Math.floor((h - (SEGMENT_COUNT - 1) * 2) / SEGMENT_COUNT);
          const step   = segH + 2;
          const active = Math.round(level * SEGMENT_COUNT);
          const pk     = Math.round(peak * SEGMENT_COUNT);
          for (let i = 0; i < SEGMENT_COUNT; i++) {
            const y = h - (i + 1) * step + 2;
            c.globalAlpha = i < active ? 1 : 0.2;
            c.fillStyle   = segColor(i);
            c.fillRect(ox, y, cw, segH);
            if (i === pk && pk > 0) {
              c.globalAlpha = 1;
              c.fillStyle   = '#fff';
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
        <canvas
          ref={canvasRef}
          width={20}
          height={300}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    );
  }
));

VUMeter.displayName = 'VUMeter';
