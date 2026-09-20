import { useEffect, useState } from 'react';
import FileDropzone from './components/FileDropzone';
import PageCanvas from './components/PageCanvas';
import Toolbar from './components/Toolbar';
import PageNav from './components/PageNav';
import HistoryPanel from './components/HistoryPanel';
import { usePdfDocument } from './hooks/usePdfDocument';
import { useRedactions } from './hooks/useRedactions';
import { useHistory } from './hooks/useHistory';
import { buildRedactedPdf } from './lib/exportPdf';
import { triggerDownload } from './lib/download';
import { getHistoryEntry, saveHistoryEntry } from './lib/history';

const AUTOSAVE_DELAY_MS = 400;

type View = 'upload' | 'editing' | 'history';

export default function App() {
  const [view, setView] = useState<View>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
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

  async function handleExport() {
    if (!pdfDoc) return;
    setIsExporting(true);
    try {
      const bytes = await buildRedactedPdf(pdfDoc, redactions);
      const baseName = file?.name.replace(/\.pdf$/i, '') ?? 'document';
      triggerDownload(bytes, `${baseName}-redacted.pdf`);
    } finally {
      setIsExporting(false);
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
        <div className="editor">
          <Toolbar
            onUndo={() => undoLast(page)}
            onClear={() => clearPage(page)}
            onExport={handleExport}
            exportDisabled={isExporting}
          />
          <PageCanvas
            pdfDoc={pdfDoc}
            pageNumber={page}
            rects={redactions[page] ?? []}
            onAddRect={(rect) => addRect(page, rect)}
            onDeleteRect={(index) => deleteRect(page, index)}
          />
          <PageNav
            page={page}
            numPages={numPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(numPages, p + 1))}
          />
        </div>
      )}
    </main>
  );
}
