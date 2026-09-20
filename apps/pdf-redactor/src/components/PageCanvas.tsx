import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RedactionRect } from '../types';
import { renderPageToCanvas } from '../lib/pdfRender';

const PREVIEW_SCALE = 1.5;
const MIN_RECT_SIZE = 0.005;

interface Props {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  rects: RedactionRect[];
  onAddRect: (rect: RedactionRect) => void;
  onDeleteRect: (index: number) => void;
}

export default function PageCanvas({ pdfDoc, pageNumber, rects, onAddRect, onDeleteRect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<RedactionRect | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBaseCanvas(null);
    setSelectedIndex(null);

    renderPageToCanvas(pdfDoc, pageNumber, PREVIEW_SCALE).then((base) => {
      if (cancelled) return;
      setBaseCanvas(base);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseCanvas) return;
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(baseCanvas, 0, 0);
    ctx.fillStyle = '#000000';
    rects.forEach((rect, index) => {
      fillNormalizedRect(ctx, canvas, rect);
      if (index === selectedIndex) {
        strokeNormalizedRect(ctx, canvas, rect);
      }
    });
    if (dragRect) {
      fillNormalizedRect(ctx, canvas, dragRect);
    }
  }, [baseCanvas, rects, dragRect, selectedIndex]);

  function toNormalizedPoint(e: PointerEvent<HTMLCanvasElement>) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - bounds.left) / bounds.width),
      y: clamp01((e.clientY - bounds.top) / bounds.height),
    };
  }

  function hitTest(point: { x: number; y: number }): number | null {
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) {
        return i;
      }
    }
    return null;
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const point = toNormalizedPoint(e);
    const hit = hitTest(point);
    if (hit !== null) {
      setSelectedIndex(hit);
      return;
    }
    setSelectedIndex(null);
    setDragStart(point);
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart) return;
    setDragRect(rectFromPoints(dragStart, toNormalizedPoint(e)));
  }

  function handlePointerUp() {
    if (dragRect && dragRect.width > MIN_RECT_SIZE && dragRect.height > MIN_RECT_SIZE) {
      onAddRect(dragRect);
    }
    setDragStart(null);
    setDragRect(null);
  }

  const selectedRect = selectedIndex !== null ? rects[selectedIndex] : null;

  return (
    <div className="page-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="page-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {selectedRect && (
        <button
          className="rect-delete-btn"
          style={{
            left: `${(selectedRect.x + selectedRect.width) * 100}%`,
            top: `${selectedRect.y * 100}%`,
          }}
          onClick={() => {
            onDeleteRect(selectedIndex!);
            setSelectedIndex(null);
          }}
          aria-label="Delete redaction box"
        >
          ×
        </button>
      )}
    </div>
  );
}

function fillNormalizedRect(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: RedactionRect,
) {
  ctx.fillRect(
    rect.x * canvas.width,
    rect.y * canvas.height,
    rect.width * canvas.width,
    rect.height * canvas.height,
  );
}

function strokeNormalizedRect(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: RedactionRect,
) {
  ctx.save();
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    rect.x * canvas.width,
    rect.y * canvas.height,
    rect.width * canvas.width,
    rect.height * canvas.height,
  );
  ctx.restore();
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): RedactionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
