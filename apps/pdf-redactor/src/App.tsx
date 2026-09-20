import { useState } from 'react';
import FileDropzone from './components/FileDropzone';
import PageCanvas from './components/PageCanvas';
import Toolbar from './components/Toolbar';
import PageNav from './components/PageNav';
import { usePdfDocument } from './hooks/usePdfDocument';
import { useRedactions } from './hooks/useRedactions';
import { buildRedactedPdf } from './lib/exportPdf';
import { triggerDownload } from './lib/download';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const { pdfDoc, numPages, status, error } = usePdfDocument(file);
  const { redactions, addRect, undoLast, clearPage } = useRedactions();

  function handleFileSelected(selected: File) {
    setFile(selected);
    setPage(1);
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

  return (
    <main className="page">
      <header className="tool-header">
        <a className="back-link" href="/">
          ← Back to Toolbox
        </a>
        <h1>PDF Redactor</h1>
        <p className="subtitle">
          Everything happens in your browser — your PDF is never uploaded anywhere.
        </p>
      </header>

      {!file && <FileDropzone onFileSelected={handleFileSelected} />}

      {file && status === 'loading' && <p>Loading PDF…</p>}
      {file && status === 'error' && <p className="error">{error}</p>}

      {file && pdfDoc && status === 'ready' && (
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
