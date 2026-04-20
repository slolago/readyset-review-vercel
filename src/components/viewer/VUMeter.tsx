'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';

/**
 * Precise stereo audio meter driven by the Web Audio API.
 *
 * Reads real sample data from one or more <video> elements and displays:
 *   - Filled bar: true RMS in dBFS with VU-like ballistics (attack + release).
 *   - Peak marker: true instantaneous peak (max |sample| per frame) with hold + decay.
 *
 * Supports multi-source monitoring for Version Compare: pass multiple video refs and
 * switch the monitored source via `activeIndex`. Non-active sources are silenced by
 * the meter's own GainNodes (don't also set video.muted — the meter owns volume).
 */
export interface VUMeterHandle {
  resume: () => Promise<void>;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

interface VUMeterProps {
  /** One or more video elements to monitor. First ref is monitored if `activeIndex` is omitted. */
  videoRefs: React.RefObject<HTMLVideoElement>[];
  /** Index into `videoRefs` — the source currently being listened to. Others are silenced. */
  activeIndex?: number;
  isPlaying: boolean;
}

// ── dBFS scale ────────────────────────────────────────────────────────────────
const MIN_DB   = -60;
const MAX_DB   = 3;
const DB_RANGE = MAX_DB - MIN_DB;

const DB_MARKS = [0, -3, -6, -9, -12, -18, -24, -40, -60] as const;

// Peak-hold ballistics: instantaneous rise, slow decay after a hold window.
const PEAK_HOLD_MS  = 1200;
const PEAK_DECAY_DB = 0.25; // dB per frame after hold window

// Bar ballistics (PPM-style): near-instant attack so peaks actually show,
// moderate release so the eye can read the level.
const BAR_ATTACK_ALPHA  = 1.0;   // bar rises to peak immediately
const BAR_RELEASE_ALPHA = 0.15;  // fall rate — ~400ms to drop 20dB visually

// RMS smoothing for optional RMS-tick overlay
const RMS_ATTACK_ALPHA  = 0.85;
const RMS_RELEASE_ALPHA = 0.12;

// Canvas layout (pixels — rendered at 2× for crispness)
const LABEL_W = 40;
const SEP_W   = 2;
const BAR_GAP = 4;
const L_X     = LABEL_W + SEP_W;

function dbToY(db: number, h: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return ((MAX_DB - clamped) / DB_RANGE) * h;
}

/** Compute RMS dBFS and true peak dBFS for a single analyser in one pass. */
function analyse(analyser: AnalyserNode | null, buf: Float32Array): { rmsDb: number; peakDb: number } {
  if (!analyser) return { rmsDb: MIN_DB, peakDb: MIN_DB };
  // Cast away the ArrayBuffer/SharedArrayBuffer variance mismatch some TS lib versions complain about
  analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = buf[i];
    sumSq += s * s;
    const a = s < 0 ? -s : s;
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / buf.length);
  const rmsDb  = rms  > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms))  : MIN_DB;
  const peakDb = peak > 0 ? Math.max(MIN_DB, 20 * Math.log10(peak)) : MIN_DB;
  return { rmsDb, peakDb };
}

interface AudioGraph {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  bufL: Float32Array;
  bufR: Float32Array;
}

/**
 * Module-level singleton state. Two reasons:
 *
 *   1. `createMediaElementSource(video)` can only be called ONCE per <video>
 *      element for its entire lifetime. In React StrictMode / HMR, effects
 *      double-invoke; a naive implementation would throw InvalidStateError on
 *      the second attempt and silently produce no audio. Caching the graph
 *      per video element avoids the retry.
 *   2. Browsers cap the number of AudioContexts (Chrome ~6). A singleton
 *      prevents resource leaks when VUMeter remounts.
 *
 * Cleanup intentionally does NOT close the context or destroy graphs — they
 * live for the lifetime of the <video> elements they're bound to.
 */
let sharedCtx: AudioContext | null = null;
const graphCache = new WeakMap<HTMLVideoElement, AudioGraph>();

function getOrCreateAudioContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch { return null; }
}

function getOrCreateGraph(ctx: AudioContext, video: HTMLVideoElement): AudioGraph | null {
  const cached = graphCache.get(video);
  if (cached) return cached;
  try {
    const source   = ctx.createMediaElementSource(video);
    const gain     = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const aL = ctx.createAnalyser();
    const aR = ctx.createAnalyser();
    aL.fftSize = 2048; aL.smoothingTimeConstant = 0;
    aR.fftSize = 2048; aR.smoothingTimeConstant = 0;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.connect(splitter);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);

    gain.gain.value = 1;
    video.volume = 1;

    const graph: AudioGraph = {
      source, gain, analyserL: aL, analyserR: aR,
      bufL: new Float32Array(aL.fftSize),
      bufR: new Float32Array(aR.fftSize),
    };
    graphCache.set(video, graph);
    return graph;
  } catch (e) {
    console.warn('[VUMeter] createMediaElementSource failed', e);
    return null;
  }
}

export const VUMeter = memo(forwardRef<VUMeterHandle, VUMeterProps>(
  function VUMeter({ videoRefs, activeIndex = 0, isPlaying }, ref) {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const ctxRef      = useRef<AudioContext | null>(null);
    const graphsRef   = useRef<(AudioGraph | null)[]>([]);
    const activeRef   = useRef(activeIndex);
    const volumeRef   = useRef(1);
    const mutedRef    = useRef(false);
    const rafRef      = useRef(0);

    // Display state (dB domain)
    const barLevel    = useRef<[number, number]>([MIN_DB, MIN_DB]);  // what the filled bar shows
    const rmsSmoothed = useRef<[number, number]>([MIN_DB, MIN_DB]);  // RMS overlay
    const peakDisp    = useRef<[number, number]>([MIN_DB, MIN_DB]);  // peak-hold marker
    const peakTime    = useRef<[number, number]>([0, 0]);

    // ── Public handle ────────────────────────────────────────────────────────
    // Each source has its own gain node connected to destination. For multi-source
    // (compare), audibility is gated by video.muted (which silences the source's
    // output per Web Audio spec). Volume/mute here is a global user control.
    const applyGains = useCallback(() => {
      const effective = mutedRef.current ? 0 : volumeRef.current;
      graphsRef.current.forEach((g) => {
        if (!g) return;
        g.gain.gain.value = effective;
      });
    }, []);

    const resume = useCallback(async () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (ctx.state !== 'running') {
        try { await ctx.resume(); } catch (e) { console.warn('[VUMeter] AudioContext resume failed', e); }
      }
    }, []);

    const setVolume = useCallback((v: number) => {
      volumeRef.current = v;
      applyGains();
      // Keep video.volume at 1 so the analyser reads full-level source signal
      videoRefs.forEach((r) => { if (r.current) r.current.volume = 1; });
    }, [videoRefs, applyGains]);

    const setMuted = useCallback((m: boolean) => {
      mutedRef.current = m;
      applyGains();
      // Note: video.muted is managed by the parent via props (it gates audibility
      // of each source independently). We don't touch it here.
    }, [applyGains]);

    useImperativeHandle(ref, () => ({ resume, setVolume, setMuted }), [resume, setVolume, setMuted]);

    // ── Build audio graph (one per video, shared via module-level cache) ─────
    // See the singleton doc above the cache definitions for why we cache
    // at module scope instead of per-instance.
    useEffect(() => {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      ctxRef.current = ctx;

      const graphs: (AudioGraph | null)[] = videoRefs.map((vr) => {
        const video = vr.current;
        if (!video) return null;
        const graph = getOrCreateGraph(ctx, video);
        // For single-source callers, clear video.muted so the source isn't born silent.
        // Multi-source (compare) callers manage video.muted declaratively per side.
        if (graph && videoRefs.length === 1) video.muted = false;
        return graph;
      });

      graphsRef.current = graphs;
      applyGains();

      return () => {
        // Cancel the RAF loop; do NOT close the context or discard graphs
        // (they're cached module-wide and bound to the video elements).
        cancelAnimationFrame(rafRef.current);
        graphsRef.current = [];
      };
    // Rebuild only if the set of video refs changes (stable across renders in practice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Track activeIndex changes ────────────────────────────────────────────
    useEffect(() => {
      activeRef.current = activeIndex;
      applyGains();
      // Reset display so the meter doesn't show stale peaks from the other source
      barLevel.current    = [MIN_DB, MIN_DB];
      rmsSmoothed.current = [MIN_DB, MIN_DB];
      peakDisp.current    = [MIN_DB, MIN_DB];
      peakTime.current    = [0, 0];
    }, [activeIndex, applyGains]);

    // ── Draw loop ────────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const c = canvas.getContext('2d');
      if (!c) return;

      if (!isPlaying) {
        cancelAnimationFrame(rafRef.current);
        c.clearRect(0, 0, canvas.width, canvas.height);
        drawStatic(c, canvas.width, canvas.height);
        drawBar(c, MIN_DB, MIN_DB, MIN_DB, L_X, barWidth(canvas.width), canvas.height);
        drawBar(c, MIN_DB, MIN_DB, MIN_DB, rXOf(canvas.width), barWidth(canvas.width), canvas.height);
        barLevel.current    = [MIN_DB, MIN_DB];
        rmsSmoothed.current = [MIN_DB, MIN_DB];
        peakDisp.current    = [MIN_DB, MIN_DB];
        peakTime.current    = [0, 0];
        return;
      }

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const w = canvas.width, h = canvas.height;
        const now = performance.now();
        const barW = barWidth(w);
        const rX = rXOf(w);

        const g = graphsRef.current[activeRef.current];
        const L = analyse(g?.analyserL ?? null, g?.bufL ?? new Float32Array(2048));
        const R = analyse(g?.analyserR ?? null, g?.bufR ?? new Float32Array(2048));

        for (let ch = 0; ch < 2; ch++) {
          const truePeak = ch === 0 ? L.peakDb : R.peakDb;
          const rms      = ch === 0 ? L.rmsDb  : R.rmsDb;

          // Bar tracks TRUE PEAK with near-instant attack, gentle release.
          // This is what you see "full" — no gap between the bar and the peak marker.
          const prevBar = barLevel.current[ch];
          const barAlpha = truePeak > prevBar ? BAR_ATTACK_ALPHA : BAR_RELEASE_ALPHA;
          barLevel.current[ch] = truePeak * barAlpha + prevBar * (1 - barAlpha);

          // RMS overlay (a subtle inner tick showing integrated level)
          const prevRms = rmsSmoothed.current[ch];
          const rmsAlpha = rms > prevRms ? RMS_ATTACK_ALPHA : RMS_RELEASE_ALPHA;
          rmsSmoothed.current[ch] = rms * rmsAlpha + prevRms * (1 - rmsAlpha);

          // Peak hold: bright line at max-recent peak, decays after hold window
          if (truePeak >= peakDisp.current[ch]) {
            peakDisp.current[ch] = truePeak;
            peakTime.current[ch] = now;
          } else if (now - peakTime.current[ch] > PEAK_HOLD_MS) {
            peakDisp.current[ch] = Math.max(MIN_DB, peakDisp.current[ch] - PEAK_DECAY_DB);
          }
        }

        c.clearRect(0, 0, w, h);
        drawStatic(c, w, h);
        drawBar(c, barLevel.current[0], rmsSmoothed.current[0], peakDisp.current[0], L_X, barW, h);
        drawBar(c, barLevel.current[1], rmsSmoothed.current[1], peakDisp.current[1], rX, barW, h);
      };

      rafRef.current = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying]);

    return (
      <div className="flex-1 flex items-stretch py-2 px-1">
        <canvas
          ref={canvasRef}
          width={144}
          height={600}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    );
  }
));

VUMeter.displayName = 'VUMeter';

// ── Layout helpers ───────────────────────────────────────────────────────────
const barWidth = (w: number) => Math.floor((w - L_X - BAR_GAP) / 2);
const rXOf     = (w: number) => L_X + barWidth(w) + BAR_GAP;

function drawStatic(c: CanvasRenderingContext2D, w: number, h: number) {
  const barW = barWidth(w);
  const rX   = rXOf(w);

  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(LABEL_W, 0, SEP_W, h);

  c.fillStyle = 'rgba(255,255,255,0.04)';
  c.fillRect(L_X, 0, barW, h);
  c.fillRect(rX,  0, barW, h);

  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.fillText('L', L_X + barW / 2, 2);
  c.fillText('R', rX  + barW / 2, 2);

  c.font = '11px monospace';
  c.textAlign = 'right';
  c.textBaseline = 'middle';

  for (const db of DB_MARKS) {
    const y = dbToY(db, h);
    c.fillStyle = db >= 0 ? 'rgba(239,68,68,0.75)' :
                  db >= -6 ? 'rgba(249,115,22,0.65)' :
                  db >= -20 ? 'rgba(234,179,8,0.6)' :
                  'rgba(255,255,255,0.38)';
    c.fillText(db === 0 ? '0' : `${db}`, LABEL_W - 4, y);

    c.fillStyle = db === 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.10)';
    c.fillRect(L_X, y - 0.5, barW, 1);
    c.fillRect(rX,  y - 0.5, barW, 1);
  }
}

function drawBar(
  c: CanvasRenderingContext2D,
  barDb: number,      // fills up to here (near-instant peak)
  rmsDb: number,      // subtle inner tick
  peakHoldDb: number, // peak-hold marker
  x: number,
  barW: number,
  h: number,
) {
  const levelY = dbToY(barDb, h);

  if (levelY < h - 0.5) {
    // Gradient fills the active region. Same color zones as before but now the
    // bar's top always equals the current peak — no visible gap vs the peak marker.
    const grad = c.createLinearGradient(0, 0, 0, h);
    const y0  = dbToY(MAX_DB, h) / h;
    const y3  = dbToY(0,   h) / h;
    const y6  = dbToY(-6,  h) / h;
    const y20 = dbToY(-20, h) / h;
    grad.addColorStop(y0,  '#ef4444');
    grad.addColorStop(y3,  '#ef4444');
    grad.addColorStop(y6,  '#f97316');
    grad.addColorStop(y20, '#eab308');
    grad.addColorStop(1,   '#22c55e');

    // Rounded top for a softer look
    const radius = Math.min(3, barW / 2);
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(x, levelY + radius);
    c.quadraticCurveTo(x, levelY, x + radius, levelY);
    c.lineTo(x + barW - radius, levelY);
    c.quadraticCurveTo(x + barW, levelY, x + barW, levelY + radius);
    c.lineTo(x + barW, h);
    c.lineTo(x, h);
    c.closePath();
    c.fill();

    // Subtle highlight line at the very top of the bar to define the edge
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x + radius / 2, levelY, barW - radius, 1);
  }

  // RMS inner tick — thin dark line showing integrated level (inside the filled bar)
  if (rmsDb > MIN_DB + 2) {
    const rmsY = dbToY(rmsDb, h);
    if (rmsY < h - 1) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(x + 1, rmsY, barW - 2, 1);
    }
  }

  // Peak hold marker — colored line sitting at the max recent peak
  if (peakHoldDb > MIN_DB + 2) {
    const pkY = dbToY(peakHoldDb, h);
    c.fillStyle = peakHoldDb >= 0
      ? '#ffffff'
      : peakHoldDb >= -6
      ? 'rgba(255,255,255,0.95)'
      : 'rgba(255,255,255,0.85)';
    c.fillRect(x, pkY - 1, barW, 2);
  }
}
