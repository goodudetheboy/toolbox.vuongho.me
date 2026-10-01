import { useEffect, useRef, useState } from 'react';
import FileDropzone from './components/FileDropzone';
import PageCanvas, { type EditMode } from './components/PageCanvas';
import EditorBar from './components/EditorBar';
import HistoryPanel from './components/HistoryPanel';
import { usePdfDocument } from './hooks/usePdfDocument';
import { useRedactions } from './hooks/useRedactions';
import { useHistory } from './hooks/useHistory';
import { buildRedactedPdf, type ExportFormat } from './lib/exportPdf';
import { triggerDownload } from './lib/download';
import { getHistoryEntry, saveHistoryEntry } from './lib/history';

const AUTOSAVE_DELAY_MS = 400;

type View = 'upload' | 'editing' | 'history';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [historyId, setHistoryId] = useState<string | null>(null);
  // On touch screens one finger pans by default, so scrolling never draws a stray box.
  const [mode, setMode] = useState<EditMode>(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'move' : 'draw',
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const { pdfDoc, numPages, status, error } = usePdfDocument(file);
  const { redactions, addRect, undoLast, clearPage, deleteRect, replaceAll } = useRedactions();
  const history = useHistory();

  // Save a new history entry once a freshly uploaded PDF finishes loading.
  useEffect(() => {
    if (status !== 'ready' || !file || !pdfDoc) return;
    if (historyId) return; // already tracking an entry (fresh upload or opened from history)

    let cancelled = false;
    file.arrayBuffer().then((pdfBytes) => {
      if (cancelled) return;
      const id = crypto.randomUUID();
      saveHistoryEntry({
        id,
        filename: file.name,
        uploadedAt: Date.now(),
        pageCount: pdfDoc.numPages,
        pdfBytes,
        redactions: {},
      }).then(() => {
        if (cancelled) return;
        setHistoryId(id);
        history.refresh();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [status, file, pdfDoc, historyId]);

  // Debounced autosave of redaction edits against the current history entry.
  useEffect(() => {
    if (!historyId || !file || !pdfDoc) return;
    const timer = setTimeout(() => {
      file.arrayBuffer().then((pdfBytes) => {
        saveHistoryEntry({
          id: historyId,
          filename: file.name,
          uploadedAt: Date.now(),
          pageCount: pdfDoc.numPages,
          pdfBytes,
          redactions,
        }).then(() => history.refresh());
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [redactions, historyId, file, pdfDoc]);

  // On a phone the editor fills the screen, so bring it fully into view once loaded.
  useEffect(() => {
    if (status === 'ready' && view === 'editing' && window.matchMedia('(max-width: 640px)').matches) {
      editorRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [status, view]);

  // Ctrl+Z / Cmd+Z undoes the current page's last redaction box.
  useEffect(() => {
    if (view !== 'editing') return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast(page);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, page, undoLast]);

  function handleFileSelected(selected: File) {
    setFile(selected);
    setPage(1);
    setHistoryId(null);
    replaceAll({});
    setView('editing');
  }

  async function handleExport(format: ExportFormat) {
    if (!pdfDoc || !file) return;
    setExportProgress({ done: 0, total: pdfDoc.numPages });
    try {
      const originalBytes = await file.arrayBuffer();
      const bytes = await buildRedactedPdf(pdfDoc, originalBytes, redactions, {
        format,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      const baseName = file.name.replace(/\.pdf$/i, '');
      triggerDownload(bytes, `${baseName}-redacted.pdf`);
    } finally {
      setExportProgress(null);
    }
  }

  async function handleOpenHistoryEntry(id: string) {
    const entry = await getHistoryEntry(id);
    if (!entry) return;
    const restored = new File([entry.pdfBytes], entry.filename, { type: 'application/pdf' });
    setFile(restored);
    setPage(1);
    replaceAll(entry.redactions);
    setHistoryId(entry.id);
    setView('editing');
  }

  function handleCloseHistory() {
    setView(file ? 'editing' : 'upload');
  }

  const pageRects = redactions[page] ?? [];

  return (
    <main className="page">
      <header className="tool-header">
        <div className="header-row">
          <a className="back-link" href="/">
            ← Back to Toolbox
          </a>
          {view !== 'history' && (
            <button className="history-toggle" onClick={() => setView('history')}>
              History
            </button>
          )}
        </div>
        <h1>PDF Redactor</h1>
        <p className="subtitle">
          Everything happens in your browser — your PDF is never uploaded anywhere.
        </p>
      </header>

      {view === 'history' && (
        <HistoryPanel
          entries={history.entries}
          onOpen={handleOpenHistoryEntry}
          onDelete={history.remove}
          onClear={history.clear}
          onClose={handleCloseHistory}
        />
      )}

      {view !== 'history' && !file && <FileDropzone onFileSelected={handleFileSelected} />}

      {view !== 'history' && file && status === 'loading' && <p>Loading PDF…</p>}
      {view !== 'history' && file && status === 'error' && <p className="error">{error}</p>}

      {view !== 'history' && file && pdfDoc && status === 'ready' && (
        <div className="editor" ref={editorRef}>
          <PageCanvas
            pdfDoc={pdfDoc}
            pageNumber={page}
            rects={pageRects}
            mode={mode}
            onAddRect={(rect) => addRect(page, rect)}
            onDeleteRect={(index) => deleteRect(page, index)}
          />
          <EditorBar
            page={page}
            numPages={numPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(numPages, p + 1))}
            mode={mode}
            onModeChange={setMode}
            hasBoxes={pageRects.length > 0}
            onUndo={() => undoLast(page)}
            onClear={() => {
              if (window.confirm(`Remove all ${pageRects.length} boxes on page ${page}?`)) {
                clearPage(page);
              }
            }}
            onExport={handleExport}
            exportProgress={exportProgress}
          />
        </div>
      )}
    </main>
  );
}
