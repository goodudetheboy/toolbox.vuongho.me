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
}

export default function PageCanvas({ pdfDoc, pageNumber, rects, onAddRect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<RedactionRect | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);

    renderPageToCanvas(pdfDoc, pageNumber, PREVIEW_SCALE).then((base) => {
      if (cancelled) return;
      baseCanvasRef.current = base;
      const target = canvasRef.current;
      if (target) {
        target.width = base.width;
        target.height = base.height;
      }
      setIsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    draw();
  }, [rects, dragRect, isReady]);

  function draw() {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = '#000000';
    for (const rect of rects) {
      fillNormalizedRect(ctx, canvas, rect);
    }
    if (dragRect) {
      fillNormalizedRect(ctx, canvas, dragRect);
    }
  }

  function toNormalizedPoint(e: PointerEvent<HTMLCanvasElement>) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - bounds.left) / bounds.width),
      y: clamp01((e.clientY - bounds.top) / bounds.height),
    };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    setDragStart(toNormalizedPoint(e));
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

  return (
    <canvas
      ref={canvasRef}
      className="page-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
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
