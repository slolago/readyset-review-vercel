'use client';

import { useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import type { AnnotationTool, AnnotationColor } from '@/types';

interface AnnotationCanvasProps {
  width: number;
  height: number;
  tool: AnnotationTool;
  color: AnnotationColor;
  isActive: boolean;
  readOnlyShapes?: string;
}

export interface AnnotationCanvasHandle {
  getShapesJSON: () => string;
  clear: () => void;
  undo: () => void;
  loadShapes: (json: string) => void;
}

const COLOR_MAP: Record<AnnotationColor, string> = {
  red: '#ff3333',
  yellow: '#ffdd00',
  blue: '#3399ff',
  green: '#00cc66',
  white: '#ffffff',
};

async function makeArrow(fabric: any, x1: number, y1: number, x2: number, y2: number, strokeColor: string): Promise<any> {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 6) return null;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const shaftW = 4, headLen = Math.min(28, len * 0.38), headW = 13;
  const bx = x2 - ux * headLen, by = y2 - uy * headLen;
  const s1x = x1 + px * shaftW, s1y = y1 + py * shaftW;
  const s2x = x1 - px * shaftW, s2y = y1 - py * shaftW;
  const s3x = bx - px * shaftW, s3y = by - py * shaftW;
  const s4x = bx + px * shaftW, s4y = by + py * shaftW;
  const h1x = bx + px * headW, h1y = by + py * headW;
  const h2x = bx - px * headW, h2y = by - py * headW;
  const d = [`M ${s1x} ${s1y}`, `L ${s4x} ${s4y}`, `L ${h1x} ${h1y}`, `L ${x2} ${y2}`, `L ${h2x} ${h2y}`, `L ${s3x} ${s3y}`, `L ${s2x} ${s2y}`, 'Z'].join(' ');
  return new fabric.Path(d, { fill: strokeColor, stroke: strokeColor, strokeWidth: 0.5, strokeLineJoin: 'round', selectable: false });
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  ({ width, height, tool, color, isActive, readOnlyShapes }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<any>(null);
    const historyRef = useRef<any[]>([]);
    const [fabricLoaded, setFabricLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
      getShapesJSON: () => {
        if (!fabricRef.current) return '[]';
        return JSON.stringify(fabricRef.current.toJSON().objects || []);
      },
      clear: () => {
        if (!fabricRef.current) return;
        fabricRef.current.clear();
        fabricRef.current.renderAll();
        historyRef.current = [];
      },
      undo: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const obj = historyRef.current.pop();
        if (obj) { canvas.remove(obj); canvas.renderAll(); }
      },
      loadShapes: async (json: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        try {
          const objects = JSON.parse(json);
          if (!Array.isArray(objects) || objects.length === 0) return;
          const { fabric } = await import('fabric');
          canvas.clear();
          canvas.loadFromJSON({ version: '5.3.0', objects }, () => {
            canvas.getObjects().forEach((obj: any) => { obj.selectable = false; obj.evented = false; });
            canvas.renderAll();
          });
        } catch (e) {
          console.error('loadShapes error:', e);
        }
      },
    }));

    // SYNCHRONOUS cleanup — runs before React removes the canvas from the DOM.
    // useEffect cleanup is scheduled async, so the DOM node would already be gone
    // by the time it ran, causing Fabric's dispose() to fail. useLayoutEffect
    // cleanup runs synchronously in the commit phase, before DOM removal.
    useLayoutEffect(() => {
      return () => {
        if (fabricRef.current) {
          try { fabricRef.current.dispose(); } catch {}
          fabricRef.current = null;
        }
        historyRef.current = [];
      };
    }, []);

    // Async init — only on mount (key changes trigger remounts)
    useEffect(() => {
      let cancelled = false;
      const init = async () => {
        const { fabric } = await import('fabric');
        if (cancelled || !canvasElRef.current || fabricRef.current) return;
        const canvas = new fabric.Canvas(canvasElRef.current, { width, height, selection: false });
        fabricRef.current = canvas;
        setFabricLoaded(true);

        if (readOnlyShapes && readOnlyShapes !== '[]') {
          try {
            const objects = JSON.parse(readOnlyShapes);
            canvas.loadFromJSON({ version: '5.3.0', objects }, () => {
              canvas.getObjects().forEach((obj: any) => { obj.selectable = false; obj.evented = false; });
              canvas.renderAll();
            });
          } catch {}
        }
      };
      init();
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resize
    useEffect(() => {
      if (!fabricRef.current) return;
      fabricRef.current.setWidth(width);
      fabricRef.current.setHeight(height);
      fabricRef.current.renderAll();
    }, [width, height]);

    // Drawing tools
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || !fabricLoaded || readOnlyShapes !== undefined) return;

      const strokeColor = COLOR_MAP[color];
      canvas.off('mouse:down');
      canvas.off('mouse:move');
      canvas.off('mouse:up');
      canvas.off('path:created');
      canvas.isDrawingMode = false;
      canvas.selection = false;

      if (!isActive) {
        canvas.forEachObject((obj: any) => { obj.selectable = false; obj.evented = false; });
        return;
      }

      // Reset all objects to non-selectable before tool switch — prevents
      // leftover selectability from 'select' mode leaking into other tools
      canvas.forEachObject((obj: any) => { obj.selectable = false; obj.evented = false; });

      const register = (obj: any) => { historyRef.current.push(obj); };

      switch (tool) {
        case 'select':
          canvas.selection = true;
          canvas.forEachObject((obj: any) => { obj.selectable = true; obj.evented = true; });
          break;

        case 'freehand':
          canvas.isDrawingMode = true;
          if (canvas.freeDrawingBrush) { canvas.freeDrawingBrush.color = strokeColor; canvas.freeDrawingBrush.width = 3; }
          canvas.on('path:created', (e: any) => { if (e.path) register(e.path); });
          break;

        case 'rectangle': {
          let isDown = false, startX = 0, startY = 0, rect: any = null;
          canvas.on('mouse:down', async (o: any) => {
            isDown = true;
            const pt = canvas.getPointer(o.e);
            startX = pt.x; startY = pt.y;
            const { fabric } = await import('fabric');
            rect = new fabric.Rect({ left: startX, top: startY, width: 0, height: 0, stroke: strokeColor, fill: 'transparent', strokeWidth: 2, selectable: false });
            canvas.add(rect);
          });
          canvas.on('mouse:move', (o: any) => {
            if (!isDown || !rect) return;
            const pt = canvas.getPointer(o.e);
            rect.set({ left: Math.min(pt.x, startX), top: Math.min(pt.y, startY), width: Math.abs(pt.x - startX), height: Math.abs(pt.y - startY) });
            canvas.renderAll();
          });
          canvas.on('mouse:up', () => { if (rect) register(rect); isDown = false; rect = null; });
          break;
        }

        case 'circle': {
          let isDown = false, startX = 0, startY = 0, circle: any = null;
          canvas.on('mouse:down', async (o: any) => {
            isDown = true;
            const pt = canvas.getPointer(o.e);
            startX = pt.x; startY = pt.y;
            const { fabric } = await import('fabric');
            circle = new fabric.Circle({ left: startX, top: startY, radius: 0, stroke: strokeColor, fill: 'transparent', strokeWidth: 2, selectable: false });
            canvas.add(circle);
          });
          canvas.on('mouse:move', (o: any) => {
            if (!isDown || !circle) return;
            const pt = canvas.getPointer(o.e);
            const r = Math.sqrt(Math.pow(pt.x - startX, 2) + Math.pow(pt.y - startY, 2)) / 2;
            circle.set({ radius: r, left: startX - r, top: startY - r });
            canvas.renderAll();
          });
          canvas.on('mouse:up', () => { if (circle) register(circle); isDown = false; circle = null; });
          break;
        }

        case 'arrow': {
          let isDown = false, startX = 0, startY = 0, previewLine: any = null;
          canvas.on('mouse:down', async (o: any) => {
            isDown = true;
            const pt = canvas.getPointer(o.e);
            startX = pt.x; startY = pt.y;
            const { fabric } = await import('fabric');
            previewLine = new fabric.Line([startX, startY, startX, startY], { stroke: strokeColor, strokeWidth: 2, strokeDashArray: [5, 3], selectable: false });
            canvas.add(previewLine);
          });
          canvas.on('mouse:move', (o: any) => {
            if (!isDown || !previewLine) return;
            const pt = canvas.getPointer(o.e);
            previewLine.set({ x2: pt.x, y2: pt.y });
            canvas.renderAll();
          });
          canvas.on('mouse:up', async (o: any) => {
            if (!isDown) return;
            isDown = false;
            const pt = canvas.getPointer(o.e);
            if (previewLine) { canvas.remove(previewLine); previewLine = null; }
            const { fabric } = await import('fabric');
            const arrow = await makeArrow(fabric, startX, startY, pt.x, pt.y, strokeColor);
            if (arrow) { canvas.add(arrow); register(arrow); canvas.renderAll(); }
          });
          break;
        }

        case 'text': {
          canvas.on('mouse:down', async (o: any) => {
            const pt = canvas.getPointer(o.e);
            const { fabric } = await import('fabric');
            const text = new fabric.IText('Type here', { left: pt.x, top: pt.y, fill: strokeColor, fontSize: 18, fontFamily: 'Inter, sans-serif', selectable: true });
            canvas.add(text);
            register(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            canvas.renderAll();
          });
          break;
        }
      }
    }, [tool, color, isActive, readOnlyShapes, fabricLoaded]);

    return (
      <canvas
        ref={canvasElRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          pointerEvents: isActive ? 'all' : 'none',
          cursor: isActive && tool !== 'select' ? 'crosshair' : 'default',
        }}
      />
    );
  }
);

AnnotationCanvas.displayName = 'AnnotationCanvas';
