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

// ── dBFS scale ────────────────────────────────────────────────────────────────
const MIN_DB   = -60;
const MAX_DB   = 3;            // slight headroom above 0 dBFS
const DB_RANGE = MAX_DB - MIN_DB;

// Labelled tick positions (dBFS)
const DB_MARKS = [0, -3, -6, -9, -12, -18, -24, -40, -60] as const;

// Peak hold / decay
const PEAK_HOLD_MS  = 1500;
const PEAK_DECAY_DB = 0.18; // dB per frame

// VU ballistics (exponential smoothing in dB domain)
const ATTACK_ALPHA  = 0.30;  // fraction of new reading on attack
const RELEASE_ALPHA = 0.06;  // fraction of new reading on release

/** dBFS value → y pixel (0 = top, h = bottom). */
function dbToY(db: number, h: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return ((MAX_DB - clamped) / DB_RANGE) * h;
}

/** RMS level in dBFS from the float time-domain waveform. */
function getDb(analyser: AnalyserNode | null): number {
  if (!analyser) return MIN_DB;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms)) : MIN_DB;
}

// ── Canvas layout (pixels, at canvas resolution 56 × dynamic) ────────────────
const LABEL_W = 14; // label column width (right-aligned text)
const SEP_W   = 1;  // separator between labels and bars
const BAR_GAP = 3;  // gap between L and R bars
const L_X     = LABEL_W + SEP_W;

export const VUMeter = memo(forwardRef<VUMeterHandle, VUMeterProps>(
  function VUMeter({ videoRef, isPlaying }, ref) {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const ctxRef       = useRef<AudioContext | null>(null);
    const gainNodeRef  = useRef<GainNode | null>(null);
    const analyserLRef = useRef<AnalyserNode | null>(null);
    const analyserRRef = useRef<AnalyserNode | null>(null);
    const rafRef       = useRef(0);
    const peakDb       = useRef<[number, number]>([MIN_DB, MIN_DB]);
    const peakTime     = useRef<[number, number]>([0, 0]);
    const smoothDb     = useRef<[number, number]>([MIN_DB, MIN_DB]);
    const volumeRef    = useRef(1);
    const mutedRef     = useRef(false);

    // ── resume() ─────────────────────────────────────────────────────────────
    const resume = useCallback(() => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    }, []);

    const setVolume = useCallback((v: number) => {
      volumeRef.current = v;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = mutedRef.current ? 0 : v;
        // Keep video.volume at 1 so createMediaElementSource output is always full-level
        if (videoRef.current) videoRef.current.volume = 1;
      } else {
        if (videoRef.current) videoRef.current.volume = v;
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const setMuted = useCallback((m: boolean) => {
      mutedRef.current = m;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = m ? 0 : volumeRef.current;
        if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = 1; }
      } else {
        if (videoRef.current) videoRef.current.muted = m;
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({ resume, setVolume, setMuted }), [resume, setVolume, setMuted]);

    // ── Wire Web Audio graph once, at mount ───────────────────────────────────
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

        const source   = ctx.createMediaElementSource(video);
        const gainNode = ctx.createGain();
        const splitter = ctx.createChannelSplitter(2);
        const aL       = ctx.createAnalyser();
        const aR       = ctx.createAnalyser();

        // Large FFT size for stable RMS; smoothing irrelevant for time-domain data
        aL.fftSize = 2048; aL.smoothingTimeConstant = 0;
        aR.fftSize = 2048; aR.smoothingTimeConstant = 0;

        gainNode.gain.value = volumeRef.current;

        // Playback chain (volume-controlled)
        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Measurement chain (pre-gain — always reads source signal)
        source.connect(splitter);
        splitter.connect(aL, 0);
        splitter.connect(aR, 1);

        video.volume = 1;
        video.muted  = false;

        ctxRef.current       = ctx;
        gainNodeRef.current  = gainNode;
        analyserLRef.current = aL;
        analyserRRef.current = aR;
      } catch {
        return;
      }

      return () => {
        ctx.close().catch(() => {});
        ctxRef.current       = null;
        gainNodeRef.current  = null;
        analyserLRef.current = null;
        analyserRRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Global cleanup ────────────────────────────────────────────────────────
    useEffect(() => () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
    }, []);

    // ── rAF draw loop ─────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!isPlaying) {
        cancelAnimationFrame(rafRef.current);
        const c = canvas.getContext('2d');
        if (c) {
          c.clearRect(0, 0, canvas.width, canvas.height);
          drawStatic(c, canvas.width, canvas.height);
        }
        peakDb.current   = [MIN_DB, MIN_DB];
        peakTime.current = [0, 0];
        smoothDb.current = [MIN_DB, MIN_DB];
        return;
      }

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const c = canvas.getContext('2d');
        if (!c) return;

        const w = canvas.width, h = canvas.height;
        const now = performance.now();
        const barW = Math.floor((w - L_X - BAR_GAP) / 2);
        const rX   = L_X + barW + BAR_GAP;

        // Measure dBFS for each channel
        const rawL = getDb(analyserLRef.current);
        const rawR = getDb(analyserRRef.current);

        // Ballistic smoothing (attack faster than release)
        for (let ch = 0; ch < 2; ch++) {
          const raw  = ch === 0 ? rawL : rawR;
          const prev = smoothDb.current[ch];
          const alpha = raw > prev ? ATTACK_ALPHA : RELEASE_ALPHA;
          smoothDb.current[ch] = raw * alpha + prev * (1 - alpha);
        }

        // Peak hold
        for (let ch = 0; ch < 2; ch++) {
          const db = smoothDb.current[ch];
          if (db >= peakDb.current[ch]) {
            peakDb.current[ch]   = db;
            peakTime.current[ch] = now;
          } else if (now - peakTime.current[ch] > PEAK_HOLD_MS) {
            peakDb.current[ch] = Math.max(MIN_DB, peakDb.current[ch] - PEAK_DECAY_DB);
          }
        }

        c.clearRect(0, 0, w, h);
        drawStatic(c, w, h);
        drawBar(c, smoothDb.current[0], peakDb.current[0], L_X,  barW, h);
        drawBar(c, smoothDb.current[1], peakDb.current[1], rX,   barW, h);
      };

      rafRef.current = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying]);

    return (
      <div className="flex-1 flex items-stretch py-2 px-1">
        <canvas
          ref={canvasRef}
          width={56}
          height={300}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    );
  }
));

VUMeter.displayName = 'VUMeter';

// ── Drawing helpers ────────────────────────────────────────────────────────────

/** Static layer: label column, separator, tick lines, L/R labels. */
function drawStatic(c: CanvasRenderingContext2D, w: number, h: number) {
  const barW = Math.floor((w - L_X - BAR_GAP) / 2);
  const rX   = L_X + barW + BAR_GAP;

  // Separator between label column and bars
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(LABEL_W, 0, SEP_W, h);

  // Bar track backgrounds
  c.fillStyle = 'rgba(255,255,255,0.04)';
  c.fillRect(L_X, 0, barW, h);
  c.fillRect(rX,  0, barW, h);

  // Channel labels "L" / "R" at very top
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.font = '5px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.fillText('L', L_X + barW / 2, 1);
  c.fillText('R', rX  + barW / 2, 1);

  // dB tick marks and labels
  c.font = '5.5px monospace';
  c.textAlign = 'right';
  c.textBaseline = 'middle';

  for (const db of DB_MARKS) {
    const y = dbToY(db, h);

    // Label (skip -60 to avoid crowding at bottom)
    const label = db === 0 ? '0' : `${db}`;
    c.fillStyle = db >= 0 ? 'rgba(239,68,68,0.75)' :
                  db >= -6 ? 'rgba(249,115,22,0.65)' :
                  db >= -20 ? 'rgba(234,179,8,0.6)' :
                  'rgba(255,255,255,0.38)';
    c.fillText(label, LABEL_W - 2, y);

    // Tick lines across both bars
    c.fillStyle = db === 0
      ? 'rgba(239,68,68,0.20)'
      : 'rgba(255,255,255,0.09)';
    c.fillRect(L_X, y - 0.5, barW, 1);
    c.fillRect(rX,  y - 0.5, barW, 1);
  }
}

/** Animated bar: gradient fill up to level + peak hold marker. */
function drawBar(
  c: CanvasRenderingContext2D,
  db: number,
  peakDb: number,
  x: number,
  barW: number,
  h: number,
) {
  const levelY = dbToY(db, h);

  // Active bar — filled from bottom up to current level
  if (levelY < h) {
    // Gradient spans the full canvas height; we clip to the active portion
    const grad = c.createLinearGradient(0, 0, 0, h);
    const y0  = dbToY(MAX_DB, h) / h;     // +3 dBFS (top)
    const y3  = dbToY(0,   h) / h;        //  0 dBFS
    const y6  = dbToY(-6,  h) / h;        // -6 dBFS
    const y20 = dbToY(-20, h) / h;        // -20 dBFS
    grad.addColorStop(y0,  '#ef4444');     // red
    grad.addColorStop(y3,  '#ef4444');
    grad.addColorStop(y6,  '#f97316');     // orange
    grad.addColorStop(y20, '#eab308');     // yellow
    grad.addColorStop(1,   '#22c55e');     // green

    c.fillStyle = grad;
    c.fillRect(x, levelY, barW, h - levelY);
  }

  // Peak hold marker
  if (peakDb > MIN_DB + 2) {
    const pkY = dbToY(peakDb, h);
    c.fillStyle = peakDb >= 0
      ? '#ef4444'
      : peakDb >= -6
      ? '#f97316'
      : 'rgba(255,255,255,0.75)';
    c.fillRect(x, pkY, barW, 2);
  }
}
