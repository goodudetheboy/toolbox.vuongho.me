import { useEffect, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function usePdfDocument(file: File | null) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPdfDoc(null);
      setNumPages(0);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const doc = await getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  return { pdfDoc, numPages, status, error };
}
