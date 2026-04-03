'use client';

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Asset, Comment, AnnotationTool, AnnotationColor } from '@/types';
import { AnnotationCanvas, AnnotationCanvasHandle } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { X } from 'lucide-react';

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
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <div ref={containerRef} className="relative max-w-full max-h-full">
        <img
          src={(asset as any).signedUrl || asset.url}
          alt={asset.name}
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
    </div>
  );
});
