import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RedactionRect } from '../types';
import { getPageSize, renderPageToCanvas } from '../lib/pdfRender';

/** What a single finger (or mouse drag) does: draw a box, or pan the page. */
export type EditMode = 'draw' | 'move';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
// Cap on the preview bitmap's pixel count. iOS Safari silently renders a blank
// canvas past ~16.7M pixels, and two canvases (base + display) are held at once.
const MAX_RENDER_PIXELS = 10_000_000;
// Wait for a pinch to settle before re-rendering the page at the new zoom.
const RENDER_SETTLE_MS = 200;
// A pan that moves less than this (CSS px) is a tap, which selects a box.
const TAP_SLOP_PX = 8;
// A drawn box thinner than MIN_RECT_SIDE_PX, or smaller than
// MIN_RECT_TAP_PX on both sides, is a tap or finger jitter, not a redaction.
const MIN_RECT_SIDE_PX = 4;
const MIN_RECT_TAP_PX = 10;
// Fingers are imprecise: let a touch select a box it lands just outside of.
const TOUCH_HIT_SLOP_PX = 10;

interface Props {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  rects: RedactionRect[];
  mode: EditMode;
  onAddRect: (rect: RedactionRect) => void;
  onDeleteRect: (index: number) => void;
}

interface Point {
  x: number;
  y: number;
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'draw'; start: Point }
  | { kind: 'pan'; lastX: number; lastY: number; downX: number; downY: number; moved: boolean }
  | { kind: 'pinch'; startDist: number; startZoom: number; lastMidX: number; lastMidY: number };

export default function PageCanvas({
  pdfDoc,
  pageNumber,
  rects,
  mode,
  onAddRect,
  onDeleteRect,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: 'none' });
  // The pinch handler reads/writes zoom synchronously, ahead of React re-rendering.
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [scrollerWidth, setScrollerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [renderScale, setRenderScale] = useState<number | null>(null);
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dragRect, setDragRect] = useState<RedactionRect | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current!;
    const observer = new ResizeObserver(([entry]) => setScrollerWidth(entry.contentRect.width));
    observer.observe(scroller);

    // Trackpad pinch (and Ctrl+scroll) arrive as ctrlKey wheel events.
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    }
    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBaseCanvas(null);
    setSelectedIndex(null);
    setPageSize(null);
    scrollerRef.current?.scrollTo(0, 0);

    getPageSize(pdfDoc, pageNumber).then((size) => {
      if (!cancelled) setPageSize(size);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  // Render at the resolution the page is actually shown at (zoom × device
  // pixels), so zooming in stays sharp instead of upscaling a small bitmap.
  useEffect(() => {
    if (!pageSize || scrollerWidth === 0) return;
    const timer = setTimeout(() => {
      const wanted = (scrollerWidth * zoom * (window.devicePixelRatio || 1)) / pageSize.width;
      const cap = Math.sqrt(MAX_RENDER_PIXELS / (pageSize.width * pageSize.height));
      // Quantized so small zoom changes reuse the current render.
      setRenderScale(Math.max(0.5, Math.ceil(Math.min(wanted, cap) * 4) / 4));
    }, RENDER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pageSize, scrollerWidth, zoom]);

  useEffect(() => {
    if (renderScale === null) return;
    let cancelled = false;

    renderPageToCanvas(pdfDoc, pageNumber, renderScale).then((base) => {
      if (!cancelled) setBaseCanvas(base);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, renderScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseCanvas) return;
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(baseCanvas, 0, 0);
    ctx.fillStyle = '#000000';
    rects.forEach((rect) => {
      ctx.fillRect(
        rect.x * canvas.width,
        rect.y * canvas.height,
        rect.width * canvas.width,
        rect.height * canvas.height,
      );
    });
  }, [baseCanvas, rects]);

  /**
   * Sets the zoom, keeping the content under (clientX, clientY) in place and
   * then shifting it by (panX, panY). Applied to the DOM immediately so a
   * pinch tracks the fingers without waiting on a React render.
   */
  function zoomAt(nextZoom: number, clientX: number, clientY: number, panX = 0, panY = 0) {
    const scroller = scrollerRef.current;
    const wrap = wrapRef.current;
    if (!scroller || !wrap) return;

    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const ratio = z / zoomRef.current;
    const bounds = scroller.getBoundingClientRect();
    const anchorX = clientX - bounds.left;
    const anchorY = clientY - bounds.top;
    const contentX = scroller.scrollLeft + anchorX;
    const contentY = scroller.scrollTop + anchorY;

    zoomRef.current = z;
    wrap.style.width = `${z * 100}%`;
    scroller.scrollLeft = contentX * ratio - anchorX - panX;
    scroller.scrollTop = contentY * ratio - anchorY - panY;
    setZoom(z);
  }

  function resetZoom() {
    zoomRef.current = 1;
    if (wrapRef.current) wrapRef.current.style.width = '100%';
    scrollerRef.current?.scrollTo(0, 0);
    setZoom(1);
  }

  function toNormalizedPoint(clientX: number, clientY: number): Point {
    const bounds = wrapRef.current!.getBoundingClientRect();
    return {
      x: clamp01((clientX - bounds.left) / bounds.width),
      y: clamp01((clientY - bounds.top) / bounds.height),
    };
  }

  function hitTest(clientX: number, clientY: number, pointerType: string): number | null {
    const bounds = wrapRef.current!.getBoundingClientRect();
    const point = toNormalizedPoint(clientX, clientY);
    const slopX = pointerType === 'touch' ? TOUCH_HIT_SLOP_PX / bounds.width : 0;
    const slopY = pointerType === 'touch' ? TOUCH_HIT_SLOP_PX / bounds.height : 0;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (
        point.x >= r.x - slopX &&
        point.x <= r.x + r.width + slopX &&
        point.y >= r.y - slopY &&
        point.y <= r.y + r.height + slopY
      ) {
        return i;
      }
    }
    return null;
  }

  function commitDrag(start: Point, clientX: number, clientY: number) {
    const rect = rectFromPoints(start, toNormalizedPoint(clientX, clientY));
    const bounds = wrapRef.current!.getBoundingClientRect();
    const widthPx = rect.width * bounds.width;
    const heightPx = rect.height * bounds.height;
    const isJitter =
      widthPx < MIN_RECT_SIDE_PX ||
      heightPx < MIN_RECT_SIDE_PX ||
      (widthPx < MIN_RECT_TAP_PX && heightPx < MIN_RECT_TAP_PX);
    if (!isJitter) onAddRect(rect);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Capture keeps the gesture alive when the finger slides off the page,
    // instead of ending (and committing) the box at the edge.
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // A second finger turns whatever the first was doing into pinch-zoom/pan,
      // in either mode, and drops any half-drawn box.
      setDragRect(null);
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: 'pinch',
        startDist: distance(a, b),
        startZoom: zoomRef.current,
        lastMidX: (a.x + b.x) / 2,
        lastMidY: (a.y + b.y) / 2,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    if (mode === 'draw') {
      const hit = hitTest(e.clientX, e.clientY, e.pointerType);
      setSelectedIndex(hit);
      gesture.current =
        hit !== null
          ? { kind: 'none' }
          : { kind: 'draw', start: toNormalizedPoint(e.clientX, e.clientY) };
    } else {
      gesture.current = {
        kind: 'pan',
        lastX: e.clientX,
        lastY: e.clientY,
        downX: e.clientX,
        downY: e.clientY,
        moved: false,
      };
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      zoomAt(
        (g.startZoom * distance(a, b)) / g.startDist,
        g.lastMidX,
        g.lastMidY,
        midX - g.lastMidX,
        midY - g.lastMidY,
      );
      g.lastMidX = midX;
      g.lastMidY = midY;
    } else if (g.kind === 'pan') {
      const scroller = scrollerRef.current!;
      scroller.scrollLeft -= e.clientX - g.lastX;
      scroller.scrollTop -= e.clientY - g.lastY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      if (Math.hypot(e.clientX - g.downX, e.clientY - g.downY) > TAP_SLOP_PX) g.moved = true;
    } else if (g.kind === 'draw') {
      setDragRect(rectFromPoints(g.start, toNormalizedPoint(e.clientX, e.clientY)));
    }
  }

  function handlePointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    const completed = e.type === 'pointerup';

    if (g.kind === 'draw' && completed) {
      commitDrag(g.start, e.clientX, e.clientY);
    } else if (g.kind === 'pan' && !g.moved && completed) {
      setSelectedIndex(hitTest(e.clientX, e.clientY, e.pointerType));
    }
    // After a pinch, the finger still down stays inert until it lifts, so
    // ending a pinch never leaves a stray box or pan behind.
    setDragRect(null);
    gesture.current = { kind: 'none' };
  }

  const selectedRect = selectedIndex !== null ? rects[selectedIndex] : null;

  return (
    <div className="page-viewer">
      <div className="page-scroller" ref={scrollerRef}>
        <div
          ref={wrapRef}
          className={`page-canvas-wrap mode-${mode}`}
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <canvas ref={canvasRef} className="page-canvas" />
          {dragRect && <div className="rect-preview" style={rectStyle(dragRect)} />}
          {selectedRect && (
            <>
              <div className="rect-selected" style={rectStyle(selectedRect)} />
              <button
                className="rect-delete-btn"
                style={{
                  left: `clamp(20px, ${(selectedRect.x + selectedRect.width) * 100}%, calc(100% - 20px))`,
                  top: `clamp(20px, ${selectedRect.y * 100}%, calc(100% - 20px))`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onDeleteRect(selectedIndex!);
                  setSelectedIndex(null);
                }}
                aria-label="Delete redaction box"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>
      {zoom > 1.01 && (
        <button className="zoom-reset" onClick={resetZoom}>
          {Math.round(zoom * 100)}% · Fit
        </button>
      )}
    </div>
  );
}

function rectStyle(rect: RedactionRect): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function rectFromPoints(a: Point, b: Point): RedactionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
