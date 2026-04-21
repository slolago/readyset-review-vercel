'use client';

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Asset, Comment, AnnotationTool, AnnotationColor } from '@/types';
import { AnnotationCanvas, AnnotationCanvasHandle } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface ImageViewerProps {
  asset: Asset;
  comments: Comment[];
  // Annotation mode props (controlled by parent)
  isAnnotationMode: boolean;
  onAnnotationCapture: (shapes: string) => void;
  onAnnotationCancel: () => void;
  // Show a saved comment's annotation in read-only
  displayShapes?: string | null;
}

export interface ImageViewerHandle {
  captureAnnotation: () => string;
}

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(function ImageViewer({
  asset,
  comments,
  isAnnotationMode,
  onAnnotationCapture,
  onAnnotationCancel,
  displayShapes,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<AnnotationCanvasHandle>(null);

  useImperativeHandle(ref, () => ({
    captureAnnotation: () => {
      const shapes = canvasRef.current?.getShapesJSON() ?? '[]';
      canvasRef.current?.clear();
      return shapes;
    },
  }));
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<AnnotationTool>('rectangle');
  const [color, setColor] = useState<AnnotationColor>('red');
  // Zoom + pan state — disabled while annotating (canvas needs direct coords)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStateRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const zoomIn = () => setZoom((z) => Math.min(z * 1.25, 8));
  const zoomOut = () => setZoom((z) => Math.max(z / 1.25, 1));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Wheel zoom (cursor-anchored) when not annotating
  useEffect(() => {
    if (isAnnotationMode) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50) return;
      e.preventDefault();
      const delta = -e.deltaY;
      setZoom((z) => Math.max(1, Math.min(8, z * (delta > 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isAnnotationMode]);

  // Mouse pan when zoomed in
  const handlePanStart = (e: React.MouseEvent) => {
    if (isAnnotationMode || zoom === 1) return;
    panStateRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panStateRef.current) return;
      const { startX, startY, origX, origY } = panStateRef.current;
      setPan({ x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) });
    };
    const onUp = () => { panStateRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Ctrl+Z undo
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

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleCapture = () => {
    const shapes = canvasRef.current?.getShapesJSON() || '[]';
    canvasRef.current?.clear();
    onAnnotationCapture(shapes);
  };

  const handleCancel = () => {
    canvasRef.current?.clear();
    onAnnotationCancel();
  };

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden"
      onMouseDown={handlePanStart}
      style={{ cursor: !isAnnotationMode && zoom > 1 ? (panStateRef.current ? 'grabbing' : 'grab') : 'default' }}
    >
      <div
        ref={containerRef}
        className="relative max-w-full max-h-full"
        style={{
          transform: isAnnotationMode ? 'none' : `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: panStateRef.current ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        <img
          src={(asset as any).signedUrl ?? ''}
          alt={asset.name}
          draggable={false}
          className="max-w-full max-h-[calc(100vh-120px)] object-contain block"
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ width: img.offsetWidth, height: img.offsetHeight });
          }}
        />

        {/* Drawing canvas (active annotation mode) */}
        {isAnnotationMode && dimensions.width > 0 && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: dimensions.width, height: dimensions.height }}>
            <AnnotationCanvas
              key="drawing"
              ref={canvasRef}
              width={dimensions.width}
              height={dimensions.height}
              tool={tool}
              color={color}
              isActive={true}
            />
          </div>
        )}

        {/* Read-only display of a saved comment's annotation */}
        {!isAnnotationMode && displayShapes && dimensions.width > 0 && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: dimensions.width, height: dimensions.height, pointerEvents: 'none' }}>
            <AnnotationCanvas
              key={`readonly-${displayShapes}`}
              ref={canvasRef}
              width={dimensions.width}
              height={dimensions.height}
              tool="select"
              color="red"
              isActive={false}
              readOnlyShapes={displayShapes}
            />
          </div>
        )}
      </div>

      {/* Drawing toolbar */}
      {isAnnotationMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <AnnotationToolbar
            tool={tool}
            color={color}
            onToolChange={setTool}
            onColorChange={setColor}
            onUndo={() => canvasRef.current?.undo()}
            onClear={() => canvasRef.current?.clear()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCapture}
              className="px-5 py-2 bg-frame-accent hover:bg-frame-accentHover text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
            >
              Attach to comment
            </button>
            <button
              onClick={handleCancel}
              className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Read-only annotation indicator */}
      {!isAnnotationMode && displayShapes && displayShapes !== '[]' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-frame-accent/80 backdrop-blur-sm text-white text-xs rounded-full">
          Showing annotation — click another comment to switch
        </div>
      )}

      {/* Zoom controls (hidden during annotation mode — pan would interfere) */}
      {!isAnnotationMode && (
        <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg p-1">
          <button
            onClick={zoomOut}
            disabled={zoom <= 1}
            title="Zoom out"
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/80 font-mono px-1 tabular-nums min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={zoom >= 8}
            title="Zoom in"
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
            title="Fit to screen"
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
});
