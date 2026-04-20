'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';

/**
 * Precise stereo audio meter.
 *
 * Architecture (rewritten): we use `video.captureStream()` to get a MediaStream
 * from each monitored video element, then feed those streams into
 * `MediaStreamAudioSourceNode → AnalyserNode`. Critically, we do NOT route
 * through `ctx.destination`, and we never call `createMediaElementSource()`.
 *
 * Why this matters:
 *   - `createMediaElementSource(video)` HIJACKS the video's native audio path.
 *     Once called, the browser routes audio exclusively through Web Audio.
 *     If the AudioContext is suspended (Chrome's autoplay policy) or we misroute
 *     gain at the wrong moment, the video plays silently — even though
 *     `video.muted = false`.
 *   - `video.captureStream()` is a SIDE CHANNEL. The native audio path stays
 *     intact: `video.muted` and `video.volume` directly control what you hear.
 *     We only use the captured stream to read sample data for the meter.
 *
 * Browser support: Chrome ✓, Firefox ✓ (mozCaptureStream), Safari 16+ ✓.
 * If captureStream is unavailable or fails, the meter shows no signal but
 * audio playback is unaffected (it's native).
 */

export interface VUMeterHandle {
  /** No-op kept for API compatibility. Kept so older callers can safely invoke it. */
  resume: () => void;
  /** No-op — use video.volume directly. */
  setVolume: (v: number) => void;
  /** No-op — use video.muted directly. */
  setMuted: (m: boolean) => void;
}

interface VUMeterProps {
  videoRefs: React.RefObject<HTMLVideoElement>[];
  /** Index into videoRefs — only the active source is monitored. */
  activeIndex?: number;
  isPlaying: boolean;
}

// ── dBFS scale ────────────────────────────────────────────────────────────────
const MIN_DB   = -60;
const MAX_DB   = 3;
const DB_RANGE = MAX_DB - MIN_DB;
const DB_MARKS = [0, -3, -6, -9, -12, -18, -24, -40, -60] as const;

const PEAK_HOLD_MS  = 1200;
const PEAK_DECAY_DB = 0.25;
const BAR_ATTACK_ALPHA  = 1.0;
const BAR_RELEASE_ALPHA = 0.15;
const RMS_ATTACK_ALPHA  = 0.85;
const RMS_RELEASE_ALPHA = 0.12;

const LABEL_W = 40;
const SEP_W   = 2;
const BAR_GAP = 4;
const L_X     = LABEL_W + SEP_W;

function dbToY(db: number, h: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return ((MAX_DB - clamped) / DB_RANGE) * h;
}

function analyse(analyser: AnalyserNode | null, buf: Float32Array): { rmsDb: number; peakDb: number } {
  if (!analyser) return { rmsDb: MIN_DB, peakDb: MIN_DB };
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

interface AnalysisGraph {
  source: MediaStreamAudioSourceNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  bufL: Float32Array;
  bufR: Float32Array;
  stream: MediaStream;
}

// ── Module-level singleton AudioContext ──────────────────────────────────────
// Shared across all VUMeter instances per page load (Chrome caps contexts at ~6).
// No graph cache: graphs are instance-owned and rebuilt when video src changes,
// because MediaStreamAudioSourceNode is bound to the audio track present at
// creation time — it doesn't automatically follow the video when src flips.
let sharedCtx: AudioContext | null = null;

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

function captureAudioStream(video: HTMLVideoElement): MediaStream | null {
  const cs = (video as any).captureStream
    || (video as any).mozCaptureStream
    || (video as any).webkitCaptureStream;
  if (typeof cs !== 'function') return null;
  try {
    const stream: MediaStream = cs.call(video);
    return stream ?? null;
  } catch (e) {
    console.warn('[VUMeter] captureStream failed', e);
    return null;
  }
}

/** Build an analysis graph. Returns null if the video has no audio track yet;
 *  the caller is expected to retry on later media events. */
function buildAnalysisGraph(ctx: AudioContext, video: HTMLVideoElement): AnalysisGraph | null {
  const stream = captureAudioStream(video);
  if (!stream) return null;
  // CRITICAL: MediaStreamAudioSourceNode binds to the audio track that exists
  // at creation time. If we build the source when the stream has zero audio
  // tracks, it will emit silence forever even after the track appears. So we
  // only build once tracks are present and ask the caller to retry otherwise.
  if (stream.getAudioTracks().length === 0) return null;
  try {
    const source = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(2);
    const aL = ctx.createAnalyser();
    const aR = ctx.createAnalyser();
    aL.fftSize = 2048; aL.smoothingTimeConstant = 0;
    aR.fftSize = 2048; aR.smoothingTimeConstant = 0;
    source.connect(splitter);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);
    return {
      source, analyserL: aL, analyserR: aR,
      bufL: new Float32Array(aL.fftSize),
      bufR: new Float32Array(aR.fftSize),
      stream,
    };
  } catch (e) {
    console.warn('[VUMeter] analysis graph creation failed', e);
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export const VUMeter = memo(forwardRef<VUMeterHandle, VUMeterProps>(
  function VUMeter({ videoRefs, activeIndex = 0, isPlaying }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const graphsRef = useRef<(AnalysisGraph | null)[]>([]);
    const activeRef = useRef(activeIndex);
    const rafRef    = useRef(0);

    const barLevel    = useRef<[number, number]>([MIN_DB, MIN_DB]);
    const rmsSmoothed = useRef<[number, number]>([MIN_DB, MIN_DB]);
    const peakDisp    = useRef<[number, number]>([MIN_DB, MIN_DB]);
    const peakTime    = useRef<[number, number]>([0, 0]);

    // Public handle — volume/mute are now no-ops (callers control the video
    // element directly). resume() does still matter for the analyser: when the
    // AudioContext is suspended the analyser samples stop updating, so the
    // meter freezes at its last reading. Audio plays regardless (native path).
    const resume    = useCallback(() => {
      const ctx = sharedCtx;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }, []);
    const setVolume = useCallback((_v: number) => { /* no-op */ }, []);
    const setMuted  = useCallback((_m: boolean) => { /* no-op */ }, []);
    useImperativeHandle(ref, () => ({ resume, setVolume, setMuted }), [resume, setVolume, setMuted]);

    // Build analysis graphs per video. Each graph is independent and rebuilt
    // when its video's src changes (MediaStreamAudioSourceNode is bound to the
    // audio track present at creation time — it doesn't follow a new src).
    useEffect(() => {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;

      graphsRef.current = videoRefs.map(() => null);
      const cleanups: Array<() => void> = [];

      videoRefs.forEach((vr, i) => {
        const video = vr.current;
        if (!video) return;

        const tearDown = () => {
          const g = graphsRef.current[i];
          if (g) {
            try { g.source.disconnect(); } catch {}
            graphsRef.current[i] = null;
          }
        };

        const build = () => {
          if (graphsRef.current[i]) return; // already have one
          const g = buildAnalysisGraph(ctx, video);
          if (g) graphsRef.current[i] = g;
        };

        // First attempt — may fail if the audio track isn't ready yet
        build();

        // Retry on media events. `loadedmetadata` fires once the audio/video
        // tracks are known; `canplay` fires when enough data is buffered;
        // `playing` covers browsers that only expose tracks at playback start.
        const retryEvents: Array<keyof HTMLMediaElementEventMap> = ['loadedmetadata', 'canplay', 'playing'];
        retryEvents.forEach((ev) => video.addEventListener(ev, build));

        // On src change (new version picked for this side), the stream's
        // current track ends and a new one takes its place. The source node
        // won't auto-follow — tear down first so the next media event rebuilds.
        const onLoadStart = () => { tearDown(); };
        video.addEventListener('loadstart', onLoadStart);

        cleanups.push(() => {
          retryEvents.forEach((ev) => video.removeEventListener(ev, build));
          video.removeEventListener('loadstart', onLoadStart);
          tearDown();
        });
      });

      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      return () => {
        cancelAnimationFrame(rafRef.current);
        cleanups.forEach((fn) => fn());
        graphsRef.current = [];
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      activeRef.current = activeIndex;
      barLevel.current    = [MIN_DB, MIN_DB];
      rmsSmoothed.current = [MIN_DB, MIN_DB];
      peakDisp.current    = [MIN_DB, MIN_DB];
      peakTime.current    = [0, 0];

      // Force-rebuild the newly active side's analysis graph.
      //
      // Why: Chrome drops the audio track from captureStream() when video.muted
      // is true at capture time. In compare, the inactive side is muted at
      // mount, so its initial captureStream has zero audio tracks → source node
      // binds to silence forever. When the user switches to that side (React
      // unmutes the video), the existing node doesn't pick up the newly
      // available track. Tearing down and rebuilding while the video is now
      // unmuted gets us a real audio source.
      const ctx = sharedCtx;
      if (!ctx) return;
      const video = videoRefs[activeIndex]?.current;
      if (!video) return;

      // React's muted prop update and this effect both run post-commit, so
      // video.muted should already reflect the new active side. If for some
      // reason it's still muted, defer to the next paint so the DOM settles.
      const rebuild = () => {
        const old = graphsRef.current[activeIndex];
        if (old) {
          try { old.source.disconnect(); } catch {}
        }
        const fresh = buildAnalysisGraph(ctx, video);
        graphsRef.current[activeIndex] = fresh;
      };

      if (video.muted) {
        // Shouldn't happen — but defer one frame if it does.
        const id = requestAnimationFrame(rebuild);
        return () => cancelAnimationFrame(id);
      }
      rebuild();
    }, [activeIndex, videoRefs]);

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

          const prevBar = barLevel.current[ch];
          const barAlpha = truePeak > prevBar ? BAR_ATTACK_ALPHA : BAR_RELEASE_ALPHA;
          barLevel.current[ch] = truePeak * barAlpha + prevBar * (1 - barAlpha);

          const prevRms = rmsSmoothed.current[ch];
          const rmsAlpha = rms > prevRms ? RMS_ATTACK_ALPHA : RMS_RELEASE_ALPHA;
          rmsSmoothed.current[ch] = rms * rmsAlpha + prevRms * (1 - rmsAlpha);

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
  barDb: number,
  rmsDb: number,
  peakHoldDb: number,
  x: number,
  barW: number,
  h: number,
) {
  const levelY = dbToY(barDb, h);

  if (levelY < h - 0.5) {
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

    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x + radius / 2, levelY, barW - radius, 1);
  }

  if (rmsDb > MIN_DB + 2) {
    const rmsY = dbToY(rmsDb, h);
    if (rmsY < h - 1) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(x + 1, rmsY, barW - 2, 1);
    }
  }

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
