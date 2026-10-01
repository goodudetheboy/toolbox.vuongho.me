import { useEffect, useRef, useState } from 'react';
import type { ExportFormat } from '../lib/exportPdf';
import type { EditMode } from './PageCanvas';

interface Props {
  page: number;
  numPages: number;
  onPrev: () => void;
  onNext: () => void;
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  hasBoxes: boolean;
  onUndo: () => void;
  onClear: () => void;
  onExport: (format: ExportFormat) => void;
  exportProgress: { done: number; total: number } | null;
}

/** Every editor control in one bar, pinned to the bottom of the screen within thumb reach. */
export default function EditorBar({
  page,
  numPages,
  onPrev,
  onNext,
  mode,
  onModeChange,
  hasBoxes,
  onUndo,
  onClear,
  onExport,
  exportProgress,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: globalThis.PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  function chooseExport(format: ExportFormat) {
    setMenuOpen(false);
    onExport(format);
  }

  return (
    <div className="editor-bar">
      <div className="bar-group">
        <button onClick={onPrev} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        <span className="page-count">
          {page} / {numPages}
        </span>
        <button onClick={onNext} disabled={page >= numPages} aria-label="Next page">
          ›
        </button>
      </div>

      <div className="bar-group mode-toggle" role="group" aria-label="One-finger action">
        <button
          className={mode === 'move' ? 'active' : ''}
          aria-pressed={mode === 'move'}
          onClick={() => onModeChange('move')}
        >
          Move
        </button>
        <button
          className={mode === 'draw' ? 'active' : ''}
          aria-pressed={mode === 'draw'}
          onClick={() => onModeChange('draw')}
        >
          Draw
        </button>
      </div>

      <div className="bar-group">
        <button onClick={onUndo} disabled={!hasBoxes}>
          Undo
        </button>
        <button onClick={onClear} disabled={!hasBoxes}>
          Clear
        </button>
        <div className="export-menu" ref={menuRef}>
          <button
            className="primary"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={exportProgress !== null}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {exportProgress ? `${exportProgress.done}/${exportProgress.total}…` : 'Export'}
          </button>
          {menuOpen && (
            <div className="export-menu-list" role="menu">
              <button role="menuitem" onClick={() => chooseExport('jpeg')}>
                <strong>Fast</strong>
                <span>JPEG pages, smaller file</span>
              </button>
              <button role="menuitem" onClick={() => chooseExport('png')}>
                <strong>Best quality</strong>
                <span>Lossless PNG pages, slower</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
