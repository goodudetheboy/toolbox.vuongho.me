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
import { getHistoryEntry, newDocId, saveHistoryEntry } from './lib/history';
import { useRoute } from './lib/router';

const AUTOSAVE_DELAY_MS = 400;

export default function App() {
  const { route, navigate, goBack } = useRoute();
  const [file, setFile] = useState<File | null>(null);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [historyId, setHistoryId] = useState<string | null>(null);
  // A doc URL whose id isn't in this browser's history (deleted, or opened on another device).
  const [missingDocId, setMissingDocId] = useState<string | null>(null);
  // On touch screens one finger pans by default, so scrolling never draws a stray box.
  const [mode, setMode] = useState<EditMode>(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'move' : 'draw',
  );
  const editorRef = useRef<HTMLDivElement>(null);
  // Id of a fresh upload whose first history entry hasn't been written yet.
  const pendingNewIdRef = useRef<string | null>(null);
  const { pdfDoc, numPages, status, error } = usePdfDocument(file);
  const { redactions, addRect, undoLast, clearPage, deleteRect, replaceAll } = useRedactions();
  const history = useHistory();

  const isEditing = route.name === 'doc';
  const docLoaded = isEditing && route.id === historyId;
  const page = isEditing ? Math.min(route.page, numPages || route.page) : 1;

  // The URL is the source of truth for which document is open: entering a doc
  // URL (back/forward, reload, a history click) loads that entry from IndexedDB.
  // Leaving to upload/history keeps the document in memory, so Forward is instant.
  useEffect(() => {
    if (route.name !== 'doc' || route.id === historyId) return;
    let cancelled = false;
    setMissingDocId(null);
    getHistoryEntry(route.id).then((entry) => {
      if (cancelled) return;
      if (!entry) {
        setMissingDocId(route.id);
        return;
      }
      setFile(new File([entry.pdfBytes], entry.filename, { type: 'application/pdf' }));
      replaceAll(entry.redactions);
      setHistoryId(entry.id);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  // Write the first history entry once a freshly uploaded PDF finishes loading.
  useEffect(() => {
    const id = pendingNewIdRef.current;
    if (!id || id !== historyId || status !== 'ready' || !file || !pdfDoc) return;

    let cancelled = false;
    file.arrayBuffer().then((pdfBytes) => {
      if (cancelled) return;
      saveHistoryEntry({
        id,
        filename: file.name,
        uploadedAt: Date.now(),
        pageCount: pdfDoc.numPages,
        pdfBytes,
        redactions: {},
      }).then(() => {
        if (cancelled) return;
        if (pendingNewIdRef.current === id) pendingNewIdRef.current = null;
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
    // A fresh upload's pdfDoc may still be the previous file's until it loads.
    if (pendingNewIdRef.current === historyId) return;
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
    if (status === 'ready' && docLoaded && window.matchMedia('(max-width: 640px)').matches) {
      editorRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [status, docLoaded]);

  // Ctrl+Z / Cmd+Z undoes the current page's last redaction box.
  useEffect(() => {
    if (!isEditing) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast(page);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, page, undoLast]);

  function handleFileSelected(selected: File) {
    const id = newDocId();
    pendingNewIdRef.current = id;
    setFile(selected);
    setHistoryId(id);
    replaceAll({});
    navigate({ name: 'doc', id, page: 1 });
  }

  // Page turns replace the URL rather than push, so Back leaves the document
  // instead of stepping back through every page.
  function goToPage(next: number) {
    if (route.name !== 'doc') return;
    navigate({ ...route, page: Math.min(numPages, Math.max(1, next)) }, { replace: true });
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

  function handleCloseHistory() {
    goBack(historyId ? { name: 'doc', id: historyId, page: 1 } : { name: 'upload' });
  }

  const pageRects = redactions[page] ?? [];

  return (
    <main className="page">
      <header className="tool-header">
        <div className="header-row">
          <a className="back-link" href="/">
            ← Back to Toolbox
          </a>
          {route.name !== 'history' && (
            <button className="history-toggle" onClick={() => navigate({ name: 'history' })}>
              History
            </button>
          )}
        </div>
        <h1>PDF Redactor</h1>
        <p className="subtitle">
          Everything happens in your browser. Your PDF is never uploaded anywhere.
        </p>
      </header>

      {route.name === 'history' && (
        <HistoryPanel
          entries={history.entries}
          onOpen={(id) => navigate({ name: 'doc', id, page: 1 })}
          onDelete={history.remove}
          onClear={history.clear}
          onClose={handleCloseHistory}
        />
      )}

      {route.name === 'upload' && <FileDropzone onFileSelected={handleFileSelected} />}

      {isEditing && !docLoaded && missingDocId !== route.id && <p>Opening PDF…</p>}
      {isEditing && missingDocId === route.id && (
        <p className="error">
          This PDF isn't in this browser's history anymore.{' '}
          <a href={import.meta.env.BASE_URL}>Open another PDF</a>
        </p>
      )}

      {docLoaded && status === 'loading' && <p>Loading PDF…</p>}
      {docLoaded && status === 'error' && <p className="error">{error}</p>}

      {docLoaded && file && pdfDoc && status === 'ready' && (
        <div className="editor" ref={editorRef}>
          <div className="doc-header">
            {/* Same as the browser back button when we got here in-app (upload or
                history); a directly opened doc URL falls back to the upload screen. */}
            <button className="doc-back" onClick={() => goBack({ name: 'upload' })}>
              ← Back
            </button>
            {/* File name shown on the page only — never in the URL or tab title,
                which land in (possibly cloud-synced) browser history. */}
            <span className="doc-title">{file.name}</span>
          </div>
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
            onPrev={() => goToPage(page - 1)}
            onNext={() => goToPage(page + 1)}
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
